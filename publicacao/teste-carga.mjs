#!/usr/bin/env node
// Teste de carga simples (sem dependências): N conexões simultâneas pedindo, em ciclo, o que um visitante
// pede a cada atualização da página (presidente, histórico, governador, saúde). Mede vazão, latência e erros.
//
//   node publicacao/teste-carga.mjs <url> [--conexoes 200] [--segundos 30]
//
// Rodado contra `wrangler dev` mede o nosso código (Worker + cache + Durable Object) numa máquina só,
// não a rede da Cloudflare. Não rode contra o TSE nem contra o site de outra pessoa.
import { parseArgs } from "node:util";

const { values: a, positionals } = parseArgs({ allowPositionals: true, options: { conexoes: { type: "string", default: "200" }, segundos: { type: "string", default: "30" } } });
const base = (positionals[0] || "").replace(/\/$/, "");
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(base) && !process.env.CARGA_AUTORIZADA) {
  console.error("por segurança, só roda contra localhost; para um site publicado SEU, defina CARGA_AUTORIZADA=1");
  process.exit(2);
}
const CAMINHOS = ["/dados/v1/presidente.json", "/dados/v1/historico.json", "/dados/v1/governador.json", "/dados/v1/saude.json"];
const fim = Date.now() + Number(a.segundos) * 1000;
const tempos = [], status = {};
let bytes = 0;

async function conexao(i) {
  let k = i;
  while (Date.now() < fim) {
    const t0 = performance.now();
    try {
      const r = await fetch(base + CAMINHOS[k++ % CAMINHOS.length]);
      bytes += (await r.arrayBuffer()).byteLength;
      status[r.status] = (status[r.status] ?? 0) + 1;
    } catch (e) {
      status[e.cause?.code || "erro"] = (status[e.cause?.code || "erro"] ?? 0) + 1;
    }
    tempos.push(performance.now() - t0);
  }
}

const t0 = Date.now();
await Promise.all(Array.from({ length: Number(a.conexoes) }, (_, i) => conexao(i)));
const dur = (Date.now() - t0) / 1000;
tempos.sort((x, y) => x - y);
const q = (p) => +tempos[Math.min(tempos.length - 1, Math.floor(tempos.length * p))].toFixed(1);
const res = { url: base, conexoes: +a.conexoes, segundos: +dur.toFixed(1), requisicoes: tempos.length, por_segundo: Math.round(tempos.length / dur), latencia_ms: { p50: q(0.5), p95: q(0.95), p99: q(0.99), max: q(1) }, status, mb: +(bytes / 1e6).toFixed(1) };
console.log(JSON.stringify(res, null, 1));
