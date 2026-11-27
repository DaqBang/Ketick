// Helper UI yang dikongsi semua paparan.

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );

export const go = (path) => (location.hash = '#' + path);

// Lukis semula paparan semasa
export const refresh = () => window.dispatchEvent(new HashChangeEvent('hashchange'));

export function toast(msg, type = 'error') {
  const el = document.createElement('div');
  el.className = `fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-full text-white text-sm font-semibold shadow-lg ${
    type === 'error' ? 'bg-red-600' : 'bg-brand-600'
  }`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// Jalankan fungsi async; papar ralat sebagai toast
export const safe = (fn) => async (...a) => {
  try {
    await fn(...a);
  } catch (e) {
    toast(e.message);
  }
};

export const fmtTime = (iso) =>
  new Date(iso).toLocaleString('ms-MY', { dateStyle: 'short', timeStyle: 'short' });

// Gaya asas — ditukar di sini, semua skrin ikut
export const input =
  'w-full bg-white/90 border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none shadow-[inset_0_1px_2px_rgba(15,23,42,.06)] focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition';
export const btn =
  'w-full text-white rounded-xl py-2.5 text-sm font-semibold bg-gradient-to-b from-brand-500 to-brand-700 shadow-[inset_0_1px_0_rgba(255,255,255,.4),0_8px_18px_-8px_rgba(37,88,235,.8)] active:scale-[.98] transition disabled:opacity-40';
// Kad lapisan kedua dalam tetingkap spatial (lihat css/app.css)
export const card = 'spatial-card p-4';

// ---------- Ikon (garisan, gaya lucide) ----------
const ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/>',
  receipt: '<path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
  wrench: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9z"/>',
  box: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5M12 13v8"/>',
  file: '<path d="M14 3H6v18h12V7z"/><path d="M14 3v4h4M9 13h6M9 17h6"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20a6.5 6.5 0 0 0-4-6"/>',
  wallet: '<rect x="3" y="6" width="18" height="14" rx="2.5"/><path d="M3 10h18M16 15h2"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M12 8v5M12 16h.01"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  tag: '<path d="M3 12V3h9l9 9-9 9z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
  building: '<rect x="4" y="3" width="16" height="18" rx="1.5"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2"/>',
  logout: '<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  bell: '<path d="M6 16v-5a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  up: '<path d="m3 17 6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  down: '<path d="m3 7 6 6 4-4 8 8"/><path d="M15 17h6v-6"/>',
  sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  check: '<path d="m5 12 5 5 9-10"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  chev: '<path d="m9 6 6 6-6 6"/>',
  panel: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9 4v16"/>',
};

export const icon = (name, cls = 'w-4 h-4') =>
  `<svg class="${cls} shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;

export const initials = (name) =>
  String(name ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('') || '?';
