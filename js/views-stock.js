// Paparan: Stok (ringkasan), Terima Stok, Kira Stok (buta), Laras Stok.
import * as cash from './cash.js';
import * as stock from './stock.js';
import * as products from './products.js';
import { approverFields } from './views-sales.js';
import { esc, go, refresh, toast, safe, fmtTime, input, btn, card } from './ui.js';

const fmtQty = (n) => (n > 0 ? `+${n}` : String(n));
const mgrOnly = { html: `<div class="${card} text-sm">Hanya manager/owner.</div>` };

// ---------- Ringkasan ----------

export function viewStock(user, id) {
  const mgr = cash.isManager(user);
  if (id) return mgr ? productDetail(id) : mgrOnly;

  const actions = `
    <div class="grid grid-cols-3 gap-2 text-center text-sm">
      <a href="#/stock-in" class="${card}">📥<br>Terima</a>
      <a href="#/stock-count" class="${card}">📋<br>Kira</a>
      <a href="#/stock-adjust" class="${card}">⚠️<br>Laras</a>
    </div>`;

  if (!mgr) {
    return {
      html: `${actions}
      <div class="${card} text-sm text-slate-500">Baki stok hanya dilihat manager (kiraan buta).</div>`,
    };
  }

  const rows = stock.summary();
  const total = rows.reduce((t, r) => t + r.value, 0);
  const counts = stock.counts(5);
  const recs = stock.receipts(5);

  return {
    html: `${actions}
    <div class="${card} divide-y">
      <div class="flex justify-between pb-2">
        <h2 class="font-bold">Baki Stok</h2>
        <span class="text-sm">Nilai kos: <b>${cash.fmtRM(total)}</b></span>
      </div>
      ${
        rows
          .map(
            (r) => `
        <a href="#/stock/${r.id}" class="py-2 flex justify-between text-sm">
          <div>
            <div class="font-medium">${esc(r.name)}</div>
            <div class="text-xs text-slate-500">${r.track_serial ? 'Bersiri · ' : ''}${cash.fmtRM(r.value)}</div>
          </div>
          <div class="font-bold ${r.qty <= 0 ? 'text-red-600' : ''}">${r.qty}</div>
        </a>`
          )
          .join('') || '<div class="text-sm text-slate-400 py-2">Tiada produk</div>'
      }
    </div>
    <div class="${card} divide-y">
      <h2 class="font-bold pb-2">Kiraan Terkini</h2>
      ${
        counts
          .map(
            (c) => `
        <a href="#/stock-count/${c.id}" class="py-2 flex justify-between text-sm">
          <div>
            <div>${esc(c.user_name)} · ${c.lines.length} produk</div>
            <div class="text-xs text-slate-500">${fmtTime(c.created_at)}${
              stock.countApplied(c.id) ? ' · dilaras' : ''
            }</div>
          </div>
          <div class="font-bold ${c.value < 0 ? 'text-red-600' : c.value > 0 ? 'text-amber-600' : 'text-emerald-600'}">
            ${c.value === 0 ? 'Tepat' : cash.fmtRM(c.value)}
          </div>
        </a>`
          )
          .join('') || '<div class="text-sm text-slate-400 py-2">Belum ada kiraan</div>'
      }
    </div>
    <div class="${card} divide-y">
      <h2 class="font-bold pb-2">Terimaan Terkini</h2>
      ${
        recs
          .map(
            (r) => `
        <div class="py-2 flex justify-between text-sm">
          <div>
            <div>${esc(r.supplier)} · ${esc(r.doc_ref)}</div>
            <div class="text-xs text-slate-500">${fmtTime(r.created_at)} · ${esc(r.user_name)}</div>
          </div>
          <div class="font-bold">${cash.fmtRM(r.total)}</div>
        </div>`
          )
          .join('') || '<div class="text-sm text-slate-400 py-2">Belum ada terimaan</div>'
      }
    </div>`,
  };
}

