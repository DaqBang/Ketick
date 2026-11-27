// Router + paparan. Hash routing: #/login, #/audit, dll.
import { db } from './db.js';
import { verify } from './audit.js';
import * as auth from './auth.js';
import * as cash from './cash.js';
import * as sales from './sales.js';
import { esc, go, refresh, toast, safe, fmtTime, input, btn, card, icon, initials } from './ui.js';
import { sparkline, areaChart, dial } from './charts.js';
import * as metrics from './metrics.js';
import { search } from './search.js';
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

// ---------- Layout: sidebar kaca ----------

// Menu sidebar. who: 'mgr' (manager/owner) atau 'owner'
const MENU = [
  { p: '/', l: 'Utama', ic: 'home' },
  { p: '/sales', l: 'Jualan', ic: 'receipt', sub: [['/sales', 'Point of Sale'], ['/products', 'Produk & Harga']] },
  {
    p: '/jobs', l: 'Job', ic: 'wrench',
    sub: [['/jobs/active', 'Aktif'], ['/jobs/closed', 'Diserah'], ['/jobs/cancelled', 'Batal'], ['/job-new', 'Job baru']],
  },
  {
    p: '/billing', l: 'Billing', ic: 'file',
    sub: [
      ['/billing/INV', 'Invois'], ['/billing/QT', 'Sebut Harga'], ['/billing/RC', 'Resit'],
      ['/billing/DO', 'Nota Hantaran'], ['/billing/CN', 'Nota Kredit'], ['/billing/PO', 'Pesanan Belian'],
    ],
  },
  { p: '/crm', l: 'CRM', ic: 'users', sub: [['/crm/customer', 'Pelanggan'], ['/crm/supplier', 'Pembekal']] },
  {
    p: '/stock', l: 'Stok', ic: 'box',
    sub: [['/stock', 'Ringkasan'], ['/stock-in', 'Terima'], ['/stock-count', 'Kira'], ['/stock-adjust', 'Laras']],
  },
  { p: '/cash', l: 'Tunai & Syif', ic: 'wallet' },
  { p: '/fraud', l: 'Anti-Fraud', ic: 'shield', sub: [['/alerts', 'Amaran', 'mgr'], ['/audit', 'Log Audit']] },
  { p: '/settings', l: 'Tetapan', ic: 'building', who: 'owner', sub: [['/users', 'Pengguna'], ['/company', 'Profil Syarikat']] },
];

// Skrin -> kumpulan menu
const GROUP_OF = {
  '/receipt': '/sales', '/refund': '/sales', '/products': '/sales',
  '/job': '/jobs', '/job-new': '/jobs', '/job-cancel': '/jobs',
  '/doc': '/billing', '/doc-edit': '/billing', '/doc-do': '/billing', '/doc-void': '/billing',
  '/contact': '/crm', '/crm-edit': '/crm',
  '/stock-in': '/stock', '/stock-count': '/stock', '/stock-adjust': '/stock',
  '/alerts': '/fraud', '/audit': '/fraud',
  '/users': '/settings', '/company': '/settings',
};
const PAGE = {
  '/sales': ['Jualan', 'Point of Sale'], '/receipt': ['Jualan', 'Resit'], '/refund': ['Jualan', 'Pulangan'],
  '/jobs': ['Operasi', 'Job Order'], '/job': ['Operasi', 'Butiran Job'], '/job-new': ['Operasi', 'Job Baru'],
  '/job-cancel': ['Operasi', 'Batal Job'],
  '/billing': ['Kewangan', 'Billing'], '/doc': ['Kewangan', 'Dokumen'], '/doc-edit': ['Kewangan', 'Draf Dokumen'],
  '/doc-do': ['Kewangan', 'Nota Hantaran'], '/doc-void': ['Kewangan', 'Batal Dokumen'],
  '/crm': ['Pelanggan', 'CRM'], '/contact': ['Pelanggan', 'Kenalan'], '/crm-edit': ['Pelanggan', 'Kenalan'],
  '/stock': ['Inventori', 'Stok'], '/stock-in': ['Inventori', 'Terima Stok'], '/stock-count': ['Inventori', 'Kiraan Stok'],
  '/stock-adjust': ['Inventori', 'Laras Stok'], '/products': ['Inventori', 'Produk & Harga'],
  '/cash': ['Kewangan', 'Tunai & Syif'], '/alerts': ['Anti-Fraud', 'Amaran Fraud'], '/audit': ['Anti-Fraud', 'Log Audit'],
  '/users': ['Tetapan', 'Pengguna'], '/company': ['Tetapan', 'Profil Syarikat'], '/more': ['Menu', 'Semua Modul'],
};

