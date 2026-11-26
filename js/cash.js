// Tunai & Syif. Semua pergerakan tunai append-only dalam cash_moves.
// Status syif diterbitkan dari event 'open' dan 'close' — tiada rekod yang di-update.
// Kiraan buta: staf tidak nampak jumlah dijangka sebelum tutup syif.
// Jumlah disimpan dalam SEN (integer) untuk elak ralat titik perpuluhan.

import { db, uid } from './db.js';
import { log } from './audit.js';
import { session } from './session.js';

export const VARIANCE_LIMIT = 500; // sen = RM 5.00

export const TYPES = {
  open: 'Float buka',
  in: 'Tunai masuk',
  out: 'Belanja',
  deposit: 'Masuk bank',
  drawing: 'Pengeluaran owner',
  sale: 'Jualan',
  refund: 'Pulangan',
  reverse: 'Pembalikan',
  close: 'Tutup syif',
};

// +1 tambah duit dalam laci, -1 kurang
const SIGN = { open: 1, in: 1, sale: 1, out: -1, deposit: -1, drawing: -1, refund: -1 };
const MANUAL = new Set(['in', 'out', 'deposit', 'drawing']);

export function toSen(value) {
  const s = String(value ?? '').trim().replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) throw new Error('Jumlah tidak sah');
  const [ringgit, cents = ''] = s.split('.');
  return Number(ringgit) * 100 + Number(cents.padEnd(2, '0'));
}

export const fmtRM = (sen) => `${sen < 0 ? '-' : ''}RM ${(Math.abs(sen) / 100).toFixed(2)}`;

export const isManager = (u) => u?.role === 'owner' || u?.role === 'manager';

function me() {
  const u = session.get();
  if (!u) throw new Error('Sila log masuk');
  return u;
}

// Syif yang masih dibuka (satu laci untuk satu syarikat buat masa ini)
export function currentShift() {
  const moves = db.all('cash_moves');
  const closed = new Set(moves.filter((m) => m.type === 'close').map((m) => m.shift_id));
  const open = moves.find((m) => m.type === 'open' && !closed.has(m.shift_id));
  if (!open) return null;
  return {
    id: open.shift_id,
    user_id: open.user_id,
    user_name: open.user_name,
    opened_at: open.created_at,
  };
}

export const shiftMoves = (shiftId) => db.where('cash_moves', (m) => m.shift_id === shiftId);

export function reversedIds(moves) {
  return new Set(moves.filter((m) => m.type === 'reverse').map((m) => m.ref));
}

export function expected(shiftId) {
  const moves = shiftMoves(shiftId);
  const reversed = reversedIds(moves);
  return moves
    .filter((m) => SIGN[m.type] && !reversed.has(m.id))
    .reduce((sum, m) => sum + SIGN[m.type] * m.amount, 0);
}

function insertMove(u, shiftId, type, amount, extra = {}) {
  return db.insert('cash_moves', {
    shift_id: shiftId,
    type,
    amount,
    user_id: u.id,
    user_name: u.name,
    ...extra,
  });
}

function requireShiftAccess(u) {
  const sh = currentShift();
  if (!sh) throw new Error('Tiada syif dibuka');
  if (sh.user_id !== u.id && !isManager(u)) {
    throw new Error(`Syif ini milik ${sh.user_name}`);
  }
  return sh;
}

export async function startShift(floatSen) {
  const u = me();
  const sh = currentShift();
  if (sh) throw new Error(`Syif sudah dibuka oleh ${sh.user_name}`);
  if (floatSen < 0) throw new Error('Float tidak sah');
  const shiftId = uid();
  insertMove(u, shiftId, 'open', floatSen);
  await log('cash.open', { shift_id: shiftId, amount: floatSen });
  return shiftId;
}

export async function addMove(type, amountSen, note) {
  const u = me();
  const sh = requireShiftAccess(u);
  if (!MANUAL.has(type)) throw new Error('Jenis tidak sah');
  if (type === 'drawing' && u.role !== 'owner') {
    throw new Error('Hanya owner boleh buat pengeluaran owner');
  }
  if (!(amountSen > 0)) throw new Error('Jumlah mesti lebih dari 0');
  if (!note?.trim()) throw new Error('Sebab / catatan diperlukan');
  if (SIGN[type] < 0 && amountSen > expected(sh.id)) {
    throw new Error('Tunai dalam laci tidak cukup');
  }
  const m = insertMove(u, sh.id, type, amountSen, { note: note.trim() });
  await log(`cash.${type}`, { shift_id: sh.id, move_id: m.id, amount: amountSen, note: m.note });
  return m;
}

// Pembetulan: tidak padam rekod asal, tambah entri pembalikan
export async function reverseMove(moveId, reason) {
  const u = me();
  if (!isManager(u)) throw new Error('Hanya manager/owner boleh batal');
  if (!reason?.trim()) throw new Error('Sebab pembatalan diperlukan');
  const m = db.find('cash_moves', moveId);
  const sh = currentShift();
  if (!m || !sh || m.shift_id !== sh.id) throw new Error('Hanya rekod syif semasa boleh dibatal');
  if (!SIGN[m.type] || m.type === 'open') throw new Error('Rekod ini tidak boleh dibatal');
  if (m.type === 'sale' || m.type === 'refund') throw new Error('Guna pulangan di skrin Jualan');
  if (reversedIds(shiftMoves(sh.id)).has(m.id)) throw new Error('Rekod sudah dibatal');
  insertMove(u, sh.id, 'reverse', m.amount, { ref: m.id, note: reason.trim() });
  await log('cash.reverse', {
    shift_id: sh.id,
    move_id: m.id,
    amount: m.amount,
    type: m.type,
    by_original: m.user_name,
    note: reason.trim(),
  });
}

// Dipanggil oleh sales.js sahaja. Audit direkod di sana (sale.create / sale.refund).
export function postSale(u, shiftId, sale) {
  return insertMove(u, shiftId, 'sale', sale.total, { ref: sale.id, note: sale.no });
}

export function postRefund(u, shiftId, refund) {
  return insertMove(u, shiftId, 'refund', refund.amount, { ref: refund.id, note: refund.no });
}

export async function closeShift(countedSen, note = '') {
  const u = me();
  const sh = requireShiftAccess(u);
  if (countedSen < 0) throw new Error('Kiraan tidak sah');
  const exp = expected(sh.id);
  const variance = countedSen - exp;
  insertMove(u, sh.id, 'close', countedSen, { expected: exp, variance, note: note.trim() });
  await log('cash.close', { shift_id: sh.id, counted: countedSen, expected: exp, variance });
  if (Math.abs(variance) > VARIANCE_LIMIT) {
    await log('cash.variance', { shift_id: sh.id, variance, name: sh.user_name });
  }
  return { expected: exp, variance };
}

// Sejarah syif yang sudah ditutup, terbaru dahulu
export function closedShifts(limit = 10) {
  const moves = db.all('cash_moves');
  const opens = new Map(moves.filter((m) => m.type === 'open').map((m) => [m.shift_id, m]));
  return moves
    .filter((m) => m.type === 'close')
    .reverse()
    .slice(0, limit)
    .map((c) => ({
      id: c.shift_id,
      opened_by: opens.get(c.shift_id)?.user_name,
      opened_at: opens.get(c.shift_id)?.created_at,
      closed_by: c.user_name,
      closed_at: c.created_at,
      counted: c.amount,
      expected: c.expected,
      variance: c.variance,
    }));
}
