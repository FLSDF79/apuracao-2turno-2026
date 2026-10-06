// Mede a CPU do código do coletor por rodada (rodada + gravação no storage), com fetch mínimo
// (sem custo de HTTP) para isolar o que conta no limite da Cloudflare.
// Uso: npm run cpu   (ou: node tools/medir-cpu.mjs --sha-sincrono --max=12)
const R = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
// Com --sha-sincrono, o SHA-256 usa node:crypto síncrono, como o digest nativo do Workers; o Web Crypto do
// Node passa por uma fila de threads e infla a medição sem refletir o custo no Workers.
if (process.argv.includes("--sha-sincrono")) {
  const { createHash } = await import("node:crypto");
  Object.defineProperty(globalThis.crypto.subtle, "digest", { value: async (_alg, dados) => { const b = createHash("sha256").update(dados).digest(); return b.buffer.slice(b.byteOffset, b.byteOffset + b.length); } });
}
const imp = async (p) => import(`${R}/${p}`);
const { Fonte } = await imp("backend/conectores/http.js");
const { rodada } = await imp("backend/coletor/rodada.js");
const { carregarBase, montarSite } = await imp("backend/conectores/simulador.js");
const { gravarEstado, gravarSaidas } = await imp("backend/armazenamento/durable-object.js");
const base = await carregarBase(`${R}/tests/fixtures/tse-2026-10-06`);
let t = Date.parse("2026-10-25T20:00:00Z"), passo = 0, corpos = new Map();
const preparar = () => {
  const site = montarSite(base, { hora: `25/10/2026 ${17 + Math.floor(passo / 60)}:${String(passo % 60).padStart(2, "0")}:00`, fracao: { padrao: Math.min(1, 0.01 * (passo + 1)) } });
  corpos = new Map(Object.entries(site).map(([k, v]) => [k, { c: JSON.stringify(v), etag: `"${passo}-${k}"` }]));
};
const resp = (status, corpo, etag) => ({ status, ok: status < 300, headers: { get: (h) => (h === "etag" ? etag : null) }, text: async () => corpo });
const fetchMin = async (url, init = {}) => {
  const x = corpos.get(url.replace("https://resultados.tse.jus.br/", ""));
  if (!x) return resp(404, "", null);
  if (init.headers?.["If-None-Match"] === x.etag) return resp(304, "", x.etag);
  return resp(200, x.c, x.etag);
};
const m = new Map();
const st = { async get(k) { return m.get(k); }, async put(o) { for (const [k, v] of Object.entries(o)) m.set(k, v); }, async list({ prefix }) { return new Map([...m].filter(([k]) => k.startsWith(prefix))); }, async delete() {} };
const cpu = () => { const u = process.cpuUsage(); return (u.user + u.system) / 1000; };
let estado = null;
const K = Number((process.argv.find((a) => a.startsWith("--max=")) || "--max=Infinity").slice(6));
const parciais = [], finais = [];
// Uma "rodada" = as execuções do Durable Object até não haver continuação; mede cada execução.
async function uma() {
  let maior = 0;
  for (;;) {
    const f = new Fonte({ fetch: fetchMin, agora: () => t, esperar: async (ms) => { t += ms; }, estado: estado?.fonte });
    if (globalThis.gc) globalThis.gc(); // limpa o lixo do simulador antes de medir (no Workers ele não existe)
    const c0 = cpu();
    const r = await rodada(f, estado, { modo: "oficial", maxNovosPorExecucao: K });
    await gravarEstado(st, r.estado);
    await gravarSaidas(st, r.saidas, r.brutos);
    const ms = cpu() - c0;
    (r.continuar ? parciais : finais).push(ms);
    maior = Math.max(maior, ms);
    estado = r.estado;
    if (!r.continuar) break;
    t += 1000;
  }
  t += 15000;
  return maior;
}
preparar();
for (let i = 0; i < 30; i++) { passo++; preparar(); await uma(); await uma(); } // aquecimento (JIT)
const mudou = [], igual = [];
for (let i = 0; i < 100; i++) { passo++; preparar(); mudou.push(await uma()); igual.push(await uma()); }
const est = (a) => { const s = [...a].sort((x, y) => x - y); return `mediana ${s[s.length >> 1].toFixed(2)} ms | p95 ${s[Math.floor(s.length * 0.95)].toFixed(2)} ms | máx ${s[s.length - 1].toFixed(2)} ms`; };
console.log(`rodada sem novidade (38 x 304):        ${est(igual)}`);
console.log(`rodada com os 38 arquivos mudando:      ${est(mudou)}`);
if (parciais.length) console.log(`execuções parciais (só coleta):         ${est(parciais)}`);
console.log(`execuções que montam os arquivos:       ${est(finais)}`);
console.log(`snapshots no índice: ${estado.snapshots.length}; pontos na série: ${estado.series["presidente:6258:br"].length}`);
