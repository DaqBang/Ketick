// Stok & nombor siri. Semua pergerakan append-only dalam stock_moves.
// Baki = jumlah qty semua pergerakan. Siri "dalam stok" = jumlah pergerakan siri itu = 1.
//
// Kawalan fraud:
// - Terima stok wajib ada pembekal + no. DO/invois.
// - Siri tidak boleh diterima dua kali selagi masih dalam stok.
// - Stok tidak boleh jadi negatif (jual tanpa rekod terima = disekat).
// - Kiraan stok BUTA: staf tidak nampak baki sistem. Beza = amaran.
// - Laras stok (rosak/hilang) perlu sebab + kelulusan manager/owner.

import { db } from './db.js';
import { log } from './audit.js';
import { session } from './session.js';
import * as auth from './auth.js';

export const REASONS = {
  receive: 'Terima stok',
  sale: 'Jualan',
  refund: 'Pulangan',
  adjust: 'Laras',
  count: 'Laras kiraan',
};

function me() {
  const u = session.get();
  if (!u) throw new Error('Sila log masuk');
  return u;
}

const product = (id) => {
  const p = db.find('products', id);
  if (!p) throw new Error('Produk tidak dijumpai');
  return p;
};

export const movesOf = (productId) => db.where('stock_moves', (m) => m.product_id === productId);

export const balance = (productId) => movesOf(productId).reduce((t, m) => t + m.qty, 0);

export function serialsInStock(productId) {
  const sum = new Map();
  for (const m of movesOf(productId)) {
    if (!m.serial) continue;
    sum.set(m.serial, (sum.get(m.serial) || 0) + m.qty);
  }
  return [...sum].filter(([, q]) => q > 0).map(([s]) => s);
}

// Senarai siri dari teks (satu per baris / koma), buang ruang kosong & pendua
export const parseSerials = (text) => [
  ...new Set(
    String(text ?? '')
      .split(/[\n,]+/)
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean)
  ),
];

function move(u, data) {
  return db.insert('stock_moves', { user_id: u.id, user_name: u.name, ...data });
}

// Dipanggil oleh sales.js (jualan & pulangan). Semak sebelum tulis.
export function checkAvailable(p, qty, serials = []) {
  if (p.track_serial) {
    const inStock = new Set(serialsInStock(p.id));
    if (serials.length !== qty || new Set(serials).size !== qty) {
      throw new Error(`Pilih ${qty} nombor siri berbeza untuk ${p.name}`);
    }
    for (const s of serials) {
      if (!inStock.has(s)) throw new Error(`Siri ${s} tiada dalam stok`);
    }
  } else if (balance(p.id) < qty) {
    throw new Error(`Stok ${p.name} tidak cukup (rekod terima stok dulu)`);
  }
}

export function postOut(u, line, reason, ref) {
  if (line.serials?.length) {
    for (const s of line.serials) move(u, { product_id: line.product_id, qty: -1, serial: s, reason, ref });
  } else {
    move(u, { product_id: line.product_id, qty: -line.qty, reason, ref });
  }
}

export function postIn(u, line, reason, ref) {
  if (line.serials?.length) {
    for (const s of line.serials) move(u, { product_id: line.product_id, qty: 1, serial: s, reason, ref });
  } else {
    move(u, { product_id: line.product_id, qty: line.qty, reason, ref });
  }
}

// ---------- Terima stok ----------

export async function receive({ supplier, docRef, lines }) {
  const u = me();
  if (!supplier?.trim()) throw new Error('Nama pembekal diperlukan');
  if (!docRef?.trim()) throw new Error('No. DO / invois pembekal diperlukan');
  if (!lines?.length) throw new Error('Tiada barang');

  const seen = new Set();
  const clean = lines.map((l) => {
    const p = product(l.product_id);
    if (!p.active) throw new Error(`${p.name} tidak aktif`);
    if (!Number.isInteger(l.cost) || l.cost < 0) throw new Error('Kos tidak sah');
    let qty = l.qty;
    let serials = [];
    if (p.track_serial) {
      serials = l.serials || [];
      if (!serials.length) throw new Error(`Masukkan nombor siri untuk ${p.name}`);
      const inStock = new Set(serialsInStock(p.id));
      for (const s of serials) {
        const key = `${p.id}:${s}`;
        if (seen.has(key)) throw new Error(`Siri ${s} berulang`);
        if (inStock.has(s)) throw new Error(`Siri ${s} sudah ada dalam stok`);
        seen.add(key);
      }
      qty = serials.length;
    } else if (!Number.isInteger(qty) || qty < 1) {
      throw new Error('Kuantiti tidak sah');
    }
    return { product_id: p.id, name: p.name, qty, cost: l.cost, serials };
  });

  const rec = db.insert('stock_receipts', {
    supplier: supplier.trim(),
    doc_ref: docRef.trim(),
    lines: clean,
    total: clean.reduce((t, l) => t + l.qty * l.cost, 0),
    user_id: u.id,
    user_name: u.name,
  });
  for (const l of clean) postIn(u, l, 'receive', rec.id);

  await log('stock.receive', {
    receipt_id: rec.id,
    amount: rec.total,
    note: `${rec.supplier} · ${rec.doc_ref} · ${clean.reduce((t, l) => t + l.qty, 0)} unit`,
  });
  return rec;
}

export const receipts = (limit = 10) => db.all('stock_receipts').slice(-limit).reverse();

