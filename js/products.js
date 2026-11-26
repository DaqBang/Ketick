// Produk & harga. Data induk: boleh dikemas kini, tapi setiap perubahan direkod.
// Perubahan harga direkod berasingan (product.price) sebab ia isyarat fraud:
// turunkan harga sekejap, jual, naikkan semula.

import { db } from './db.js';
import { log } from './audit.js';
import { session } from './session.js';
import { balance } from './stock.js';

function requireManager() {
  const u = session.get();
  if (!(u?.role === 'owner' || u?.role === 'manager')) throw new Error('Hanya manager/owner');
  return u;
}

export const list = (includeInactive = false) =>
  db.where('products', (p) => includeInactive || p.active);

export const find = (id) => db.find('products', id);

function validate({ name, sku, price, cost, track_serial }) {
  if (!name?.trim()) throw new Error('Nama produk diperlukan');
  if (!Number.isInteger(price) || price < 0) throw new Error('Harga tidak sah');
  if (!Number.isInteger(cost) || cost < 0) throw new Error('Kos tidak sah');
  const s = sku?.trim() || '';
  return { name: name.trim(), sku: s, price, cost, track_serial: !!track_serial };
}

export async function save(data) {
  requireManager();
  const p = validate(data);
  if (p.sku && db.where('products', (x) => x.sku === p.sku && x.id !== data.id).length) {
    throw new Error('SKU sudah digunakan');
  }

  if (!data.id) {
    const rec = db.insert('products', { ...p, active: true });
    await log('product.create', { product_id: rec.id, name: rec.name, amount: rec.price });
    return rec;
  }

  const old = db.find('products', data.id);
  if (!old) throw new Error('Produk tidak dijumpai');
  if (!!old.track_serial !== p.track_serial && balance(old.id) !== 0) {
    throw new Error('Tidak boleh tukar jenis siri selagi ada stok');
  }
  const rec = db.update('products', data.id, p);
  const norm = (k, v) => (k === 'track_serial' ? !!v : v);
  const changed = Object.keys(p).filter((k) => norm(k, old[k]) !== p[k]);
  if (changed.includes('price')) {
    await log('product.price', {
      product_id: rec.id,
      name: rec.name,
      old_price: old.price,
      amount: rec.price,
    });
  }
  const other = changed.filter((k) => k !== 'price');
  if (other.length) {
    await log('product.update', {
      product_id: rec.id,
      name: rec.name,
      changes: Object.fromEntries(other.map((k) => [k, [old[k], p[k]]])),
    });
  }
  return rec;
}

export async function setActive(id, active) {
  requireManager();
  const rec = db.update('products', id, { active });
  await log(active ? 'product.activate' : 'product.deactivate', {
    product_id: rec.id,
    name: rec.name,
  });
}
