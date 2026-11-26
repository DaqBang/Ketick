// Paparan Billing: senarai dokumen, edit draf, paparan dokumen (cetak/PDF/kongsi),
// nota hantaran, batal, profil syarikat.
import * as cash from './cash.js';
import * as stock from './stock.js';
import * as products from './products.js';
import * as contacts from './customers.js';
import * as billing from './billing.js';
import * as settings from './settings.js';
import { sharePdf } from './share.js';
import { approverFields } from './views-sales.js';
import { contactButtons, wireContactButtons } from './views-crm.js';
import { esc, go, refresh, toast, safe, fmtTime, input, btn, card } from './ui.js';

const T = billing.TYPES;
const rm = (sen) => cash.fmtRM(sen);
const fmtDate = (iso) => new Date(iso).toLocaleDateString('ms-MY');
const STATUS_CLS = {
  unpaid: 'bg-red-100 text-red-800',
  partial: 'bg-amber-100 text-amber-800',
  paid: 'bg-emerald-100 text-emerald-800',
  void: 'bg-slate-200 text-slate-600',
};

// ---------- Senarai ----------

const TABS = ['INV', 'QT', 'RC', 'DO', 'CN', 'PO'];

export function viewBilling(user, type) {
  const ty = TABS.includes(type) ? type : 'INV';
  const docs = billing.listDocs(ty).slice(0, 50);
  const drafts = billing.DRAFTABLE.includes(ty) ? billing.drafts(ty) : [];

  return {
    html: `
    <div class="grid grid-cols-3 gap-2 text-center text-xs">
      ${TABS.map((k) => `<a href="#/billing/${k}" class="rounded-lg py-2 ${k === ty ? 'bg-slate-900 text-white' : 'bg-white'}">${T[k].label}</a>`).join('')}
    </div>
    ${
      billing.DRAFTABLE.includes(ty)
        ? `<button id="new" class="${btn}">+ ${T[ty].label} Baru</button>`
        : `<div class="text-xs text-slate-500">${T[ty].label} dikeluarkan dari skrin invois.</div>`
    }
    ${
      drafts.length
        ? `<div class="${card} divide-y">
        <h2 class="font-bold pb-2 text-sm">Draf</h2>
        ${drafts
          .map((d) => {
            const c = contacts.find(d.contact_id);
            return `<a href="#/doc-edit/${d.id}" class="py-2 flex justify-between text-sm">
              <span>${esc(c?.name || 'Tiada pelanggan')} · ${d.lines.length} item</span>
              <span class="text-xs text-slate-400">${fmtTime(d.created_at)}</span></a>`;
          })
          .join('')}
      </div>`
        : ''
    }
    <div class="${card} divide-y">
      ${
        docs
          .map((d) => {
            const s = d.type === 'INV' ? billing.invoiceState(d.id) : null;
            const voided = billing.voidOf(d.id);
            return `
        <a href="#/doc/${d.id}" class="py-2 flex justify-between items-start text-sm">
          <div>
            <div class="font-medium">${d.no} · ${esc(d.party?.name)}</div>
            <div class="text-xs text-slate-500">${fmtTime(d.created_at)}${d.invoice_no ? ` · ${d.invoice_no}` : ''}</div>
          </div>
          <div class="text-right space-y-1">
            ${d.type === 'DO' ? '' : `<div class="font-bold ${voided ? 'line-through text-slate-400' : ''}">${rm(d.total)}</div>`}
            ${
              s
                ? `<span class="text-xs px-2 py-0.5 rounded-full ${STATUS_CLS[s.status]}">${billing.STATUS[s.status]}${s.overdue ? ' · LEWAT' : ''}</span>`
                : voided
                ? '<span class="text-xs text-red-600">BATAL</span>'
                : ''
            }
          </div>
        </a>`;
          })
          .join('') || '<div class="text-sm text-slate-400 py-2">Tiada dokumen</div>'
      }
    </div>`,
    mount() {
      const n = document.getElementById('new');
      if (n) {
        n.onclick = safe(async () => {
          const d = billing.newDraft(ty);
          go('/doc-edit/' + d.id);
        });
      }
    },
  };
}

