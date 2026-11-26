// Router + paparan. Hash routing: #/login, #/audit, dll.
import { db } from './db.js';
import { verify } from './audit.js';
import * as auth from './auth.js';
import * as cash from './cash.js';
import * as sales from './sales.js';
import { esc, go, toast, safe, fmtTime, input, btn, card } from './ui.js';
import { viewSales, viewReceipt, viewRefund, viewProducts } from './views-sales.js';
import { viewStock, viewStockIn, viewStockCount, viewStockAdjust } from './views-stock.js';
import { viewJobs, viewJobNew, viewJob, viewJobCancel } from './views-jobs.js';
import * as jobs from './jobs.js';
import * as fraud from './fraud.js';
import { viewAlerts } from './views-alerts.js';
import { viewCrm, viewCrmEdit, viewContact } from './views-crm.js';
import {
  viewBilling, viewDocEdit, viewDoc, viewDocDeliver, viewDocVoid, viewCompany,
} from './views-billing.js';
import * as billing from './billing.js';

const $app = document.getElementById('app');

const ACTION_LABEL = {
  setup: 'Sistem disediakan',
  'user.create': 'Pengguna dicipta',
  'user.locked': 'Akaun dikunci',
  'user.unlock': 'Kunci dibuka',
  'user.activate': 'Akaun diaktifkan',
  'user.deactivate': 'Akaun dinyahaktif',
  'auth.login': 'Log masuk',
  'auth.logout': 'Log keluar',
  'auth.fail': 'PIN salah',
  'cash.open': 'Syif dibuka',
  'cash.in': 'Tunai masuk',
  'cash.out': 'Belanja tunai',
  'cash.deposit': 'Masuk bank',
  'cash.drawing': 'Pengeluaran owner',
  'cash.reverse': 'Rekod tunai dibatal',
  'cash.close': 'Syif ditutup',
  'cash.variance': 'Tunai tidak padan',
  'sale.create': 'Jualan',
  'sale.discount': 'Diskaun diluluskan',
  'sale.refund': 'Pulangan jualan',
  'product.create': 'Produk ditambah',
  'product.update': 'Produk dikemas kini',
  'product.price': 'Harga produk diubah',
  'product.deactivate': 'Produk dinyahaktif',
  'product.activate': 'Produk diaktifkan',
  'stock.receive': 'Terima stok',
  'stock.adjust': 'Laras stok',
  'stock.count': 'Kiraan stok',
  'stock.variance': 'Stok tidak padan',
  'stock.count_apply': 'Laras ikut kiraan',
  'job.create': 'Job dicipta',
  'job.status': 'Status job',
  'job.assign': 'Job ditugaskan',
  'job.part': 'Part guna dalam job',
  'job.charge': 'Caj job',
  'job.void': 'Baris job dibuang',
  'job.discount': 'Diskaun job',
  'job.payment': 'Bayaran job',
  'job.close': 'Job diserah',
  'job.cancel': 'Job dibatal',
  'alert.review': 'Amaran disemak',
  'contact.create': 'Kenalan ditambah',
  'contact.update': 'Kenalan dikemas kini',
  'contact.activate': 'Kenalan diaktifkan',
  'contact.deactivate': 'Kenalan dinyahaktif',
  'company.update': 'Profil syarikat dikemas kini',
  'company.bank': 'Akaun bank syarikat diubah',
  'doc.issue': 'Dokumen dikeluarkan',
  'doc.discount': 'Harga invois bawah senarai (lulus)',
  'doc.po_price': 'Harga PO atas kos (lulus)',
  'doc.receipt': 'Resit dikeluarkan',
  'doc.credit': 'Nota kredit',
  'doc.deliver': 'Nota hantaran',
  'doc.void': 'Dokumen dibatal',
  'doc.share': 'Dokumen dihantar',
  'doc.draft_discard': 'Draf dibuang',
};
const ALERT_ACTIONS = new Set([
  'auth.fail',
  'user.locked',
  'user.deactivate',
  'cash.reverse',
  'cash.variance',
  'sale.discount',
  'sale.refund',
  'product.price',
  'stock.adjust',
  'stock.variance',
  'stock.count_apply',
  'job.void',
  'job.discount',
  'job.cancel',
  'company.bank',
  'doc.discount',
  'doc.po_price',
  'doc.credit',
  'doc.void',
]);

