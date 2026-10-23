// Desenho do mapa (SVG puro, sem bibliotecas).
// Dois modos: "geo" (malha estadual do IBGE) e "grade" (cada UF com o mesmo tamanho,
// para não sugerir que área maior = mais votos e dar visibilidade ao DF e às UFs pequenas).
import { REGIAO_DA_UF } from "./contrato.js";

const COS = Math.cos((15 * Math.PI) / 180);
const K = 10;
const proj = ([lon, lat]) => [(lon + 74.5) * COS * K, (5.8 - lat) * K];

// UFs pequenas cujo rótulo vai para o mar, ligado por uma linha.
const ROTULO_FORA = { rn: -8, pb: -1, pe: 6, al: 13, se: 20, es: 2, rj: 8, df: null };

// Grade (coluna, linha) aproximando a posição real.
export const GRADE = {
  rr: [2, 0], ap: [4, 0],
  am: [1, 1], pa: [3, 1], ma: [4, 1], ce: [5, 1], rn: [6, 1],
  ac: [0, 2], ro: [1, 2], mt: [2, 2], to: [3, 2], pi: [4, 2], pe: [5, 2], pb: [6, 2],
  ms: [2, 3], go: [3, 3], df: [4, 3], ba: [5, 3], al: [6, 3],
  pr: [2, 4], sp: [3, 4], mg: [4, 4], es: [5, 4], se: [6, 4],
  sc: [2, 5], rj: [4, 5],
  rs: [2, 6]
};

function caminho(geom) {
  const polys = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
  let d = "";
  let melhor = null;
  let area = -1;
  const caixa = [Infinity, Infinity, -Infinity, -Infinity];
  for (const poly of polys) {
    poly.forEach((anel, i) => {
      const pts = anel.map(proj);
      d += "M" + pts.map((p) => p[0].toFixed(1) + "," + p[1].toFixed(1)).join("L") + "Z";
      for (const [x, y] of pts) {
        caixa[0] = Math.min(caixa[0], x); caixa[1] = Math.min(caixa[1], y);
        caixa[2] = Math.max(caixa[2], x); caixa[3] = Math.max(caixa[3], y);
      }
      if (i === 0) {
        // centróide do maior anel externo (fórmula do polígono)
        let a = 0, cx = 0, cy = 0;
        for (let k = 0; k < pts.length - 1; k++) {
          const [x0, y0] = pts[k], [x1, y1] = pts[k + 1];
          const f = x0 * y1 - x1 * y0;
          a += f; cx += (x0 + x1) * f; cy += (y0 + y1) * f;
        }
        if (Math.abs(a) > area) { area = Math.abs(a); melhor = [cx / (3 * a), cy / (3 * a)]; }
      }
    });
  }
  return { d, c: melhor, caixa };
}

export function prepararGeo(geojson) {
  const ufs = geojson.features.map((f) => ({ uf: f.properties.uf, ...caminho(f.geometry) }));
  const caixa = ufs.reduce((b, u) => [Math.min(b[0], u.caixa[0]), Math.min(b[1], u.caixa[1]), Math.max(b[2], u.caixa[2]), Math.max(b[3], u.caixa[3])], [Infinity, Infinity, -Infinity, -Infinity]);
  return { ufs, caixa };
}

const r1 = (x) => Math.round(x * 10) / 10;

