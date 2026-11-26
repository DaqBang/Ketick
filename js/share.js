// Jana PDF dari paparan dokumen & kongsi ke WhatsApp / Telegram / apa-apa app (Web Share API).
// html2pdf dimuat hanya bila diperlukan (perlu internet kali pertama).

const H2P = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
let loading = null;

function loadLib() {
  if (window.html2pdf) return Promise.resolve(window.html2pdf);
  loading ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = H2P;
    s.onload = () => resolve(window.html2pdf);
    s.onerror = () => {
      loading = null;
      s.remove();
      reject(new Error('Gagal muat penjana PDF. Semak internet.'));
    };
    document.head.appendChild(s);
  });
  return loading;
}

// Render salinan pada lebar A4 tetap supaya PDF dari phone tidak sempit
export async function makePdf(el, filename) {
  const html2pdf = await loadLib();
  const holder = document.createElement('div');
  holder.style.cssText = 'position:fixed;left:-10000px;top:0;width:760px;background:#fff';
  const clone = el.cloneNode(true);
  clone.querySelectorAll('.print\\:hidden').forEach((n) => n.remove());
  holder.appendChild(clone);
  document.body.appendChild(holder);
  try {
    return await html2pdf()
      .set({
        margin: 10,
        filename,
        image: { type: 'jpeg', quality: 0.95 },
        html2canvas: { scale: 2, useCORS: true, windowWidth: 760 },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      })
      .from(clone)
      .outputPdf('blob');
  } finally {
    holder.remove();
  }
}

export function download(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

// Pulangkan 'shared' | 'cancelled' | 'downloaded'
export async function sharePdf(el, filename, text) {
  const blob = await makePdf(el, filename);
  const file = new File([blob], filename, { type: 'application/pdf' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename, text });
      return 'shared';
    } catch (e) {
      if (e.name === 'AbortError') return 'cancelled';
    }
  }
  download(blob, filename);
  return 'downloaded';
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