// ---------- Layout ----------

const NAV = [
  ['/', 'Utama', '🏠'],
  ['/sales', 'Jualan', '🧾'],
  ['/stock', 'Stok', '📦'],
  ['/jobs', 'Job', '🛠️'],
  ['/more', 'Lagi', '☰'],
];

function shell(body, path, user) {
  return `
  <header class="print:hidden bg-slate-900 text-white px-4 py-3 flex justify-between items-center sticky top-0 z-10">
    <div>
      <div class="font-bold">${esc(auth.company())}</div>
      <div class="text-xs text-slate-300">${esc(user.name)} · ${auth.ROLES[user.role]}</div>
    </div>
  </header>
  <main class="p-4 pb-24 max-w-2xl mx-auto space-y-4">${body}</main>
  <nav class="print:hidden fixed bottom-0 inset-x-0 bg-white border-t grid grid-cols-5 text-xs">
    ${NAV.map(
      ([p, label, icon]) => `
      <a href="#${p}" class="py-2 flex flex-col items-center ${
        (p === '/' ? path === '/' : path.startsWith(p.replace(/s$/, ''))) ? 'text-slate-900 font-bold' : 'text-slate-500'
      }"><span class="text-lg">${icon}</span>${label}</a>`
    ).join('')}
  </nav>`;
}

// ---------- Paparan ----------

function viewSetup() {
  return {
    html: `
    <div class="min-h-screen flex items-center justify-center p-4">
      <form id="f" class="${card} w-full max-w-sm space-y-3">
        <h1 class="text-xl font-bold">Sediakan Sistem</h1>
        <p class="text-sm text-slate-500">Akaun owner pertama. PIN 6 digit.</p>
        <input name="companyName" class="${input}" placeholder="Nama syarikat" required>
        <input name="name" class="${input}" placeholder="Nama owner" required>
        <input name="pin" type="password" inputmode="numeric" maxlength="6" class="${input}" placeholder="PIN" required>
        <input name="pin2" type="password" inputmode="numeric" maxlength="6" class="${input}" placeholder="Ulang PIN" required>
        <button class="${btn}">Mula</button>
      </form>
    </div>`,
    mount() {
      document.getElementById('f').onsubmit = safe(async (ev) => {
        ev.preventDefault();
        const d = Object.fromEntries(new FormData(ev.target));
        if (d.pin !== d.pin2) throw new Error('PIN tidak sama');
        await auth.setupOwner(d);
        toast('Sistem sedia. Sila log masuk.', 'ok');
        go('/login');
      });
    },
  };
}

function viewLogin() {
  const users = db.where('users', (u) => u.active);
  return {
    html: `
    <div class="min-h-screen flex items-center justify-center p-4">
      <form id="f" class="${card} w-full max-w-sm space-y-3">
        <h1 class="text-xl font-bold">${esc(auth.company())}</h1>
        <select name="user" class="${input}" required>
          <option value="">Pilih nama</option>
          ${users.map((u) => `<option value="${u.id}">${esc(u.name)}</option>`).join('')}
        </select>
        <input name="pin" type="password" inputmode="numeric" maxlength="6" class="${input}" placeholder="PIN" required>
        <button class="${btn}">Log Masuk</button>
      </form>
    </div>`,
    mount() {
      document.getElementById('f').onsubmit = safe(async (ev) => {
        ev.preventDefault();
        const d = Object.fromEntries(new FormData(ev.target));
        await auth.login(d.user, d.pin);
        go('/');
      });
    },
  };
}

async function viewHome(user) {
  const chain = await verify();
  const mgr = cash.isManager(user);
  const found = mgr ? (await fraud.findings()).filter((f) => !f.review) : [];
  const high = found.filter((f) => f.severity === 'high').length;
  const owing = mgr ? billing.outstanding() : [];
  const owingLate = owing.filter((s) => s.overdue).length;
  const shift = cash.currentShift();
  const today = sales.todaySummary();
  return {
    html: `
    <div class="${card}">
      <div class="text-sm text-slate-500">Selamat datang</div>
      <div class="text-lg font-bold">${esc(user.name)}</div>
    </div>
    <div class="grid grid-cols-2 gap-3">
      <a href="#/audit" class="${card} ${chain.ok ? '' : 'ring-2 ring-red-500'}">
        <div class="text-xs text-slate-500">Integriti log</div>
        <div class="text-lg font-bold ${chain.ok ? 'text-emerald-600' : 'text-red-600'}">
          ${chain.ok ? 'Selamat' : 'DIUSIK!'}
        </div>
        <div class="text-xs text-slate-400">${chain.count} entri</div>
      </a>
      ${
        mgr
          ? `<a href="#/alerts" class="${card} ${high ? 'ring-2 ring-red-500' : ''}">
        <div class="text-xs text-slate-500">Amaran fraud</div>
        <div class="text-lg font-bold ${high ? 'text-red-600' : found.length ? 'text-amber-600' : 'text-emerald-600'}">${found.length}</div>
        <div class="text-xs text-slate-400">${high} tinggi · belum disemak</div>
      </a>`
          : `<a href="#/jobs" class="${card}">
        <div class="text-xs text-slate-500">Job aktif</div>
        <div class="text-lg font-bold">${jobs.activeCount()}</div>
      </a>`
      }
      ${
        mgr
          ? `<a href="#/sales" class="${card} col-span-2">
        <div class="text-xs text-slate-500">Jualan bersih hari ini</div>
        <div class="text-lg font-bold">${cash.fmtRM(today.net)}</div>
        <div class="text-xs text-slate-400">${today.count} resit · pulangan ${cash.fmtRM(today.refunds)}</div>
      </a>`
          : ''
      }
      ${
        mgr
          ? `<a href="#/billing/INV" class="${card} col-span-2 ${owingLate ? 'ring-2 ring-amber-400' : ''}">
        <div class="text-xs text-slate-500">Invois tertunggak</div>
        <div class="text-lg font-bold">${cash.fmtRM(owing.reduce((t, s) => t + s.balance, 0))}</div>
        <div class="text-xs text-slate-400">${owing.length} invois · ${owingLate} lewat</div>
      </a>`
          : ''
      }
      <a href="#/jobs" class="${card} col-span-2">
        <div class="text-xs text-slate-500">Job aktif</div>
        <div class="font-bold">${jobs.activeCount()} job belum diserah</div>
      </a>
      <a href="#/cash" class="${card} col-span-2">
        <div class="text-xs text-slate-500">Syif tunai</div>
        <div class="font-bold">${
          shift ? `Dibuka oleh ${esc(shift.user_name)} · ${fmtTime(shift.opened_at)}` : 'Tiada syif dibuka'
        }</div>
      </a>
    </div>`,
  };
}

function auditMoney(d = {}) {
  if (typeof d.variance === 'number' && typeof d.counted !== 'number') {
    return ` · beza ${cash.fmtRM(d.variance)}`;
  }
  if (typeof d.counted === 'number') {
    return ` · kira ${cash.fmtRM(d.counted)} / jangka ${cash.fmtRM(d.expected)}`;
  }
  return typeof d.amount === 'number' ? ` · ${cash.fmtRM(d.amount)}` : '';
}

async function viewAudit(user) {
  const chain = await verify();
  const rows = db.all('audit_log').slice(-200).reverse();
  return {
    html: `
    <div class="${card} ${chain.ok ? 'bg-emerald-50' : 'bg-red-50'}">
      <div class="font-bold ${chain.ok ? 'text-emerald-700' : 'text-red-700'}">
        ${
          chain.ok
            ? `✔ Rantai log utuh (${chain.count} entri)`
            : `✖ Log diusik bermula entri #${chain.brokenAt}`
        }
      </div>
    </div>
    <div class="${card} divide-y">
      ${
        rows
          .map(
            (e) => `
        <div class="py-2 text-sm ${ALERT_ACTIONS.has(e.action) ? 'text-red-700' : ''}">
          <div class="flex justify-between">
            <span class="font-medium">#${e.seq} ${esc(ACTION_LABEL[e.action] || e.action)}</span>
            <span class="text-xs text-slate-400">${fmtTime(e.ts)}</span>
          </div>
          <div class="text-xs text-slate-500">${esc(e.actor_name)}${
              e.detail?.name ? ` → ${esc(e.detail.name)}` : ''
            }${auditMoney(e.detail)}${e.detail?.note ? ` · ${esc(e.detail.note)}` : ''}</div>
        </div>`
          )
          .join('') || '<div class="text-sm text-slate-400">Tiada rekod</div>'
      }
    </div>`,
  };
}

function viewUsers(user) {
  const users = db.all('users');
  return {
    html: `
    <form id="f" class="${card} space-y-3">
      <h2 class="font-bold">Tambah Pengguna</h2>
      <input name="name" class="${input}" placeholder="Nama" required>
      <select name="role" class="${input}">
        <option value="staff">Staf</option>
        <option value="manager">Manager</option>
      </select>
      <input name="pin" type="password" inputmode="numeric" maxlength="6" class="${input}" placeholder="PIN 6 digit" required>
      <button class="${btn}">Tambah</button>
    </form>
    <div class="${card} divide-y">
      ${users
        .map(
          (u) => `
        <div class="py-2 flex justify-between items-center text-sm">
          <div>
            <div class="font-medium ${u.active ? '' : 'line-through text-slate-400'}">${esc(u.name)}</div>
            <div class="text-xs text-slate-500">${auth.ROLES[u.role]}${
              u.fails >= 5 && u.role !== 'owner' ? ' · <span class="text-red-600">Dikunci</span>' : ''
            }</div>
          </div>
          ${
            u.id === user.id
              ? ''
              : `<div class="flex gap-2">
              ${u.fails >= 5 ? `<button data-unlock="${u.id}" class="text-xs px-2 py-1 border rounded">Buka</button>` : ''}
              <button data-toggle="${u.id}" data-active="${u.active}" class="text-xs px-2 py-1 border rounded">
                ${u.active ? 'Nyahaktif' : 'Aktifkan'}
              </button>
            </div>`
          }
        </div>`
        )
        .join('')}
    </div>`,
    mount() {
      document.getElementById('f').onsubmit = safe(async (ev) => {
        ev.preventDefault();
        await auth.createUser(Object.fromEntries(new FormData(ev.target)));
        toast('Pengguna ditambah', 'ok');
        render();
      });
      $app.querySelectorAll('[data-unlock]').forEach(
        (b) => (b.onclick = safe(async () => { await auth.unlockUser(b.dataset.unlock); render(); }))
      );
      $app.querySelectorAll('[data-toggle]').forEach(
        (b) =>
          (b.onclick = safe(async () => {
            await auth.setActive(b.dataset.toggle, b.dataset.active !== 'true');
            render();
          }))
      );
    },
  };
}

function viewMore(user) {
  const items = [
    ...(cash.isManager(user) ? [['/alerts', '🚨 Amaran Fraud']] : []),
    ['/billing', '📑 Billing (Invois, Sebut Harga, DO, PO)'],
    ['/crm', '👤 CRM (Pelanggan & Pembekal)'],
    ['/cash', '💵 Tunai & Syif'],
    ['/products', '🏷️ Produk & Harga'],
    ['/audit', '🔒 Log Audit'],
    ...(user.role === 'owner' ? [['/users', '👥 Pengguna'], ['/company', '🏢 Profil Syarikat']] : []),
  ];
  return {
    html: `
    <div class="${card} divide-y">
      ${items.map(([p, l]) => `<a href="#${p}" class="block py-3">${l}</a>`).join('')}
      <button id="out" class="block w-full text-left py-3 text-red-600">↩ Log Keluar</button>
    </div>`,
    mount() {
      document.getElementById('out').onclick = safe(async () => {
        await auth.logout();
        go('/login');
      });
    },
  };
}

function viewCash(user) {
  const sh = cash.currentShift();
  const mgr = cash.isManager(user);

  if (!sh) {
    const history = mgr ? cash.closedShifts() : [];
    return {
      html: `
      <form id="open" class="${card} space-y-3">
        <h2 class="font-bold">Buka Syif</h2>
        <p class="text-sm text-slate-500">Kira duit dalam laci sebelum mula.</p>
        <input name="float" inputmode="decimal" class="${input}" placeholder="Float (RM)" required>
        <button class="${btn}">Buka Syif</button>
      </form>
      ${
        history.length
          ? `<div class="${card} divide-y">
          <h2 class="font-bold pb-2">Sejarah Syif</h2>
          ${history
            .map(
              (h) => `
            <div class="py-2 text-sm">
              <div class="flex justify-between">
                <span>${esc(h.opened_by)}</span>
                <span class="font-bold ${
                  Math.abs(h.variance) > cash.VARIANCE_LIMIT ? 'text-red-600' : 'text-emerald-600'
                }">${h.variance === 0 ? 'Tepat' : cash.fmtRM(h.variance)}</span>
              </div>
              <div class="text-xs text-slate-500">
                ${fmtTime(h.opened_at)} – ${fmtTime(h.closed_at)} · kira ${cash.fmtRM(h.counted)} / jangka ${cash.fmtRM(h.expected)}
              </div>
            </div>`
            )
            .join('')}
        </div>`
          : ''
      }`,
      mount() {
        document.getElementById('open').onsubmit = safe(async (ev) => {
          ev.preventDefault();
          await cash.startShift(cash.toSen(new FormData(ev.target).get('float')));
          toast('Syif dibuka', 'ok');
          render();
        });
      },
    };
  }

  const moves = cash.shiftMoves(sh.id).reverse();
  const reversed = cash.reversedIds(moves);
  const canUse = sh.user_id === user.id || mgr;
  const types = ['in', 'out', 'deposit', ...(user.role === 'owner' ? ['drawing'] : [])];

  return {
    html: `
    <div class="${card}">
      <div class="text-xs text-slate-500">Syif dibuka</div>
      <div class="font-bold">${esc(sh.user_name)} · ${fmtTime(sh.opened_at)}</div>
      ${
        mgr
          ? `<div class="mt-2 text-sm">Dijangka dalam laci: <b>${cash.fmtRM(cash.expected(sh.id))}</b></div>`
          : '<div class="mt-2 text-xs text-slate-400">Kiraan buta: jumlah dijangka hanya dilihat manager.</div>'
      }
    </div>
    ${
      canUse
        ? `
    <form id="move" class="${card} space-y-3">
      <h2 class="font-bold">Rekod Tunai</h2>
      <select name="type" class="${input}">
        ${types.map((t) => `<option value="${t}">${cash.TYPES[t]}</option>`).join('')}
      </select>
      <input name="amount" inputmode="decimal" class="${input}" placeholder="Jumlah (RM)" required>
      <input name="note" class="${input}" placeholder="Sebab / catatan (wajib)" required>
      <button class="${btn}">Simpan</button>
    </form>`
        : `<div class="${card} text-sm text-amber-700">Syif ini milik ${esc(sh.user_name)}.</div>`
    }
    <div class="${card} divide-y">
      <h2 class="font-bold pb-2">Pergerakan</h2>
      ${moves
        .filter((m) => m.type !== 'reverse')
        .map((m) => {
          const gone = reversed.has(m.id);
          const minus = ['out', 'deposit', 'drawing', 'refund', 'job_refund'].includes(m.type);
          return `
        <div class="py-2 text-sm flex justify-between items-start gap-2">
          <div class="${gone ? 'line-through text-slate-400' : ''}">
            <div class="font-medium">${cash.TYPES[m.type]}</div>
            <div class="text-xs text-slate-500">${esc(m.user_name)} · ${fmtTime(m.created_at)}${
            m.note ? ` · ${esc(m.note)}` : ''
          }</div>
          </div>
          <div class="text-right">
            <div class="font-bold ${gone ? 'line-through text-slate-400' : minus ? 'text-red-600' : ''}">
              ${minus ? '-' : ''}${cash.fmtRM(m.amount)}
            </div>
            ${
              mgr && !gone && !['open', 'sale', 'refund', 'job', 'job_refund'].includes(m.type)
                ? `<button data-rev="${m.id}" class="text-xs text-red-600 underline">Batal</button>`
                : ''
            }
          </div>
        </div>`;
        })
        .join('')}
    </div>
    ${
      canUse
        ? `
    <form id="close" class="${card} space-y-3 border-2 border-slate-900">
      <h2 class="font-bold">Tutup Syif</h2>
      <p class="text-sm text-slate-500">Kira semua tunai dalam laci, masukkan jumlah sebenar.</p>
      <input name="counted" inputmode="decimal" class="${input}" placeholder="Jumlah dikira (RM)" required>
      <input name="note" class="${input}" placeholder="Catatan (pilihan)">
      <button class="${btn}">Tutup Syif</button>
    </form>`
        : ''
    }`,
    mount() {
      const move = document.getElementById('move');
      if (move) {
        move.onsubmit = safe(async (ev) => {
          ev.preventDefault();
          const d = Object.fromEntries(new FormData(ev.target));
          await cash.addMove(d.type, cash.toSen(d.amount), d.note);
          toast('Disimpan', 'ok');
          render();
        });
      }
      $app.querySelectorAll('[data-rev]').forEach(
        (b) =>
          (b.onclick = safe(async () => {
            const reason = prompt('Sebab batal rekod ini?');
            if (reason === null) return;
            await cash.reverseMove(b.dataset.rev, reason);
            toast('Rekod dibatal (direkod dalam audit)', 'ok');
            render();
          }))
      );
      const close = document.getElementById('close');
      if (close) {
        close.onsubmit = safe(async (ev) => {
          ev.preventDefault();
          const d = Object.fromEntries(new FormData(ev.target));
          const counted = cash.toSen(d.counted);
          if (!confirm(`Tutup syif dengan kiraan ${cash.fmtRM(counted)}? Tidak boleh ubah selepas ini.`)) return;
          const r = await cash.closeShift(counted, d.note);
          toast(
            r.variance === 0 ? 'Syif ditutup. Tunai tepat.' : `Syif ditutup. Beza ${cash.fmtRM(r.variance)}`,
            Math.abs(r.variance) > cash.VARIANCE_LIMIT ? 'error' : 'ok'
          );
          render();
        });
      }
    },
  };
}

const soon = (title) => () => ({
  html: `<div class="${card}"><h2 class="font-bold">${title}</h2>
    <p class="text-sm text-slate-500">Akan datang.</p></div>`,
});

// ---------- Router ----------

const routes = {
  '/setup': viewSetup,
  '/login': viewLogin,
  '/': viewHome,
  '/sales': viewSales,
  '/receipt': viewReceipt,
  '/refund': viewRefund,
  '/products': viewProducts,
  '/stock': viewStock,
  '/stock-in': viewStockIn,
  '/stock-count': viewStockCount,
  '/stock-adjust': viewStockAdjust,
  '/jobs': viewJobs,
  '/job-new': viewJobNew,
  '/job': viewJob,
  '/job-cancel': viewJobCancel,
  '/cash': viewCash,
  '/audit': viewAudit,
  '/alerts': viewAlerts,
  '/billing': viewBilling,
  '/doc-edit': viewDocEdit,
  '/doc': viewDoc,
  '/doc-do': viewDocDeliver,
  '/doc-void': viewDocVoid,
  '/company': viewCompany,
  '/crm': viewCrm,
  '/crm-edit': viewCrmEdit,
  '/contact': viewContact,
  '/users': viewUsers,
  '/more': viewMore,
};
const PUBLIC = new Set(['/setup', '/login']);
const OWNER_ONLY = new Set(['/users']);

async function render() {
  const path = location.hash.slice(1) || '/';
  // '/receipt/ID' -> base '/receipt', param 'ID'
  const [, seg = '', param] = path.match(/^\/([^/]*)\/?(.*)$/) || [];
  const base = '/' + seg;
  const ready = auth.isSetup();
  const user = auth.current();

  if (!ready && path !== '/setup') return go('/setup');
  if (ready && path === '/setup') return go('/login');
  if (!user && !PUBLIC.has(path)) return go('/login');
  if (user && path === '/login') return go('/');
  if (OWNER_ONLY.has(path) && user.role !== 'owner') return go('/');

  const view = routes[base] || soon('Tidak dijumpai');
  const { html, mount } = await view(user, param || null);
  $app.innerHTML = PUBLIC.has(path) ? html : shell(html, path, user);
  mount?.();
}

window.addEventListener('hashchange', safe(render));
safe(render)();
