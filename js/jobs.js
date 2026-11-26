// Job Order: repair & pemasangan.
// Rekod job (jobs) tetap. Semua perubahan ialah event append-only (job_events);
// status, parts, caj, bayaran semuanya diterbitkan dari event.
//
// Kawalan fraud:
// - Parts keluar dari stok ikut siri dan TERUS dicaj pada harga jual.
// - Job tidak boleh diserah (tutup) selagi ada baki belum bayar.
// - Bayaran tunai wajib syif dibuka; bukan tunai wajib no. rujukan.
// - Buang part / caj tidak boleh jadikan jumlah kurang dari yang sudah dibayar.
// - Diskaun melebihi had perlu PIN manager/owner.
// - Batal job perlu sebab + kelulusan; parts dipulang ke stok, bayaran dipulang.

import { db } from './db.js';
import { log } from './audit.js';
import { session } from './session.js';
import * as auth from './auth.js';
import * as cash from './cash.js';
import * as stock from './stock.js';
import { needsApproval, METHODS } from './sales.js';
import * as contacts from './customers.js';

export const TYPES = { repair: 'Repair', install: 'Pemasangan' };
export const STATUS = {
  open: 'Baru',
  in_progress: 'Dalam kerja',
  done: 'Siap',
  closed: 'Diserah',
  cancelled: 'Batal',
};
export { METHODS };

// Peralihan status yang dibenarkan (closed & cancelled ada fungsi sendiri)
const FLOW = {
  open: ['in_progress'],
  in_progress: ['done'],
  done: ['in_progress'],
};

function me() {
  const u = session.get();
  if (!u) throw new Error('Sila log masuk');
  return u;
}

const nextNo = () => `J${String(db.all('jobs').length + 1).padStart(6, '0')}`;

function event(u, jobId, kind, data = {}) {
  return db.insert('job_events', { job_id: jobId, kind, user_id: u.id, user_name: u.name, ...data });
}

export const eventsOf = (jobId) => db.where('job_events', (e) => e.job_id === jobId);

// Keadaan semasa job, diterbitkan dari event
export function state(jobId) {
  const job = db.find('jobs', jobId);
  if (!job) return null;
  const events = eventsOf(jobId);
  const voided = new Set(events.filter((e) => e.kind === 'void').map((e) => e.ref));

  let status = 'open';
  let assigned = job.assigned ?? null;
  let discount = 0;
  let discountBy = null;
  for (const e of events) {
    if (e.kind === 'status') status = e.status;
    if (e.kind === 'cancel') status = 'cancelled';
    if (e.kind === 'assign') assigned = { id: e.to_id, name: e.to_name };
    if (e.kind === 'discount') {
      discount = e.amount;
      discountBy = e.approved_by;
    }
  }
  const parts = events.filter((e) => e.kind === 'part' && !voided.has(e.id));
  const charges = events.filter((e) => e.kind === 'charge' && !voided.has(e.id));
  const payments = events.filter((e) => e.kind === 'payment');
  const refunds = events.filter((e) => e.kind === 'pay_refund');

  const subtotal =
    parts.reduce((t, p) => t + p.line, 0) + charges.reduce((t, c) => t + c.amount, 0);
  const total = subtotal - discount;
  const paid =
    payments.reduce((t, p) => t + p.amount, 0) - refunds.reduce((t, r) => t + r.amount, 0);

  return {
    job,
    status,
    assigned,
    parts,
    charges,
    payments,
    refunds,
    discount,
    discountBy,
    subtotal,
    total,
    paid,
    due: total - paid,
    events,
    locked: status === 'closed' || status === 'cancelled',
  };
}

function open(jobId) {
  const s = state(jobId);
  if (!s) throw new Error('Job tidak dijumpai');
  if (s.locked) throw new Error(`Job sudah ${STATUS[s.status].toLowerCase()}`);
  return s;
}

function cashShiftFor(u) {
  const sh = cash.currentShift();
  if (!sh) throw new Error('Buka syif dulu untuk urusan tunai');
  if (sh.user_id !== u.id && !cash.isManager(u)) throw new Error(`Syif ini milik ${sh.user_name}`);
  return sh;
}

// ---------- Cipta & status ----------

