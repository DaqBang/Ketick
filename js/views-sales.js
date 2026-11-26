// Paparan: POS (Jualan), Resit, Pulangan, Produk.
import * as auth from './auth.js';
import * as cash from './cash.js';
import * as sales from './sales.js';
import * as products from './products.js';
import * as stock from './stock.js';
import { esc, go, refresh, toast, safe, fmtTime, input, btn, card } from './ui.js';

// Troli kekal semasa tukar skrin (hilang bila refresh browser)
const cart = { qty: {}, serials: {}, discount: '', method: 'cash', ref: '' };

const resetCart = () =>
  Object.assign(cart, { qty: {}, serials: {}, discount: '', method: 'cash', ref: '' });

// Buang produk yang sudah dinyahaktif dari troli
function cartLines() {
  for (const id of Object.keys(cart.qty)) {
    const p = products.find(id);
    if (!p || !p.active) delete cart.qty[id];
  }
  return sales.buildLines(cart.qty, cart.serials);
}

const discountSen = () => {
  if (!cart.discount.trim()) return 0;
  try {
    return cash.toSen(cart.discount);
  } catch {
    return NaN;
  }
};

export const approverFields = () => `
  <select name="approver" class="${input}">
    ${auth
      .approvers()
      .map((a) => `<option value="${a.id}">${esc(a.name)} (${auth.ROLES[a.role]})</option>`)
      .join('')}
  </select>
  <input name="approverPin" type="password" inputmode="numeric" maxlength="6" class="${input}" placeholder="PIN pelulus">`;

// ---------- POS ----------

// Satu pilihan siri bagi setiap unit produk bersiri
function serialPickers(l) {
  const p = products.find(l.product_id);
  if (!p?.track_serial) return '';
  const avail = stock.serialsInStock(p.id);
  const chosen = cart.serials[p.id] || [];
  return Array.from({ length: l.qty }, (_, i) => `
    <select data-serial="${p.id}" data-i="${i}" class="${input} text-xs">
      <option value="">Pilih no. siri ${i + 1}</option>
      ${avail
        .map((s) => `<option value="${esc(s)}" ${chosen[i] === s ? 'selected' : ''}>${esc(s)}</option>`)
        .join('')}
    </select>`).join('');
}