const allowed = (role, who) => !who || (who === 'mgr' ? role === 'owner' || role === 'manager' : role === who);
const todayLabel = () => new Date().toLocaleDateString('ms-MY', { weekday: 'short', day: 'numeric', month: 'short' });

// Keadaan sidebar (desktop runtuh disimpan; kumpulan dibuka hanya untuk sesi ini)
const SB_KEY = 'kawal:ui:sidebar';
let sbCollapsed = false;
try {
  sbCollapsed = localStorage.getItem(SB_KEY) === 'collapsed';
} catch {}
const openGroups = new Set();

function activeSub(subs, path, groupBase) {
  const hit = subs.find(([sp]) => path === sp || path.startsWith(sp + '/'));
  if (hit) return hit[0];
  return path === groupBase ? subs[0][0] : null;
}

function sidebar(path, base, user, st) {
  const grp = GROUP_OF[base] || base;
  const items = MENU.filter((m) => allowed(user.role, m.who))
    .map((m) => {
      const subs = (m.sub || []).filter((s) => allowed(user.role, s[2]));
      const active = grp === m.p;
      if (!subs.length || (subs.length === 1 && !m.sub)) {
        return `<a href="#${m.p}" class="sb-item ${active ? 'active' : ''}" title="${m.l}">${icon(m.ic, 'w-[18px] h-[18px]')}<span class="sb-label">${m.l}</span></a>`;
      }
      const act = activeSub(subs, path, m.p);
      const open = active || openGroups.has(m.p);
      return `<div class="sb-group ${open ? 'open' : ''}">
        <button type="button" data-group="${m.p}" class="sb-item ${active ? 'active' : ''}" title="${m.l}">
          ${icon(m.ic, 'w-[18px] h-[18px]')}<span class="sb-label">${m.l}</span>
          ${m.p === '/fraud' && st.highAlerts ? `<span class="sb-label ml-auto text-[10px] bg-red-500 text-white rounded-full px-1.5">${st.highAlerts}</span>` : ''}
          <span class="sb-chev ${m.p === '/fraud' && st.highAlerts ? '!ml-1' : ''}">${icon('chev', 'w-3.5 h-3.5')}</span>
        </button>
        <div class="sb-sub"><div class="pt-1 space-y-0.5">
          ${subs.map(([sp, sl]) => `<a href="#${sp}" class="sb-subitem ${sp === act ? 'active' : ''}">${sl}</a>`).join('')}
        </div></div>
      </div>`;
    })
    .join('');

  const status = [
    ['/cash', st.shift ? `Syif: ${esc(st.shift.user_name)}` : 'Syif ditutup', st.shift ? 'text-emerald-400' : 'off'],
    ['/jobs', `${st.doneJobs} job siap belum serah`, st.doneJobs ? 'text-amber-400' : 'off'],
    ...(cash.isManager(user) ? [['/alerts', `${st.highAlerts} amaran tinggi`, st.highAlerts ? 'text-red-500 blink' : 'off']] : []),
  ];

  return `
  <aside id="sidebar" class="sidebar ${sbCollapsed ? 'collapsed' : ''} print:hidden glass-dark rounded-[1.75rem] md:sticky md:top-3 md:h-[calc(100vh-1.5rem)] flex overflow-hidden text-slate-200">
    <div class="flex-1 min-w-0 flex flex-col p-3">
      <div class="flex items-center gap-2.5 px-1.5 py-1.5 mb-3">
        <div class="w-9 h-9 rounded-full grid place-items-center shrink-0 bg-gradient-to-b from-white/30 to-white/5 border border-white/20 shadow-[inset_0_1px_0_rgba(255,255,255,.4)]">${icon('shield', 'w-[18px] h-[18px]')}</div>
        <div class="sb-label min-w-0">
          <div class="font-bold text-white leading-tight truncate">${esc(auth.company())}</div>
          <div class="text-[11px] text-slate-400">Kawal ERP</div>
        </div>
      </div>
      <div class="sb-hide relative mb-3">
        <span class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">${icon('search')}</span>
        <input id="gsearch" autocomplete="off" placeholder="Cari…" class="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-3 py-2 text-sm text-white placeholder:text-slate-400 outline-none focus:border-brand-400 focus:bg-white/10">
        <div id="gresults" class="hidden absolute left-0 right-0 mt-2 bg-white text-slate-900 rounded-2xl shadow-2xl overflow-hidden z-50"></div>
      </div>
      <nav class="sb-scroll flex-1 overflow-y-auto space-y-1 -mx-1 px-1">
        ${items}
        <div class="sb-hide pt-4">
          <div class="px-3 pb-2 text-[10px] font-bold tracking-[.18em] text-slate-500">STATUS</div>
          ${status
            .map(([h, t, c]) => `<a href="#${h}" class="flex items-center gap-3 px-3 py-1.5 rounded-lg text-xs text-slate-300 hover:bg-white/5"><span class="led ${c}"></span>${t}</a>`)
            .join('')}
        </div>
      </nav>
      <div class="flex items-center gap-2.5 pt-3 mt-2 border-t border-white/10 px-1">
        <div class="relative shrink-0">
          <div class="w-9 h-9 rounded-full bg-gradient-to-b from-amber-200 to-amber-400 text-slate-900 grid place-items-center text-xs font-bold">${initials(user.name)}</div>
          <span class="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 border-2 border-[#0b1533]"></span>
        </div>
        <div class="sb-label min-w-0 flex-1 leading-tight">
          <div class="text-sm font-semibold text-white truncate">${esc(user.name)}</div>
          <div class="text-[11px] text-slate-400">${auth.ROLES[user.role]}</div>
        </div>
        <button data-logout class="sb-label w-8 h-8 rounded-full hover:bg-white/10 grid place-items-center" title="Log keluar">${icon('logout')}</button>
      </div>
    </div>
    <div class="sb-rail hidden md:flex w-14 flex-col items-center gap-2.5 py-3 rounded-l-[1.25rem]">
      <button data-sb-collapse class="rail-btn primary" title="Runtuhkan sidebar">${icon('panel')}</button>
      <a href="#/sales" class="rail-btn" title="Jualan baru">${icon('plus')}</a>
      <a href="#/job-new" class="rail-btn" title="Job baru">${icon('wrench')}</a>
      ${cash.isManager(user) ? `<a href="#/alerts" class="rail-btn relative" title="Amaran">${icon('bell')}${st.highAlerts ? '<span class="absolute top-1.5 right-2 w-2 h-2 rounded-full bg-red-500"></span>' : ''}</a>` : ''}
    </div>
  </aside>`;
}