function productDetail(id) {
  const p = products.find(id);
  if (!p) return { html: `<div class="${card}">Produk tidak dijumpai.</div>` };
  const moves = stock.movesOf(p.id).reverse();
  const serials = p.track_serial ? stock.serialsInStock(p.id) : [];
  const qty = p.track_serial ? serials.length : stock.balance(p.id);

  return {
    html: `
    <div class="${card}">
      <div class="font-bold">${esc(p.name)}</div>
      <div class="text-sm">Baki: <b>${qty}</b> · Kos ${cash.fmtRM(p.cost)} · Jual ${cash.fmtRM(p.price)}</div>
      ${
        serials.length
          ? `<div class="mt-2 text-xs"><b>Siri dalam stok:</b> ${serials.map(esc).join(', ')}</div>`
          : ''
      }
    </div>
    <div class="${card} divide-y">
      <h2 class="font-bold pb-2">Sejarah Pergerakan</h2>
      ${
        moves
          .map(
            (m) => `
        <div class="py-2 flex justify-between text-sm">
          <div>
            <div>${stock.REASONS[m.reason] || esc(m.reason)}${m.serial ? ` · ${esc(m.serial)}` : ''}</div>
            <div class="text-xs text-slate-500">${fmtTime(m.created_at)} · ${esc(m.user_name || '')}</div>
          </div>
          <div class="font-bold ${m.qty < 0 ? 'text-red-600' : 'text-emerald-600'}">${fmtQty(m.qty)}</div>
        </div>`
          )
          .join('') || '<div class="text-sm text-slate-400 py-2">Tiada pergerakan</div>'
      }
    </div>
    <a href="#/stock" class="block text-center text-sm text-slate-500">Kembali</a>`,
  };
}

// ---------- Terima stok ----------

const recv = { supplier: '', docRef: '', productId: '', lines: [] };

export function viewStockIn() {
  const list = products.list();
  const sel = products.find(recv.productId);

  return {
    html: `
    <form id="f" class="${card} space-y-3">
      <h2 class="font-bold">Terima Stok</h2>
      <input id="supplier" class="${input}" placeholder="Nama pembekal" value="${esc(recv.supplier)}">
      <input id="docRef" class="${input}" placeholder="No. DO / invois pembekal" value="${esc(recv.docRef)}">

      <div class="border rounded-lg p-3 space-y-2 bg-slate-50">
        <select id="product" class="${input}">
          <option value="">Pilih produk</option>
          ${list
            .map((p) => `<option value="${p.id}" ${p.id === recv.productId ? 'selected' : ''}>${esc(p.name)}</option>`)
            .join('')}
        </select>
        ${
          sel
            ? `
        <input id="cost" inputmode="decimal" class="${input}" placeholder="Kos seunit (RM)" value="${(sel.cost / 100).toFixed(2)}">
        ${
          sel.track_serial
            ? `<textarea id="serials" rows="4" class="${input}" placeholder="Scan / taip nombor siri, satu setiap baris"></textarea>`
            : `<input id="qty" inputmode="numeric" class="${input}" placeholder="Kuantiti">`
        }
        <button type="button" id="addLine" class="w-full border rounded-lg py-2">+ Tambah ke senarai</button>`
            : ''
        }
      </div>

      <div class="divide-y">
        ${recv.lines
          .map(
            (l, i) => `
          <div class="py-2 flex justify-between text-sm">
            <div>
              <div class="font-medium">${esc(l.name)} × ${l.qty}</div>
              <div class="text-xs text-slate-500">@ ${cash.fmtRM(l.cost)}${
                l.serials.length ? ` · ${l.serials.map(esc).join(', ')}` : ''
              }</div>
            </div>
            <button type="button" data-rm="${i}" class="text-xs text-red-600 underline">Buang</button>
          </div>`
          )
          .join('')}
      </div>
      <button class="${btn}" ${recv.lines.length ? '' : 'disabled'}>Simpan Terimaan</button>
    </form>`,
    mount() {
      const $ = (id) => document.getElementById(id);
      $('supplier').oninput = (e) => (recv.supplier = e.target.value);
      $('docRef').oninput = (e) => (recv.docRef = e.target.value);
      $('product').onchange = (e) => {
        recv.productId = e.target.value;
        refresh();
      };
      if ($('addLine')) {
        $('addLine').onclick = safe(async () => {
          const cost = cash.toSen($('cost').value);
          const serials = sel.track_serial ? stock.parseSerials($('serials').value) : [];
          const qty = sel.track_serial ? serials.length : Number($('qty').value);
          if (sel.track_serial && !serials.length) throw new Error('Masukkan nombor siri');
          if (!sel.track_serial && !(Number.isInteger(qty) && qty > 0)) throw new Error('Kuantiti tidak sah');
          recv.lines.push({ product_id: sel.id, name: sel.name, qty, cost, serials });
          recv.productId = '';
          refresh();
        });
      }
      document.querySelectorAll('[data-rm]').forEach(
        (b) =>
          (b.onclick = () => {
            recv.lines.splice(Number(b.dataset.rm), 1);
            refresh();
          })
      );
      $('f').onsubmit = safe(async (ev) => {
        ev.preventDefault();
        const r = await stock.receive({ supplier: recv.supplier, docRef: recv.docRef, lines: recv.lines });
        Object.assign(recv, { supplier: '', docRef: '', productId: '', lines: [] });
        toast(`Terimaan disimpan (${cash.fmtRM(r.total)})`, 'ok');
        go('/stock');
      });
    },
  };
}

