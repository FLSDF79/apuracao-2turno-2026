// Worker de produção: o coletor da frente 2 (backend/execucao/cloudflare/worker.js) sem mudanças, mais os
// cabeçalhos de segurança nas respostas de /dados/v1/*. A página estática recebe os mesmos cabeçalhos
// pelo arquivo _headers que publicacao/montar-site.mjs grava.
// Administração (/admin/*, com Bearer ADMIN_TOKEN) é da frente 2; aqui só se deixa passar POST para ela.
import coletor from "../backend/execucao/cloudflare/worker.js";
import { CABECALHOS } from "./seguranca.mjs";

export { Coletor } from "../backend/execucao/cloudflare/worker.js";

export function comSeguranca(resp) {
  const r = new Response(resp.body, resp);
  for (const [k, v] of Object.entries(CABECALHOS)) r.headers.set(k, v);
  return r;
}

export default {
  async fetch(req, env, ctx) {
    if (!["GET", "HEAD"].includes(req.method) && !(req.method === "POST" && new URL(req.url).pathname.startsWith("/admin/"))) return comSeguranca(new Response("método não permitido", { status: 405, headers: { allow: "GET, HEAD" } }));
    return comSeguranca(await coletor.fetch(req, env, ctx));
  },
  scheduled: coletor.scheduled,
};
