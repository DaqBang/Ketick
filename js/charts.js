// Carta SVG ringan tanpa library: sparkline, carta kawasan, gauge.

const G1 = '#1f7a51';
const G2 = '#4fb382';
let uid = 0;

function scale(values, w, h, pad = 2) {
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const step = values.length > 1 ? (w - pad * 2) / (values.length - 1) : 0;
  return values.map((v, i) => [pad + i * step, h - pad - ((v - min) / span) * (h - pad * 2)]);
}

// Lengkung licin (Catmull-Rom -> Bezier)
function smooth(pts) {
  if (pts.length < 2) return pts.length ? `M${pts[0][0]},${pts[0][1]}` : '';
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    // Had titik kawalan dalam julat segmen supaya lengkung tidak terlajak bawah sifar
    const lo = Math.min(p1[1], p2[1]);
    const hi = Math.max(p1[1], p2[1]);
    const clamp = (v) => Math.max(lo, Math.min(hi, v));
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, clamp(p1[1] + (p2[1] - p0[1]) / 6)];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, clamp(p2[1] - (p3[1] - p1[1]) / 6)];
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

export function sparkline(values, { w = 90, h = 28, color = G1 } = {}) {
  const id = `sp${++uid}`;
  const pts = scale(values, w, h);
  const line = smooth(pts);
  return `<svg viewBox="0 0 ${w} ${h}" class="w-[90px] h-7" preserveAspectRatio="none">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${color}" stop-opacity=".25"/><stop offset="1" stop-color="${color}" stop-opacity="0"/>
    </linearGradient></defs>
    <path d="${line} L${w - 2},${h} L2,${h} Z" fill="url(#${id})"/>
    <path d="${line}" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round"/>
  </svg>`;
}

// series: nilai harian; avg: garis putus-putus purata bergerak; labels: label paksi-x
export function areaChart(values, { labels = [], avg = [], fmt = (v) => v, h = 220, dark = false } = {}) {
  const line = dark ? '#38bdf8' : G1;
  const fill = dark ? '#38bdf8' : G2;
  const grid = dark ? 'rgba(255,255,255,.07)' : '#eef2f0';
  const txt = dark ? '#7f8ea8' : '#94a3b8';
  const w = 640;
  const padL = 56;
  const padB = 24;
  const innerW = w - padL - 8;
  const innerH = h - padB - 8;
  const max = Math.max(...values, ...avg, 1) * 1.15;
  const x = (i) => padL + (values.length > 1 ? (i / (values.length - 1)) * innerW : innerW / 2);
  const y = (v) => 8 + innerH - (v / max) * innerH;
  const pts = values.map((v, i) => [x(i), y(v)]);
  const avgPts = avg.map((v, i) => [x(i), y(v)]);
  const id = `ar${++uid}`;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => max * f);
  const last = pts[pts.length - 1];

  return `<svg viewBox="0 0 ${w} ${h}" class="w-full h-auto" role="img">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${fill}" stop-opacity=".35"/><stop offset="1" stop-color="${fill}" stop-opacity="0"/>
    </linearGradient>
    <filter id="${id}g" x="-10%" y="-30%" width="120%" height="160%"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
    ${ticks
      .map(
        (t) => `<line x1="${padL}" x2="${w - 8}" y1="${y(t)}" y2="${y(t)}" stroke="${grid}"/>
        <text x="${padL - 8}" y="${y(t) + 4}" text-anchor="end" font-size="13" fill="${txt}">${fmt(t)}</text>`
      )
      .join('')}
    ${labels
      .map((l, i) => (l ? `<text x="${x(i)}" y="${h - 4}" text-anchor="${i === labels.length - 1 ? 'end' : i === 0 ? 'start' : 'middle'}" font-size="13" fill="${txt}">${l}</text>` : ''))
      .join('')}
    <path d="${smooth(pts)} L${x(values.length - 1)},${8 + innerH} L${x(0)},${8 + innerH} Z" fill="url(#${id})"/>
    <path d="${smooth(pts)}" fill="none" stroke="${line}" stroke-width="2.5" stroke-linecap="round" ${dark ? `filter="url(#${id}g)"` : ''}/>
    ${avgPts.length ? `<path d="${smooth(avgPts)}" fill="none" stroke="${dark ? 'rgba(255,255,255,.35)' : '#94a3b8'}" stroke-width="1.5" stroke-dasharray="5 5"/>` : ''}
    ${last ? `<circle cx="${last[0]}" cy="${last[1]}" r="5" fill="${dark ? '#0b1533' : '#fff'}" stroke="${line}" stroke-width="2.5"/>` : ''}
  </svg>`;
}

