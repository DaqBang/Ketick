// Billing: Sebut Harga (QT), Invois (INV), Resit (RC), Nota Hantaran (DO),
// Nota Kredit (CN), Pesanan Belian (PO).
//
// Draf boleh diedit (doc_drafts). Bila "dikeluarkan", dokumen dapat nombor berturutan
// dan dikunci selamanya (docs). Pembetulan = Nota Kredit atau Batal (dengan sebab + kelulusan).
// Dokumen batal kekal dengan cop BATAL; nombor tidak diguna semula.
//
// Kawalan fraud:
// - Harga senarai diambil dari data produk semasa dikeluarkan.
// - Invois: jumlah bersih lebih 10% bawah harga senarai perlu PIN manager/owner.
// - PO: harga belian lebih 10% atas kos produk perlu PIN (elak "kickback" pembekal).
// - Resit tunai terus masuk syif; bukan tunai wajib no. rujukan.
// - Invois tidak boleh dibatal jika ada resit/DO/nota kredit aktif.
// - DO keluarkan stok ikut siri; batal DO pulangkan stok.

import { db } from './db.js';
import { log } from './audit.js';
import { session } from './session.js';
import * as auth from './auth.js';
import * as cash from './cash.js';
import * as stock from './stock.js';
import * as contacts from './customers.js';
import { needsApproval, METHODS } from './sales.js';

export { METHODS };

export const TYPES = {
  QT: { label: 'Sebut Harga', title: 'SEBUT HARGA', party: 'customer', days: 14, daysLabel: 'Sah sehingga' },
  INV: { label: 'Invois', title: 'INVOIS', party: 'customer', days: 30, daysLabel: 'Tarikh akhir bayar' },
  RC: { label: 'Resit', title: 'RESIT RASMI' },
  DO: { label: 'Nota Hantaran', title: 'NOTA PENGHANTARAN' },
  CN: { label: 'Nota Kredit', title: 'NOTA KREDIT' },
  PO: { label: 'Pesanan Belian', title: 'PESANAN BELIAN', party: 'supplier', days: 14, daysLabel: 'Tarikh hantar' },
};
export const DRAFTABLE = ['QT', 'INV', 'PO'];
export const TAX_RATES = [0, 6, 8, 10];
const PRICE_LIMIT_PCT = 10;
const DAY = 86400000;

function me() {
  const u = session.get();
  if (!u) throw new Error('Sila log masuk');
  return u;
}

const nextNo = (type) =>
  `${type}-${String(db.where('docs', (d) => d.type === type).length + 1).padStart(6, '0')}`;

export const findDoc = (id) => db.find('docs', id);
export const voidOf = (id) => db.where('doc_voids', (v) => v.doc_id === id)[0] || null;
const active = (d) => !voidOf(d.id);

// ---------- Kira ----------

export function calc({ lines = [], discount = 0, tax_pct = 0 }) {
  const subtotal = lines.reduce((t, l) => t + l.qty * l.price, 0);
  const net = subtotal - discount;
  const tax = Math.round((net * tax_pct) / 100);
  return { subtotal, discount, net, tax, total: net + tax };
}

// ---------- Draf ----------

export function newDraft(type, { contactId = '', fromDocId = null } = {}) {
  const u = me();
  if (!DRAFTABLE.includes(type)) throw new Error('Jenis dokumen tidak sah');
  let base = { contact_id: contactId, lines: [], discount: 0, tax_pct: 0, notes: '' };
  if (fromDocId) {
    const src = findDoc(fromDocId);
    if (!src || !active(src)) throw new Error('Dokumen sumber tidak sah');
    base = {
      contact_id: src.party?.id || '',
      lines: src.lines.map((l) => ({ product_id: l.product_id, desc: l.desc, qty: l.qty, price: l.price })),
      discount: src.discount,
      tax_pct: src.tax_pct,
      notes: src.notes,
    };
  }
  return db.insert('doc_drafts', {
    type,
    ...base,
    days: TYPES[type].days,
    ref_doc_id: fromDocId,
    discarded: false,
    user_id: u.id,
    user_name: u.name,
  });
}

export const findDraft = (id) => db.find('doc_drafts', id);
export const drafts = (type) => db.where('doc_drafts', (d) => d.type === type && !d.discarded).reverse();