// contactId: pelanggan dari CRM. Jika kosong, pelanggan dicari ikut no. telefon
// atau didaftar baru dalam CRM secara automatik.
export async function create({ type, contactId, customer, phone, device, deviceSerial, address, problem, assignTo }) {
  const u = me();
  if (!TYPES[type]) throw new Error('Jenis job tidak sah');
  if (!problem?.trim()) throw new Error('Masalah / skop kerja diperlukan');
  let c = contactId ? contacts.find(contactId) : null;
  if (contactId && !c) throw new Error('Pelanggan tidak dijumpai');
  if (!c) {
    if (!customer?.trim()) throw new Error('Nama pelanggan diperlukan');
    if (!phone?.trim()) throw new Error('No. telefon pelanggan diperlukan');
    c = await contacts.ensure({ name: customer, phone });
  }
  const tech = assignTo ? db.find('users', assignTo) : null;

  const job = db.insert('jobs', {
    no: nextNo(),
    type,
    contact_id: c.id,
    customer: c.name,
    phone: c.phone,
    device: device?.trim() || '',
    device_serial: deviceSerial?.trim().toUpperCase() || '',
    address: address?.trim() || c.address || '',
    problem: problem.trim(),
    assigned: tech ? { id: tech.id, name: tech.name } : null,
    user_id: u.id,
    user_name: u.name,
  });
  await log('job.create', { job_id: job.id, no: job.no, name: job.customer, note: TYPES[type] });
  return job;
}

export async function setStatus(jobId, status) {
  const u = me();
  const s = open(jobId);
  if (!FLOW[s.status]?.includes(status)) {
    throw new Error(`Tidak boleh tukar dari ${STATUS[s.status]} ke ${STATUS[status] || status}`);
  }
  event(u, jobId, 'status', { status });
  await log('job.status', { job_id: jobId, no: s.job.no, note: `${STATUS[s.status]} → ${STATUS[status]}` });
}

export async function assign(jobId, userId) {
  const u = me();
  const s = open(jobId);
  const t = db.find('users', userId);
  if (!t || !t.active) throw new Error('Pengguna tidak sah');
  event(u, jobId, 'assign', { to_id: t.id, to_name: t.name });
  await log('job.assign', { job_id: jobId, no: s.job.no, name: t.name });
}

export async function note(jobId, text) {
  const u = me();
  const s = open(jobId);
  if (!text?.trim()) throw new Error('Catatan kosong');
  event(u, jobId, 'note', { text: text.trim() });
}

// ---------- Parts & caj ----------

export async function addPart(jobId, { productId, qty = 1, serials = [] }) {
  const u = me();
  const s = open(jobId);
  const p = db.find('products', productId);
  if (!p || !p.active) throw new Error('Produk tidak sah');
  if (p.track_serial) {
    if (!serials.length) throw new Error('Pilih nombor siri');
    qty = serials.length;
  }
  if (!Number.isInteger(qty) || qty < 1) throw new Error('Kuantiti tidak sah');
  stock.checkAvailable(p, qty, serials);

  const e = event(u, jobId, 'part', {
    product_id: p.id,
    name: p.name,
    qty,
    price: p.price,
    cost: p.cost,
    serials: p.track_serial ? serials : [],
    line: p.price * qty,
  });
  stock.postOut(u, e, 'job', jobId);
  await log('job.part', {
    job_id: jobId,
    no: s.job.no,
    name: p.name,
    amount: e.line,
    note: `${qty} unit${e.serials.length ? ' · ' + e.serials.join(', ') : ''}`,
  });
  return e;
}

export async function addCharge(jobId, desc, amount) {
  const u = me();
  const s = open(jobId);
  if (!desc?.trim()) throw new Error('Keterangan caj diperlukan');
  if (!Number.isInteger(amount) || amount <= 0) throw new Error('Jumlah tidak sah');
  event(u, jobId, 'charge', { desc: desc.trim(), amount });
  await log('job.charge', { job_id: jobId, no: s.job.no, amount, note: desc.trim() });
}

// Buang part (pulang ke stok) atau caj. Tidak boleh jika jumlah jadi < dibayar.
export async function voidLine(jobId, eventId, reason) {
  const u = me();
  const s = open(jobId);
  if (!reason?.trim()) throw new Error('Sebab diperlukan');
  const line = [...s.parts, ...s.charges].find((e) => e.id === eventId);
  if (!line) throw new Error('Baris tidak dijumpai');
  const amount = line.kind === 'part' ? line.line : line.amount;
  if (s.total - amount < s.paid) throw new Error('Jumlah tidak boleh kurang dari yang sudah dibayar');
  if (s.subtotal - amount < s.discount) throw new Error('Buang diskaun dulu');

  event(u, jobId, 'void', { ref: line.id, reason: reason.trim() });
  if (line.kind === 'part') stock.postIn(u, line, 'job_return', jobId);
  await log('job.void', {
    job_id: jobId,
    no: s.job.no,
    name: line.name || line.desc,
    amount,
    note: reason.trim(),
  });
}

