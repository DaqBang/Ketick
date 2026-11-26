// Paparan: senarai job, job baru, butiran job, batal job.
import { db } from './db.js';
import * as cash from './cash.js';
import * as stock from './stock.js';
import * as products from './products.js';
import * as jobs from './jobs.js';
import { approverFields } from './views-sales.js';
import * as contacts from './customers.js';
import * as settings from './settings.js';
import { sharePdf } from './share.js';
import { contactButtons, wireContactButtons } from './views-crm.js';
import { esc, go, refresh, toast, safe, fmtTime, input, btn, card } from './ui.js';

const BADGE = {
  open: 'bg-slate-200 text-slate-800',
  in_progress: 'bg-blue-100 text-blue-800',
  done: 'bg-amber-100 text-amber-800',
  closed: 'bg-emerald-100 text-emerald-800',
  cancelled: 'bg-red-100 text-red-800',
};
const badge = (st) => `<span class="text-xs px-2 py-0.5 rounded-full ${BADGE[st]}">${jobs.STATUS[st]}</span>`;
const activeUsers = () => db.where('users', (u) => u.active);
const row = (label, value) =>
  `<div class="flex justify-between"><span>${label}</span><span>${value}</span></div>`;

// ---------- Senarai ----------

const TABS = [
  ['active', 'Aktif'],
  ['closed', 'Diserah'],
  ['cancelled', 'Batal'],
];

export function viewJobs(user, filter) {
  const f = TABS.some(([k]) => k === filter) ? filter : 'active';
  const list = jobs.list(f).slice(0, 50);

  return {
    html: `
    <a href="#/job-new" class="${btn} block text-center">+ Job Baru</a>
    <div class="grid grid-cols-3 gap-2 text-center text-sm">
      ${TABS.map(
        ([k, l]) =>
          `<a href="#/jobs/${k}" class="rounded-lg py-2 ${k === f ? 'bg-slate-900 text-white' : 'bg-white'}">${l}</a>`
      ).join('')}
    </div>
    <div class="${card} divide-y">
      ${
        list
          .map(
            (s) => `
        <a href="#/job/${s.job.id}" class="py-2 flex justify-between items-start text-sm">
          <div>
            <div class="font-medium">${s.job.no} · ${esc(s.job.customer)}</div>
            <div class="text-xs text-slate-500">${jobs.TYPES[s.job.type]} · ${esc(s.job.device || s.job.address)}${
              s.assigned ? ` · 👷 ${esc(s.assigned.name)}` : ''
            }</div>
            <div class="text-xs text-slate-400">${fmtTime(s.job.created_at)}</div>
          </div>
          <div class="text-right space-y-1">
            ${badge(s.status)}
            ${s.due > 0 && !s.locked ? `<div class="text-xs text-red-600">Baki ${cash.fmtRM(s.due)}</div>` : ''}
          </div>
        </a>`
          )
          .join('') || '<div class="text-sm text-slate-400 py-2">Tiada job</div>'
      }
    </div>`,
  };
}

// ---------- Job baru ----------

