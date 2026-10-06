// Coletor na Cloudflare: um Durable Object único roda a rodada a cada INTERVALO_S segundos (alarme)
// e guarda os arquivos do contrato; o Worker serve /dados/v1/* para todos os visitantes com cache curto.
// Assim o TSE recebe as mesmas ~2,5 req/s, tenha o painel 10 ou 100 mil visitantes.
//
// Administração: /admin/* exige "Authorization: Bearer <ADMIN_TOKEN>" (segredo do Worker, criado com
// `wrangler secret put ADMIN_TOKEN`; nunca vai para o frontend). Sem o segredo, a administração fica desligada.
import { Fonte } from "../../conectores/http.js";
import { rodada, OPCOES_PADRAO } from "../../coletor/rodada.js";
import { carregarEstado, gravarEstado, gravarSaidas, lerBruto } from "../../armazenamento/durable-object.js";

const TIPOS = { json: "application/json; charset=utf-8", csv: "text/csv; charset=utf-8" };
const CAMINHO_PUBLICO = /^\/dados\/v1\/(?:[a-z]+\.json|export\/[a-z]+\.csv|snapshots\/[0-9a-f]{64}\.json)$/;

function opcoes(env) {
  return {
    modo: env.MODO || OPCOES_PADRAO.modo,
    base: env.BASE || OPCOES_PADRAO.base,
    ambiente: env.AMBIENTE || OPCOES_PADRAO.ambiente,
    intervaloS: Math.max(10, Number(env.INTERVALO_S || OPCOES_PADRAO.intervaloS)),
  };
}

function hostsExtras(env) {
  return (env.HOSTS_EXTRAS_TESTE || "").split(",").map((s) => s.trim()).filter(Boolean);
}

export class Coletor {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.estado = null;
  }

  async pausado() {
    return this.env.PAUSADO === "sim" || (await this.state.storage.get("controle:pausado")) === true;
  }

  async garantirAlarme() {
    if (await this.pausado()) return;
    if (!(await this.state.storage.getAlarm())) await this.state.storage.setAlarm(Date.now() + 1000);
  }

  async executarRodada() {
    const op = opcoes(this.env);
    // O estado fica em memória enquanto o objeto vive; o storage só é lido quando ele (re)começa.
    const estado = this.estado ?? (await carregarEstado(this.state.storage));
    const fonte = new Fonte({ estado: estado?.fonte, hostsExtras: hostsExtras(this.env) });
    const r = await rodada(fonte, estado, op);
    const linhas = (await gravarEstado(this.state.storage, r.estado)) + (await gravarSaidas(this.state.storage, r.saidas, r.brutos));
    this.estado = JSON.parse(JSON.stringify(r.estado));
    console.log(JSON.stringify({ rodada: r.saidas["v1/saude.json"]?.coletor?.rodada_em, chaves_gravadas: linhas }));
    return r;
  }

  async alarm() {
    if (await this.pausado()) return;
    await this.state.storage.setAlarm(Date.now() + opcoes(this.env).intervaloS * 1000);
    await this.executarRodada();
  }

  async fetch(req) {
    const caminho = new URL(req.url).pathname;
    if (caminho === "/_garantir") {
      await this.garantirAlarme();
      return new Response("ok");
    }
    if (caminho === "/_admin/pausar") {
      await this.state.storage.put("controle:pausado", true);
      await this.state.storage.deleteAlarm();
      return Response.json({ pausado: true });
    }
    if (caminho === "/_admin/retomar") {
      await this.state.storage.put("controle:pausado", false);
      await this.garantirAlarme();
      return Response.json({ pausado: false });
    }
    if (caminho === "/_admin/rodada") {
      const r = await this.executarRodada();
      return Response.json(r.saidas["v1/saude.json"]);
    }
    if (caminho === "/_admin/estado") {
      const saude = await this.state.storage.get("saida:v1/saude.json");
      return Response.json({ pausado: await this.pausado(), alarme: await this.state.storage.getAlarm(), saude: saude ? JSON.parse(saude) : null });
    }
    const snap = /^\/dados\/v1\/snapshots\/([0-9a-f]{64})\.json$/.exec(caminho);
    if (snap) {
      const bruto = await lerBruto(this.state.storage, snap[1]);
      return bruto === undefined ? new Response("snapshot não encontrado", { status: 404 }) : new Response(bruto, { headers: { "content-type": TIPOS.json, "cache-control": "public, max-age=31536000, immutable" } });
    }
    const conteudo = await this.state.storage.get(`saida:${caminho.replace(/^\/dados\//, "")}`);
    if (conteudo === undefined) return new Response("ainda não gerado", { status: 404 });
    return new Response(conteudo, { headers: { "content-type": TIPOS[caminho.split(".").pop()] ?? "application/octet-stream" } });
  }
}

const coletor = (env) => env.COLETOR.get(env.COLETOR.idFromName("principal"));

/** Comparação em tempo constante para o token de administração. */
export function tokenConfere(recebido, esperado) {
  if (typeof esperado !== "string" || esperado.length < 32 || typeof recebido !== "string") return false;
  const a = new TextEncoder().encode(recebido), b = new TextEncoder().encode(esperado);
  let dif = a.length ^ b.length;
  for (let i = 0; i < b.length; i++) dif |= (a[i] ?? 0) ^ b[i];
  return dif === 0;
}

async function admin(req, env, url) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!tokenConfere(token, env.ADMIN_TOKEN)) return new Response("não autorizado", { status: 401 });
  const acao = url.pathname.slice("/admin/".length);
  if (!["estado", "pausar", "retomar", "rodada"].includes(acao)) return new Response("não encontrado", { status: 404 });
  if (acao !== "estado" && req.method !== "POST") return new Response("use POST", { status: 405 });
  return coletor(env).fetch(new Request(`https://coletor/_admin/${acao}`));
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (url.pathname.startsWith("/admin/")) return admin(req, env, url);
    if (req.method !== "GET" && req.method !== "HEAD") return new Response("método não permitido", { status: 405 });
    if (!CAMINHO_PUBLICO.test(url.pathname)) return new Response("não encontrado", { status: 404 });
    const cache = caches.default;
    const chave = new Request(url.origin + url.pathname);
    let resp = await cache.match(chave);
    if (!resp) {
      const r = await coletor(env).fetch(new Request(`https://coletor${url.pathname}`));
      resp = new Response(r.body, r);
      if (!resp.headers.has("cache-control")) resp.headers.set("cache-control", r.ok ? "public, max-age=5" : "no-store");
      resp.headers.set("access-control-allow-origin", "*");
      resp.headers.set("x-content-type-options", "nosniff");
      if (r.ok) ctx.waitUntil(cache.put(chave, resp.clone()));
    }
    return resp;
  },
  // Cron de 1 em 1 minuto só como vigia: garante que o alarme do coletor está armado.
  async scheduled(_evt, env) {
    await coletor(env).fetch(new Request("https://coletor/_garantir"));
  },
};