function shell(body, base, user, st, path) {
  const [section, title] = PAGE[base] || [];
  return `
  <div class="md:flex md:gap-4 md:p-3 min-h-screen">
    <div id="sbBackdrop" class="sb-backdrop md:hidden"></div>
    ${sidebar(path, base, user, st)}
    ${
      sbCollapsed
        ? `<button data-sb-expand class="print:hidden hidden md:grid fixed left-[5.4rem] top-6 z-40 w-7 h-7 rounded-full bg-white text-brand-900 place-items-center shadow-lg" title="Buka sidebar">${icon('chev', 'w-3.5 h-3.5')}</button>`
        : ''
    }
    <div class="flex-1 min-w-0">
      <header class="print:hidden md:hidden sticky top-0 z-30 flex items-center gap-3 px-4 py-3 text-white glass-dark !rounded-none !border-x-0 !border-t-0">
        <button data-sb-open class="w-10 h-10 rounded-xl bg-white/10 border border-white/15 grid place-items-center">${icon('menu', 'w-5 h-5')}</button>
        <div class="min-w-0 flex-1">
          <div class="font-bold leading-tight truncate">${esc(auth.company())}</div>
          <div class="text-[11px] text-slate-400">${todayLabel()}</div>
        </div>
        ${
          st.highAlerts
            ? `<a href="#/alerts" class="relative w-10 h-10 rounded-xl bg-white/10 grid place-items-center">${icon('bell')}<span class="absolute top-2 right-2.5 w-2 h-2 rounded-full bg-red-500"></span></a>`
            : ''
        }
      </header>
      <main class="page-in px-3 py-4 md:px-4 md:py-3 pb-10 ${base === '/' ? 'max-w-6xl' : 'max-w-4xl'} mx-auto">
        ${
          base === '/'
            ? body
            : `<section class="spatial-window print-reset space-y-4">
            ${
              title
                ? `<div class="print:hidden">
                <div class="text-[11px] font-bold tracking-widest text-brand-600 uppercase">• ${section}</div>
                <h1 class="text-2xl md:text-3xl font-extrabold tracking-tight">${title}</h1>
              </div>`
                : ''
            }
            ${body}
          </section>`
        }
      </main>
    </div>
  </div>`;
}

