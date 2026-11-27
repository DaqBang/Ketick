// Angka untuk dashboard. Baca sahaja.
import { db } from './db.js';

const DAY = 86400000;
const dayKey = (d) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`;
};

// Kutipan wang masuk bersih setiap hari (jualan POS + bayaran job + resit invois - pulangan)
export function dailyCollections(days = 14) {
  const map = {};
  const add = (iso, amt) => {
    const k = dayKey(iso);
    map[k] = (map[k] || 0) + amt;
  };
  for (const s of db.all('sales')) add(s.created_at, s.total);
  for (const r of db.all('refunds')) add(r.created_at, -r.amount);
  for (const e of db.all('job_events')) {
    if (e.kind === 'payment') add(e.created_at, e.amount);
    if (e.kind === 'pay_refund') add(e.created_at, -e.amount);
  }
  const voided = new Set(db.all('doc_voids').map((v) => v.doc_id));
  for (const d of db.all('docs')) if (d.type === 'RC' && !voided.has(d.id)) add(d.created_at, d.amount);

  const out = [];
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * DAY);
    out.push({ date: d, value: map[dayKey(d)] || 0 });
  }
  return out;
}

export function movingAvg(values, n = 7) {
  return values.map((_, i) => {
    const s = values.slice(Math.max(0, i - n + 1), i + 1);
    return s.reduce((a, b) => a + b, 0) / s.length;
  });
}

// Perubahan % tempoh ini berbanding tempoh sebelumnya
export function trend(values, n = 7) {
  const cur = values.slice(-n).reduce((a, b) => a + b, 0);
  const prev = values.slice(-2 * n, -n).reduce((a, b) => a + b, 0);
  if (!prev) return cur ? 100 : 0;
  return Math.round(((cur - prev) / prev) * 100);
}

// Skor integriti 0-100 dari amaran belum disemak
export function integrityScore(findings, chainOk = true) {
  if (!chainOk) return 0;
  const open = findings.filter((f) => !f.review);
  const penalty = { high: 15, medium: 5, low: 1, info: 0 };
  return Math.max(0, 100 - open.reduce((t, f) => t + penalty[f.severity], 0));
}

// Bilangan rekod mengikut hari (untuk sparkline)
export function dailyCount(table, filter = () => true, days = 14) {
  const map = {};
  for (const r of db.where(table, filter)) map[dayKey(r.created_at)] = (map[dayKey(r.created_at)] || 0) + 1;
  const out = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) out.push(map[dayKey(today.getTime() - i * DAY)] || 0);
  return out;
}