// pintura(id) → { fill, defasada, rotulo, titulo }
export function svgGeo(geo, pintura, { nivel = "uf" } = {}) {
  const [x0, y0, x1, y1] = geo.caixa;
  const margemDir = 70;
  const W = x1 - x0 + margemDir + 20, H = y1 - y0 + 20;
  const ox = -x0 + 10, oy = -y0 + 10;
  const mx = x1 + ox + 18; // coluna de rótulos no mar
  let corpo = "", sobre = "", rotulos = "";
  for (const u of geo.ufs) {
    const id = nivel === "regiao" ? "reg-" + REGIAO_DA_UF[u.uf] : u.uf;
    const p = pintura(id, u.uf);
    const ttl = p.titulo ? `<title>${p.titulo}</title>` : "";
    corpo += `<path class="uf" data-id="${id}" data-uf="${u.uf}" d="${u.d}" transform="translate(${r1(ox)},${r1(oy)})" fill="${p.fill}" tabindex="${nivel === "uf" ? 0 : -1}" role="button" aria-label="${p.aria || ""}">${ttl}</path>`;
    if (p.defasada) sobre += `<path class="defasada" d="${u.d}" transform="translate(${r1(ox)},${r1(oy)})" fill="url(#pad-defasada)"/>`;
    if (nivel !== "uf") continue;
    const [cx, cy] = [u.c[0] + ox, u.c[1] + oy];
    if (u.uf === "df") {
      // DF é minúsculo: marcador clicável + rótulo deslocado
      rotulos += `<line class="guia" x1="${r1(cx)}" y1="${r1(cy)}" x2="${r1(cx + 22)}" y2="${r1(cy - 16)}"/>`;
      rotulos += `<circle class="marcador" data-id="df" data-uf="df" cx="${r1(cx)}" cy="${r1(cy)}" r="4.2" fill="${p.fill}" tabindex="0" role="button" aria-label="${p.aria || ""}"/>`;
      rotulos += `<text class="rot" x="${r1(cx + 24)}" y="${r1(cy - 16)}" text-anchor="start">DF${p.rotulo ? ` <tspan class="rot2">${p.rotulo}</tspan>` : ""}</text>`;
    } else if (u.uf in ROTULO_FORA) {
      const ty = cy + ROTULO_FORA[u.uf];
      rotulos += `<line class="guia" x1="${r1(cx)}" y1="${r1(cy)}" x2="${r1(mx - 3)}" y2="${r1(ty - 3)}"/>`;
      rotulos += `<text class="rot" x="${r1(mx)}" y="${r1(ty)}" text-anchor="start">${u.uf.toUpperCase()}${p.rotulo ? ` <tspan class="rot2">${p.rotulo}</tspan>` : ""}</text>`;
    } else {
      rotulos += `<text class="rot" x="${r1(cx)}" y="${r1(cy + 3)}">${u.uf.toUpperCase()}${p.rotulo ? `<tspan class="rot2" x="${r1(cx)}" dy="10">${p.rotulo}</tspan>` : ""}</text>`;
    }
  }
  return { viewBox: `0 0 ${r1(W)} ${r1(H)}`, html: corpo + sobre + rotulos, largura: W, altura: H };
}

export function svgGrade(pintura, { nivel = "uf" } = {}) {
  const L = 46, G = 4;
  let html = "";
  for (const [uf, [c, l]] of Object.entries(GRADE)) {
    const id = nivel === "regiao" ? "reg-" + REGIAO_DA_UF[uf] : uf;
    const p = pintura(id, uf);
    const x = 8 + c * (L + G), y = 8 + l * (L + G);
    html += `<g class="tile" data-id="${id}" data-uf="${uf}" tabindex="${nivel === "uf" ? 0 : -1}" role="button" aria-label="${p.aria || ""}">`;
    html += `<rect class="uf" x="${x}" y="${y}" width="${L}" height="${L}" rx="5" fill="${p.fill}">${p.titulo ? `<title>${p.titulo}</title>` : ""}</rect>`;
    if (p.defasada) html += `<rect class="defasada" x="${x}" y="${y}" width="${L}" height="${L}" rx="5" fill="url(#pad-defasada)"/>`;
    html += `<text class="rot rot-tile ${p.escuro ? "claro" : ""} ${p.neutro ? "neutro" : ""}" x="${x + L / 2}" y="${y + 20}">${uf.toUpperCase()}</text>`;
    if (p.rotulo) html += `<text class="rot2 rot-tile ${p.escuro ? "claro" : ""} ${p.neutro ? "neutro" : ""}" x="${x + L / 2}" y="${y + 34}">${p.rotulo}</text>`;
    html += `</g>`;
  }
  const W = 8 * 2 + 7 * (L + G), H = 8 * 2 + 7 * (L + G);
  return { viewBox: `0 0 ${W} ${H}`, html, largura: W, altura: H };
}

// Defs compartilhados: padrões para empate, indisponível e defasada.
export function defs(corA, corB) {
  return `<defs>
    <pattern id="pad-empate" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="4" height="8" fill="${corA}"/><rect x="4" width="4" height="8" fill="${corB}"/>
    </pattern>
    <pattern id="pad-indisp" width="6" height="6" patternUnits="userSpaceOnUse">
      <rect width="6" height="6" class="pad-fundo"/><path d="M0 0L6 6M6 0L0 6" class="pad-traco"/>
    </pattern>
    <pattern id="pad-semdados" width="5" height="5" patternUnits="userSpaceOnUse">
      <rect width="5" height="5" class="pad-semdados-fundo"/><circle cx="2.5" cy="2.5" r=".7" class="pad-semdados-ponto"/>
    </pattern>
    <pattern id="pad-defasada" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
      <rect width="2.4" height="7" fill="rgba(10,12,16,.55)"/>
    </pattern>
  </defs>`;
}
