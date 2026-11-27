// Carian global: kenalan, dokumen billing, job, resit POS, produk.
import { db } from './db.js';
import { normPhone } from './customers.js';

export function search(q, limit = 8) {
  const s = String(q ?? '').trim().toLowerCase();
  if (s.length < 2) return [];
  const digits = normPhone(s);
  const has = (...v) => v.some((x) => String(x ?? '').toLowerCase().includes(s));
  const out = [];

  for (const c of db.all('customers')) {
    if (has(c.name, c.company, c.phone, c.email) || (digits.length >= 4 && c.phone_norm.includes(digits))) {
      out.push({ kind: 'Kenalan', title: c.name, sub: `${c.company ? c.company + ' · ' : ''}${c.phone}`, href: `#/contact/${c.id}` });
    }
  }
  for (const d of db.all('docs')) {
    if (has(d.no, d.party?.name, d.pay_ref)) {
      out.push({ kind: 'Dokumen', title: d.no, sub: d.party?.name || '', href: `#/doc/${d.id}` });
    }
  }
  for (const j of db.all('jobs')) {
    if (has(j.no, j.customer, j.phone, j.device, j.device_serial)) {
      out.push({ kind: 'Job', title: `${j.no} · ${j.customer}`, sub: j.device || j.address || '', href: `#/job/${j.id}` });
    }
  }
  for (const r of db.all('sales')) {
    if (has(r.no, r.party?.name, r.pay_ref) || r.lines.some((l) => l.serials?.some((x) => x.toLowerCase().includes(s)))) {
      out.push({ kind: 'Resit', title: r.no, sub: r.party?.name || 'Walk-in', href: `#/receipt/${r.id}` });
    }
  }
  for (const p of db.all('products')) {
    if (has(p.name, p.sku)) out.push({ kind: 'Produk', title: p.name, sub: p.sku || '', href: `#/products/${p.id}` });
  }
  return out.slice(0, limit);
}
