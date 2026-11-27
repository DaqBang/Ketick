// Paparan CRM: senarai kenalan, tambah/edit, butiran + butang hubungi + sejarah.
import * as cash from './cash.js';
import * as contacts from './customers.js';
import * as billing from './billing.js';
import * as jobs from './jobs.js';
import * as sales from './sales.js';
import { copyText } from './share.js';
import { esc, go, refresh, toast, safe, fmtTime, input, btn, card } from './ui.js';

// Butang hubungi. text = mesej untuk dihantar (WhatsApp prefill; lain-lain disalin ke clipboard)
export function contactButtons(c, { text = '', subject = '' } = {}) {
  const items = [
    ['📞 Call', contacts.links.tel(c), 'tel'],
    ['💬 WhatsApp', contacts.links.whatsapp(c, text), 'whatsapp'],
    ['✈️ Telegram', contacts.links.telegram(c), 'telegram'],
    ['💙 Messenger', contacts.links.messenger(c), 'messenger'],
    ['📸 Instagram', contacts.links.instagram(c), 'instagram'],
    ['✉️ Emel', contacts.links.email(c, subject, text), 'email'],
  ].filter(([, href]) => href);
  if (!items.length) return '<div class="text-xs text-slate-400">Tiada maklumat hubungan</div>';
  return `<div class="grid grid-cols-3 gap-2 text-xs">
    ${items
      .map(
        ([label, href, ch]) =>
          `<a href="${esc(href)}" data-channel="${ch}" target="_blank" rel="noopener"
             class="border rounded-lg py-2 text-center bg-white active:bg-slate-100">${label}</a>`
      )
      .join('')}
  </div>`;
}

// Saluran tanpa prefill mesej: salin mesej dulu supaya boleh tampal
export function wireContactButtons(text, onUse) {
  document.querySelectorAll('[data-channel]').forEach((a) => {
    a.addEventListener('click', async () => {
      const ch = a.dataset.channel;
      if (text && ['telegram', 'messenger', 'instagram'].includes(ch)) {
        if (await copyText(text)) toast('Mesej disalin. Tampal dalam chat.', 'ok');
      }
      onUse?.(ch);
    });
  });
}

// ---------- Senarai ----------

export function viewCrm(user, kind) {
  const k = contacts.KINDS[kind] ? kind : 'customer';
  const list = contacts.list({ kind: k, includeInactive: cash.isManager(user) });
  const owing = {};
  for (const s of billing.outstanding()) owing[s.doc.party.id] = (owing[s.doc.party.id] || 0) + s.balance;

  return {
    html: `
    <a href="#/crm-edit/new-${k}" class="${btn} block text-center">+ ${contacts.KINDS[k]} Baru</a>
    <div class="grid grid-cols-2 gap-2 text-center text-sm">
      ${Object.entries(contacts.KINDS)
        .map(([key, l]) => `<a href="#/crm/${key}" class="rounded-lg py-2 ${key === k ? 'bg-brand-900 text-white' : 'bg-white'}">${l}</a>`)
        .join('')}
    </div>
    <input id="q" class="${input}" placeholder="Cari nama / syarikat / telefon">
    <div class="${card} divide-y">
      ${
        list
          .map(
            (c) => `
        <a href="#/contact/${c.id}" data-key="${esc(`${c.name} ${c.company} ${c.phone} ${c.phone_norm}`.toLowerCase())}"
           class="py-2 flex justify-between text-sm ${c.active ? '' : 'opacity-50'}">
          <div>
            <div class="font-medium">${esc(c.name)}</div>
            <div class="text-xs text-slate-500">${esc(c.company || '')}${c.company ? ' · ' : ''}${esc(c.phone)}</div>
          </div>
          ${owing[c.id] ? `<div class="text-xs text-red-600 font-bold">${cash.fmtRM(owing[c.id])}</div>` : ''}
        </a>`
          )
          .join('') || '<div class="text-sm text-slate-400 py-2">Tiada kenalan</div>'
      }
    </div>`,
    mount() {
      document.getElementById('q').oninput = (e) => {
        const q = e.target.value.trim().toLowerCase();
        document.querySelectorAll('[data-key]').forEach((a) => (a.hidden = q && !a.dataset.key.includes(q)));
      };
    },
  };
}