// ---------- Edit draf ----------

export function viewDocEdit(user, id) {
  const d = billing.findDraft(id);
  if (!d || d.discarded) return { html: `<div class="${card}">Draf tidak dijumpai.</div>` };
  const ty = T[d.type];
  const kind = ty.party;
  const people = contacts.list({ kind });
  const totals = billing.calc(d);
  const mgr = cash.isManager(user);
  const needsPin = !mgr && (d.type === 'INV' || d.type === 'PO');

  return {
    html: `
    <form id="f" class="${card} space-y-3">
      <h2 class="font-bold">Draf ${ty.label}</h2>
      <div class="flex gap-2">
        <select name="contact_id" class="${input}">
          <option value="">Pilih ${kind === 'supplier' ? 'pembekal' : 'pelanggan'}</option>
          ${people.map((c) => `<option value="${c.id}" ${c.id === d.contact_id ? 'selected' : ''}>${esc(c.name)}${c.company ? ' · ' + esc(c.company) : ''}</option>`).join('')}
        </select>
        <a href="#/crm-edit/new-${kind}" class="px-3 py-2 border rounded-lg text-sm whitespace-nowrap">+ Baru</a>
      </div>

      <div class="space-y-2">
        ${d.lines
          .map(
            (l, i) => `
          <div class="border rounded-lg p-2 space-y-1">
            <div class="flex gap-2">
              <input data-l="${i}" data-f="desc" class="${input}" placeholder="Keterangan" value="${esc(l.desc)}">
              <button type="button" data-rm="${i}" class="px-2 text-red-600">✕</button>
            </div>
            <div class="grid grid-cols-3 gap-2 items-center">
              <input data-l="${i}" data-f="qty" inputmode="numeric" class="${input}" value="${l.qty}">
              <input data-l="${i}" data-f="price" inputmode="decimal" class="${input}" value="${(l.price / 100).toFixed(2)}">
              <div class="text-right text-sm font-medium">${rm(l.qty * l.price)}</div>
            </div>
          </div>`
          )
          .join('') || '<div class="text-sm text-slate-400">Tiada item</div>'}
      </div>
      <div class="grid grid-cols-2 gap-2">
        <select id="addProduct" class="${input}">
          <option value="">+ Produk</option>
          ${products.list().map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}
        </select>
        <button type="button" id="addFree" class="border rounded-lg">+ Item bebas</button>
      </div>

      <div class="grid grid-cols-2 gap-2 text-sm">
        <label>Diskaun (RM)<input name="discount" inputmode="decimal" class="${input}" value="${(d.discount / 100).toFixed(2)}"></label>
        <label>Cukai SST
          <select name="tax_pct" class="${input}">
            ${billing.TAX_RATES.map((r) => `<option value="${r}" ${r === d.tax_pct ? 'selected' : ''}>${r}%</option>`).join('')}
          </select>
        </label>
        <label class="col-span-2">${ty.daysLabel} (hari dari tarikh keluar)
          <input name="days" inputmode="numeric" class="${input}" value="${d.days}">
        </label>
      </div>
      <textarea name="notes" rows="2" class="${input}" placeholder="Nota / terma">${esc(d.notes)}</textarea>

      <div class="border-t pt-2 text-sm space-y-1">
        <div class="flex justify-between"><span>Subjumlah</span><span>${rm(totals.subtotal)}</span></div>
        ${totals.discount ? `<div class="flex justify-between"><span>Diskaun</span><span>-${rm(totals.discount)}</span></div>` : ''}
        ${totals.tax ? `<div class="flex justify-between"><span>SST ${d.tax_pct}%</span><span>${rm(totals.tax)}</span></div>` : ''}
        <div class="flex justify-between font-bold text-base"><span>Jumlah</span><span>${rm(totals.total)}</span></div>
      </div>

      ${
        needsPin
          ? `<div class="space-y-2 bg-amber-50 p-3 rounded-lg">
        <div class="text-xs text-amber-800">${
          d.type === 'INV'
            ? 'PIN manager/owner diperlukan jika harga bersih lebih 10% bawah harga senarai.'
            : 'PIN manager/owner diperlukan jika harga belian lebih 10% atas kos produk.'
        }</div>
        ${approverFields()}
      </div>`
          : ''
      }
      <button type="button" id="issue" class="${btn}">Keluarkan ${ty.label}</button>
      <div class="text-xs text-slate-500 text-center">Selepas dikeluarkan, dokumen dapat nombor dan tidak boleh diedit.</div>
      <button type="button" id="discard" class="w-full text-sm text-red-600 underline">Buang draf</button>
    </form>`,
    mount() {
      const form = document.getElementById('f');

      // Baca borang -> simpan draf
      const collect = () => {
        const f = new FormData(form);
        const lines = d.lines.map((l, i) => {
          const get = (k) => form.querySelector(`[data-l="${i}"][data-f="${k}"]`).value;
          return { ...l, desc: get('desc'), qty: Number(get('qty')), price: cash.toSen(get('price') || '0') };
        });
        return {
          contact_id: f.get('contact_id'),
          lines,
          discount: f.get('discount').trim() ? cash.toSen(f.get('discount')) : 0,
          tax_pct: Number(f.get('tax_pct')),
          days: Number(f.get('days')),
          notes: f.get('notes'),
        };
      };
      const save = safe(async () => {
        billing.saveDraft(d.id, collect());
        refresh();
      });
      form.querySelectorAll('input, select, textarea').forEach((el) => {
        if (el.id !== 'addProduct' && !el.name?.startsWith('approver')) el.onchange = save;
      });

      document.getElementById('addProduct').onchange = safe(async (e) => {
        const p = products.find(e.target.value);
        if (!p) return;
        const cur = collect();
        cur.lines.push({ product_id: p.id, desc: p.name, qty: 1, price: d.type === 'PO' ? p.cost : p.price });
        billing.saveDraft(d.id, cur);
        refresh();
      });
      document.getElementById('addFree').onclick = safe(async () => {
        const cur = collect();
        cur.lines.push({ product_id: null, desc: '', qty: 1, price: 0 });
        billing.saveDraft(d.id, cur);
        refresh();
      });
      form.querySelectorAll('[data-rm]').forEach(
        (b) =>
          (b.onclick = safe(async () => {
            const cur = collect();
            cur.lines.splice(Number(b.dataset.rm), 1);
            billing.saveDraft(d.id, cur);
            refresh();
          }))
      );
      document.getElementById('issue').onclick = safe(async () => {
        billing.saveDraft(d.id, collect());
        const f = new FormData(form);
        const approver = needsPin ? { id: f.get('approver'), pin: f.get('approverPin') } : null;
        const doc = await billing.issue(d.id, approver);
        toast(`${doc.no} dikeluarkan`, 'ok');
        go('/doc/' + doc.id);
      });
      document.getElementById('discard').onclick = safe(async () => {
        if (!confirm('Buang draf ini?')) return;
        await billing.discardDraft(d.id);
        go('/billing/' + d.type);
      });
    },
  };
}

