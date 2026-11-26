// Paparan: Amaran Fraud (manager/owner sahaja).
import * as auth from './auth.js';
import * as cash from './cash.js';
import * as fraud from './fraud.js';
import { esc, refresh, toast, safe, fmtTime, card } from './ui.js';

let showReviewed = false;

export async function viewAlerts(user) {
  if (!cash.isManager(user)) {
    return { html: `<div class="${card} text-sm">Hanya manager/owner.</div>` };
  }
  const all = await fraud.findings();
  const open = all.filter((f) => !f.review);
  const list = showReviewed ? all : open;
  const count = (sev) => open.filter((f) => f.severity === sev).length;
  const wa = `https://wa.me/?text=${encodeURIComponent(fraud.whatsappText(auth.company(), all))}`;

  return {
    html: `
    <div class="grid grid-cols-3 gap-2 text-center">
      <div class="${card}"><div class="text-2xl font-bold text-red-600">${count('high')}</div><div class="text-xs">Tinggi</div></div>
      <div class="${card}"><div class="text-2xl font-bold text-amber-600">${count('medium')}</div><div class="text-xs">Sederhana</div></div>
      <div class="${card}"><div class="text-2xl font-bold">${count('low') + count('info')}</div><div class="text-xs">Rendah / info</div></div>
    </div>
    <div class="flex gap-2">
      <a href="${wa}" target="_blank" rel="noopener" class="flex-1 bg-emerald-600 text-white rounded-lg py-2 text-center text-sm font-medium">Hantar ke WhatsApp</a>
      <button id="toggle" class="flex-1 border rounded-lg py-2 text-sm">${showReviewed ? 'Sembunyi disemak' : 'Tunjuk disemak'}</button>
    </div>
    <div class="text-xs text-slate-500">Tempoh semakan: ${fraud.CONFIG.windowDays} hari terakhir.</div>
    ${
      list
        .map((f) => {
          const sev = fraud.SEVERITY[f.severity];
          return `
      <div class="${card} space-y-1 ${f.review ? 'opacity-60' : ''}">
        <div class="flex justify-between items-start gap-2">
          <a href="${f.link}" class="font-medium">${esc(f.title)}</a>
          <span class="text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${sev.cls}">${sev.label}</span>
        </div>
        <div class="text-sm text-slate-600">${esc(f.detail)}</div>
        <div class="text-xs text-slate-400">${fmtTime(f.ts)}${f.who ? ` · ${esc(f.who.name)}` : ''}</div>
        ${
          f.review
            ? `<div class="text-xs text-emerald-700">✔ Disemak ${esc(f.review.user_name)}, ${fmtTime(f.review.created_at)}: ${esc(f.review.note)}</div>`
            : f.who?.id === user.id && user.role !== 'owner'
            ? '<div class="text-xs text-slate-400">Amaran tentang anda — hanya owner boleh semak.</div>'
            : `<button data-review="${esc(f.key)}" class="text-xs underline">Tanda disemak</button>`
        }
      </div>`;
        })
        .join('') ||
      `<div class="${card} text-sm text-emerald-700">Tiada amaran${showReviewed ? '' : ' belum disemak'}. 👍</div>`
    }`,
    mount() {
      document.getElementById('toggle').onclick = () => {
        showReviewed = !showReviewed;
        refresh();
      };
      document.querySelectorAll('[data-review]').forEach(
        (b) =>
          (b.onclick = safe(async () => {
            const note = prompt('Catatan semakan (apa yang anda dapati / tindakan)?');
            if (note === null) return;
            await fraud.review(b.dataset.review, note);
            toast('Disemak & direkod dalam audit', 'ok');
            refresh();
          }))
      );
    },
  };
}
