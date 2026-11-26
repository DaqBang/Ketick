// Enjin rule fraud v1. Baca sahaja: kira dapatan dari data sedia ada setiap kali dibuka.
// Satu-satunya tulisan ialah "semakan" (alert_reviews) — append-only.
//
// Setiap dapatan: { key, rule, severity, title, detail, who, link, ts }
// key stabil; untuk dapatan agregat, key termasuk bilangan supaya kes baru muncul semula.

import { db } from './db.js';
import { log, verify } from './audit.js';
import { session } from './session.js';
import * as jobs from './jobs.js';
import * as billing from './billing.js';
import { VARIANCE_LIMIT, fmtRM } from './cash.js';

// Ambang — boleh dijadikan tetapan nanti
export const CONFIG = {
  windowDays: 30,
  jobStaleDays: 3, // siap tapi belum diserah
  jobLongDays: 14, // aktif terlalu lama
  refundMinCount: 3,
  refundMinPct: 10, // % nilai jualan staf
  discountMinSales: 5,
  discountMinPct: 30, // % jualan staf yang ada diskaun
  cashShortBig: 5000, // sen, satu syif
  cashShortRepeat: 2, // kali dalam tempoh
  voidMinCount: 3,
  adjustMinCount: 3,
  stockLossBig: 10000, // sen
  pinFailDaily: 3,
  openHour: 8,
  closeHour: 22,
  priceFlipHours: 24,
  invoiceOverdueDays: 30,
};

export const SEVERITY = {
  high: { label: 'Tinggi', cls: 'bg-red-100 text-red-800', order: 0 },
  medium: { label: 'Sederhana', cls: 'bg-amber-100 text-amber-800', order: 1 },
  low: { label: 'Rendah', cls: 'bg-slate-200 text-slate-700', order: 2 },
  info: { label: 'Info', cls: 'bg-blue-100 text-blue-800', order: 3 },
};

const DAY = 86400000;
const t = (iso) => new Date(iso).getTime();
const dateKey = (iso) => new Date(iso).toLocaleDateString('ms-MY');
const groupBy = (arr, fn) =>
  arr.reduce((m, x) => {
    const k = fn(x);
    (m[k] ||= []).push(x);
    return m;
  }, {});

function userMap() {
  return Object.fromEntries(db.all('users').map((u) => [u.id, u]));
}