// ---------- Paparan dokumen ----------

function message(d, s, co) {
  const lines = [`Salam ${d.party?.name},`, '', `${T[d.type].label} ${d.no} daripada ${co.company}.`];
  if (d.type === 'INV') {
    lines.push(`Jumlah: ${rm(d.total)}`);
    if (s && s.balance > 0) lines.push(`Baki: ${rm(s.balance)} · Tarikh akhir: ${fmtDate(d.due_at)}`);
  } else if (d.type === 'QT') {
    lines.push(`Jumlah: ${rm(d.total)} · Sah sehingga ${fmtDate(d.due_at)}`);
  } else if (d.type === 'RC') {
    lines.push(`Bayaran ${rm(d.amount)} bagi ${d.invoice_no} telah diterima. Terima kasih.`);
  } else if (d.type === 'CN') {
    lines.push(`Kredit ${rm(d.amount)} bagi ${d.invoice_no}.`);
  } else if (d.type === 'PO') {
    lines.push(`Jumlah: ${rm(d.total)} · Mohon hantar sebelum ${fmtDate(d.due_at)}`);
  }
  if ((d.type === 'INV' || d.type === 'QT') && co.bank_acc) {
    lines.push('', `Bayaran ke: ${co.bank_name} ${co.bank_acc} (${co.bank_holder})`);
  }
  lines.push('', 'PDF dilampirkan. Terima kasih.');
  return lines.join('\n');
}