// Gauge separuh bulatan 0-100
export function gauge(value, { label = '', color = G1 } = {}) {
  const v = Math.max(0, Math.min(100, value));
  const r = 80;
  const cx = 100;
  const cy = 95;
  const len = Math.PI * r;
  const arc = `M${cx - r},${cy} A${r},${r} 0 0 1 ${cx + r},${cy}`;
  return `<svg viewBox="0 0 200 110" class="w-full max-w-[240px] mx-auto">
    <path d="${arc}" fill="none" stroke="#e8efeb" stroke-width="16" stroke-linecap="round"/>
    <path d="${arc}" fill="none" stroke="${color}" stroke-width="16" stroke-linecap="round"
      stroke-dasharray="${len}" stroke-dashoffset="${len * (1 - v / 100)}" style="transition:stroke-dashoffset .8s ease"/>
    <text x="${cx}" y="${cy - 14}" text-anchor="middle" font-size="30" font-weight="800" fill="#0b2a1d">${Math.round(v)}</text>
    <text x="${cx}" y="${cy + 4}" text-anchor="middle" font-size="11" fill="#64748b">${label}</text>
  </svg>`;
}

// Dial analog skeuomorfik 0-100: bezel logam, muka kaca, zon warna, jarum
export function dial(value, { label = '' } = {}) {
  const v = Math.max(0, Math.min(100, value));
  const cx = 120;
  const cy = 120;
  const start = -210; // darjah
  const sweep = 240;
  const ang = (p) => ((start + (sweep * p) / 100) * Math.PI) / 180;
  const pt = (p, r) => [cx + r * Math.cos(ang(p)), cy + r * Math.sin(ang(p))];
  const arc = (a, b, r) => {
    const [x1, y1] = pt(a, r);
    const [x2, y2] = pt(b, r);
    return `M${x1.toFixed(1)},${y1.toFixed(1)} A${r},${r} 0 ${(b - a) * 2.4 > 180 ? 1 : 0} 1 ${x2.toFixed(1)},${y2.toFixed(1)}`;
  };
  const id = `dl${++uid}`;
  let ticks = '';
  for (let p = 0; p <= 100; p += 5) {
    const major = p % 20 === 0;
    const [x1, y1] = pt(p, major ? 78 : 82);
    const [x2, y2] = pt(p, 90);
    ticks += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${major ? '#e2e8f0' : '#64748b'}" stroke-width="${major ? 2 : 1}"/>`;
    if (major) {
      const [tx, ty] = pt(p, 66);
      ticks += `<text x="${tx.toFixed(1)}" y="${(ty + 4).toFixed(1)}" text-anchor="middle" font-size="11" fill="#94a3b8" font-family="JetBrains Mono, monospace">${p}</text>`;
    }
  }
  const needle = start + (sweep * v) / 100;
  return `<svg viewBox="0 0 240 210" class="w-full max-w-[260px] mx-auto">
    <defs>
      <radialGradient id="${id}f" cx="50%" cy="40%" r="65%"><stop offset="0" stop-color="#1e2a4a"/><stop offset="1" stop-color="#060c1f"/></radialGradient>
      <linearGradient id="${id}b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#cbd5e1"/><stop offset=".5" stop-color="#475569"/><stop offset="1" stop-color="#1e293b"/></linearGradient>
      <linearGradient id="${id}n" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fca5a5"/><stop offset="1" stop-color="#ef4444"/></linearGradient>
      <radialGradient id="${id}c" cx="35%" cy="30%" r="70%"><stop offset="0" stop-color="#f8fafc"/><stop offset="1" stop-color="#475569"/></radialGradient>
    </defs>
    <circle cx="${cx}" cy="${cy}" r="108" fill="url(#${id}b)"/>
    <circle cx="${cx}" cy="${cy}" r="100" fill="url(#${id}f)" stroke="rgba(0,0,0,.6)" stroke-width="2"/>
    <path d="${arc(0, 50, 94)}" fill="none" stroke="#ef4444" stroke-width="5" opacity=".85"/>
    <path d="${arc(50, 80, 94)}" fill="none" stroke="#f59e0b" stroke-width="5" opacity=".85"/>
    <path d="${arc(80, 100, 94)}" fill="none" stroke="#22c55e" stroke-width="5" opacity=".85"/>
    ${ticks}
    <text x="${cx}" y="${cy + 42}" text-anchor="middle" font-size="26" font-weight="700" fill="#bae6fd" font-family="JetBrains Mono, monospace" style="filter:drop-shadow(0 0 6px rgba(56,189,248,.7))">${Math.round(v)}</text>
    <text x="${cx}" y="${cy + 60}" text-anchor="middle" font-size="10" fill="#94a3b8" letter-spacing="2">${label}</text>
    <g transform="rotate(${needle.toFixed(1)} ${cx} ${cy})" style="transition:transform .8s">
      <path d="M${cx - 12},${cy} L${cx + 84},${cy - 2} L${cx + 88},${cy} L${cx + 84},${cy + 2} Z" fill="url(#${id}n)" style="filter:drop-shadow(0 2px 3px rgba(0,0,0,.6))"/>
    </g>
    <circle cx="${cx}" cy="${cy}" r="11" fill="url(#${id}c)" stroke="#0f172a" stroke-width="1.5"/>
    <ellipse cx="${cx}" cy="${cy - 55}" rx="70" ry="28" fill="#fff" opacity=".05"/>
  </svg>`;
}