export function viewSales(user) {
  const list = products.list();
  const lines = cartLines();
  const mgr = cash.isManager(user);
  const recent = sales.recent(15);

  return {
    html: `
    <div class="${card} space-y-3">
      <input id="q" class="${input}" placeholder="Cari produk / SKU">
      <div id="plist" class="grid grid-cols-2 gap-2 max-h-72 overflow-y-auto">
        ${
          list
            .map(
              (p) => `
          <button data-add="${p.id}" data-key="${esc((p.name + ' ' + p.sku).toLowerCase())}"
            class="text-left border rounded-lg p-2 active:bg-slate-100">
            <div class="text-sm font-medium">${esc(p.name)}</div>
            <div class="text-xs text-slate-500">${cash.fmtRM(p.price)}</div>
          </button>`
            )
            .join('') ||
          `<div class="col-span-2 text-sm text-slate-400">Tiada produk. ${
            mgr ? '<a href="#/products" class="underline">Tambah produk</a>' : 'Minta manager tambah.'
          }</div>`
        }
      </div>
    </div>

    <form id="pay" class="${card} space-y-3">
      <h2 class="font-bold">Troli</h2>
      ${
        lines
          .map(
            (l) => `
        <div class="text-sm space-y-1">
        <div class="flex justify-between items-center">
          <div>
            <div class="font-medium">${esc(l.name)}</div>
            <div class="text-xs text-slate-500">${cash.fmtRM(l.price)} × ${l.qty}</div>
          </div>
          <div class="flex items-center gap-2">
            <button type="button" data-dec="${l.product_id}" class="w-8 h-8 border rounded">−</button>
            <span class="w-6 text-center">${l.qty}</span>
            <button type="button" data-inc="${l.product_id}" class="w-8 h-8 border rounded">+</button>
            <span class="w-20 text-right font-medium">${cash.fmtRM(l.line)}</span>
          </div>
        </div>
        ${serialPickers(l)}
        </div>`
          )
          .join('') || '<div class="text-sm text-slate-400">Troli kosong</div>'
      }
      <div class="border-t pt-3 space-y-2">
        <div class="flex justify-between text-sm"><span>Subjumlah</span><span id="sub"></span></div>
        <input id="disc" inputmode="decimal" class="${input}" placeholder="Diskaun (RM)" value="${esc(cart.discount)}">
        <div id="appr" class="hidden space-y-2 bg-amber-50 p-3 rounded-lg">
          <div class="text-xs text-amber-800">Diskaun melebihi ${sales.DISCOUNT_LIMIT_PCT}%. Perlu PIN manager/owner.</div>
          ${approverFields()}
        </div>
        <select id="method" class="${input}">
          ${Object.entries(sales.METHODS)
            .map(([k, v]) => `<option value="${k}" ${k === cart.method ? 'selected' : ''}>${v}</option>`)
            .join('')}
        </select>
        <input id="ref" class="${input} ${cart.method === 'cash' ? 'hidden' : ''}" placeholder="No. rujukan bayaran (wajib)" value="${esc(cart.ref)}">
        <div class="flex justify-between text-lg font-bold"><span>Jumlah</span><span id="total"></span></div>
      </div>
      <button class="${btn}" ${lines.length ? '' : 'disabled'}>Bayar</button>
      ${lines.length ? '<button type="button" id="clear" class="w-full text-sm text-slate-500">Kosongkan troli</button>' : ''}
    </form>

    <div class="${card} divide-y">
      <h2 class="font-bold pb-2">Jualan Terkini</h2>
      ${
        recent
          .map((s) => {
            const r = sales.refundOf(s.id);
            return `
        <a href="#/receipt/${s.id}" class="py-2 flex justify-between text-sm">
          <div>
            <div class="font-medium">${s.no} ${r ? '<span class="text-xs text-red-600">DIPULANGKAN</span>' : ''}</div>
            <div class="text-xs text-slate-500">${fmtTime(s.created_at)} · ${esc(s.user_name)} · ${sales.METHODS[s.method]}</div>
          </div>
          <div class="font-bold ${r ? 'line-through text-slate-400' : ''}">${cash.fmtRM(s.total)}</div>
        </a>`;
          })
          .join('') || '<div class="text-sm text-slate-400 py-2">Belum ada jualan</div>'
      }
    </div>`,

    mount() {
      const $ = (id) => document.getElementById(id);
      const subtotal = sales.subtotalOf(lines);

      const update = () => {
        const d = discountSen();
        $('sub').textContent = cash.fmtRM(subtotal);
        $('total').textContent = Number.isNaN(d) ? '—' : cash.fmtRM(subtotal - d);
        const show = !mgr && !Number.isNaN(d) && sales.needsApproval(subtotal, d);
        $('appr').classList.toggle('hidden', !show);
      };
      update();

      $('q').oninput = (ev) => {
        const q = ev.target.value.trim().toLowerCase();
        document.querySelectorAll('[data-add]').forEach((b) => {
          b.hidden = q && !b.dataset.key.includes(q);
        });
      };
      document.querySelectorAll('[data-add]').forEach(
        (b) =>
          (b.onclick = () => {
            cart.qty[b.dataset.add] = (cart.qty[b.dataset.add] || 0) + 1;
            refresh();
          })
      );
      document.querySelectorAll('[data-inc]').forEach(
        (b) =>
          (b.onclick = () => {
            cart.qty[b.dataset.inc]++;
            refresh();
          })
      );
      document.querySelectorAll('[data-dec]').forEach(
        (b) =>
          (b.onclick = () => {
            const id = b.dataset.dec;
            if (--cart.qty[id] < 1) {
              delete cart.qty[id];
              delete cart.serials[id];
            } else if (cart.serials[id]) {
              cart.serials[id] = cart.serials[id].slice(0, cart.qty[id]);
            }
            refresh();
          })
      );
      document.querySelectorAll('[data-serial]').forEach(
        (sel) =>
          (sel.onchange = () => {
            (cart.serials[sel.dataset.serial] ||= [])[Number(sel.dataset.i)] = sel.value;
          })
      );
      $('disc').oninput = (ev) => {
        cart.discount = ev.target.value;
        update();
      };
      $('method').onchange = (ev) => {
        cart.method = ev.target.value;
        $('ref').classList.toggle('hidden', cart.method === 'cash');
      };
      $('ref').oninput = (ev) => (cart.ref = ev.target.value);
      if ($('clear')) {
        $('clear').onclick = () => {
          resetCart();
          refresh();
        };
      }

      $('pay').onsubmit = safe(async (ev) => {
        ev.preventDefault();
        const discount = discountSen();
        if (Number.isNaN(discount)) throw new Error('Diskaun tidak sah');
        const f = new FormData(ev.target);
        const approver = $('appr').classList.contains('hidden')
          ? null
          : { id: f.get('approver'), pin: f.get('approverPin') };
        const sale = await sales.checkout({
          qtyMap: cart.qty,
          serialMap: cart.serials,
          discount,
          method: cart.method,
          payRef: cart.ref,
          approver,
        });
        resetCart();
        toast(`Jualan ${sale.no} disimpan`, 'ok');
        go('/receipt/' + sale.id);
      });
    },
  };
}