// Sidebar, carian global & log keluar
function wireShell() {
  const sb = document.getElementById('sidebar');
  const bd = document.getElementById('sbBackdrop');
  const isMobile = () => window.matchMedia('(max-width: 767px)').matches;
  const setCollapsed = (v) => {
    sbCollapsed = v;
    try {
      localStorage.setItem(SB_KEY, v ? 'collapsed' : 'open');
    } catch {}
    refresh();
  };

  document.querySelectorAll('[data-group]').forEach((b) => {
    b.onclick = () => {
      const g = b.dataset.group;
      if (sbCollapsed && !isMobile()) {
        openGroups.add(g);
        return setCollapsed(false);
      }
      const el = b.closest('.sb-group');
      el.classList.toggle('open');
      if (el.classList.contains('open')) openGroups.add(g);
      else openGroups.delete(g);
    };
  });
  document.querySelector('[data-sb-collapse]')?.addEventListener('click', () => setCollapsed(true));
  document.querySelector('[data-sb-expand]')?.addEventListener('click', () => setCollapsed(false));
  document.querySelector('[data-sb-open]')?.addEventListener('click', () => {
    sb.classList.add('mobile-open');
    bd.classList.add('show');
  });
  bd?.addEventListener('click', () => {
    sb.classList.remove('mobile-open');
    bd.classList.remove('show');
  });

  const q = document.getElementById('gsearch');
  const box = document.getElementById('gresults');
  if (q) {
    q.oninput = () => {
      const res = search(q.value);
      box.classList.toggle('hidden', !q.value.trim());
      box.innerHTML = res.length
        ? res
            .map(
              (r) => `<a href="${r.href}" class="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-slate-50 text-sm">
            <div class="min-w-0"><div class="font-semibold truncate">${esc(r.title)}</div><div class="text-xs text-slate-500 truncate">${esc(r.sub)}</div></div>
            <span class="text-[10px] font-bold uppercase tracking-wide text-brand-600 bg-brand-50 rounded-full px-2 py-0.5">${r.kind}</span></a>`
            )
            .join('')
        : '<div class="px-4 py-3 text-sm text-slate-400">Tiada hasil</div>';
    };
    q.onblur = () => setTimeout(() => box.classList.add('hidden'), 200);
  }
  document.querySelectorAll('[data-logout]').forEach(
    (b) =>
      (b.onclick = safe(async () => {
        await auth.logout();
        go('/login');
      }))
  );
}

