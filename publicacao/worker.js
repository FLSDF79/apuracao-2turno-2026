// Worker de produção: o coletor da frente 2 (coletor/cloudflare/worker.js) sem mudanças, mais os
// cabeçalhos de segurança nas respostas de /dados/v1/*. A página estática recebe os mesmos cabeçalhos
// pelo arquivo _headers que publicacao/montar-site.mjs grava.
// Não há rota de administração: intervalo e pausa só mudam por variável no deploy (wrangler.toml / --var).
import coletor from "../coletor/cloudflare/worker.js";
import { CABECALHOS } from "./seguranca.mjs";

export { Coletor } from "../coletor/cloudflare/worker.js";

export function comSeguranca(resp) {
  const r = new Response(resp.body, resp);
  for (const [k, v] of Object.entries(CABECALHOS)) r.headers.set(k, v);
  return r;
}

export default {
  async fetch(req, env, ctx) {
    if (req.method !== "GET" && req.method !== "HEAD") return comSeguranca(new Response("método não permitido", { status: 405, headers: { allow: "GET, HEAD" } }));
    return comSeguranca(await coletor.fetch(req, env, ctx));
  },
  scheduled: coletor.scheduled,
};