// ---------- Resit ----------

export function viewReceipt(user, id) {
  const s = sales.findSale(id);
  if (!s) return { html: `<div class="${card}">Resit tidak dijumpai.</div>` };
  const r = sales.refundOf(s.id);

  return {
    html: `
    <div class="${card} space-y-3 font-mono text-sm relative">
      ${
        r
          ? `<div class="absolute top-8 right-4 rotate-12 border-4 border-red-600 text-red-600 font-bold px-2">DIPULANGKAN</div>`
          : ''
      }
      <div class="text-center">
        <div class="font-bold text-base">${esc(auth.company())}</div>
        <div>Resit ${s.no}</div>
        <div class="text-xs">${fmtTime(s.created_at)} · ${esc(s.user_name)}</div>
      </div>
      <div class="border-t border-dashed pt-2 space-y-1">
        ${s.lines
          .map(
            (l) => `
          <div class="flex justify-between"><span>${esc(l.name)}</span><span>${cash.fmtRM(l.line)}</span></div>
          <div class="text-xs text-slate-500">${l.qty} × ${cash.fmtRM(l.price)}</div>
          ${l.serials?.length ? `<div class="text-xs">SN: ${l.serials.map(esc).join(', ')}</div>` : ''}`
          )
          .join('')}
      </div>
      <div class="border-t border-dashed pt-2 space-y-1">
        <div class="flex justify-between"><span>Subjumlah</span><span>${cash.fmtRM(s.subtotal)}</span></div>
        ${
          s.discount
            ? `<div class="flex justify-between"><span>Diskaun</span><span>-${cash.fmtRM(s.discount)}</span></div>`
            : ''
        }
        <div class="flex justify-between font-bold text-base"><span>JUMLAH</span><span>${cash.fmtRM(s.total)}</span></div>
        <div class="flex justify-between"><span>${sales.METHODS[s.method]}</span><span>${esc(s.pay_ref)}</span></div>
        ${s.approved_by ? `<div class="text-xs">Diskaun lulus: ${esc(s.approved_by.name)}</div>` : ''}
      </div>
      ${
        r
          ? `<div class="border-t border-dashed pt-2 text-xs text-red-700">
          Dipulangkan ${fmtTime(r.created_at)} oleh ${esc(r.user_name)}, lulus ${esc(r.approved_by.name)}.<br>Sebab: ${esc(r.reason)}
        </div>`
          : ''
      }
      <div class="text-center text-xs pt-2">Terima kasih</div>
    </div>
    <div class="print:hidden grid grid-cols-2 gap-2">
      <button id="print" class="${btn}">Cetak</button>
      <a href="#/sales" class="w-full border rounded-lg py-2 text-center">Kembali</a>
    </div>
    ${
      r
        ? ''
        : `<a href="#/refund/${s.id}" class="print:hidden block text-center text-sm text-red-600 underline">Pulangan / batal jualan</a>`
    }`,
    mount() {
      document.getElementById('print').onclick = () => window.print();
    },
  };
}

// ---------- Pulangan ----------

export function viewRefund(user, id) {
  const s = sales.findSale(id);
  if (!s) return { html: `<div class="${card}">Jualan tidak dijumpai.</div>` };
  if (sales.refundOf(s.id)) {
    return { html: `<div class="${card}">Jualan ${s.no} sudah dipulangkan.</div>` };
  }
  const mgr = cash.isManager(user);

  return {
    html: `
    <form id="f" class="${card} space-y-3">
      <h2 class="font-bold text-red-700">Pulangan ${s.no}</h2>
      <div class="text-sm">Jumlah dipulangkan: <b>${cash.fmtRM(s.total)}</b> (${sales.METHODS[s.method]})</div>
      <div class="text-xs text-slate-500">Rekod asal kekal. Pulangan direkod dengan nama anda, pelulus dan sebab.</div>
      <input name="reason" class="${input}" placeholder="Sebab pulangan (wajib)" required>
      ${
        mgr
          ? ''
          : `<div class="space-y-2 bg-amber-50 p-3 rounded-lg">
        <div class="text-xs text-amber-800">Perlu PIN manager/owner.</div>
        ${approverFields()}
      </div>`
      }
      <button class="w-full bg-red-600 text-white rounded-lg py-2 font-medium">Sahkan Pulangan</button>
      <a href="#/receipt/${s.id}" class="block text-center text-sm text-slate-500">Batal</a>
    </form>`,
    mount() {
      document.getElementById('f').onsubmit = safe(async (ev) => {
        ev.preventDefault();
        const f = new FormData(ev.target);
        const approver = mgr ? null : { id: f.get('approver'), pin: f.get('approverPin') };
        await sales.refund(s.id, f.get('reason'), approver);
        toast(`${s.no} dipulangkan`, 'ok');
        go('/receipt/' + s.id);
      });
    },
  };
}