// ---------- Kira stok (buta) ----------

export function viewStockCount(user, id) {
  const mgr = cash.isManager(user);
  if (id) return mgr ? countDetail(id, user) : mgrOnly;
  const list = products.list();

  return {
    html: `
    <form id="f" class="${card} space-y-3">
      <h2 class="font-bold">Kira Stok</h2>
      <p class="text-xs text-slate-500">
        Kira barang fizikal. Baki sistem tidak ditunjuk. Biarkan kosong untuk produk yang tidak dikira.
      </p>
      ${list
        .map(
          (p) => `
        <label class="block text-sm space-y-1">
          <span class="font-medium">${esc(p.name)}</span>
          ${
            p.track_serial
              ? `<textarea name="${p.id}" rows="3" class="${input}" placeholder="Scan / taip siri yang ada, satu setiap baris"></textarea>`
              : `<input name="${p.id}" inputmode="numeric" class="${input}" placeholder="Kuantiti dikira">`
          }
        </label>`
        )
        .join('') || '<div class="text-sm text-slate-400">Tiada produk</div>'}
      <input name="__note" class="${input}" placeholder="Catatan (pilihan)">
      <button class="${btn}">Hantar Kiraan</button>
    </form>`,
    mount() {
      document.getElementById('f').onsubmit = safe(async (ev) => {
        ev.preventDefault();
        const d = Object.fromEntries(new FormData(ev.target));
        const note = d.__note;
        delete d.__note;
        for (const k of Object.keys(d)) {
          if (!String(d[k]).trim()) delete d[k];
          else if (!products.find(k)?.track_serial) d[k] = Number(d[k]);
        }
        if (!confirm('Hantar kiraan? Tidak boleh ubah selepas ini.')) return;
        const c = await stock.submitCount(d, note);
        toast('Kiraan dihantar', 'ok');
        go(mgr ? '/stock-count/' + c.id : '/stock');
      });
    },
  };
}