export async function findings() {
  const now = Date.now();
  const since = now - CONFIG.windowDays * DAY;
  const inWindow = (r) => t(r.created_at) >= since;
  const users = userMap();
  const who = (id) => (users[id] ? { id, name: users[id].name } : null);
  const out = [];
  const add = (f) => out.push({ ts: new Date().toISOString(), who: null, ...f });

  // 1. Log audit diusik
  const chain = await verify();
  if (!chain.ok) {
    add({
      key: `chain:${chain.brokenAt}`,
      rule: 'chain',
      severity: 'high',
      title: 'Log audit diusik',
      detail: `Rantai log putus bermula entri #${chain.brokenAt}. Data mungkin diubah terus.`,
      link: '#/audit',
    });
  }

  // 2. Job siap tapi lama tidak diserah / job aktif terlalu lama
  for (const j of db.all('jobs')) {
    const s = jobs.state(j.id);
    if (s.locked) continue;
    const lastStatus = s.events.filter((e) => e.kind === 'status').pop();
    if (s.status === 'done' && lastStatus && now - t(lastStatus.created_at) > CONFIG.jobStaleDays * DAY) {
      add({
        key: `job_stale:${j.id}:${lastStatus.id}`,
        rule: 'job_stale',
        severity: 'medium',
        title: `${j.no} siap tapi belum diserah`,
        detail: `Siap sejak ${dateKey(lastStatus.created_at)} · baki ${fmtRM(s.due)}. Pastikan bayaran tidak diambil di luar sistem.`,
        who: s.assigned,
        link: `#/job/${j.id}`,
        ts: lastStatus.created_at,
      });
    } else if (now - t(j.created_at) > CONFIG.jobLongDays * DAY) {
      add({
        key: `job_long:${j.id}`,
        rule: 'job_long',
        severity: 'low',
        title: `${j.no} aktif lebih ${CONFIG.jobLongDays} hari`,
        detail: `${j.customer} · status ${jobs.STATUS[s.status]}`,
        who: s.assigned,
        link: `#/job/${j.id}`,
        ts: j.created_at,
      });
    }
  }

  // 3. Kadar pulangan tinggi ikut juruwang jualan asal
  const sales = db.where('sales', inWindow);
  const saleById = Object.fromEntries(db.all('sales').map((s) => [s.id, s]));
  const refunds = db.where('refunds', inWindow);
  const refundsByCashier = groupBy(refunds, (r) => saleById[r.sale_id]?.user_id);
  for (const [uid, list] of Object.entries(refundsByCashier)) {
    const valRef = list.reduce((a, r) => a + r.amount, 0);
    const valSales = sales.filter((s) => s.user_id === uid).reduce((a, s) => a + s.total, 0);
    if (list.length >= CONFIG.refundMinCount && valRef * 100 >= valSales * CONFIG.refundMinPct) {
      add({
        key: `refund_rate:${uid}:${list.length}`,
        rule: 'refund_rate',
        severity: 'high',
        title: `Pulangan kerap: ${users[uid]?.name}`,
        detail: `${list.length} pulangan (${fmtRM(valRef)}) berbanding jualan ${fmtRM(valSales)} dalam ${CONFIG.windowDays} hari.`,
        who: who(uid),
        link: '#/sales',
      });
    }
  }

  // 4. Diskaun kerap ikut staf
  for (const [uid, list] of Object.entries(groupBy(sales, (s) => s.user_id))) {
    const disc = list.filter((s) => s.discount > 0);
    if (list.length >= CONFIG.discountMinSales && disc.length * 100 >= list.length * CONFIG.discountMinPct) {
      add({
        key: `discount_rate:${uid}:${disc.length}`,
        rule: 'discount_rate',
        severity: 'medium',
        title: `Diskaun kerap: ${users[uid]?.name}`,
        detail: `${disc.length} dari ${list.length} jualan ada diskaun (jumlah ${fmtRM(disc.reduce((a, s) => a + s.discount, 0))}).`,
        who: who(uid),
        link: '#/sales',
      });
    }
  }

  // 5. Tunai kurang semasa tutup syif
  const moves = db.all('cash_moves');
  const opens = Object.fromEntries(moves.filter((m) => m.type === 'open').map((m) => [m.shift_id, m]));
  const shorts = moves.filter(
    (m) => m.type === 'close' && inWindow(m) && m.variance < -VARIANCE_LIMIT
  );
  for (const c of shorts) {
    if (-c.variance >= CONFIG.cashShortBig) {
      const o = opens[c.shift_id];
      add({
        key: `cash_short:${c.shift_id}`,
        rule: 'cash_short',
        severity: 'high',
        title: `Tunai kurang ${fmtRM(-c.variance)}`,
        detail: `Syif ${o?.user_name} ${dateKey(c.created_at)} · kira ${fmtRM(c.amount)} / jangka ${fmtRM(c.expected)}.`,
        who: who(o?.user_id),
        link: '#/cash',
        ts: c.created_at,
      });
    }
  }
  for (const [uid, list] of Object.entries(groupBy(shorts, (c) => opens[c.shift_id]?.user_id))) {
    if (list.length >= CONFIG.cashShortRepeat) {
      add({
        key: `cash_short_rep:${uid}:${list.length}`,
        rule: 'cash_short_rep',
        severity: 'high',
        title: `Tunai selalu kurang: ${users[uid]?.name}`,
        detail: `${list.length} syif kurang dalam ${CONFIG.windowDays} hari, jumlah ${fmtRM(-list.reduce((a, c) => a + c.variance, 0))}.`,
        who: who(uid),
        link: '#/cash',
      });
    }
  }

  // 6. Buang baris job kerap
  const voids = db.where('job_events', (e) => e.kind === 'void' && e.reason !== 'job batal' && inWindow(e));
  for (const [uid, list] of Object.entries(groupBy(voids, (e) => e.user_id))) {
    if (list.length >= CONFIG.voidMinCount) {
      add({
        key: `job_void:${uid}:${list.length}`,
        rule: 'job_void',
        severity: 'medium',
        title: `Kerap buang part/caj job: ${users[uid]?.name}`,
        detail: `${list.length} kali dalam ${CONFIG.windowDays} hari.`,
        who: who(uid),
        link: '#/jobs',
      });
    }
  }

  // 7. Laras stok kerap & kerugian kiraan
  const adjusts = db.where('stock_adjusts', inWindow);
  for (const [uid, list] of Object.entries(groupBy(adjusts, (a) => a.user_id))) {
    if (list.length >= CONFIG.adjustMinCount) {
      add({
        key: `stock_adjust:${uid}:${list.length}`,
        rule: 'stock_adjust',
        severity: 'medium',
        title: `Kerap laras stok: ${users[uid]?.name}`,
        detail: `${list.length} laras (rosak/hilang) dalam ${CONFIG.windowDays} hari.`,
        who: who(uid),
        link: '#/stock',
      });
    }
  }
  for (const c of db.where('stock_counts', (c) => inWindow(c) && c.value < 0)) {
    add({
      key: `stock_loss:${c.id}`,
      rule: 'stock_loss',
      severity: -c.value >= CONFIG.stockLossBig ? 'high' : 'medium',
      title: `Stok hilang ${fmtRM(-c.value)}`,
      detail: `Kiraan ${dateKey(c.created_at)} oleh ${c.user_name}: ${c.lines
        .filter((l) => l.diff < 0)
        .map((l) => `${l.name} ${l.diff}`)
        .join(', ')}`,
      who: who(c.user_id),
      link: `#/stock-count/${c.id}`,
      ts: c.created_at,
    });
  }

  // 8. Aktiviti luar waktu operasi
  const after = [
    ...sales.map((r) => ['jualan', r]),
    ...refunds.map((r) => ['pulangan', r]),
    ...adjusts.map((r) => ['laras stok', r]),
    ...moves.filter((m) => inWindow(m) && ['out', 'drawing', 'in', 'deposit'].includes(m.type)).map((r) => ['tunai', r]),
    ...db.where('job_events', (e) => inWindow(e) && e.kind === 'payment').map((r) => ['bayaran job', r]),
  ].filter(([, r]) => {
    const h = new Date(r.created_at).getHours();
    return h < CONFIG.openHour || h >= CONFIG.closeHour;
  });
  for (const [k, list] of Object.entries(groupBy(after, ([, r]) => `${r.user_id}|${dateKey(r.created_at)}`))) {
    const [uid, day] = k.split('|');
    add({
      key: `after_hours:${uid}:${day}:${list.length}`,
      rule: 'after_hours',
      severity: 'medium',
      title: `Aktiviti luar waktu: ${users[uid]?.name}`,
      detail: `${day}: ${list.length} rekod (${[...new Set(list.map(([type]) => type))].join(', ')}) sebelum ${CONFIG.openHour}:00 atau selepas ${CONFIG.closeHour}:00.`,
      who: who(uid),
      link: '#/audit',
      ts: list[0][1].created_at,
    });
  }

  // 9. PIN salah berulang (cuba teka PIN orang lain / PIN manager)
  const fails = db.where('audit_log', (e) => e.action === 'auth.fail' && t(e.ts) >= since);
  for (const [k, list] of Object.entries(groupBy(fails, (e) => `${e.actor_id}|${dateKey(e.ts)}`))) {
    if (list.length < CONFIG.pinFailDaily) continue;
    const [uid, day] = k.split('|');
    const approval = list.some((e) => e.detail?.context === 'kelulusan');
    add({
      key: `pin_fail:${uid}:${day}:${list.length}`,
      rule: 'pin_fail',
      severity: 'high',
      title: `PIN ${users[uid]?.name} salah ${list.length} kali`,
      detail: `${day}${approval ? ' · termasuk PIN kelulusan' : ''}. Mungkin ada orang cuba teka PIN akaun ini.`,
      who: null, // mangsa, bukan pelaku
      link: '#/audit',
      ts: list[list.length - 1].ts,
    });
  }

  // 10. Harga diturun, dijual, kemudian dinaikkan semula
  const priceLogs = db.all('audit_log').filter((e) => e.action === 'product.price' && t(e.ts) >= since);
  for (const list of Object.values(groupBy(priceLogs, (e) => e.detail.product_id))) {
    for (let i = 0; i < list.length - 1; i++) {
      const drop = list[i];
      const back = list[i + 1];
      if (drop.detail.amount >= drop.detail.old_price) continue;
      if (back.detail.amount < drop.detail.old_price) continue;
      if (t(back.ts) - t(drop.ts) > CONFIG.priceFlipHours * 3600000) continue;
      const sold = db.where(
        'sales',
        (s) =>
          t(s.created_at) >= t(drop.ts) &&
          t(s.created_at) <= t(back.ts) &&
          s.lines.some((l) => l.product_id === drop.detail.product_id)
      );
      if (!sold.length) continue;
      add({
        key: `price_flip:${drop.id}`,
        rule: 'price_flip',
        severity: 'high',
        title: `Harga ${drop.detail.name} diturun sekejap`,
        detail: `${fmtRM(drop.detail.old_price)} → ${fmtRM(drop.detail.amount)} → ${fmtRM(back.detail.amount)}; ${sold.length} jualan (${sold.map((s) => s.no).join(', ')}) pada harga rendah.`,
        who: who(drop.actor_id),
        link: '#/audit',
        ts: drop.ts,
      });
    }
  }

  // 11. No. rujukan bayaran sama digunakan berulang (screenshot transfer diguna semula)
  const refs = [
    ...db
      .where('sales', (s) => s.method !== 'cash' && s.pay_ref)
      .map((s) => ({ ref: s.pay_ref, doc: s.no, user_id: s.user_id, link: `#/receipt/${s.id}`, at: s.created_at })),
    ...db
      .where('job_events', (e) => e.kind === 'payment' && e.method !== 'cash' && e.pay_ref)
      .map((e) => ({
        ref: e.pay_ref,
        doc: db.find('jobs', e.job_id)?.no,
        user_id: e.user_id,
        link: `#/job/${e.job_id}`,
        at: e.created_at,
      })),
    ...db
      .where('docs', (d) => d.type === 'RC' && d.method !== 'cash' && d.pay_ref && !billing.voidOf(d.id))
      .map((d) => ({ ref: d.pay_ref, doc: d.no, user_id: d.user_id, link: `#/doc/${d.id}`, at: d.created_at })),
  ];
  for (const [ref, list] of Object.entries(groupBy(refs, (r) => r.ref.trim().toUpperCase()))) {
    if (list.length < 2) continue;
    const last = list[list.length - 1];
    add({
      key: `dup_ref:${ref}:${list.length}`,
      rule: 'dup_ref',
      severity: 'high',
      title: `No. rujukan bayaran berulang: ${ref}`,
      detail: `Digunakan ${list.length} kali: ${list.map((r) => r.doc).join(', ')}. Semak penyata bank.`,
      who: who(last.user_id),
      link: last.link,
      ts: last.at,
    });
  }

  // 12. Manager lulus diskaun/pulangan/laras sendiri
  const selfApproved = [
    ...sales.filter((s) => s.approved_by?.self),
    ...refunds.filter((r) => r.approved_by?.self),
    ...adjusts.filter((a) => a.approved_by?.self),
    ...db.where('docs', (d) => inWindow(d) && d.approved_by?.self),
    ...db.where('doc_voids', (v) => inWindow(v) && v.approved_by?.self),
  ].filter((r) => users[r.user_id]?.role === 'manager');
  for (const [uid, list] of Object.entries(groupBy(selfApproved, (r) => r.user_id))) {
    add({
      key: `self_approve:${uid}:${list.length}`,
      rule: 'self_approve',
      severity: 'low',
      title: `Manager lulus sendiri: ${users[uid]?.name}`,
      detail: `${list.length} diskaun/pulangan/laras diluluskan sendiri tanpa orang kedua.`,
      who: who(uid),
      link: '#/audit',
    });
  }

  // 13. Akaun bank syarikat diubah (lencong bayaran pelanggan)
  for (const e of db.all('audit_log').filter((e) => e.action === 'company.bank' && t(e.ts) >= since)) {
    add({
      key: `company_bank:${e.id}`,
      rule: 'company_bank',
      severity: 'high',
      title: 'Akaun bank pada invois diubah',
      detail: `${e.detail.note}. Pastikan ini akaun syarikat yang sah.`,
      who: who(e.actor_id),
      link: '#/company',
      ts: e.ts,
    });
  }

  // 14. Dokumen billing dibatal & nota kredit
  for (const v of db.where('doc_voids', inWindow)) {
    const d = billing.findDoc(v.doc_id);
    if (!d || !['INV', 'RC', 'CN', 'DO'].includes(d.type)) continue;
    add({
      key: `doc_void:${v.id}`,
      rule: 'doc_void',
      severity: d.type === 'RC' ? 'high' : 'medium',
      title: `${d.no} dibatal`,
      detail: `${billing.TYPES[d.type].label} ${d.total ? fmtRM(d.total) + ' · ' : ''}${d.party?.name} · sebab: ${v.reason} · lulus ${v.approved_by.name}`,
      who: who(v.user_id),
      link: `#/doc/${d.id}`,
      ts: v.created_at,
    });
  }
  for (const cn of db.where('docs', (d) => d.type === 'CN' && inWindow(d) && !billing.voidOf(d.id))) {
    add({
      key: `credit_note:${cn.id}`,
      rule: 'credit_note',
      severity: 'medium',
      title: `Nota kredit ${fmtRM(cn.amount)}: ${cn.party?.name}`,
      detail: `${cn.no} bagi ${cn.invoice_no} · ${cn.reason} · lulus ${cn.approved_by.name}`,
      who: who(cn.user_id),
      link: `#/doc/${cn.id}`,
      ts: cn.created_at,
    });
  }

  // 15. Invois lewat bayar terlalu lama
  for (const s of billing.outstanding()) {
    const late = now - t(s.doc.due_at);
    if (late < CONFIG.invoiceOverdueDays * DAY) continue;
    add({
      key: `overdue:${s.doc.id}:${s.balance}`,
      rule: 'overdue',
      severity: 'low',
      title: `${s.doc.no} lewat ${Math.floor(late / DAY)} hari`,
      detail: `${s.doc.party?.name} · baki ${fmtRM(s.balance)}. Pastikan pelanggan tidak bayar tunai kepada staf di luar sistem.`,
      link: `#/doc/${s.doc.id}`,
      ts: s.doc.due_at,
    });
  }

  // 16. Pengeluaran owner (ketelusan untuk rakan kongsi)
  const reversed = new Set(moves.filter((m) => m.type === 'reverse').map((m) => m.ref));
  const drawings = moves.filter((m) => m.type === 'drawing' && inWindow(m) && !reversed.has(m.id));
  if (drawings.length) {
    const total = drawings.reduce((a, m) => a + m.amount, 0);
    add({
      key: `drawing:${drawings.length}:${total}`,
      rule: 'drawing',
      severity: 'info',
      title: `Pengeluaran owner ${fmtRM(total)}`,
      detail: `${drawings.length} pengeluaran direkod dalam ${CONFIG.windowDays} hari.`,
      link: '#/cash',
    });
  }

  const reviews = Object.fromEntries(db.all('alert_reviews').map((r) => [r.key, r]));
  for (const f of out) f.review = reviews[f.key] || null;
  return out.sort(
    (a, b) => SEVERITY[a.severity].order - SEVERITY[b.severity].order || t(b.ts) - t(a.ts)
  );
}