export function saveDraft(id, patch) {
  me();
  const d = findDraft(id);
  if (!d || d.discarded) throw new Error('Draf tidak dijumpai');
  return db.update('doc_drafts', id, patch);
}

export async function discardDraft(id) {
  const d = saveDraft(id, { discarded: true });
  await log('doc.draft_discard', { note: TYPES[d.type].label });
}

function cleanLines(lines, type) {
  if (!lines?.length) throw new Error('Tiada item');
  return lines.map((l) => {
    const p = l.product_id ? db.find('products', l.product_id) : null;
    if (l.product_id && !p) throw new Error('Produk tidak dijumpai');
    const desc = String(l.desc ?? '').trim() || p?.name;
    if (!desc) throw new Error('Keterangan item diperlukan');
    if (!Number.isInteger(l.qty) || l.qty < 1) throw new Error(`Kuantiti tidak sah: ${desc}`);
    if (!Number.isInteger(l.price) || l.price < 0) throw new Error(`Harga tidak sah: ${desc}`);
    return {
      product_id: p?.id ?? null,
      desc,
      qty: l.qty,
      price: l.price,
      // harga rujukan dari data induk semasa dikeluarkan
      ref_price: p ? (type === 'PO' ? p.cost : p.price) : null,
    };
  });
}

// Keluarkan draf -> dokumen berkunci
export async function issue(draftId, approver = null) {
  const u = me();
  const d = findDraft(draftId);
  if (!d || d.discarded) throw new Error('Draf tidak dijumpai');
  const T = TYPES[d.type];

  const c = contacts.find(d.contact_id);
  if (!c) throw new Error(`Pilih ${T.party === 'supplier' ? 'pembekal' : 'pelanggan'}`);
  const lines = cleanLines(d.lines, d.type);
  const discount = d.discount || 0;
  if (!Number.isInteger(discount) || discount < 0) throw new Error('Diskaun tidak sah');
  if (!TAX_RATES.includes(d.tax_pct)) throw new Error('Kadar cukai tidak sah');
  const totals = calc({ lines, discount, tax_pct: d.tax_pct });
  if (totals.net < 0) throw new Error('Diskaun melebihi jumlah');
  const days = Number.isInteger(d.days) && d.days >= 0 ? d.days : T.days;

  // Semakan harga
  let approvedBy = null;
  let check = null;
  if (d.type === 'INV') {
    const list = lines.reduce((t, l) => t + l.qty * (l.ref_price ?? l.price), 0);
    const below = list - totals.net;
    if (needsApproval(list, below)) check = { kind: 'doc.discount', amount: below };
  }
  if (d.type === 'PO') {
    const ref = lines.reduce((t, l) => t + l.qty * (l.ref_price ?? l.price), 0);
    const over = lines.reduce((t, l) => t + l.qty * Math.max(0, l.price - (l.ref_price ?? l.price)), 0);
    if (over * 100 > ref * PRICE_LIMIT_PCT) check = { kind: 'doc.po_price', amount: over };
  }
  if (check) approvedBy = await auth.approval(approver);

  const doc = db.insert('docs', {
    type: d.type,
    no: nextNo(d.type),
    party: contacts.snapshot(c),
    lines,
    ...totals,
    tax_pct: d.tax_pct,
    notes: String(d.notes ?? '').trim(),
    due_at: new Date(Date.now() + days * DAY).toISOString(),
    ref_doc_id: d.ref_doc_id || null,
    approved_by: approvedBy,
    user_id: u.id,
    user_name: u.name,
  });
  db.update('doc_drafts', d.id, { discarded: true, issued_doc_id: doc.id });

  await log('doc.issue', { doc_id: doc.id, no: doc.no, name: c.name, amount: doc.total, note: T.label });
  if (check) {
    await log(check.kind, { doc_id: doc.id, no: doc.no, amount: check.amount, name: approvedBy.name });
  }
  return doc;
}

// ---------- Keadaan invois ----------

export function related(docId) {
  return db.where('docs', (x) => x.invoice_id === docId || x.ref_doc_id === docId);
}

