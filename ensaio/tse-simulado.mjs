// "TSE simulado" do ensaio geral: serve, por HTTP, os mesmos caminhos do servidor de resultados do TSE
// (/oficial/comum/config/ele-c.json, /oficial/ele2026/<eleição>/dados/...), com o conteúdo que o roteiro
// (ensaio/roteiro.mjs) define para o instante atual. Responde ETag/304 e injeta as falhas do roteiro.
//
// Usa Request/Response da plataforma web, então o mesmo handler roda em Node 22 (ensaio local)
// e num Worker da Cloudflare (ensaio publicado).
import { montarSite } from "../backend/conectores/simulador.js";
import { COMPONENTES_BRASIL } from "../backend/normalizacao/territorios.js";
import { noite, DURACAO_MIN } from "./roteiro.mjs";

function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(16);
}

/**
 * @param base       { cfg, pres, gov } de backend/conectores/simulador.js#carregarBase (ou montado a partir de JSON importado)
 * @param inicioMs   instante real do início do ensaio
 * @param agora      relógio (injetável)
 * @param ciclico    se true, a noite recomeça depois de DURACAO_MIN + 4 min (ensaio publicado que fica no ar)
 */
export function criarTseSimulado({ base, inicioMs, agora = () => Date.now(), ciclico = false, registro = null }) {
  let cacheChave = null, cacheSite = null;
  const minuto = () => {
    const t = (agora() - inicioMs) / 60000;
    return ciclico ? ((t % (DURACAO_MIN + 4)) + DURACAO_MIN + 4) % (DURACAO_MIN + 4) : t;
  };

  return async function responder(req) {
    const url = new URL(req.url);
    const t = minuto();
    const inicioCiclo = agora() - t * 60000;
    if (url.pathname === "/_ensaio") return Response.json({ minuto: t, ...noite(t, inicioCiclo, COMPONENTES_BRASIL).marco });
    const { cenario, falha } = noite(t, inicioCiclo, COMPONENTES_BRASIL);
    const rel = url.pathname.replace(/^\//, "");
    registro?.({ t, rel, falha: falha?.status ?? null });

    if (falha && (!falha.so || falha.so.test(rel))) {
      const h = falha.retryAfter ? { "retry-after": String(falha.retryAfter) } : {};
      return new Response(falha.status === 404 ? "<Error><Code>NoSuchKey</Code></Error>" : `erro simulado ${falha.status}`, { status: falha.status, headers: h });
    }

    const chave = JSON.stringify(cenario);
    if (chave !== cacheChave) {
      cacheSite = montarSite(base, cenario);
      cacheChave = chave;
    }
    if (!(rel in cacheSite)) return new Response("<Error><Code>NoSuchKey</Code></Error>", { status: 404, headers: { "content-type": "application/xml" } });
    const corpo = JSON.stringify(cacheSite[rel]);
    const etag = `"${hash(corpo)}"`;
    const comuns = { etag, "cache-control": "no-cache", "access-control-allow-origin": "*" };
    if (req.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers: comuns });
    return new Response(corpo, { status: 200, headers: { ...comuns, "content-type": "application/json" } });
  };
}
