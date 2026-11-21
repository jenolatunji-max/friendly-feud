/* =========================================================
   Logo: gold ticket on a blue starburst with marquee bulbs.
   Plain function so the build script can reuse it in Node.
   ========================================================= */
function logoSVG(brand, opts) {
  opts = opts || {};
  const words = String(brand || 'Friendly Feud').toUpperCase().split(/\s+/);
  const line1 = words.length > 1 ? words.slice(0, -1).join(' ') : '';
  const line2 = words[words.length - 1];
  const cx = 300;
  const cy = 150;
  const spikes = 30;
  let pts = '';
  for (let i = 0; i < spikes * 2; i++) {
    const a = (Math.PI * i) / spikes - Math.PI / 2;
    const outer = i % 2 === 0;
    const rx = outer ? 296 : 252;
    const ry = outer ? 148 : 118;
    pts += (cx + Math.cos(a) * rx).toFixed(1) + ',' + (cy + Math.sin(a) * ry).toFixed(1) + ' ';
  }
  // Ticket with notches on the short sides
  const ticket = 'M84,62 H516 a22,22 0 0 1 22,22 V126 a24,24 0 0 0 0,48 V216 a22,22 0 0 1 -22,22 H84 a22,22 0 0 1 -22,-22 V174 a24,24 0 0 0 0,-48 V84 a22,22 0 0 1 22,-22 Z';
  let bulbs = '';
  const bx0 = 96;
  const bx1 = 504;
  const n = 15;
  for (let i = 0; i <= n; i++) {
    const x = bx0 + ((bx1 - bx0) * i) / n;
    bulbs += `<circle class="lg-b" cx="${x.toFixed(1)}" cy="78" r="5.2"/><circle class="lg-b" cx="${x.toFixed(1)}" cy="222" r="5.2"/>`;
  }
  const fam = "Anton, Impact, 'Arial Narrow Bold', 'Arial Narrow', sans-serif";
  const t1 = line1
    ? `<text x="300" y="138" text-anchor="middle" font-family="${fam}" font-size="56" letter-spacing="5" fill="#0A1238">${line1}</text>`
    : '';
  const y2 = line1 ? 206 : 178;
  const fs2 = line1 ? 78 : 92;
  const t2 = `<text x="300" y="${y2}" text-anchor="middle" font-family="${fam}" font-size="${fs2}" letter-spacing="7" fill="#0A1238">${line2}</text>`;
  const title = opts.title === false ? '' : `<title>${brand}</title>`;
  return `<svg class="logo-svg" viewBox="0 0 600 300" role="img" aria-label="${brand}" xmlns="http://www.w3.org/2000/svg">${title}
    <polygon points="${pts.trim()}" fill="#2F6BFF"/>
    <polygon points="${pts.trim()}" fill="#1C3FAA" transform="translate(300 150) scale(0.86) translate(-300 -150)"/>
    <path d="${ticket}" fill="#0A1238" transform="translate(0 7)" opacity="0.55"/>
    <path d="${ticket}" fill="#F6B93B" stroke="#FFF6E0" stroke-width="4"/>
    <path d="${ticket}" fill="none" stroke="#B57B12" stroke-width="2" transform="translate(300 150) scale(0.93) translate(-300 -150)"/>
    <g fill="#FFF6E0">${bulbs}</g>
    ${t1}${t2}
  </svg>`;
}
