// O Worker do ensaio recomeça do zero a cada nova noite simulada (ciclo de 30 min). Depois do recomeço,
// o storage tem de ter de novo todas as chaves de uma noite nova: nada pode ficar preso em memória.
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { DURACAO_MIN } from "../../ensaio/roteiro.mjs";

// base-ensaio.mjs importa JSON sem atributo (o wrangler empacota assim); no Node, o carregador abaixo supre o atributo.
register("data:text/javascript," + encodeURIComponent(`export async function load(url, ctx, next) {
  return next(url, url.endsWith(".json") ? { ...ctx, importAttributes: { type: "json" } } : ctx);
}`));

/** Storage em memória com a mesma interface usada pelo coletor no Durable Object. */
function storageFalso() {
  const m = new Map();
  let alarme = null;
  const s = {
    async get(k) { return Array.isArray(k) ? new Map(k.filter((x) => m.has(x)).map((x) => [x, m.get(x)])) : m.get(k); },
    async put(k, v) { if (typeof k === "object") for (const [a, b] of Object.entries(k)) m.set(a, b); else m.set(k, v); },
    async delete(k) { if (Array.isArray(k)) { let n = 0; for (const x of k) n += m.delete(x) ? 1 : 0; return n; } return m.delete(k); },
    async deleteAll() { m.clear(); },
    async list({ prefix = "" } = {}) { return new Map([...m].filter(([k]) => k.startsWith(prefix)).sort(([a], [b]) => (a < b ? -1 : 1))); },
    async getAlarm() { return alarme; },
    async setAlarm(t) { alarme = t; },
    async deleteAlarm() { alarme = null; },
    async transaction(f) { return f(s); },
    mapa: m,
  };
  return s;
}

test("ensaio publicado: novo ciclo recomeça do zero, sem estado preso em memória", async () => {
  const inicio = Date.parse("2026-10-01T00:00:00Z");
  const ciclo = (DURACAO_MIN + 4) * 60000;
  const agoraReal = Date.now;
  // relógio deslocado (não congelado): o limitador de requisições da Fonte espera em tempo real
  let delta = 0;
  const irPara = (t) => { delta = t - agoraReal(); };
  const avancar = (ms) => { delta += ms; };
  irPara(inicio + 23 * 60000); // fim da noite: tudo apurado
  Date.now = () => agoraReal() + delta;
  try {
    const { Coletor } = await import("../../publicacao/worker-ensaio.js");
    const env = { MODO: "simulacao", BASE: "https://tse-simulado.ensaio.invalid", HOSTS_EXTRAS_TESTE: "tse-simulado.ensaio.invalid", INTERVALO_S: "15", PAUSADO: "nao", ENSAIO_INICIO: "2026-10-01T00:00:00Z", MAX_NOVOS_POR_EXECUCAO: "1000" };
    const storage = storageFalso();
    const c = new Coletor({ storage }, env);
    const presidente = async () => {
      const r = await c.fetch(new Request("https://x/dados/v1/presidente.json"));
      return r.status === 200 ? r.json() : null;
    };
    for (let i = 0; i < 3; i++) { await c.alarm(); avancar(15000); }
    const fimNoite = await presidente();
    assert.ok(fimNoite.totalizacao?.percentual > 90 || fimNoite.estado_publicacao === "concluida", "fim da noite apurado");

    // noite seguinte, minuto 5 (resultados ainda zerados no roteiro)
    irPara(inicio + ciclo + 5 * 60000);
    for (let i = 0; i < 3; i++) { await c.alarm(); avancar(15000); }
    const novaNoite = await presidente();
    assert.notEqual(novaNoite.estado_publicacao, "concluida", "nova noite não pode herdar a apuração anterior");

    // mesmas chaves que um coletor novo, no mesmo instante, grava
    const s2 = storageFalso();
    const c2 = new Coletor({ storage: s2 }, env);
    irPara(inicio + ciclo + 5 * 60000);
    for (let i = 0; i < 3; i++) { await c2.alarm(); avancar(15000); }
    const faltando = [...s2.mapa.keys()].filter((k) => !storage.mapa.has(k));
    assert.deepEqual(faltando, [], "chaves que sumiram depois do recomeço");
  } finally {
    Date.now = agoraReal;
  }
});