// Tandakan dapatan sudah disemak. Tidak boleh semak dapatan tentang diri sendiri (kecuali owner).
export async function review(key, note) {
  const u = session.get();
  if (!(u?.role === 'owner' || u?.role === 'manager')) throw new Error('Hanya manager/owner');
  if (!note?.trim()) throw new Error('Catatan semakan diperlukan');
  const f = (await findings()).find((x) => x.key === key);
  if (!f) throw new Error('Amaran tidak dijumpai');
  if (f.review) throw new Error('Amaran sudah disemak');
  if (f.who?.id === u.id && u.role !== 'owner') {
    throw new Error('Tidak boleh semak amaran tentang diri sendiri');
  }
  db.insert('alert_reviews', { key, rule: f.rule, note: note.trim(), user_id: u.id, user_name: u.name });
  await log('alert.review', { name: f.who?.name, note: `${f.title} · ${note.trim()}` });
}

export function whatsappText(company, list) {
  const open = list.filter((f) => !f.review);
  const high = open.filter((f) => f.severity === 'high').length;
  const lines = open
    .slice(0, 10)
    .map((f) => `• [${SEVERITY[f.severity].label}] ${f.title}`);
  return [
    `Kawal ERP · ${company}`,
    `Amaran belum disemak: ${open.length} (tinggi: ${high})`,
    ...lines,
    open.length > 10 ? `…dan ${open.length - 10} lagi` : '',
  ]
    .filter(Boolean)
    .join('\n');
}
