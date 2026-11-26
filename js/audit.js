// Log audit berantai (hash chain).
// Setiap entri menyimpan hash entri sebelumnya. Ubah satu entri = rantai putus = dikesan.
// NOTA: di browser ini hanya "tamper-evident". Perlindungan sebenar datang bila log
// disimpan di server (Supabase) yang staf tidak boleh tulis terus.

import { db, now } from './db.js';
import { session } from './session.js';

const GENESIS = 'GENESIS';

export async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const payload = (e) =>
  JSON.stringify([e.seq, e.ts, e.actor_id, e.actor_name, e.action, e.detail, e.prev]);

// Beratur supaya dua log serentak tidak guna "prev" yang sama
let queue = Promise.resolve();

export function log(action, detail = {}, actor = session.get()) {
  const run = queue.then(() => append(action, detail, actor));
  queue = run.catch(() => {});
  return run;
}

async function append(action, detail, actor) {
  const rows = db.all('audit_log');
  const last = rows[rows.length - 1];
  const entry = {
    seq: rows.length + 1,
    ts: now(),
    actor_id: actor?.id ?? 'system',
    actor_name: actor?.name ?? 'Sistem',
    action,
    detail,
    prev: last ? last.hash : GENESIS,
  };
  entry.hash = await sha256(payload(entry));
  return db.insert('audit_log', entry);
}

// Semak seluruh rantai. Pulangkan { ok, count, brokenAt }
export async function verify() {
  const rows = db.all('audit_log');
  let prev = GENESIS;
  for (let i = 0; i < rows.length; i++) {
    const e = rows[i];
    if (e.seq !== i + 1 || e.prev !== prev || (await sha256(payload(e))) !== e.hash) {
      return { ok: false, count: rows.length, brokenAt: i + 1 };
    }
    prev = e.hash;
  }
  return { ok: true, count: rows.length, brokenAt: null };
}