export async function setDiscount(jobId, amount, approver = null) {
  const u = me();
  const s = open(jobId);
  if (!Number.isInteger(amount) || amount < 0 || amount > s.subtotal) throw new Error('Diskaun tidak sah');
  if (s.subtotal - amount < s.paid) throw new Error('Jumlah tidak boleh kurang dari yang sudah dibayar');
  const approvedBy = needsApproval(s.subtotal, amount) ? await auth.approval(approver) : null;
  event(u, jobId, 'discount', { amount, approved_by: approvedBy });
  if (approvedBy) {
    await log('job.discount', { job_id: jobId, no: s.job.no, amount, name: approvedBy.name });
  }
}

// ---------- Bayaran ----------

export async function pay(jobId, { amount, method, payRef = '' }) {
  const u = me();
  const s = open(jobId);
  if (!Number.isInteger(amount) || amount <= 0) throw new Error('Jumlah tidak sah');
  if (!METHODS[method]) throw new Error('Kaedah bayaran tidak sah');
  const ref = payRef.trim();
  if (method !== 'cash' && !ref) throw new Error('No. rujukan bayaran diperlukan');
  // Deposit dibenarkan sebelum caj dimasukkan; selepas ada caj, tidak boleh lebih bayar
  if (s.total > 0 && amount > s.due) throw new Error(`Melebihi baki ${cash.fmtRM(s.due)}`);

  const shift = method === 'cash' ? cashShiftFor(u) : null;
  const e = event(u, jobId, 'payment', { amount, method, pay_ref: ref, shift_id: shift?.id ?? null });
  if (shift) cash.postJobCash(u, shift.id, 'job', amount, e.id, s.job.no);
  await log('job.payment', { job_id: jobId, no: s.job.no, amount, note: METHODS[method] });
  return e;
}

// Serah kepada pelanggan: mesti siap & lunas
export async function close(jobId) {
  const u = me();
  const s = open(jobId);
  if (s.status !== 'done') throw new Error('Job mesti berstatus Siap dulu');
  if (s.total <= 0) throw new Error('Tiada caj direkod. Masukkan parts / upah dulu');
  if (s.due > 0) throw new Error(`Baki belum bayar ${cash.fmtRM(s.due)}`);
  if (s.due < 0) throw new Error(`Lebih bayar ${cash.fmtRM(-s.due)}. Betulkan dulu`);
  event(u, jobId, 'status', { status: 'closed' });
  await log('job.close', { job_id: jobId, no: s.job.no, amount: s.total });
}

// Batal: parts pulang ke stok, semua bayaran dipulang. Perlu kelulusan.
export async function cancel(jobId, reason, approver = null) {
  const u = me();
  const s = open(jobId);
  if (!reason?.trim()) throw new Error('Sebab pembatalan diperlukan');

  const cashBack = s.payments.filter((p) => p.method === 'cash');
  const cashOwed =
    cashBack.reduce((t, p) => t + p.amount, 0) -
    s.refunds.filter((r) => r.method === 'cash').reduce((t, r) => t + r.amount, 0);
  let shift = null;
  if (cashOwed > 0) {
    shift = cashShiftFor(u);
    if (cash.expected(shift.id) < cashOwed) throw new Error('Tunai dalam laci tidak cukup untuk pulangan');
  }
  const approvedBy = await auth.approval(approver);

  for (const p of s.parts) {
    event(u, jobId, 'void', { ref: p.id, reason: 'job batal' });
    stock.postIn(u, p, 'job_return', jobId);
  }
  // Pulang ikut kaedah asal
  const byMethod = {};
  for (const p of s.payments) byMethod[p.method] = (byMethod[p.method] || 0) + p.amount;
  for (const r of s.refunds) byMethod[r.method] = (byMethod[r.method] || 0) - r.amount;
  for (const [method, amount] of Object.entries(byMethod)) {
    if (amount <= 0) continue;
    const r = event(u, jobId, 'pay_refund', { amount, method, shift_id: method === 'cash' ? shift.id : null });
    if (method === 'cash') cash.postJobCash(u, shift.id, 'job_refund', amount, r.id, s.job.no);
  }
  event(u, jobId, 'cancel', { reason: reason.trim(), approved_by: approvedBy });
  await log('job.cancel', {
    job_id: jobId,
    no: s.job.no,
    amount: s.paid,
    name: approvedBy.name,
    note: reason.trim(),
  });
}

// ---------- Senarai ----------

export function list(filter = 'active') {
  return db
    .all('jobs')
    .reverse()
    .map((j) => state(j.id))
    .filter((s) =>
      filter === 'active' ? !s.locked : filter === 'closed' ? s.status === 'closed' : s.status === 'cancelled'
    );
}

export const activeCount = () => db.all('jobs').filter((j) => !state(j.id).locked).length;
