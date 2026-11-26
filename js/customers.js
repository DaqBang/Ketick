// CRM: kenalan (pelanggan & pembekal). Data induk: boleh dikemas kini, setiap perubahan direkod.
// No. telefon dinormalkan (format antarabangsa, cth 60123456789) dan unik — tiada pendua.

import { db } from './db.js';
import { log } from './audit.js';
import { session } from './session.js';

export const KINDS = { customer: 'Pelanggan', supplier: 'Pembekal' };

const FIELDS = [
  'kind', 'name', 'company', 'phone', 'whatsapp', 'telegram', 'email',
  'facebook', 'instagram', 'address', 'tin', 'notes',
];

function me() {
  const u = session.get();
  if (!u) throw new Error('Sila log masuk');
  return u;
}

// 012-345 6789 -> 60123456789 ; +60 12... -> 6012... ; nombor luar negara kekal
export function normPhone(p) {
  let d = String(p ?? '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('0')) d = '6' + d;
  return d;
}

const cleanHandle = (s) => String(s ?? '').trim().replace(/^@/, '').replace(/^https?:\/\/\S+\//, '');

export const list = ({ kind = null, includeInactive = false } = {}) =>
  db.where('customers', (c) => (includeInactive || c.active) && (!kind || c.kind === kind));

export const find = (id) => db.find('customers', id);

export const findByPhone = (phone) => {
  const n = normPhone(phone);
  return n ? db.where('customers', (c) => c.phone_norm === n)[0] || null : null;
};

function validate(d) {
  if (!KINDS[d.kind]) throw new Error('Jenis kenalan tidak sah');
  if (!d.name?.trim()) throw new Error('Nama diperlukan');
  const phone_norm = normPhone(d.phone);
  if (phone_norm.length < 9) throw new Error('No. telefon tidak sah');
  const email = String(d.email ?? '').trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Emel tidak sah');
  const out = {};
  for (const f of FIELDS) out[f] = String(d[f] ?? '').trim();
  out.telegram = cleanHandle(out.telegram);
  out.facebook = cleanHandle(out.facebook);
  out.instagram = cleanHandle(out.instagram);
  out.phone_norm = phone_norm;
  return out;
}

export async function save(data) {
  me();
  const c = validate(data);
  const dup = db.where('customers', (x) => x.phone_norm === c.phone_norm && x.id !== data.id)[0];
  if (dup) throw new Error(`No. telefon sudah didaftar untuk ${dup.name}`);

  if (!data.id) {
    const rec = db.insert('customers', { ...c, active: true });
    await log('contact.create', { contact_id: rec.id, name: rec.name, note: KINDS[rec.kind] });
    return rec;
  }
  const old = find(data.id);
  if (!old) throw new Error('Kenalan tidak dijumpai');
  const changed = Object.keys(c).filter((k) => (old[k] ?? '') !== c[k] && k !== 'phone_norm');
  const rec = db.update('customers', data.id, c);
  if (changed.length) {
    await log('contact.update', {
      contact_id: rec.id,
      name: rec.name,
      note: changed.map((k) => `${k}: ${old[k] || '—'} → ${c[k] || '—'}`).join('; '),
    });
  }
  return rec;
}

export async function setActive(id, active) {
  const u = me();
  if (!(u.role === 'owner' || u.role === 'manager')) throw new Error('Hanya manager/owner');
  const rec = db.update('customers', id, { active });
  await log(active ? 'contact.activate' : 'contact.deactivate', { contact_id: id, name: rec.name });
}

// Snapshot untuk disimpan dalam dokumen (dokumen tidak berubah walau kenalan dikemas kini)
export function snapshot(c) {
  return {
    id: c.id,
    name: c.name,
    company: c.company,
    phone: c.phone,
    email: c.email,
    address: c.address,
    tin: c.tin,
  };
}

// ---------- Pautan hubungi ----------

export const links = {
  tel: (c) => (c.phone ? `tel:${c.phone.replace(/\s/g, '')}` : null),
  whatsapp: (c, text = '') => {
    const n = normPhone(c.whatsapp || c.phone);
    return n ? `https://wa.me/${n}${text ? `?text=${encodeURIComponent(text)}` : ''}` : null;
  },
  telegram: (c) => (c.telegram ? `https://t.me/${encodeURIComponent(c.telegram)}` : null),
  messenger: (c) => (c.facebook ? `https://m.me/${encodeURIComponent(c.facebook)}` : null),
  instagram: (c) => (c.instagram ? `https://ig.me/m/${encodeURIComponent(c.instagram)}` : null),
  email: (c, subject = '', body = '') =>
    c.email
      ? `mailto:${c.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
      : null,
};

// ---------- Sejarah ----------

export function history(id) {
  const c = find(id);
  if (!c) return { docs: [], jobs: [] };
  const docs = db
    .where('docs', (d) => d.party?.id === id)
    .reverse();
  const jobs = db
    .where('jobs', (j) => normPhone(j.phone) === c.phone_norm)
    .reverse();
  return { docs, jobs };
}