function docHtml(d, s, co, voided) {
  const party = d.party || {};
  const showLines = ['QT', 'INV', 'PO'].includes(d.type);
  return `
  <div id="doc" class="bg-white text-slate-900 p-5 text-sm relative rounded-xl shadow-sm">
    ${voided ? '<div class="absolute top-24 right-6 rotate-12 border-4 border-red-600 text-red-600 text-2xl font-bold px-3">BATAL</div>' : ''}
    <div class="flex justify-between gap-4 border-b pb-3">
      <div class="text-xs space-y-0.5">
        <div class="text-base font-bold">${esc(co.company)}</div>
        ${co.ssm ? `<div>SSM: ${esc(co.ssm)}</div>` : ''}
        ${co.address ? `<div class="whitespace-pre-line">${esc(co.address)}</div>` : ''}
        ${co.phone || co.email ? `<div>${esc(co.phone || '')} ${co.email ? '· ' + esc(co.email) : ''}</div>` : ''}
        ${co.sst_no ? `<div>No. SST: ${esc(co.sst_no)}</div>` : ''}
      </div>
      <div class="text-right">
        <div class="text-lg font-bold">${T[d.type].title}</div>
        <div class="font-mono">${d.no}</div>
        <div class="text-xs">Tarikh: ${fmtDate(d.created_at)}</div>
        ${T[d.type].daysLabel ? `<div class="text-xs">${T[d.type].daysLabel}: ${fmtDate(d.due_at)}</div>` : ''}
        ${d.invoice_no ? `<div class="text-xs">Rujukan: ${d.invoice_no}</div>` : ''}
      </div>
    </div>

    <div class="py-3 text-xs">
      <div class="text-slate-500">${d.type === 'PO' ? 'Kepada (pembekal)' : d.type === 'RC' ? 'Diterima daripada' : 'Kepada'}</div>
      <div class="font-bold text-sm">${esc(party.name)}</div>
      ${party.company ? `<div>${esc(party.company)}</div>` : ''}
      ${party.address ? `<div class="whitespace-pre-line">${esc(party.address)}</div>` : ''}
      <div>${esc(party.phone || '')}${party.email ? ' · ' + esc(party.email) : ''}</div>
      ${party.tin ? `<div>TIN/SSM: ${esc(party.tin)}</div>` : ''}
    </div>

    ${
      showLines
        ? `<table class="w-full text-xs border-t">
        <thead><tr class="border-b text-left"><th class="py-1">#</th><th>Item</th><th class="text-right">Kuantiti</th><th class="text-right">Harga</th><th class="text-right">Jumlah</th></tr></thead>
        <tbody>
          ${d.lines
            .map(
              (l, i) => `<tr class="border-b align-top"><td class="py-1">${i + 1}</td><td>${esc(l.desc)}</td>
              <td class="text-right">${l.qty}</td><td class="text-right">${rm(l.price)}</td><td class="text-right">${rm(l.qty * l.price)}</td></tr>`
            )
            .join('')}
        </tbody>
      </table>
      <div class="mt-2 ml-auto w-56 text-xs space-y-0.5">
        <div class="flex justify-between"><span>Subjumlah</span><span>${rm(d.subtotal)}</span></div>
        ${d.discount ? `<div class="flex justify-between"><span>Diskaun</span><span>-${rm(d.discount)}</span></div>` : ''}
        ${d.tax ? `<div class="flex justify-between"><span>SST ${d.tax_pct}%</span><span>${rm(d.tax)}</span></div>` : ''}
        <div class="flex justify-between font-bold text-sm border-t pt-1"><span>JUMLAH</span><span>${rm(d.total)}</span></div>
        ${
          s
            ? `${s.credited ? `<div class="flex justify-between"><span>Kredit</span><span>-${rm(s.credited)}</span></div>` : ''}
               <div class="flex justify-between"><span>Dibayar</span><span>-${rm(s.paid)}</span></div>
               <div class="flex justify-between font-bold"><span>BAKI</span><span>${rm(s.balance)}</span></div>`
            : ''
        }
      </div>`
        : ''
    }

    ${
      d.type === 'RC'
        ? `<div class="border rounded-lg p-3 text-sm space-y-1">
        <div>Jumlah diterima: <b>${rm(d.amount)}</b></div>
        <div>Bagi invois: ${d.invoice_no}</div>
        <div>Kaedah: ${billing.METHODS[d.method]}${d.pay_ref ? ` · Rujukan ${esc(d.pay_ref)}` : ''}</div>
        <div class="text-xs text-slate-500">Diterima oleh ${esc(d.user_name)}</div>
      </div>`
        : ''
    }
    ${
      d.type === 'CN'
        ? `<div class="border rounded-lg p-3 text-sm space-y-1">
        <div>Jumlah kredit: <b>${rm(d.amount)}</b></div>
        <div>Bagi invois: ${d.invoice_no}</div>
        <div>Sebab: ${esc(d.reason)}</div>
      </div>`
        : ''
    }
    ${
      d.type === 'DO'
        ? `<table class="w-full text-xs border-t">
        <thead><tr class="border-b text-left"><th class="py-1">#</th><th>Item</th><th class="text-right">Kuantiti</th></tr></thead>
        <tbody>${d.lines
          .map(
            (l, i) => `<tr class="border-b align-top"><td class="py-1">${i + 1}</td>
            <td>${esc(l.desc)}${l.serials?.length ? `<div class="text-slate-500">SN: ${l.serials.map(esc).join(', ')}</div>` : ''}</td>
            <td class="text-right">${l.qty}</td></tr>`
          )
          .join('')}</tbody>
      </table>
      <div class="grid grid-cols-2 gap-6 mt-10 text-xs">
        <div class="border-t pt-1">Diserahkan oleh</div>
        <div class="border-t pt-1">Diterima oleh (nama, tandatangan, cop)</div>
      </div>`
        : ''
    }

    ${
      (d.type === 'INV' || d.type === 'QT') && co.bank_acc
        ? `<div class="mt-4 text-xs border-t pt-2">
        <div class="font-bold">Maklumat bayaran</div>
        <div>${esc(co.bank_name)} · ${esc(co.bank_acc)} · ${esc(co.bank_holder)}</div>
      </div>`
        : ''
    }
    ${d.notes ? `<div class="mt-3 text-xs whitespace-pre-line"><b>Nota:</b> ${esc(d.notes)}</div>` : ''}
    <div class="mt-4 text-[10px] text-slate-500 text-center">
      ${co.footer ? esc(co.footer) + '<br>' : ''}Dokumen janaan komputer · ${d.no} · dikeluarkan oleh ${esc(d.user_name)}
    </div>
  </div>`;
}

