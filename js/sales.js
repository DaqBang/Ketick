// Jualan / POS. Append-only: jualan tidak boleh diedit atau dipadam.
// Pembetulan = pulangan (refund) penuh, dengan sebab dan kelulusan manager.
//
// Kawalan fraud:
// - Harga diambil dari data produk, bukan dari troli (staf tidak boleh ubah harga).
// - Diskaun melebihi had perlu PIN manager/owner.
// - Bayaran bukan tunai wajib ada no. rujukan (elak "kata transfer, simpan tunai").
// - Jualan tunai wajib ada syif dibuka (tunai terus masuk kiraan laci).
// - No. resit berturutan: resit hilang = nombor melompat = nampak.

import { db } from './db.js';
import { log } from './audit.js';
import { session } from './session.js';
import * as auth from './auth.js';
import * as cash from './cash.js';
import * as stock from './stock.js';
import * as contacts from './customers.js';

export const DISCOUNT_LIMIT_PCT = 10;
export const METHODS = { cash: 'Tunai', transfer: 'Transfer', card: 'Kad', ewallet: 'e-Wallet' };

function me() {
  const u = session.get();
  if (!u) throw new Error('Sila log masuk');
  return u;
}

export const needsApproval = (subtotal, discount) =>
  discount > 0 && discount * 100 > subtotal * DISCOUNT_LIMIT_PCT;

// Bina baris dari data produk. qtyMap: { product_id: qty }, serialMap: { product_id: [siri] }
// Tiada semakan stok di sini (dipakai untuk paparan troli); semakan dibuat semasa checkout.
export function buildLines(qtyMap, serialMap = {}) {
  return Object.entries(qtyMap).map(([productId, qty]) => {
    const p = db.find('products', productId);
    if (!p || !p.active) throw new Error('Produk tidak sah dalam troli');
    if (!Number.isInteger(qty) || qty < 1) throw new Error('Kuantiti tidak sah');
    return {
      product_id: p.id,
      name: p.name,
      price: p.price,
      cost: p.cost,
      qty,
      line: p.price * qty,
      serials: p.track_serial ? (serialMap[p.id] || []).slice(0, qty).filter(Boolean) : [],
    };
  });
}

export const subtotalOf = (lines) => lines.reduce((s, l) => s + l.line, 0);

const nextNo = () => `R${String(db.all('sales').length + 1).padStart(6, '0')}`;


function cashShiftFor(u) {
  const sh = cash.currentShift();
  if (!sh) throw new Error('Buka syif dulu untuk urusan tunai');
  if (sh.user_id !== u.id && !cash.isManager(u)) {
    throw new Error(`Syif ini milik ${sh.user_name}`);
  }
  return sh;
}

export async function checkout({ qtyMap, serialMap = {}, discount = 0, method, payRef = '', approver = null, contactId = '' }) {
  const u = me();
  const c = contactId ? contacts.find(contactId) : null;
  if (contactId && !c) throw new Error('Pelanggan tidak dijumpai');
  const lines = buildLines(qtyMap, serialMap);
  if (!lines.length) throw new Error('Troli kosong');
  for (const l of lines) stock.checkAvailable(db.find('products', l.product_id), l.qty, l.serials);
  const subtotal = subtotalOf(lines);
  if (!Number.isInteger(discount) || discount < 0 || discount > subtotal) {
    throw new Error('Diskaun tidak sah');
  }
  if (!METHODS[method]) throw new Error('Kaedah bayaran tidak sah');
  const ref = payRef.trim();
  if (method !== 'cash' && !ref) throw new Error('No. rujukan bayaran diperlukan');

  const approvedBy = needsApproval(subtotal, discount) ? await auth.approval(approver) : null;
  const shift = method === 'cash' ? cashShiftFor(u) : null;

  const sale = db.insert('sales', {
    no: nextNo(),
    lines,
    subtotal,
    discount,
    total: subtotal - discount,
    method,
    pay_ref: ref,
    shift_id: shift?.id ?? null,
    user_id: u.id,
    user_name: u.name,
    approved_by: approvedBy,
    party: c ? contacts.snapshot(c) : null,
  });

  for (const l of lines) stock.postOut(u, l, 'sale', sale.id);
  if (shift) cash.postSale(u, shift.id, sale);

  await log('sale.create', {
    sale_id: sale.id,
    no: sale.no,
    amount: sale.total,
    method,
    discount,
  });
  if (approvedBy) {
    await log('sale.discount', {
      sale_id: sale.id,
      no: sale.no,
      amount: discount,
      name: approvedBy.name,
      note: approvedBy.self ? 'lulus sendiri' : `juruwang ${u.name}`,
    });
  }
  return sale;
}

export const findSale = (id) => db.find('sales', id);
export const refundOf = (saleId) => db.where('refunds', (r) => r.sale_id === saleId)[0] || null;

// Pulangan penuh sahaja (v1)
export async function refund(saleId, reason, approver = null) {
  const u = me();
  const s = findSale(saleId);
  if (!s) throw new Error('Jualan tidak dijumpai');
  if (refundOf(saleId)) throw new Error('Jualan ini sudah dipulangkan');
  if (!reason?.trim()) throw new Error('Sebab pulangan diperlukan');

  const approvedBy = await auth.approval(approver);
  let shift = null;
  if (s.method === 'cash') {
    shift = cashShiftFor(u);
    if (cash.expected(shift.id) < s.total) throw new Error('Tunai dalam laci tidak cukup');
  }

  const r = db.insert('refunds', {
    sale_id: s.id,
    no: s.no,
    amount: s.total,
    method: s.method,
    reason: reason.trim(),
    shift_id: shift?.id ?? null,
    user_id: u.id,
    user_name: u.name,
    approved_by: approvedBy,
  });

  for (const l of s.lines) stock.postIn(u, l, 'refund', r.id);
  if (shift) cash.postRefund(u, shift.id, r);

  await log('sale.refund', {
    sale_id: s.id,
    no: s.no,
    amount: s.total,
    name: approvedBy.name,
    note: r.reason,
  });
  return r;
}

export function recent(limit = 20) {
  return db.all('sales').slice(-limit).reverse();
}

const isToday = (iso) => new Date(iso).toDateString() === new Date().toDateString();

export function todaySummary() {
  const sales = db.where('sales', (s) => isToday(s.created_at));
  const refunds = db.where('refunds', (r) => isToday(r.created_at));
  const gross = sales.reduce((t, s) => t + s.total, 0);
  const ref = refunds.reduce((t, r) => t + r.amount, 0);
  return { count: sales.length, gross, refunds: ref, net: gross - ref };
}