// ---------- Paparan ----------

const brandHead = (sub) => `
  <div class="text-white text-center mb-6">
    <div class="w-16 h-16 rounded-2xl glass-dark grid place-items-center mx-auto mb-3">${icon('shield', 'w-8 h-8')}</div>
    <div class="text-xl font-extrabold">${esc(auth.company() || 'Kawal ERP')}</div>
    <div class="text-sm text-slate-400">${sub}</div>
  </div>`;

function viewSetup() {
  return {
    html: `
    <div class="min-h-screen flex flex-col items-center justify-center p-4 page-in">
      ${brandHead('ERP anti-fraud untuk SME')}
      <form id="f" class="spatial-window w-full max-w-sm space-y-3">
        <h1 class="text-xl font-extrabold">Sediakan Sistem</h1>
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
    <div class="min-h-screen flex flex-col items-center justify-center p-4 page-in">
      ${brandHead('Log masuk dengan PIN anda')}
      <form id="f" class="spatial-window w-full max-w-sm space-y-3">
        <h1 class="text-xl font-extrabold">Log Masuk</h1>
        <select name="user" class="${input}" required>
          <option value="">Pilih nama</option>
          ${users.map((u) => `<option value="${u.id}">${esc(u.name)}</option>`).join('')}
        </select>
        <input name="pin" type="password" inputmode="numeric" maxlength="6" class="${input} tracking-[.5em] text-center text-lg" placeholder="••••••" required>
        <button class="${btn}">Log Masuk</button>
        <p class="text-[11px] text-slate-500 text-center">Setiap log masuk & PIN salah direkod dalam audit.</p>
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

const compactRM = (sen) => {
  const v = sen / 100;
  if (Math.abs(v) >= 1e6) return `RM${(v / 1e6).toFixed(1)}j`;
  if (Math.abs(v) >= 1e3) return `RM${(v / 1e3).toFixed(1)}k`;
  return `RM${Math.round(v)}`;
};

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Selamat pagi' : h < 15 ? 'Selamat tengah hari' : h < 19 ? 'Selamat petang' : 'Selamat malam';
}

// Jubin instrumen skeuomorfik: label, telaga LCD, trend, sparkline
function tile({ label, ic, value, unit = '', foot = '', trend = null, spark = '', href = '#', tone = '' }) {
  return `<a href="${href}" class="skeuo block p-4">
    <div class="flex items-center gap-1.5 text-[11px] font-bold tracking-wide uppercase text-slate-400">${icon(ic, 'w-3.5 h-3.5')}${label}</div>
    <div class="well mt-3 px-3 py-2.5 flex items-end justify-between gap-2">
      <div class="lcd text-xl sm:text-2xl font-bold whitespace-nowrap ${tone}">${value}<span class="text-xs text-slate-400 ml-1">${unit}</span></div>
      <div class="hidden sm:block opacity-90">${spark}</div>
    </div>
    <div class="mt-2 flex items-center gap-1 text-[11px] font-semibold ${
      trend === null ? 'text-slate-400' : trend >= 0 ? 'text-emerald-400' : 'text-red-400'
    }">${trend === null ? '' : icon(trend >= 0 ? 'up' : 'down', 'w-3 h-3') + `${trend >= 0 ? '+' : ''}${trend}%`} <span class="text-slate-400 font-medium">${foot}</span></div>
  </a>`;
}

function insight({ ic, tone = 'blue', text, cta, href }) {
  const tones = { blue: 'text-sky-300', amber: 'text-amber-300', red: 'text-red-400', green: 'text-emerald-300' };
  return `<a href="${href}" class="glass-dark rounded-2xl p-3 flex gap-3 hover:bg-white/10 transition">
    <div class="w-9 h-9 rounded-xl grid place-items-center shrink-0 bg-white/10 border border-white/10 ${tones[tone]}">${icon(ic)}</div>
    <div class="text-xs leading-snug text-slate-300">
      <div>${text}</div>
      <div class="mt-1 font-bold text-white flex items-center gap-1">${cta} ${icon('arrow', 'w-3 h-3')}</div>
    </div>
  </a>`;
}

async function viewHome(user) {
  const mgr = cash.isManager(user);
  const chain = await verify();
  const findings = mgr ? await fraud.findings() : [];
  const open = findings.filter((f) => !f.review);
  const count = (sev) => open.filter((f) => f.severity === sev).length;
  const score = metrics.integrityScore(findings, chain.ok);
  const owing = mgr ? billing.outstanding() : [];
  const owingTotal = owing.reduce((t, s) => t + s.balance, 0);
  const late = owing.filter((s) => s.overdue);
  const jobStates = db.all('jobs').map((j) => jobs.state(j.id)).filter((s) => !s.locked);
  const doneJobs = jobStates.filter((s) => s.status === 'done');
  const myJobs = jobStates.filter((s) => s.assigned?.id === user.id);
  const shift = cash.currentShift();
  const daily = metrics.dailyCollections(14);
  const vals = daily.map((d) => d.value);
  const todayVal = vals[vals.length - 1];
  const SP = { color: '#7dd3fc' };

  const leds = [
    ['Syif tunai', shift ? `Dibuka · ${esc(shift.user_name)}` : 'Ditutup', shift ? 'text-emerald-400' : 'off', '#/cash'],
    ['Log audit', chain.ok ? 'Utuh' : `Diusik #${chain.brokenAt}`, chain.ok ? 'text-emerald-400' : 'text-red-500 blink', '#/audit'],
    ['Job siap', `${doneJobs.length} belum serah`, doneJobs.length ? 'text-amber-400' : 'off', '#/jobs'],
    ...(mgr
      ? [
          ['Amaran tinggi', `${count('high')} belum disemak`, count('high') ? 'text-red-500 blink' : 'off', '#/alerts'],
          ['Invois lewat', `${late.length} invois`, late.length ? 'text-amber-400' : 'off', '#/billing/INV'],
        ]
      : []),
  ];

  const insights = [
    ...open
      .filter((f) => f.severity === 'high')
      .slice(0, 2)
      .map((f) => ({ ic: 'shield', tone: 'red', text: esc(f.title), cta: 'Semak', href: '#/alerts' })),
    doneJobs.length && {
      ic: 'wrench', tone: 'amber', text: `<b class="text-white">${doneJobs.length} job siap</b> belum diserah`, cta: 'Lihat job', href: '#/jobs',
    },
    late.length && {
      ic: 'clock', tone: 'amber', text: `<b class="text-white">${late.length} invois lewat</b> · ${cash.fmtRM(late.reduce((t, s) => t + s.balance, 0))}`, cta: 'Kutip', href: '#/billing/INV',
    },
    !mgr && myJobs.length && { ic: 'wrench', tone: 'blue', text: `<b class="text-white">${myJobs.length} job</b> ditugaskan kepada anda`, cta: 'Lihat', href: '#/jobs' },
    !shift && { ic: 'wallet', tone: 'blue', text: 'Tiada syif tunai dibuka', cta: 'Buka syif', href: '#/cash' },
  ].filter(Boolean).slice(0, 4);

  const tiles = mgr
    ? [
        tile({ label: 'Kutipan hari ini', ic: 'wallet', value: cash.fmtRM(todayVal), trend: metrics.trend(vals), foot: '7 hari', spark: sparkline(vals, SP), href: '#/cash' }),
        tile({ label: 'Invois tertunggak', ic: 'file', value: compactRM(owingTotal), foot: `${owing.length} invois · ${late.length} lewat`, spark: sparkline(metrics.dailyCount('docs', (d) => d.type === 'INV'), SP), href: '#/billing/INV' }),
        tile({ label: 'Job aktif', ic: 'wrench', value: jobStates.length, foot: `${doneJobs.length} siap belum serah`, spark: sparkline(metrics.dailyCount('jobs'), SP), href: '#/jobs' }),
        tile({ label: 'Amaran', ic: 'shield', value: open.length, foot: `${count('high')} tinggi · ${count('medium')} sederhana`, tone: count('high') ? '!text-red-300' : '', href: '#/alerts' }),
      ]
    : [
        tile({ label: 'Job aktif', ic: 'wrench', value: jobStates.length, foot: `${doneJobs.length} siap`, href: '#/jobs' }),
        tile({ label: 'Job saya', ic: 'users', value: myJobs.length, foot: 'ditugaskan', href: '#/jobs' }),
      ];

  const recent = db.all('audit_log').slice(-8).reverse();

  return {
    html: `
    <div class="space-y-4 text-slate-200">
      <div class="flex flex-wrap items-end justify-between gap-3 pt-1">
        <div>
          <div class="text-[11px] font-bold tracking-[.2em] text-sky-300/80 uppercase">• Ringkasan · ${todayLabel()}</div>
          <h1 class="text-2xl md:text-4xl font-extrabold tracking-tight text-white">${greeting()}, ${esc(user.name.split(' ')[0])}</h1>
          <p class="text-sm text-slate-400">${jobStates.length} job aktif${mgr ? ` dan ${owing.length} invois tertunggak` : ''} hari ini.</p>
        </div>
        <a href="#/sales" class="btn-skeuo">${icon('plus')}Jualan baru</a>
      </div>

      ${
        mgr
          ? `<div class="grid lg:grid-cols-3 gap-4">
        <a href="#/alerts" class="skeuo p-5 flex flex-col">
          <div class="flex items-center justify-between">
            <div class="text-[11px] font-bold tracking-wide uppercase text-slate-400">Skor integriti</div>
            <span class="text-[11px] text-sky-300 font-semibold">Laporan →</span>
          </div>
          <div class="my-2">${dial(score, { label: 'DARIPADA 100' })}</div>
          <div class="well px-3 py-2 grid grid-cols-3 gap-2 text-center text-[11px]">
            <div><div class="lcd text-lg font-bold !text-red-300">${count('high')}</div>Tinggi</div>
            <div><div class="lcd text-lg font-bold !text-amber-300">${count('medium')}</div>Sederhana</div>
            <div><div class="lcd text-lg font-bold">${count('low') + count('info')}</div>Rendah</div>
          </div>
        </a>
        <div class="lg:col-span-2 grid grid-cols-2 gap-4">${tiles.join('')}</div>
      </div>`
          : `<div class="grid grid-cols-2 gap-4">${tiles.join('')}</div>`
      }

      <div class="skeuo p-3 md:p-4">
        <div class="flex flex-wrap gap-x-6 gap-y-3">
          ${leds
            .map(
              ([l, v, c, h]) => `<a href="${h}" class="flex items-center gap-2.5 min-w-[140px]">
              <span class="led ${c}"></span>
              <span class="leading-tight"><span class="block text-[10px] font-bold uppercase tracking-wide text-slate-400">${l}</span><span class="text-sm font-semibold text-white">${v}</span></span>
            </a>`
            )
            .join('')}
        </div>
      </div>

      <div class="grid lg:grid-cols-3 gap-4">
        ${
          mgr
            ? `<div class="skeuo p-4 md:p-5 lg:col-span-2">
          <div class="flex items-start justify-between gap-2">
            <div>
              <div class="font-bold text-white">Kutipan 14 hari</div>
              <div class="text-xs text-slate-400">POS + job + resit invois · garis putus = purata 7 hari</div>
            </div>
            <div class="well px-3 py-1.5 lcd text-sm font-bold whitespace-nowrap">${cash.fmtRM(vals.reduce((a, b) => a + b, 0))}</div>
          </div>
          <div class="well mt-3 p-2 md:p-3">${areaChart(vals, {
            labels: daily.map((d, i) => ((vals.length - 1 - i) % 3 === 0 ? d.date.toLocaleDateString('ms-MY', { day: 'numeric', month: 'short' }) : '')),
            avg: metrics.movingAvg(vals),
            fmt: compactRM,
            dark: true,
          })}</div>
        </div>`
            : ''
        }
        <div class="${mgr ? '' : 'lg:col-span-3'} space-y-3">
          <div class="flex items-center gap-2 text-[11px] font-bold tracking-[.2em] text-sky-300/80">${icon('sparkle', 'w-3.5 h-3.5')}INSIGHT</div>
          ${insights.map(insight).join('') || '<div class="glass-dark rounded-2xl p-4 text-sm text-slate-400">Tiada perkara perlu tindakan. 👍</div>'}
        </div>
      </div>

      ${
        mgr
          ? `<div class="glass-dark rounded-[1.5rem] p-4 md:p-5">
        <div class="flex items-center justify-between mb-2">
          <div class="font-bold text-white">Aktiviti terkini</div>
          <a href="#/audit" class="text-xs font-semibold text-sky-300">Semua →</a>
        </div>
        <div class="divide-y divide-white/5">
          ${recent
            .map(
              (e) => `<div class="py-2 flex items-center gap-3 text-sm">
            <div class="w-8 h-8 rounded-full bg-white/10 border border-white/10 grid place-items-center text-[10px] font-bold">${initials(e.actor_name)}</div>
            <div class="min-w-0 flex-1">
              <div class="truncate ${ALERT_ACTIONS.has(e.action) ? 'text-red-300 font-semibold' : 'text-slate-200'}">${esc(ACTION_LABEL[e.action] || e.action)}${e.detail?.no ? ` · ${esc(e.detail.no)}` : ''}</div>
              <div class="text-xs text-slate-500">${esc(e.actor_name)} · ${fmtTime(e.ts)}</div>
            </div>
          </div>`
            )
            .join('')}
        </div>
      </div>`
          : `<div class="glass-dark rounded-[1.5rem] p-4">
        <div class="font-bold text-white mb-2">Job saya</div>
        <div class="divide-y divide-white/5">
          ${
            myJobs
              .map(
                (s) => `<a href="#/job/${s.job.id}" class="py-2 flex justify-between text-sm">
              <span>${s.job.no} · ${esc(s.job.customer)}</span><span class="text-xs text-slate-400">${jobs.STATUS[s.status]}</span></a>`
              )
              .join('') || '<div class="text-sm text-slate-400 py-2">Tiada job ditugaskan</div>'
          }
        </div>
      </div>`
      }
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
  const items = MENU.filter((m) => allowed(user.role, m.who)).flatMap((m) =>
    m.sub ? m.sub.filter((x) => allowed(user.role, x[2])).map(([p, l]) => [p, l, m.ic]) : [[m.p, m.l, m.ic]]
  );
  return {
    html: `
    <div class="grid grid-cols-3 gap-3">
      ${items
        .map(
          ([p, l, ic]) => `<a href="#${p}" class="${card} flex flex-col items-center gap-2 text-center text-xs font-semibold py-5">
          <span class="w-10 h-10 rounded-2xl bg-brand-50 text-brand-700 grid place-items-center">${icon(ic, 'w-5 h-5')}</span>${l}</a>`
        )
        .join('')}
    </div>`,
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
    <form id="close" class="${card} space-y-3 border-2 border-brand-900">
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
  if (PUBLIC.has(path)) {
    $app.innerHTML = html;
  } else {
    // Lencana amaran & skor integriti untuk sidebar (manager/owner)
    // Status untuk sidebar
    const st = {
      shift: cash.currentShift(),
      doneJobs: db.all('jobs').filter((j) => jobs.state(j.id).status === 'done').length,
      highAlerts: cash.isManager(user)
        ? (await fraud.findings()).filter((x) => !x.review && x.severity === 'high').length
        : 0,
    };
    $app.innerHTML = shell(html, base, user, st, path);
    wireShell();
  }
  mount?.();
}

window.addEventListener('hashchange', safe(render));
safe(render)();
