// Router + paparan. Hash routing: #/login, #/audit, dll.
import { db } from './db.js';
import { verify } from './audit.js';
import * as auth from './auth.js';

const $app = document.getElementById('app');

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );

const go = (path) => (location.hash = '#' + path);

function toast(msg, type = 'error') {
  const el = document.createElement('div');
  el.className = `fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg text-white text-sm shadow-lg ${
    type === 'error' ? 'bg-red-600' : 'bg-emerald-600'
  }`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// Jalankan fungsi async; papar ralat sebagai toast
const safe = (fn) => async (...a) => {
  try {
    await fn(...a);
  } catch (e) {
    toast(e.message);
  }
};

const fmtTime = (iso) =>
  new Date(iso).toLocaleString('ms-MY', { dateStyle: 'short', timeStyle: 'short' });

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
};
const ALERT_ACTIONS = new Set(['auth.fail', 'user.locked', 'user.deactivate']);

const input = 'w-full border border-slate-300 rounded-lg px-3 py-2';
const btn = 'w-full bg-slate-900 text-white rounded-lg py-2 font-medium active:scale-95';
const card = 'bg-white rounded-xl shadow-sm p-4';

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
  <header class="bg-slate-900 text-white px-4 py-3 flex justify-between items-center sticky top-0 z-10">
    <div>
      <div class="font-bold">${esc(auth.company())}</div>
      <div class="text-xs text-slate-300">${esc(user.name)} · ${auth.ROLES[user.role]}</div>
    </div>
  </header>
  <main class="p-4 pb-24 max-w-2xl mx-auto space-y-4">${body}</main>
  <nav class="fixed bottom-0 inset-x-0 bg-white border-t grid grid-cols-5 text-xs">
    ${NAV.map(
      ([p, label, icon]) => `
      <a href="#${p}" class="py-2 flex flex-col items-center ${
        p === path ? 'text-slate-900 font-bold' : 'text-slate-500'
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
  const fails = db.where('audit_log', (e) => ALERT_ACTIONS.has(e.action)).length;
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
      <a href="#/audit" class="${card}">
        <div class="text-xs text-slate-500">Amaran</div>
        <div class="text-lg font-bold ${fails ? 'text-amber-600' : ''}">${fails}</div>
        <div class="text-xs text-slate-400">PIN salah / kunci</div>
      </a>
    </div>`,
  };
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
            }</div>
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
    ['/cash', '💵 Tunai & Syif'],
    ['/audit', '🔒 Log Audit'],
    ...(user.role === 'owner' ? [['/users', '👥 Pengguna']] : []),
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

const soon = (title) => () => ({
  html: `<div class="${card}"><h2 class="font-bold">${title}</h2>
    <p class="text-sm text-slate-500">Akan datang.</p></div>`,
});

// ---------- Router ----------

const routes = {
  '/setup': viewSetup,
  '/login': viewLogin,
  '/': viewHome,
  '/sales': soon('Jualan'),
  '/stock': soon('Stok'),
  '/jobs': soon('Job Order'),
  '/cash': soon('Tunai & Syif'),
  '/audit': viewAudit,
  '/users': viewUsers,
  '/more': viewMore,
};
const PUBLIC = new Set(['/setup', '/login']);
const OWNER_ONLY = new Set(['/users']);

async function render() {
  const path = location.hash.slice(1) || '/';
  const ready = auth.isSetup();
  const user = auth.current();

  if (!ready && path !== '/setup') return go('/setup');
  if (ready && path === '/setup') return go('/login');
  if (!user && !PUBLIC.has(path)) return go('/login');
  if (user && path === '/login') return go('/');
  if (OWNER_ONLY.has(path) && user.role !== 'owner') return go('/');

  const view = routes[path] || soon('Tidak dijumpai');
  const { html, mount } = await view(user);
  $app.innerHTML = PUBLIC.has(path) ? html : shell(html, path, user);
  mount?.();
}

window.addEventListener('hashchange', safe(render));
safe(render)();