function countDetail(id, user) {
  const c = stock.findCount(id);
  if (!c) return { html: `<div class="${card}">Kiraan tidak dijumpai.</div>` };
  const applied = stock.countApplied(c.id);
  const hasDiff = c.lines.some((l) => l.diff !== 0);

  return {
    html: `
    <div class="${card}">
      <div class="font-bold">Kiraan oleh ${esc(c.user_name)}</div>
      <div class="text-xs text-slate-500">${fmtTime(c.created_at)}${c.note ? ` · ${esc(c.note)}` : ''}</div>
      <div class="mt-2 text-sm">Beza nilai: <b class="${c.value < 0 ? 'text-red-600' : ''}">${cash.fmtRM(c.value)}</b></div>
    </div>
    <div class="${card} divide-y">
      ${c.lines
        .map(
          (l) => `
        <div class="py-2 text-sm">
          <div class="flex justify-between">
            <span class="font-medium">${esc(l.name)}</span>
            <span class="font-bold ${l.diff < 0 ? 'text-red-600' : l.diff > 0 ? 'text-amber-600' : 'text-emerald-600'}">
              ${l.diff === 0 ? 'Tepat' : fmtQty(l.diff)}
            </span>
          </div>
          <div class="text-xs text-slate-500">Sistem ${l.system} · Dikira ${l.counted} · ${cash.fmtRM(l.value)}</div>
          ${l.missing?.length ? `<div class="text-xs text-red-600">Hilang: ${l.missing.map(esc).join(', ')}</div>` : ''}
          ${l.extra?.length ? `<div class="text-xs text-amber-600">Tidak dikenali: ${l.extra.map(esc).join(', ')}</div>` : ''}
        </div>`
        )
        .join('')}
    </div>
    ${
      applied
        ? `<div class="${card} text-sm text-emerald-700">Stok sistem sudah dilaras ikut kiraan ini.</div>`
        : hasDiff
        ? `<button id="apply" class="${btn}">Laras stok sistem ikut kiraan</button>
           <p class="text-xs text-slate-500 text-center">Rekod laras disimpan dengan nama anda dalam audit.</p>`
        : ''
    }
    <a href="#/stock" class="block text-center text-sm text-slate-500">Kembali</a>`,
    mount() {
      const b = document.getElementById('apply');
      if (b) {
        b.onclick = safe(async () => {
          if (!confirm('Laras stok sistem ikut kiraan ini?')) return;
          await stock.applyCount(c.id, null);
          toast('Stok dilaras', 'ok');
          refresh();
        });
      }
    },
  };
}

// ---------- Laras manual ----------

const adj = { productId: '' };

export function viewStockAdjust(user) {
  const mgr = cash.isManager(user);
  const list = products.list();
  const sel = products.find(adj.productId);

  return {
    html: `
    <form id="f" class="${card} space-y-3">
      <h2 class="font-bold">Laras Stok</h2>
      <p class="text-xs text-slate-500">Untuk barang rosak, hilang, atau guna sendiri. Perlu kelulusan manager.</p>
      <select id="product" class="${input}">
        <option value="">Pilih produk</option>
        ${list
          .map((p) => `<option value="${p.id}" ${p.id === adj.productId ? 'selected' : ''}>${esc(p.name)}</option>`)
          .join('')}
      </select>
      ${
        sel
          ? `${
              sel.track_serial
                ? `<select name="serial" class="${input}" required>
              <option value="">Pilih siri untuk dikeluarkan</option>
              ${stock
                .serialsInStock(sel.id)
                .map((s) => `<option value="${esc(s)}">${esc(s)}</option>`)
                .join('')}
            </select>`
                : `<input name="qty" inputmode="numeric" class="${input}" placeholder="Kuantiti (contoh -2 keluar, 1 masuk)" required>`
            }
        <input name="reason" class="${input}" placeholder="Sebab (wajib)" required>
        ${
          mgr
            ? ''
            : `<div class="space-y-2 bg-amber-50 p-3 rounded-lg">
          <div class="text-xs text-amber-800">PIN manager/owner diperlukan.</div>
          ${approverFields()}
        </div>`
        }
        <button class="${btn}">Simpan Laras</button>`
          : ''
      }
    </form>`,
    mount() {
      document.getElementById('product').onchange = (e) => {
        adj.productId = e.target.value;
        refresh();
      };
      document.getElementById('f').onsubmit = safe(async (ev) => {
        ev.preventDefault();
        const f = new FormData(ev.target);
        await stock.adjust({
          productId: sel.id,
          qty: Number(f.get('qty')),
          serial: f.get('serial'),
          reason: f.get('reason'),
          approver: mgr ? null : { id: f.get('approver'), pin: f.get('approverPin') },
        });
        adj.productId = '';
        toast('Laras direkod', 'ok');
        go('/stock');
      });
    },
  };
}