export function invoiceState(id) {
  const doc = findDoc(id);
  if (!doc || doc.type !== 'INV') return null;
  const rel = db.where('docs', (x) => x.invoice_id === id && active(x));
  const receipts = rel.filter((x) => x.type === 'RC');
  const credits = rel.filter((x) => x.type === 'CN');
  const dos = rel.filter((x) => x.type === 'DO');
  const paid = receipts.reduce((t, r) => t + r.amount, 0);
  const credited = credits.reduce((t, r) => t + r.amount, 0);
  const balance = doc.total - paid - credited;
  const voided = !!voidOf(id);

  const delivered = {};
  for (const d of dos) for (const l of d.lines) delivered[l.product_id] = (delivered[l.product_id] || 0) + l.qty;

  let status = voided ? 'void' : balance <= 0 ? 'paid' : paid + credited > 0 ? 'partial' : 'unpaid';
  const overdue = !voided && balance > 0 && Date.now() > new Date(doc.due_at).getTime();
  return { doc, receipts, credits, dos, paid, credited, balance, status, overdue, delivered, voided };
}

export const STATUS = { unpaid: 'Belum bayar', partial: 'Separa', paid: 'Lunas', void: 'Batal' };

function openInvoice(id) {
  const s = invoiceState(id);
  if (!s) throw new Error('Invois tidak dijumpai');
  if (s.voided) throw new Error('Invois sudah dibatal');
  return s;
}

function cashShiftFor(u) {
  const sh = cash.currentShift();
  if (!sh) throw new Error('Buka syif dulu untuk urusan tunai');
  if (sh.user_id !== u.id && !cash.isManager(u)) throw new Error(`Syif ini milik ${sh.user_name}`);
  return sh;
}

// ---------- Resit ----------

export async function receivePayment(invoiceId, { amount, method, payRef = '' }) {
  const u = me();
  const s = openInvoice(invoiceId);
  if (!Number.isInteger(amount) || amount <= 0) throw new Error('Jumlah tidak sah');
  if (amount > s.balance) throw new Error(`Melebihi baki ${cash.fmtRM(s.balance)}`);
  if (!METHODS[method]) throw new Error('Kaedah bayaran tidak sah');
  const ref = payRef.trim();
  if (method !== 'cash' && !ref) throw new Error('No. rujukan bayaran diperlukan');
  const shift = method === 'cash' ? cashShiftFor(u) : null;

  const rc = db.insert('docs', {
    type: 'RC',
    no: nextNo('RC'),
    invoice_id: s.doc.id,
    invoice_no: s.doc.no,
    party: s.doc.party,
    amount,
    total: amount,
    method,
    pay_ref: ref,
    shift_id: shift?.id ?? null,
    user_id: u.id,
    user_name: u.name,
  });
  if (shift) cash.postDocCash(u, shift.id, 'invoice', amount, rc.id, rc.no);
  await log('doc.receipt', { doc_id: rc.id, no: rc.no, amount, name: s.doc.party.name, note: `${s.doc.no} · ${METHODS[method]}` });
  return rc;
}

// ---------- Nota kredit ----------

export async function creditNote(invoiceId, amount, reason, approver = null) {
  const u = me();
  const s = openInvoice(invoiceId);
  if (!reason?.trim()) throw new Error('Sebab diperlukan');
  if (!Number.isInteger(amount) || amount <= 0) throw new Error('Jumlah tidak sah');
  if (amount > s.balance) throw new Error(`Maksimum ${cash.fmtRM(s.balance)} (baki belum bayar)`);
  const approvedBy = await auth.approval(approver);

  const cn = db.insert('docs', {
    type: 'CN',
    no: nextNo('CN'),
    invoice_id: s.doc.id,
    invoice_no: s.doc.no,
    party: s.doc.party,
    amount,
    total: amount,
    reason: reason.trim(),
    approved_by: approvedBy,
    user_id: u.id,
    user_name: u.name,
  });
  await log('doc.credit', { doc_id: cn.id, no: cn.no, amount, name: approvedBy.name, note: `${s.doc.no} · ${cn.reason}` });
  return cn;
}

// ---------- Nota hantaran ----------

