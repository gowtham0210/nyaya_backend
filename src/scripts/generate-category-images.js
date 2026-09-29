/**
 * Draws the illustrated cover image for each "Recommended for you" category
 * (navy/gold to match the app) and writes them as PNGs to
 * public/categories/<slug>.png, which the server exposes at
 * /assets/categories/<slug>.png. Re-run after editing an illustration.
 *
 *   node src/scripts/generate-category-images.js
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const NAVY = '#142440';
const GOLD = '#DBA251';
const GOLD_DARK = '#B9823A';
const GOLD_LIGHT = '#F3E2C3';
const PAPER = '#FFF8EA';
const CREAM = '#FBF1DE';

const defs = `
  <defs>
    <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#F0C67E"/>
      <stop offset="0.55" stop-color="${GOLD}"/>
      <stop offset="1" stop-color="${GOLD_DARK}"/>
    </linearGradient>
    <linearGradient id="navy" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#22385F"/>
      <stop offset="1" stop-color="${NAVY}"/>
    </linearGradient>
  </defs>`;

function wheel(cx, cy, r, spokes, color) {
  let out = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="4"/>`;
  out += `<circle cx="${cx}" cy="${cy}" r="5" fill="${color}"/>`;
  for (let i = 0; i < spokes; i += 1) {
    const a = (Math.PI * 2 * i) / spokes;
    out += `<line x1="${cx}" y1="${cy}" x2="${(cx + Math.cos(a) * r).toFixed(1)}" y2="${(cy + Math.sin(a) * r).toFixed(1)}" stroke="${color}" stroke-width="2"/>`;
  }
  return out;
}

function gear(cx, cy, teeth, outer, inner) {
  const pts = [];
  const step = (Math.PI * 2) / teeth;
  for (let i = 0; i < teeth; i += 1) {
    const a = i * step;
    const w = step * 0.22;
    [[a - step * 0.5 + w, inner], [a - w, outer], [a + w, outer], [a + step * 0.5 - w, inner]].forEach(([ang, r]) => {
      pts.push(`${(cx + Math.cos(ang) * r).toFixed(1)},${(cy + Math.sin(ang) * r).toFixed(1)}`);
    });
  }
  return `<polygon points="${pts.join(' ')}" fill="url(#navy)"/>`;
}

const art = {
  'constitutional-law': `
    ${wheel(150, 62, 30, 12, GOLD)}
    <path d="M48 96 L150 114 L252 96 L252 184 L150 202 L48 184 Z" fill="url(#navy)"/>
    <path d="M58 98 L150 114 L150 192 L58 176 Z" fill="${PAPER}"/>
    <path d="M242 98 L150 114 L150 192 L242 176 Z" fill="${PAPER}"/>
    <g stroke="${GOLD}" stroke-width="4" stroke-linecap="round">
      <line x1="72" y1="120" x2="134" y2="131"/><line x1="72" y1="140" x2="134" y2="151"/><line x1="72" y1="160" x2="120" y2="169"/>
      <line x1="228" y1="120" x2="166" y2="131"/><line x1="228" y1="140" x2="166" y2="151"/><line x1="228" y1="160" x2="180" y2="169"/>
    </g>
    <line x1="150" y1="114" x2="150" y2="192" stroke="${GOLD_DARK}" stroke-width="3"/>`,

  'criminal-evidence-law': `
    <circle cx="103" cy="132" r="38" fill="none" stroke="url(#navy)" stroke-width="15"/>
    <circle cx="197" cy="132" r="38" fill="none" stroke="url(#navy)" stroke-width="15"/>
    <rect x="89" y="78" width="28" height="24" rx="5" fill="url(#gold)"/>
    <rect x="183" y="78" width="28" height="24" rx="5" fill="url(#gold)"/>
    <ellipse cx="150" cy="132" rx="14" ry="8" fill="none" stroke="${GOLD_DARK}" stroke-width="5"/>
    <circle cx="103" cy="132" r="5" fill="${GOLD}"/><circle cx="197" cy="132" r="5" fill="${GOLD}"/>`,

  'civil-general-law': `
    <rect x="68" y="196" width="164" height="22" rx="7" fill="url(#navy)"/>
    <rect x="90" y="184" width="120" height="14" rx="5" fill="url(#gold)"/>
    <g transform="rotate(-32 150 130)">
      <rect x="142" y="100" width="16" height="104" rx="6" fill="${GOLD_DARK}"/>
      <rect x="96" y="56" width="108" height="50" rx="12" fill="url(#navy)"/>
      <rect x="112" y="56" width="14" height="50" fill="url(#gold)"/>
      <rect x="174" y="56" width="14" height="50" fill="url(#gold)"/>
    </g>`,

  'marriage-family-law': `
    <circle cx="123" cy="146" r="44" fill="none" stroke="url(#gold)" stroke-width="13"/>
    <circle cx="177" cy="146" r="44" fill="none" stroke="${GOLD_DARK}" stroke-width="13"/>
    <path d="M150 96 C108 64 120 34 141 40 C147 42 150 47 150 47 C150 47 153 42 159 40 C180 34 192 64 150 96 Z" fill="url(#navy)"/>
    <circle cx="175" cy="103" r="6" fill="${GOLD_LIGHT}" stroke="${GOLD_DARK}" stroke-width="2"/>`,

  'labor-industrial-law': `
    ${gear(150, 122, 12, 84, 66)}
    <circle cx="150" cy="122" r="46" fill="${CREAM}"/>
    <path d="M108 138 A42 42 0 0 1 192 138 Z" fill="url(#gold)"/>
    <rect x="143" y="92" width="14" height="46" rx="4" fill="${GOLD_LIGHT}"/>
    <rect x="98" y="138" width="104" height="13" rx="6.5" fill="${GOLD_DARK}"/>`,

  'corporate-commercial-law': `
    <path d="M120 100 V82 a12 12 0 0 1 12 -12 h36 a12 12 0 0 1 12 12 V100" fill="none" stroke="url(#gold)" stroke-width="11" stroke-linecap="round"/>
    <rect x="66" y="98" width="168" height="108" rx="16" fill="url(#navy)"/>
    <rect x="66" y="140" width="168" height="9" fill="${GOLD_DARK}"/>
    <rect x="136" y="130" width="28" height="30" rx="6" fill="url(#gold)"/>
    <circle cx="150" cy="142" r="4" fill="${NAVY}"/>`,

  'taxation-law': `
    <rect x="86" y="42" width="128" height="160" rx="12" fill="${PAPER}" stroke="url(#navy)" stroke-width="7"/>
    <circle cx="124" cy="92" r="11" fill="none" stroke="${NAVY}" stroke-width="6"/>
    <circle cx="176" cy="142" r="11" fill="none" stroke="${NAVY}" stroke-width="6"/>
    <line x1="184" y1="82" x2="116" y2="152" stroke="${GOLD}" stroke-width="9" stroke-linecap="round"/>
    <rect x="108" y="172" width="84" height="9" rx="4.5" fill="${GOLD_LIGHT}"/>
    <circle cx="222" cy="190" r="28" fill="url(#gold)" stroke="${GOLD_DARK}" stroke-width="5"/>
    <circle cx="222" cy="190" r="17" fill="none" stroke="${GOLD_LIGHT}" stroke-width="3"/>`,

  'cyber-intellectual-property': `
    <path d="M150 34 L228 60 V124 C228 166 192 192 150 208 C108 192 72 166 72 124 V60 Z" fill="url(#navy)"/>
    <path d="M132 120 V106 a18 18 0 0 1 36 0 V120" fill="none" stroke="${GOLD}" stroke-width="9" stroke-linecap="round"/>
    <rect x="122" y="118" width="56" height="46" rx="9" fill="url(#gold)"/>
    <circle cx="150" cy="137" r="6.5" fill="${NAVY}"/><rect x="147" y="139" width="6" height="14" rx="3" fill="${NAVY}"/>
    <g stroke="${GOLD}" stroke-width="3" fill="${GOLD}"><line x1="40" y1="92" x2="72" y2="92"/><circle cx="38" cy="92" r="5"/><line x1="228" y1="100" x2="262" y2="100"/><circle cx="264" cy="100" r="5"/><line x1="46" y1="150" x2="76" y2="150"/><circle cx="44" cy="150" r="5"/></g>`,

  'property-real-estate-law': `
    <rect x="188" y="62" width="17" height="34" fill="url(#navy)"/>
    <polygon points="150,42 240,112 60,112" fill="url(#navy)"/>
    <rect x="82" y="112" width="136" height="92" fill="${PAPER}" stroke="${NAVY}" stroke-width="6"/>
    <rect x="132" y="142" width="36" height="62" rx="5" fill="url(#gold)"/>
    <rect x="97" y="128" width="24" height="24" rx="3" fill="${GOLD_LIGHT}" stroke="${GOLD_DARK}" stroke-width="3"/>
    <rect x="179" y="128" width="24" height="24" rx="3" fill="${GOLD_LIGHT}" stroke="${GOLD_DARK}" stroke-width="3"/>
    <rect x="56" y="204" width="188" height="8" rx="4" fill="${GOLD_DARK}"/>`,

  'banking-financial-law': `
    <polygon points="150,40 244,92 56,92" fill="url(#navy)"/>
    <rect x="56" y="92" width="188" height="13" fill="url(#gold)"/>
    <g fill="${PAPER}" stroke="${NAVY}" stroke-width="4">
      <rect x="76" y="110" width="24" height="70" rx="4"/><rect x="113" y="110" width="24" height="70" rx="4"/>
      <rect x="163" y="110" width="24" height="70" rx="4"/><rect x="200" y="110" width="24" height="70" rx="4"/>
    </g>
    <rect x="56" y="180" width="188" height="13" fill="url(#gold)"/>
    <rect x="44" y="193" width="212" height="14" rx="3" fill="url(#navy)"/>
    <circle cx="150" cy="66" r="10" fill="${GOLD}"/>`,

  'environmental-law': `
    <ellipse cx="150" cy="212" rx="86" ry="10" fill="${GOLD_LIGHT}"/>
    <rect x="139" y="128" width="22" height="84" rx="6" fill="url(#navy)"/>
    <circle cx="106" cy="120" r="38" fill="${GOLD_DARK}"/>
    <circle cx="194" cy="120" r="38" fill="${GOLD_DARK}"/>
    <circle cx="150" cy="86" r="50" fill="url(#gold)"/>
    <circle cx="132" cy="72" r="13" fill="#F0C67E" opacity="0.8"/>
    <path d="M150 172 L118 146 M150 172 L182 140" stroke="${NAVY}" stroke-width="7" stroke-linecap="round"/>`,
};

(async () => {
  const outDir = path.join(__dirname, '..', '..', 'public', 'categories');
  fs.mkdirSync(outDir, { recursive: true });
  for (const [slug, body] of Object.entries(art)) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 240" width="600" height="480">${defs}
      <circle cx="150" cy="122" r="108" fill="${CREAM}"/>${body}</svg>`;
    await sharp(Buffer.from(svg)).png().toFile(path.join(outDir, `${slug}.png`));
    console.log('wrote', `${slug}.png`);
  }
})();
