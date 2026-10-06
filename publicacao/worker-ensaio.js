// Worker do ENSAIO publicado: o mesmo coletor e a mesma página da produção, mas consultando um
// "TSE simulado" que roda dentro deste Worker (ensaio/tse-simulado.mjs + ensaio/roteiro.mjs),
// com a noite de apuração repetindo a cada 30 min. Nunca consulta o TSE de verdade.
// Os votos são do 1º turno, escalados: não são resultado.
import producao, { Coletor as ColetorProducao } from "../backend/execucao/cloudflare/worker.js";
import { comSeguranca } from "./worker.js";
import { criarTseSimulado } from "../ensaio/tse-simulado.mjs";
import base from "./base-ensaio.mjs";
import { DURACAO_MIN } from "../ensaio/roteiro.mjs";
import { esquecerGravados } from "../backend/armazenamento/durable-object.js";

const CICLO_MS = (DURACAO_MIN + 4) * 60000; // mesmo ciclo de ensaio/tse-simulado.mjs (ciclico)

const BASE_SIMULADA = "https://tse-simulado.ensaio.invalid"; // domínio que não existe: nada sai para a rede

let tse = null;
const simulador = (env) => (tse ??= criarTseSimulado({ base, inicioMs: Date.parse(env.ENSAIO_INICIO || "2026-10-01T00:00:00Z"), ciclico: true }));

// O coletor de produção usa o fetch global; aqui ele é desviado para o TSE simulado só para a BASE simulada.
export class Coletor extends ColetorProducao {
  constructor(state, env) {
    super(state, env);
    const original = globalThis.fetch;
    if (!original.__ensaio) {
      const desviado = (entrada, init) => {
        const url = typeof entrada === "string" ? entrada : entrada.url;
        return url.startsWith(BASE_SIMULADA) ? simulador(env)(new Request(url.replace(BASE_SIMULADA, "https://tse"), init)) : original(entrada, init);
      };
      desviado.__ensaio = true;
      globalThis.fetch = desviado;
    }
  }

  // A cada nova noite simulada, o coletor recomeça do zero (o TSE real nunca "despublica"; o ciclo do ensaio sim).
  async alarm() {
    const ciclo = Math.floor((Date.now() - Date.parse(this.env.ENSAIO_INICIO || "2026-10-01T00:00:00Z")) / CICLO_MS);
    if ((await this.state.storage.get("ensaio:ciclo")) !== ciclo) {
      await this.state.storage.deleteAll();
      await this.state.storage.put("ensaio:ciclo", ciclo);
      // O coletor guarda em memória o estado e o último valor gravado de cada chave: depois de apagar tudo,
      // os dois precisam ser esquecidos para a primeira rodada da nova noite regravar todas as chaves.
      esquecerGravados(this.state.storage);
      this.estado = null;
    }
    return super.alarm();
  }
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    // o "TSE simulado" também fica visível, para quem quiser ver o que o coletor está lendo
    if (!["GET", "HEAD"].includes(req.method) && !(req.method === "POST" && url.pathname.startsWith("/admin/"))) return comSeguranca(new Response("método não permitido", { status: 405 }));
    if (url.pathname.startsWith("/oficial/") || url.pathname === "/_ensaio") return comSeguranca(await simulador(env)(req));
    return comSeguranca(await producao.fetch(req, env, ctx));
  },
  scheduled: producao.scheduled,
};