// ---------- Produk ----------

export function viewProducts(user, id) {
  const mgr = cash.isManager(user);
  const list = products.list(mgr);
  const editing = id ? products.find(id) : null;
  const rm = (sen) => (sen ?? '') === '' ? '' : (sen / 100).toFixed(2);

  return {
    html: `
    ${
      mgr
        ? `
    <form id="f" class="${card} space-y-3">
      <h2 class="font-bold">${editing ? 'Edit Produk' : 'Tambah Produk'}</h2>
      <input name="name" class="${input}" placeholder="Nama produk" value="${esc(editing?.name)}" required>
      <input name="sku" class="${input}" placeholder="SKU / kod (pilihan)" value="${esc(editing?.sku)}">
      <div class="grid grid-cols-2 gap-2">
        <input name="price" inputmode="decimal" class="${input}" placeholder="Harga jual (RM)" value="${rm(editing?.price)}" required>
        <input name="cost" inputmode="decimal" class="${input}" placeholder="Kos (RM)" value="${rm(editing?.cost)}" required>
      </div>
      <label class="flex items-center gap-2 text-sm">
        <input type="checkbox" name="track_serial" ${editing?.track_serial ? 'checked' : ''}>
        Jejak nombor siri (kamera, phone, laptop)
      </label>
      ${editing ? '<div class="text-xs text-amber-700">Perubahan harga direkod dalam audit.</div>' : ''}
      <button class="${btn}">${editing ? 'Simpan' : 'Tambah'}</button>
      ${editing ? '<a href="#/products" class="block text-center text-sm text-slate-500">Batal edit</a>' : ''}
    </form>`
        : ''
    }
    <div class="${card} divide-y">
      <h2 class="font-bold pb-2">Produk (${list.length})</h2>
      ${
        list
          .map(
            (p) => `
        <div class="py-2 flex justify-between items-center text-sm">
          <div class="${p.active ? '' : 'line-through text-slate-400'}">
            <div class="font-medium">${esc(p.name)}</div>
            <div class="text-xs text-slate-500">${p.track_serial ? 'Bersiri · ' : ''}${esc(p.sku) || '—'}${
              mgr ? ` · kos ${cash.fmtRM(p.cost)}` : ''
            }</div>
          </div>
          <div class="text-right">
            <div class="font-bold">${cash.fmtRM(p.price)}</div>
            ${
              mgr
                ? `<a href="#/products/${p.id}" class="text-xs underline">Edit</a>
              <button data-toggle="${p.id}" data-active="${p.active}" class="text-xs underline ml-2">${
                    p.active ? 'Nyahaktif' : 'Aktifkan'
                  }</button>`
                : ''
            }
          </div>
        </div>`
          )
          .join('') || '<div class="text-sm text-slate-400 py-2">Tiada produk</div>'
      }
    </div>`,
    mount() {
      const f = document.getElementById('f');
      if (f) {
        f.onsubmit = safe(async (ev) => {
          ev.preventDefault();
          const d = Object.fromEntries(new FormData(ev.target));
          await products.save({
            id: editing?.id,
            name: d.name,
            sku: d.sku,
            price: cash.toSen(d.price),
            cost: cash.toSen(d.cost),
            track_serial: d.track_serial === 'on',
          });
          toast(editing ? 'Produk dikemas kini' : 'Produk ditambah', 'ok');
          if (editing) go('/products');
          else refresh();
        });
      }
      document.querySelectorAll('[data-toggle]').forEach(
        (b) =>
          (b.onclick = safe(async () => {
            await products.setActive(b.dataset.toggle, b.dataset.active !== 'true');
            refresh();
          }))
      );
    },
  };
}