// Baki yang belum dihantar bagi setiap produk dalam invois
export function undelivered(invoiceId) {
  const s = invoiceState(invoiceId);
  if (!s) return [];
  const need = {};
  for (const l of s.doc.lines) {
    if (!l.product_id) continue;
    need[l.product_id] = (need[l.product_id] || { product_id: l.product_id, desc: l.desc, qty: 0 });
    need[l.product_id].qty += l.qty;
  }
  return Object.values(need)
    .map((n) => ({ ...n, qty: n.qty - (s.delivered[n.product_id] || 0) }))
    .filter((n) => n.qty > 0);
}

// lines: [{ product_id, qty, serials }]
export async function deliver(invoiceId, lines) {
  const u = me();
  const s = openInvoice(invoiceId);
  const left = Object.fromEntries(undelivered(invoiceId).map((n) => [n.product_id, n]));
  const clean = lines
    .filter((l) => l.qty > 0 || l.serials?.length)
    .map((l) => {
      const p = db.find('products', l.product_id);
      if (!p || !left[p.id]) throw new Error('Item tiada dalam invois / sudah dihantar');
      const serials = p.track_serial ? (l.serials || []).filter(Boolean) : [];
      const qty = p.track_serial ? serials.length : l.qty;
      if (!Number.isInteger(qty) || qty < 1) throw new Error(`Kuantiti tidak sah: ${p.name}`);
      if (qty > left[p.id].qty) throw new Error(`${p.name}: baki untuk dihantar ${left[p.id].qty}`);
      stock.checkAvailable(p, qty, serials);
      return { product_id: p.id, desc: left[p.id].desc, qty, serials };
    });
  if (!clean.length) throw new Error('Tiada item untuk dihantar');

  const dn = db.insert('docs', {
    type: 'DO',
    no: nextNo('DO'),
    invoice_id: s.doc.id,
    invoice_no: s.doc.no,
    party: s.doc.party,
    lines: clean,
    total: 0,
    user_id: u.id,
    user_name: u.name,
  });
  for (const l of clean) stock.postOut(u, l, 'do', dn.id);
  await log('doc.deliver', {
    doc_id: dn.id,
    no: dn.no,
    name: s.doc.party.name,
    note: `${s.doc.no} · ${clean.reduce((t, l) => t + l.qty, 0)} unit`,
  });
  return dn;
}

// ---------- Batal ----------

export async function voidDoc(docId, reason, approver = null) {
  const u = me();
  const d = findDoc(docId);
  if (!d) throw new Error('Dokumen tidak dijumpai');
  if (voidOf(d.id)) throw new Error('Dokumen sudah dibatal');
  if (!reason?.trim()) throw new Error('Sebab pembatalan diperlukan');

  let shift = null;
  if (d.type === 'INV') {
    const s = invoiceState(d.id);
    if (s.receipts.length || s.credits.length || s.dos.length) {
      throw new Error('Batal resit / nota kredit / DO invois ini dulu');
    }
  }
  if (d.type === 'RC' && d.method === 'cash') {
    shift = cashShiftFor(u);
    if (cash.expected(shift.id) < d.amount) throw new Error('Tunai dalam laci tidak cukup');
  }
  const approvedBy = await auth.approval(approver);

  db.insert('doc_voids', {
    doc_id: d.id,
    no: d.no,
    reason: reason.trim(),
    approved_by: approvedBy,
    user_id: u.id,
    user_name: u.name,
  });
  if (shift) cash.postDocCash(u, shift.id, 'invoice_void', d.amount, d.id, `${d.no} batal`);
  if (d.type === 'DO') for (const l of d.lines) stock.postIn(u, l, 'do_void', d.id);

  await log('doc.void', {
    doc_id: d.id,
    no: d.no,
    amount: d.total,
    name: approvedBy.name,
    note: reason.trim(),
  });
}

// ---------- Senarai ----------

export const listDocs = (type) => db.where('docs', (d) => d.type === type).reverse();

export function outstanding() {
  return db
    .where('docs', (d) => d.type === 'INV')
    .map((d) => invoiceState(d.id))
    .filter((s) => !s.voided && s.balance > 0);
}

export async function logShare(docId, channel) {
  const d = findDoc(docId);
  if (d) await log('doc.share', { doc_id: d.id, no: d.no, name: d.party?.name, note: channel });
}