// ---------- Laras manual (rosak / hilang / guna sendiri) ----------

export async function adjust({ productId, qty, serial, reason, approver }) {
  const u = me();
  const p = product(productId);
  if (!reason?.trim()) throw new Error('Sebab diperlukan');
  let line;
  if (p.track_serial) {
    const s = String(serial ?? '').trim().toUpperCase();
    if (!serialsInStock(p.id).includes(s)) throw new Error('Pilih siri dalam stok');
    line = { product_id: p.id, qty: 1, serials: [s] };
  } else {
    if (!Number.isInteger(qty) || qty === 0) throw new Error('Kuantiti tidak sah');
    if (balance(p.id) + qty < 0) throw new Error('Stok tidak boleh jadi negatif');
    line = { product_id: p.id, qty: Math.abs(qty) };
  }
  const approvedBy = await auth.approval(approver);
  const adj = db.insert('stock_adjusts', {
    product_id: p.id,
    qty: p.track_serial ? -1 : qty,
    serial: line.serials?.[0] ?? null,
    reason: reason.trim(),
    user_id: u.id,
    user_name: u.name,
    approved_by: approvedBy,
  });
  if (adj.qty < 0) postOut(u, line, 'adjust', adj.id);
  else postIn(u, line, 'adjust', adj.id);

  await log('stock.adjust', {
    product_id: p.id,
    name: p.name,
    qty: adj.qty,
    serial: adj.serial,
    amount: Math.abs(adj.qty) * p.cost,
    note: `${adj.reason} · lulus ${approvedBy.name}`,
  });
  return adj;
}

// ---------- Kiraan stok (buta) ----------
// entries: { [productId]: number }  untuk produk biasa
//          { [productId]: "SIRI1\nSIRI2" } untuk produk bersiri
export async function submitCount(entries, note = '') {
  const u = me();
  const items = db.where('products', (p) => p.active && entries[p.id] !== undefined && entries[p.id] !== '');
  if (!items.length) throw new Error('Tiada kiraan dimasukkan');

  const lines = items.map((p) => {
    if (p.track_serial) {
      const system = serialsInStock(p.id);
      const found = parseSerials(entries[p.id]);
      const sys = new Set(system);
      const fnd = new Set(found);
      const missing = system.filter((s) => !fnd.has(s));
      const extra = found.filter((s) => !sys.has(s));
      const counted = found.length - extra.length;
      return {
        product_id: p.id,
        name: p.name,
        system: system.length,
        counted,
        diff: counted - system.length,
        value: (counted - system.length) * p.cost,
        missing,
        extra,
      };
    }
    const counted = Number(entries[p.id]);
    if (!Number.isInteger(counted) || counted < 0) throw new Error(`Kiraan ${p.name} tidak sah`);
    const system = balance(p.id);
    return {
      product_id: p.id,
      name: p.name,
      system,
      counted,
      diff: counted - system,
      value: (counted - system) * p.cost,
    };
  });

  const rec = db.insert('stock_counts', {
    lines,
    note: note.trim(),
    value: lines.reduce((t, l) => t + l.value, 0),
    user_id: u.id,
    user_name: u.name,
  });
  await log('stock.count', { count_id: rec.id, note: `${lines.length} produk` });
  const bad = lines.filter((l) => l.diff !== 0 || l.extra?.length);
  if (bad.length) {
    await log('stock.variance', {
      count_id: rec.id,
      variance: rec.value,
      note: bad.map((l) => `${l.name} ${l.diff > 0 ? '+' : ''}${l.diff}`).join(', '),
    });
  }
  return rec;
}

export const counts = (limit = 10) => db.all('stock_counts').slice(-limit).reverse();
export const findCount = (id) => db.find('stock_counts', id);
export const countApplied = (id) => db.where('stock_moves', (m) => m.reason === 'count' && m.ref === id).length > 0;

// Laras sistem ikut kiraan. Beza dikira semasa kiraan; jualan selepas kiraan kekal.
export async function applyCount(countId, approver) {
  const u = me();
  const c = findCount(countId);
  if (!c) throw new Error('Kiraan tidak dijumpai');
  if (countApplied(countId)) throw new Error('Kiraan ini sudah dilaras');
  if (!c.lines.some((l) => l.diff !== 0)) throw new Error('Tiada beza untuk dilaras');
  const approvedBy = await auth.approval(approver);

  for (const l of c.lines) {
    if (l.missing) {
      const still = new Set(serialsInStock(l.product_id));
      const gone = l.missing.filter((s) => still.has(s));
      if (gone.length) postOut(u, { product_id: l.product_id, qty: gone.length, serials: gone }, 'count', c.id);
    } else if (l.diff < 0) {
      const qty = Math.min(-l.diff, balance(l.product_id));
      if (qty > 0) postOut(u, { product_id: l.product_id, qty }, 'count', c.id);
    } else if (l.diff > 0) {
      postIn(u, { product_id: l.product_id, qty: l.diff }, 'count', c.id);
    }
  }
  await log('stock.count_apply', {
    count_id: c.id,
    variance: c.value,
    note: `lulus ${approvedBy.name}`,
  });
}

// Ringkasan untuk manager
export function summary() {
  return db
    .where('products', (p) => p.active)
    .map((p) => {
      const qty = p.track_serial ? serialsInStock(p.id).length : balance(p.id);
      return { ...p, qty, value: qty * p.cost };
    });
}
