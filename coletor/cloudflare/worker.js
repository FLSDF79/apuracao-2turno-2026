// Coletor na Cloudflare: um Durable Object único roda a rodada a cada INTERVALO_S segundos (alarme)
// e guarda os arquivos do contrato; o Worker serve /dados/v1/* para todos os visitantes com cache curto.
// Assim o TSE recebe as mesmas ~2,5 req/s, tenha o painel 10 ou 100 mil visitantes.
import { Fonte } from "../fonte.js";
import { rodada, OPCOES_PADRAO } from "../rodada.js";
import { carregarEstado, gravarEstado, gravarSaidas } from "./armazenamento.js";

const TIPOS = { json: "application/json; charset=utf-8", csv: "text/csv; charset=utf-8" };

function opcoes(env) {
  return {
    modo: env.MODO || OPCOES_PADRAO.modo,
    base: env.BASE || OPCOES_PADRAO.base,
    ambiente: env.AMBIENTE || OPCOES_PADRAO.ambiente,
    intervaloS: Math.max(10, Number(env.INTERVALO_S || OPCOES_PADRAO.intervaloS)),
  };
}

export class Coletor {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async garantirAlarme() {
    if (this.env.PAUSADO === "sim") return;
    if (!(await this.state.storage.getAlarm())) await this.state.storage.setAlarm(Date.now() + 1000);
  }

  async alarm() {
    const op = opcoes(this.env);
    if (this.env.PAUSADO !== "sim") await this.state.storage.setAlarm(Date.now() + op.intervaloS * 1000);
    const estado = await carregarEstado(this.state.storage);
    const fonte = new Fonte({ estado: estado?.fonte });
    const r = await rodada(fonte, estado, op);
    await gravarEstado(this.state.storage, r.estado);
    await gravarSaidas(this.state.storage, r.saidas);
  }

  async fetch(req) {
    const caminho = new URL(req.url).pathname;
    if (caminho === "/_garantir") {
      await this.garantirAlarme();
      return new Response("ok");
    }
    const conteudo = await this.state.storage.get(`saida:${caminho.replace(/^\/dados\//, "")}`);
    if (conteudo === undefined) return new Response("ainda não gerado", { status: 404 });
    return new Response(conteudo, { headers: { "content-type": TIPOS[caminho.split(".").pop()] ?? "application/octet-stream" } });
  }
}

const coletor = (env) => env.COLETOR.get(env.COLETOR.idFromName("principal"));

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (!url.pathname.startsWith("/dados/v1/")) return new Response("não encontrado", { status: 404 });
    const cache = caches.default;
    const chave = new Request(url.origin + url.pathname);
    let resp = await cache.match(chave);
    if (!resp) {
      const r = await coletor(env).fetch(new Request(`https://coletor${url.pathname}`));
      resp = new Response(r.body, r);
      resp.headers.set("cache-control", r.ok ? "public, max-age=5" : "no-store");
      resp.headers.set("access-control-allow-origin", "*");
      if (r.ok) ctx.waitUntil(cache.put(chave, resp.clone()));
    }
    return resp;
  },
  // Cron de 1 em 1 minuto só como vigia: garante que o alarme do coletor está armado.
  async scheduled(_evt, env) {
    await coletor(env).fetch(new Request("https://coletor/_garantir"));
  },
};
