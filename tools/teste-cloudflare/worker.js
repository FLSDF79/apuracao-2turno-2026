// Worker de teste: descobre se o TSE aceita consultas saindo da rede da Cloudflare.
// Faz 3 requisições a arquivos que existem (200 confirmado em 06/10/2026) e devolve
// status e cabeçalhos relevantes. Nenhum dado é guardado. Pode apagar o Worker depois.
const ALVOS = [
  "https://resultados.tse.jus.br/oficial/comum/config/ele-c.json",
  "https://resultados.tse.jus.br/oficial/ele2026/6257/dados/br/br-c0001-e006257-u.json",
];
const CABECALHOS = ["etag", "last-modified", "cache-control", "cdn-cache-status", "x-ratelimit-limit",
  "x-ratelimit-remaining", "retry-after", "server", "content-type", "akamai-grn"];

async function sondar(url, extra = {}) {
  const t0 = Date.now();
  try {
    const r = await fetch(url, { headers: { "User-Agent": "apuracao-2turno-2026 (teste de acesso)", ...extra } });
    const corpo = await r.text();
    const h = Object.fromEntries(CABECALHOS.filter((k) => r.headers.has(k)).map((k) => [k, r.headers.get(k)]));
    return { url, status: r.status, ms: Date.now() - t0, bytes: corpo.length, inicio: corpo.slice(0, 80), cabecalhos: h };
  } catch (e) {
    return { url, erro: String(e), ms: Date.now() - t0 };
  }
}

export default {
  async fetch(req) {
    const resultados = [];
    for (const url of ALVOS) resultados.push(await sondar(url));
    const etag = resultados[1].cabecalhos?.etag;
    if (etag) resultados.push({ condicional: true, ...(await sondar(ALVOS[1], { "If-None-Match": etag })) });
    return Response.json({
      quando: new Date().toISOString(),
      colo: req.cf?.colo ?? null,
      aceito: resultados.every((r) => r.status === 200 || r.status === 304),
      resultados,
    }, { headers: { "cache-control": "no-store" } });
  },
};
