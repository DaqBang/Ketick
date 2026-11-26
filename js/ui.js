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
  el.className = `fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg text-white text-sm shadow-lg ${
    type === 'error' ? 'bg-red-600' : 'bg-emerald-600'
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

export const input = 'w-full border border-slate-300 rounded-lg px-3 py-2';
export const btn = 'w-full bg-slate-900 text-white rounded-lg py-2 font-medium active:scale-95';
export const card = 'bg-white rounded-xl shadow-sm p-4';