// ---------- Tambah / edit ----------

export function viewCrmEdit(user, param) {
  const isNew = String(param).startsWith('new');
  const c = isNew ? { kind: param.split('-')[1] || 'customer' } : contacts.find(param);
  if (!c) return { html: `<div class="${card}">Kenalan tidak dijumpai.</div>` };
  const f = (name, label, type = 'text', extra = '') =>
    `<input name="${name}" type="${type}" class="${input}" placeholder="${label}" value="${esc(c[name])}" ${extra}>`;

  return {
    html: `
    <form id="f" class="${card} space-y-3">
      <h2 class="font-bold">${isNew ? 'Kenalan Baru' : 'Edit Kenalan'}</h2>
      <select name="kind" class="${input}">
        ${Object.entries(contacts.KINDS).map(([k, l]) => `<option value="${k}" ${c.kind === k ? 'selected' : ''}>${l}</option>`).join('')}
      </select>
      ${f('name', 'Nama', 'text', 'required')}
      ${f('company', 'Syarikat (pilihan)')}
      ${f('phone', 'No. telefon', 'tel', 'required')}
      ${f('whatsapp', 'No. WhatsApp (jika lain dari telefon)', 'tel')}
      ${f('telegram', 'Telegram username')}
      ${f('facebook', 'Facebook username (untuk Messenger)')}
      ${f('instagram', 'Instagram username')}
      ${f('email', 'Emel', 'email')}
      <textarea name="address" rows="2" class="${input}" placeholder="Alamat">${esc(c.address)}</textarea>
      ${f('tin', 'No. TIN / SSM (untuk e-Invois)')}
      <textarea name="notes" rows="2" class="${input}" placeholder="Catatan">${esc(c.notes)}</textarea>
      ${isNew ? '' : '<div class="text-xs text-amber-700">Semua perubahan direkod dalam audit.</div>'}
      <button class="${btn}">Simpan</button>
    </form>`,
    mount() {
      document.getElementById('f').onsubmit = safe(async (ev) => {
        ev.preventDefault();
        const d = Object.fromEntries(new FormData(ev.target));
        const rec = await contacts.save(isNew ? d : { ...d, id: c.id });
        toast('Disimpan', 'ok');
        go('/contact/' + rec.id);
      });
    },
  };
}

// ---------- Butiran ----------