// param: id kenalan (dari skrin CRM) untuk pilih pelanggan terus
export function viewJobNew(user, contactId) {
  const people = contacts.list({ kind: 'customer' });
  return {
    html: `
    <form id="f" class="${card} space-y-3">
      <h2 class="font-bold">Job Baru</h2>
      <select name="type" class="${input}">
        ${Object.entries(jobs.TYPES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}
      </select>
      <select name="contactId" id="contactId" class="${input}">
        <option value="">Pelanggan baru (isi di bawah)</option>
        ${people.map((c) => `<option value="${c.id}" ${c.id === contactId ? 'selected' : ''}>${esc(c.name)} · ${esc(c.phone)}</option>`).join('')}
      </select>
      <div id="newCust" class="space-y-3 ${contactId ? 'hidden' : ''}">
        <input name="customer" class="${input}" placeholder="Nama pelanggan">
        <input name="phone" type="tel" class="${input}" placeholder="No. telefon">
        <div class="text-xs text-slate-500">Pelanggan baru akan didaftar dalam CRM secara automatik. Jika no. telefon sudah wujud, rekod sedia ada digunakan.</div>
      </div>
      <input name="device" class="${input}" placeholder="Peranti (cth: iPhone 13, DVR 8ch)">
      <input name="deviceSerial" class="${input}" placeholder="Siri / IMEI peranti pelanggan (repair)">
      <input name="address" class="${input}" placeholder="Alamat tapak (pemasangan)">
      <textarea name="problem" rows="3" class="${input}" placeholder="Masalah / skop kerja" required></textarea>
      <select name="assignTo" class="${input}">
        <option value="">Teknikal (pilihan)</option>
        ${activeUsers().map((u) => `<option value="${u.id}">${esc(u.name)}</option>`).join('')}
      </select>
      <button class="${btn}">Cipta Job</button>
    </form>`,
    mount() {
      document.getElementById('contactId').onchange = (e) =>
        document.getElementById('newCust').classList.toggle('hidden', !!e.target.value);
      document.getElementById('f').onsubmit = safe(async (ev) => {
        ev.preventDefault();
        const job = await jobs.create(Object.fromEntries(new FormData(ev.target)));
        toast(`${job.no} dicipta`, 'ok');
        go('/job/' + job.id);
      });
    },
  };
}

// ---------- Butiran job ----------

const partForm = { productId: '' };

const EVENT_TEXT = {
  status: (e) => `Status → ${jobs.STATUS[e.status]}`,
  assign: (e) => `Ditugaskan kepada ${esc(e.to_name)}`,
  note: (e) => `📝 ${esc(e.text)}`,
  part: (e) => `Part: ${esc(e.name)} × ${e.qty} (${cash.fmtRM(e.line)})${e.serials.length ? ' · ' + e.serials.map(esc).join(', ') : ''}`,
  charge: (e) => `Caj: ${esc(e.desc)} (${cash.fmtRM(e.amount)})`,
  void: (e) => `Dibuang: ${esc(e.reason)}`,
  discount: (e) => `Diskaun ${cash.fmtRM(e.amount)}${e.approved_by ? ` · lulus ${esc(e.approved_by.name)}` : ''}`,
  payment: (e) => `Bayaran ${cash.fmtRM(e.amount)} · ${jobs.METHODS[e.method]}${e.pay_ref ? ' · ' + esc(e.pay_ref) : ''}`,
  pay_refund: (e) => `Pulangan bayaran ${cash.fmtRM(e.amount)} · ${jobs.METHODS[e.method]}`,
  cancel: (e) => `❌ Batal: ${esc(e.reason)} · lulus ${esc(e.approved_by.name)}`,
};