export function viewDoc(user, id) {
  const d = billing.findDoc(id);
  if (!d) return { html: `<div class="${card}">Dokumen tidak dijumpai.</div>` };
  const co = settings.get();
  const voided = billing.voidOf(d.id);
  const s = d.type === 'INV' ? billing.invoiceState(d.id) : null;
  const contact = contacts.find(d.party?.id) || d.party || {};
  const msg = message(d, s, co);
  const mgr = cash.isManager(user);
  const rel = billing.related(d.id);
  const left = s && !voided ? billing.undelivered(d.id) : [];

  return {
    html: `
    ${docHtml(d, s, co, voided)}

    <div class="print:hidden space-y-3">
      ${
        voided
          ? `<div class="${card} text-sm text-red-700">Dibatal ${fmtTime(voided.created_at)} oleh ${esc(voided.user_name)}, lulus ${esc(voided.approved_by.name)}. Sebab: ${esc(voided.reason)}</div>`
          : ''
      }
      ${
        s && !voided
          ? `<div class="${card} text-sm flex justify-between items-center">
          <span class="px-2 py-0.5 rounded-full ${STATUS_CLS[s.status]}">${billing.STATUS[s.status]}${s.overdue ? ' · LEWAT' : ''}</span>
          <span>Baki <b>${rm(s.balance)}</b></span>
        </div>`
          : ''
      }

      <div class="${card} space-y-2">
        <h2 class="font-bold text-sm">Hantar kepada ${esc(d.party?.name)}</h2>
        <button id="sharePdf" class="${btn}">📄 Kongsi PDF (WhatsApp / Telegram / lain-lain)</button>
        ${contactButtons(contact, { text: msg, subject: `${T[d.type].label} ${d.no}` })}
        <button id="print" class="w-full border rounded-lg py-2 text-sm">🖨️ Cetak</button>
      </div>

      ${
        d.type === 'QT' && !voided
          ? `<button id="toInv" class="${btn}">Tukar ke Invois</button>`
          : ''
      }

      ${
        s && !voided && s.balance > 0
          ? `
      <form id="pay" class="${card} space-y-2">
        <h2 class="font-bold text-sm">Terima Bayaran (Resit)</h2>
        <input name="amount" inputmode="decimal" class="${input}" value="${(s.balance / 100).toFixed(2)}" required>
        <select name="method" id="payMethod" class="${input}">
          ${Object.entries(billing.METHODS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}
        </select>
        <input name="payRef" id="payRef" class="${input} hidden" placeholder="No. rujukan bayaran (wajib)">
        <button class="${btn}">Keluarkan Resit</button>
      </form>
      <form id="cn" class="${card} space-y-2">
        <h2 class="font-bold text-sm">Nota Kredit</h2>
        <input name="amount" inputmode="decimal" class="${input}" placeholder="Jumlah kredit (RM)" required>
        <input name="reason" class="${input}" placeholder="Sebab (wajib)" required>
        ${mgr ? '' : `<div class="space-y-2 bg-amber-50 p-3 rounded-lg"><div class="text-xs text-amber-800">PIN manager/owner diperlukan.</div>${approverFields()}</div>`}
        <button class="${btn}">Keluarkan Nota Kredit</button>
      </form>`
          : ''
      }
      ${left.length ? `<a href="#/doc-do/${d.id}" class="${btn} block text-center">🚚 Buat Nota Hantaran (DO)</a>` : ''}

      ${
        rel.length
          ? `<div class="${card} divide-y">
          <h2 class="font-bold text-sm pb-2">Dokumen berkaitan</h2>
          ${rel
            .map(
              (r) => `<a href="#/doc/${r.id}" class="py-2 flex justify-between text-sm">
              <span>${r.no} · ${T[r.type].label}${billing.voidOf(r.id) ? ' <span class="text-red-600 text-xs">BATAL</span>' : ''}</span>
              <span>${r.type === 'DO' ? '' : rm(r.total)}</span></a>`
            )
            .join('')}
        </div>`
          : ''
      }
      ${voided ? '' : `<a href="#/doc-void/${d.id}" class="block text-center text-sm text-red-600 underline">Batal ${T[d.type].label}</a>`}
      <a href="#/billing/${d.type}" class="block text-center text-sm text-slate-500">Kembali</a>
    </div>`,
    mount() {
      const $ = (x) => document.getElementById(x);
      wireContactButtons(msg, (ch) => billing.logShare(d.id, ch));
      $('print').onclick = () => window.print();
      $('sharePdf').onclick = safe(async () => {
        toast('Menjana PDF…', 'ok');
        const r = await sharePdf($('doc'), `${d.no}.pdf`, msg);
        if (r !== 'cancelled') await billing.logShare(d.id, r === 'shared' ? 'pdf-share' : 'pdf-download');
        if (r === 'downloaded') toast('PDF dimuat turun. Lampirkan dalam chat.', 'ok');
      });
      if ($('toInv')) {
        $('toInv').onclick = safe(async () => {
          const dr = billing.newDraft('INV', { fromDocId: d.id });
          go('/doc-edit/' + dr.id);
        });
      }
      if ($('pay')) {
        $('payMethod').onchange = (e) => $('payRef').classList.toggle('hidden', e.target.value === 'cash');
        $('pay').onsubmit = safe(async (ev) => {
          ev.preventDefault();
          const f = new FormData(ev.target);
          const rc = await billing.receivePayment(d.id, {
            amount: cash.toSen(f.get('amount')),
            method: f.get('method'),
            payRef: f.get('payRef') || '',
          });
          toast(`${rc.no} dikeluarkan`, 'ok');
          go('/doc/' + rc.id);
        });
        $('cn').onsubmit = safe(async (ev) => {
          ev.preventDefault();
          const f = new FormData(ev.target);
          const cn = await billing.creditNote(
            d.id,
            cash.toSen(f.get('amount')),
            f.get('reason'),
            mgr ? null : { id: f.get('approver'), pin: f.get('approverPin') }
          );
          toast(`${cn.no} dikeluarkan`, 'ok');
          go('/doc/' + cn.id);
        });
      }
    },
  };
}

// ---------- Nota hantaran ----------

export function viewDocDeliver(user, invoiceId) {
  const s = billing.invoiceState(invoiceId);
  if (!s || s.voided) return { html: `<div class="${card}">Invois tidak sah.</div>` };
  const left = billing.undelivered(invoiceId);

  return {
    html: `
    <form id="f" class="${card} space-y-3">
      <h2 class="font-bold">Nota Hantaran untuk ${s.doc.no}</h2>
      <div class="text-xs text-slate-500">Stok akan ditolak bila DO dikeluarkan.</div>
      ${left
        .map((n) => {
          const p = products.find(n.product_id);
          return `<div class="border rounded-lg p-2 space-y-1 text-sm">
            <div class="font-medium">${esc(n.desc)} <span class="text-slate-500">(baki ${n.qty})</span></div>
            ${
              p?.track_serial
                ? Array.from({ length: n.qty }, (_, i) => `
                  <select name="s_${p.id}" class="${input} text-xs">
                    <option value="">Pilih siri ${i + 1} (kosongkan jika tidak dihantar)</option>
                    ${stock.serialsInStock(p.id).map((x) => `<option value="${esc(x)}">${esc(x)}</option>`).join('')}
                  </select>`).join('')
                : `<input name="q_${n.product_id}" inputmode="numeric" class="${input}" value="${n.qty}">`
            }
          </div>`;
        })
        .join('') || '<div class="text-sm text-slate-400">Semua item sudah dihantar.</div>'}
      ${left.length ? `<button class="${btn}">Keluarkan DO</button>` : ''}
      <a href="#/doc/${invoiceId}" class="block text-center text-sm text-slate-500">Kembali</a>
    </form>`,
    mount() {
      document.getElementById('f').onsubmit = safe(async (ev) => {
        ev.preventDefault();
        const f = new FormData(ev.target);
        const lines = left.map((n) => {
          const p = products.find(n.product_id);
          return p?.track_serial
            ? { product_id: n.product_id, serials: f.getAll(`s_${p.id}`).filter(Boolean) }
            : { product_id: n.product_id, qty: Number(f.get(`q_${n.product_id}`)) };
        });
        const dn = await billing.deliver(invoiceId, lines);
        toast(`${dn.no} dikeluarkan`, 'ok');
        go('/doc/' + dn.id);
      });
    },
  };
}

// ---------- Batal ----------

export function viewDocVoid(user, id) {
  const d = billing.findDoc(id);
  if (!d || billing.voidOf(id)) return { html: `<div class="${card}">Dokumen tidak boleh dibatal.</div>` };
  const mgr = cash.isManager(user);
  const effect = {
    INV: 'Invois mesti tiada resit / nota kredit / DO aktif.',
    RC: d.method === 'cash' ? `Tunai ${rm(d.amount)} akan dikeluarkan dari laci syif semasa.` : 'Bayaran bukan tunai akan dibatal dari rekod.',
    DO: 'Stok akan dipulangkan.',
    CN: 'Kredit akan ditarik balik; baki invois bertambah.',
    QT: '',
    PO: '',
  }[d.type];

  return {
    html: `
    <form id="f" class="${card} space-y-3">
      <h2 class="font-bold text-red-700">Batal ${d.no}</h2>
      <div class="text-sm">${effect}</div>
      <div class="text-xs text-slate-500">Dokumen kekal dengan cop BATAL. Nombor tidak diguna semula.</div>
      <input name="reason" class="${input}" placeholder="Sebab pembatalan (wajib)" required>
      ${mgr ? '' : `<div class="space-y-2 bg-amber-50 p-3 rounded-lg"><div class="text-xs text-amber-800">PIN manager/owner diperlukan.</div>${approverFields()}</div>`}
      <button class="w-full bg-red-600 text-white rounded-lg py-2 font-medium">Sahkan Batal</button>
      <a href="#/doc/${id}" class="block text-center text-sm text-slate-500">Kembali</a>
    </form>`,
    mount() {
      document.getElementById('f').onsubmit = safe(async (ev) => {
        ev.preventDefault();
        const f = new FormData(ev.target);
        await billing.voidDoc(id, f.get('reason'), mgr ? null : { id: f.get('approver'), pin: f.get('approverPin') });
        toast(`${d.no} dibatal`, 'ok');
        go('/doc/' + id);
      });
    },
  };
}

// ---------- Profil syarikat ----------

export function viewCompany(user) {
  if (user.role !== 'owner') return { html: `<div class="${card}">Hanya owner.</div>` };
  const co = settings.get();
  return {
    html: `
    <form id="f" class="${card} space-y-3">
      <h2 class="font-bold">Profil Syarikat</h2>
      <p class="text-xs text-slate-500">Dipapar pada semua dokumen billing.</p>
      ${Object.entries(settings.FIELDS)
        .map(([k, label]) =>
          k === 'address' || k === 'footer'
            ? `<textarea name="${k}" rows="2" class="${input}" placeholder="${label}">${esc(co[k])}</textarea>`
            : `<input name="${k}" class="${input}" placeholder="${label}" value="${esc(co[k])}">`
        )
        .join('')}
      <div class="text-xs text-red-700">Perubahan akaun bank masuk Amaran Fraud (tahap tinggi).</div>
      <button class="${btn}">Simpan</button>
    </form>`,
    mount() {
      document.getElementById('f').onsubmit = safe(async (ev) => {
        ev.preventDefault();
        await settings.save(Object.fromEntries(new FormData(ev.target)));
        toast('Profil disimpan', 'ok');
        refresh();
      });
    },
  };
}
