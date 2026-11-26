// Profil syarikat untuk kepala dokumen. Owner sahaja.
// Perubahan akaun bank direkod berasingan (company.bank) dan masuk amaran tinggi:
// tukar no. akaun bank pada invois ialah cara klasik lencongkan bayaran pelanggan.

import { db } from './db.js';
import { log } from './audit.js';
import { session } from './session.js';

export const FIELDS = {
  company: 'Nama syarikat',
  ssm: 'No. SSM',
  address: 'Alamat',
  phone: 'No. telefon',
  email: 'Emel',
  sst_no: 'No. SST (jika ada)',
  bank_name: 'Nama bank',
  bank_acc: 'No. akaun bank',
  bank_holder: 'Nama pemegang akaun',
  footer: 'Nota kaki dokumen',
};
const BANK = ['bank_name', 'bank_acc', 'bank_holder'];

export const get = () => db.all('settings')[0] || {};

export async function save(data) {
  const u = session.get();
  if (u?.role !== 'owner') throw new Error('Hanya owner');
  const cur = get();
  if (!cur.id) throw new Error('Sistem belum disediakan');
  const next = {};
  for (const k of Object.keys(FIELDS)) next[k] = String(data[k] ?? '').trim();
  if (!next.company) throw new Error('Nama syarikat diperlukan');

  const changed = Object.keys(next).filter((k) => (cur[k] ?? '') !== next[k]);
  if (!changed.length) return cur;
  db.update('settings', cur.id, next);

  const bank = changed.filter((k) => BANK.includes(k));
  if (bank.length) {
    await log('company.bank', {
      note: bank.map((k) => `${FIELDS[k]}: ${cur[k] || '—'} → ${next[k] || '—'}`).join('; '),
    });
  }
  const other = changed.filter((k) => !BANK.includes(k));
  if (other.length) {
    await log('company.update', { note: other.map((k) => FIELDS[k]).join(', ') });
  }
  return get();
}