export function viewJob(user, id) {
  const s = jobs.state(id);
  if (!s) return { html: `<div class="${card}">Job tidak dijumpai.</div>` };
  const { job } = s;
  const mgr = cash.isManager(user);
  const edit = !s.locked;
  const next = { open: ['in_progress', 'Mula kerja'], in_progress: ['done', 'Tanda siap'], done: ['in_progress', 'Buka semula'] }[s.status];
  const sel = products.find(partForm.productId);
  const co = settings.get();
  const contact = (job.contact_id && contacts.find(job.contact_id)) || { name: job.customer, phone: job.phone };
  const msg = [
    `Salam ${job.customer},`,
    '',
    `${co.company}: ${jobs.TYPES[job.type]} ${job.no}${job.device ? ` (${job.device})` : ''}`,
    `Status: ${jobs.STATUS[s.status]}`,
    s.total ? `Jumlah: ${cash.fmtRM(s.total)} · Dibayar: ${cash.fmtRM(s.paid)} · Baki: ${cash.fmtRM(s.due)}` : '',
    s.status === 'done' ? 'Kerja sudah siap dan boleh diambil / diserahkan.' : '',
    co.bank_acc && s.due > 0 ? `Bayaran ke: ${co.bank_name} ${co.bank_acc} (${co.bank_holder})` : '',
    '',
    'Terima kasih.',
  ]
    .filter((x, i, a) => x || (i > 0 && a[i - 1]))
    .join('\n');

  return {
    html: `
    <div id="jobsheet" class="space-y-4">
    <div class="${card} space-y-1 text-sm">
      <div class="text-xs text-slate-500">${esc(co.company)}${co.phone ? ' · ' + esc(co.phone) : ''}</div>
      <div class="flex justify-between items-center">
        <div class="font-bold text-base">${job.no} · ${jobs.TYPES[job.type]}</div>
        ${badge(s.status)}
      </div>
      <div>${
        job.contact_id
          ? `<a href="#/contact/${job.contact_id}" class="font-bold underline">${esc(job.customer)}</a>`
          : `<b>${esc(job.customer)}</b>`
      } · ${esc(job.phone)}</div>
      ${job.device ? `<div>Peranti: ${esc(job.device)}${job.device_serial ? ` · SN ${esc(job.device_serial)}` : ''}</div>` : ''}
      ${job.address ? `<div>Alamat: ${esc(job.address)}</div>` : ''}
      <div>Masalah / skop: ${esc(job.problem)}</div>
      <div class="text-xs text-slate-500">Dicipta ${fmtTime(job.created_at)} oleh ${esc(job.user_name)}${
        s.assigned ? ` · Teknikal: ${esc(s.assigned.name)}` : ''
      }</div>
    </div>

    ${
      edit
        ? `
    <div class="print:hidden grid grid-cols-2 gap-2">
      ${next ? `<button data-status="${next[0]}" class="${btn}">${next[1]}</button>` : ''}
      ${s.status === 'done' ? `<button id="close" class="w-full bg-emerald-600 text-white rounded-lg py-2 font-medium">Serah & tutup</button>` : ''}
      <select id="assign" class="${input}">
        <option value="">Tukar teknikal</option>
        ${activeUsers().map((u) => `<option value="${u.id}">${esc(u.name)}</option>`).join('')}
      </select>
    </div>`
        : ''
    }

    <div class="${card} space-y-2 text-sm">
      <h2 class="font-bold">Parts & Caj</h2>
      ${[...s.parts, ...s.charges]
        .map(
          (l) => `
        <div class="flex justify-between items-start gap-2">
          <div>
            <div>${l.kind === 'part' ? `${esc(l.name)} × ${l.qty}` : esc(l.desc)}</div>
            ${l.serials?.length ? `<div class="text-xs text-slate-500">SN: ${l.serials.map(esc).join(', ')}</div>` : ''}
          </div>
          <div class="text-right">
            <div>${cash.fmtRM(l.kind === 'part' ? l.line : l.amount)}</div>
            ${edit ? `<button data-void="${l.id}" class="print:hidden text-xs text-red-600 underline">Buang</button>` : ''}
          </div>
        </div>`
        )
        .join('') || '<div class="text-slate-400">Belum ada parts / caj</div>'}
      <div class="border-t pt-2 space-y-1">
        ${row('Subjumlah', cash.fmtRM(s.subtotal))}
        ${s.discount ? row('Diskaun', '-' + cash.fmtRM(s.discount)) : ''}
        <div class="flex justify-between font-bold"><span>Jumlah</span><span>${cash.fmtRM(s.total)}</span></div>
        ${row('Dibayar', cash.fmtRM(s.paid))}
        <div class="flex justify-between font-bold ${s.due > 0 ? 'text-red-600' : 'text-emerald-600'}">
          <span>Baki</span><span>${cash.fmtRM(s.due)}</span>
        </div>
      </div>
    </div>
    </div>

    <div class="print:hidden ${card} space-y-2">
      <h2 class="font-bold text-sm">Hantar kepada ${esc(job.customer)}</h2>
      <button id="sharePdf" class="${btn}">📄 Kongsi PDF job sheet</button>
      ${contactButtons(contact, { text: msg, subject: `${job.no} · ${jobs.STATUS[s.status]}` })}
    </div>

    ${
      edit
        ? `
    <form id="part" class="print:hidden ${card} space-y-2">
      <h2 class="font-bold text-sm">+ Part dari stok</h2>
      <select id="partProduct" class="${input}">
        <option value="">Pilih produk</option>
        ${products.list().map((p) => `<option value="${p.id}" ${p.id === partForm.productId ? 'selected' : ''}>${esc(p.name)} · ${cash.fmtRM(p.price)}</option>`).join('')}
      </select>
      ${
        sel
          ? sel.track_serial
            ? `<select name="serial" class="${input}" required>
                <option value="">Pilih no. siri</option>
                ${stock.serialsInStock(sel.id).map((x) => `<option value="${esc(x)}">${esc(x)}</option>`).join('')}
              </select>`
            : `<input name="qty" inputmode="numeric" class="${input}" value="1">`
          : ''
      }
      ${sel ? `<button class="${btn}">Tambah Part</button>` : ''}
    </form>

    <form id="charge" class="print:hidden ${card} space-y-2">
      <h2 class="font-bold text-sm">+ Upah / caj servis</h2>
      <input name="desc" class="${input}" placeholder="Keterangan (cth: Upah pasang 4 kamera)" required>
      <input name="amount" inputmode="decimal" class="${input}" placeholder="Jumlah (RM)" required>
      <button class="${btn}">Tambah Caj</button>
    </form>

    <form id="disc" class="print:hidden ${card} space-y-2">
      <h2 class="font-bold text-sm">Diskaun</h2>
      <input name="amount" inputmode="decimal" class="${input}" placeholder="Diskaun (RM)" value="${s.discount ? (s.discount / 100).toFixed(2) : ''}">
      ${
        mgr
          ? ''
          : `<div class="space-y-2 bg-amber-50 p-3 rounded-lg">
        <div class="text-xs text-amber-800">PIN manager/owner diperlukan jika diskaun lebih 10%.</div>
        ${approverFields()}
      </div>`
      }
      <button class="${btn}">Simpan Diskaun</button>
    </form>

    <form id="pay" class="print:hidden ${card} space-y-2">
      <h2 class="font-bold text-sm">Terima Bayaran</h2>
      <input name="amount" inputmode="decimal" class="${input}" placeholder="Jumlah (RM)" value="${s.due > 0 ? (s.due / 100).toFixed(2) : ''}" required>
      <select name="method" id="payMethod" class="${input}">
        ${Object.entries(jobs.METHODS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}
      </select>
      <input name="payRef" id="payRef" class="${input} hidden" placeholder="No. rujukan bayaran (wajib)">
      <button class="${btn}">Terima Bayaran</button>
    </form>`
        : ''
    }

    <div class="${card} space-y-2 text-sm">
      <h2 class="font-bold">Sejarah</h2>
      ${s.events
        .slice()
        .reverse()
        .map(
          (e) => `
        <div>
          <div>${EVENT_TEXT[e.kind]?.(e) ?? esc(e.kind)}</div>
          <div class="text-xs text-slate-400">${fmtTime(e.created_at)} · ${esc(e.user_name)}</div>
        </div>`
        )
        .join('') || '<div class="text-slate-400">Tiada aktiviti</div>'}
      ${
        edit
          ? `<form id="note" class="print:hidden flex gap-2 pt-2">
        <input name="text" class="${input}" placeholder="Tambah catatan">
        <button class="px-3 border rounded-lg">+</button>
      </form>`
          : ''
      }
    </div>

    <div class="print:hidden grid grid-cols-2 gap-2">
      <button id="print" class="w-full border rounded-lg py-2">Cetak</button>
      <a href="#/jobs" class="w-full border rounded-lg py-2 text-center">Kembali</a>
    </div>
    ${edit ? `<a href="#/job-cancel/${job.id}" class="print:hidden block text-center text-sm text-red-600 underline">Batal job</a>` : ''}`,

    mount() {
      const $ = (x) => document.getElementById(x);
      $('print').onclick = () => window.print();
      wireContactButtons(msg);
      $('sharePdf').onclick = safe(async () => {
        toast('Menjana PDF…', 'ok');
        const res = await sharePdf($('jobsheet'), `${job.no}.pdf`, msg);
        if (res === 'downloaded') toast('PDF dimuat turun. Lampirkan dalam chat.', 'ok');
      });
      if (!edit) return;

      document.querySelectorAll('[data-status]').forEach(
        (b) => (b.onclick = safe(async () => { await jobs.setStatus(id, b.dataset.status); refresh(); }))
      );
      if ($('close')) {
        $('close').onclick = safe(async () => {
          if (!confirm('Serah kepada pelanggan dan tutup job? Tidak boleh ubah selepas ini.')) return;
          await jobs.close(id);
          toast('Job ditutup', 'ok');
          refresh();
        });
      }
      $('assign').onchange = safe(async (e) => {
        if (!e.target.value) return;
        await jobs.assign(id, e.target.value);
        refresh();
      });
      document.querySelectorAll('[data-void]').forEach(
        (b) =>
          (b.onclick = safe(async () => {
            const reason = prompt('Sebab buang baris ini?');
            if (reason === null) return;
            await jobs.voidLine(id, b.dataset.void, reason);
            refresh();
          }))
      );
      $('partProduct').onchange = (e) => {
        partForm.productId = e.target.value;
        refresh();
      };
      $('part').onsubmit = safe(async (ev) => {
        ev.preventDefault();
        const f = new FormData(ev.target);
        await jobs.addPart(id, sel.track_serial
          ? { productId: sel.id, serials: [f.get('serial')].filter(Boolean) }
          : { productId: sel.id, qty: Number(f.get('qty')) });
        partForm.productId = '';
        toast('Part ditambah & stok ditolak', 'ok');
        refresh();
      });
      $('charge').onsubmit = safe(async (ev) => {
        ev.preventDefault();
        const f = new FormData(ev.target);
        await jobs.addCharge(id, f.get('desc'), cash.toSen(f.get('amount')));
        refresh();
      });
      $('disc').onsubmit = safe(async (ev) => {
        ev.preventDefault();
        const f = new FormData(ev.target);
        const amount = f.get('amount').trim() ? cash.toSen(f.get('amount')) : 0;
        await jobs.setDiscount(id, amount, mgr ? null : { id: f.get('approver'), pin: f.get('approverPin') });
        toast('Diskaun disimpan', 'ok');
        refresh();
      });
      $('payMethod').onchange = (e) => $('payRef').classList.toggle('hidden', e.target.value === 'cash');
      $('pay').onsubmit = safe(async (ev) => {
        ev.preventDefault();
        const f = new FormData(ev.target);
        await jobs.pay(id, { amount: cash.toSen(f.get('amount')), method: f.get('method'), payRef: f.get('payRef') || '' });
        toast('Bayaran diterima', 'ok');
        refresh();
      });
      $('note').onsubmit = safe(async (ev) => {
        ev.preventDefault();
        await jobs.note(id, new FormData(ev.target).get('text'));
        refresh();
      });
    },
  };
}

// ---------- Batal job ----------

export function viewJobCancel(user, id) {
  const s = jobs.state(id);
  if (!s || s.locked) return { html: `<div class="${card}">Job tidak boleh dibatal.</div>` };
  const mgr = cash.isManager(user);

  return {
    html: `
    <form id="f" class="${card} space-y-3">
      <h2 class="font-bold text-red-700">Batal ${s.job.no}</h2>
      <div class="text-sm space-y-1">
        <div>${s.parts.length} part akan dipulang ke stok.</div>
        <div>Bayaran ${cash.fmtRM(s.paid)} akan dipulang ikut kaedah asal.</div>
      </div>
      <input name="reason" class="${input}" placeholder="Sebab pembatalan (wajib)" required>
      ${
        mgr
          ? ''
          : `<div class="space-y-2 bg-amber-50 p-3 rounded-lg">
        <div class="text-xs text-amber-800">PIN manager/owner diperlukan.</div>
        ${approverFields()}
      </div>`
      }
      <button class="w-full bg-red-600 text-white rounded-lg py-2 font-medium">Sahkan Batal</button>
      <a href="#/job/${id}" class="block text-center text-sm text-slate-500">Kembali</a>
    </form>`,
    mount() {
      document.getElementById('f').onsubmit = safe(async (ev) => {
        ev.preventDefault();
        const f = new FormData(ev.target);
        await jobs.cancel(id, f.get('reason'), mgr ? null : { id: f.get('approver'), pin: f.get('approverPin') });
        toast(`${s.job.no} dibatal`, 'ok');
        go('/job/' + id);
      });
    },
  };
}