export function viewContact(user, id) {
  const c = contacts.find(id);
  if (!c) return { html: `<div class="${card}">Kenalan tidak dijumpai.</div>` };
  const { docs, jobs: jobList, sales: saleList } = contacts.history(id);
  const owing = billing.outstanding().filter((s) => s.doc.party.id === id);
  const owingTotal = owing.reduce((t, s) => t + s.balance, 0);
  const mgr = cash.isManager(user);
  const isSup = c.kind === 'supplier';

  return {
    html: `
    <div class="${card} space-y-2">
      <div class="flex justify-between items-start">
        <div>
          <div class="font-bold text-lg">${esc(c.name)}</div>
          <div class="text-sm text-slate-500">${contacts.KINDS[c.kind]}${c.company ? ' · ' + esc(c.company) : ''}</div>
        </div>
        <a href="#/crm-edit/${c.id}" class="text-sm underline">Edit</a>
      </div>
      <div class="text-sm space-y-0.5">
        <div>📱 ${esc(c.phone)}</div>
        ${c.email ? `<div>✉️ ${esc(c.email)}</div>` : ''}
        ${c.address ? `<div>📍 ${esc(c.address)}</div>` : ''}
        ${c.tin ? `<div>TIN/SSM: ${esc(c.tin)}</div>` : ''}
        ${c.notes ? `<div class="text-slate-500">${esc(c.notes)}</div>` : ''}
      </div>
      ${contactButtons(c, { text: `Salam ${c.name},` })}
    </div>

    ${
      owingTotal
        ? `<div class="${card} bg-red-50 text-sm">
        <div class="font-bold text-red-700">Tertunggak ${cash.fmtRM(owingTotal)}</div>
        ${owing.map((s) => `<a href="#/doc/${s.doc.id}" class="block underline">${s.doc.no} · baki ${cash.fmtRM(s.balance)}${s.overdue ? ' · LEWAT' : ''}</a>`).join('')}
      </div>`
        : ''
    }

    <div class="grid grid-cols-2 gap-2">
      ${
        isSup
          ? `<button data-new="PO" class="${btn}">+ Pesanan Belian</button>`
          : `<button data-new="QT" class="${btn}">+ Sebut Harga</button>
             <button data-new="INV" class="${btn}">+ Invois</button>
             <a href="#/job-new/${c.id}" class="${btn} block text-center col-span-2">+ Job Repair / Pemasangan</a>`
      }
    </div>

    <div class="${card} divide-y">
      <h2 class="font-bold pb-2">Dokumen</h2>
      ${
        docs
          .map(
            (d) => `
        <a href="#/doc/${d.id}" class="py-2 flex justify-between text-sm">
          <div>
            <div class="font-medium">${d.no}${billing.voidOf(d.id) ? ' <span class="text-xs text-red-600">BATAL</span>' : ''}</div>
            <div class="text-xs text-slate-500">${billing.TYPES[d.type].label} · ${fmtTime(d.created_at)}</div>
          </div>
          <div class="font-bold">${d.type === 'DO' ? '' : cash.fmtRM(d.total)}</div>
        </a>`
          )
          .join('') || '<div class="text-sm text-slate-400 py-2">Tiada dokumen</div>'
      }
    </div>

    ${
      isSup
        ? ''
        : `<div class="${card} divide-y">
      <h2 class="font-bold pb-2">Job</h2>
      ${
        jobList
          .map((j) => {
            const s = jobs.state(j.id);
            return `<a href="#/job/${j.id}" class="py-2 flex justify-between text-sm">
              <div><div class="font-medium">${j.no} · ${jobs.TYPES[j.type]}</div>
              <div class="text-xs text-slate-500">${esc(j.device || j.address)} · ${fmtTime(j.created_at)}</div></div>
              <div class="text-xs">${jobs.STATUS[s.status]}</div></a>`;
          })
          .join('') || '<div class="text-sm text-slate-400 py-2">Tiada job</div>'
      }
    </div>
    <div class="${card} divide-y">
      <h2 class="font-bold pb-2">Jualan POS</h2>
      ${
        saleList
          .map((s) => {
            const r = sales.refundOf(s.id);
            return `<a href="#/receipt/${s.id}" class="py-2 flex justify-between text-sm">
              <div><div class="font-medium">${s.no}${r ? ' <span class="text-xs text-red-600">DIPULANGKAN</span>' : ''}</div>
              <div class="text-xs text-slate-500">${fmtTime(s.created_at)} · ${s.lines.map((l) => esc(l.name)).join(', ')}</div></div>
              <div class="font-bold ${r ? 'line-through text-slate-400' : ''}">${cash.fmtRM(s.total)}</div></a>`;
          })
          .join('') || '<div class="text-sm text-slate-400 py-2">Tiada jualan</div>'
      }
    </div>`
    }
    ${
      mgr
        ? `<button id="toggle" class="w-full text-sm text-slate-500 underline">${c.active ? 'Nyahaktif kenalan' : 'Aktifkan semula'}</button>`
        : ''
    }`,
    mount() {
      wireContactButtons(`Salam ${c.name},`);
      document.querySelectorAll('[data-new]').forEach(
        (b) =>
          (b.onclick = safe(async () => {
            const d = billing.newDraft(b.dataset.new, { contactId: c.id });
            go('/doc-edit/' + d.id);
          }))
      );
      const t = document.getElementById('toggle');
      if (t) {
        t.onclick = safe(async () => {
          await contacts.setActive(c.id, !c.active);
          refresh();
        });
      }
    },
  };
}
