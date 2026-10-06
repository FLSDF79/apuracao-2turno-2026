import test from "node:test";
import assert from "node:assert/strict";
import { Fonte } from "../../backend/conectores/http.js";
import { rodada } from "../../backend/coletor/rodada.js";
import { fetchDeFixtures } from "../../backend/conectores/fixtures.js";
import { carregarEstado, gravarEstado, gravarSaidas, esquecerGravados } from "../../backend/armazenamento/durable-object.js";
import { RAIZ, relogio } from "./apoio.mjs";

// Imitação mínima do storage de Durable Object (get, put em lote com limite de 128, list por prefixo)
function storageFalso() {
  const m = new Map();
  return {
    m,
    async get(k) { return m.has(k) ? structuredClone(m.get(k)) : undefined; },
    async put(obj) {
      assert.ok(Object.keys(obj).length <= 128);
      for (const [k, v] of Object.entries(obj)) {
        assert.ok(JSON.stringify(v).length < 2 * 1024 * 1024, `valor grande demais em ${k}`);
        m.set(k, structuredClone(v));
      }
    },
    async list({ prefix }) { return new Map([...m].filter(([k]) => k.startsWith(prefix)).map(([k, v]) => [k, structuredClone(v)])); },
  };
}

test("estado dividido no storage do Durable Object volta igual e a rodada seguinte usa 304", async () => {
  const st = storageFalso();
  const rel = relogio();
  const r1 = await rodada(new Fonte({ fetch: fetchDeFixtures(RAIZ), ...rel }), null, { modo: "ensaio" });
  await gravarEstado(st, r1.estado);
  await gravarSaidas(st, r1.saidas);
  const volta = await carregarEstado(st);
  assert.deepEqual(volta, JSON.parse(JSON.stringify(r1.estado)));
  assert.equal(JSON.parse(await st.get("saida:v1/presidente.json")).schema, "apuracao-2t-2026/v1");
  rel.avancar(15000);
  const r2 = await rodada(new Fonte({ fetch: fetchDeFixtures(RAIZ), ...rel, estado: volta.fonte }), volta, { modo: "ensaio" });
  assert.deepEqual(r2.saidas["v1/saude.json"].coletor.status_http, { 304: 36 });
});

test("plano gratuito: rodada sem novidade do TSE regrava poucas chaves (linhas gravadas por dia)", async () => {
  const st = storageFalso();
  const rel = relogio();
  let estado = null;
  const gravadas = [];
  for (let i = 0; i < 4; i++) {
    const r = await rodada(new Fonte({ fetch: fetchDeFixtures(RAIZ), ...rel, estado: estado?.fonte }), estado, { modo: "ensaio" });
    gravadas.push((await gravarEstado(st, r.estado)) + (await gravarSaidas(st, r.saidas, r.brutos)));
    estado = JSON.parse(JSON.stringify(r.estado));
    rel.avancar(15000);
  }
  assert.ok(gravadas[0] > 50, `primeira rodada grava tudo (${gravadas[0]})`);
  // 5.760 rodadas/dia a cada 15 s; o plano gratuito permite 100 mil linhas gravadas por dia.
  for (const n of gravadas.slice(1)) assert.ok(n * 5760 < 100000, `rodada sem novidade gravou ${n} chaves`);
});

test("depois de apagar o storage, esquecerGravados faz tudo ser gravado de novo", async () => {
  const st = storageFalso();
  const r = await rodada(new Fonte({ fetch: fetchDeFixtures(RAIZ), ...relogio() }), null, { modo: "ensaio" });
  await gravarEstado(st, r.estado);
  await gravarSaidas(st, r.saidas, r.brutos);
  st.m.clear(); // storage.deleteAll()
  assert.equal(await gravarSaidas(st, r.saidas, r.brutos), 0); // sem esquecer: acha que já gravou
  esquecerGravados(st);
  assert.ok((await gravarEstado(st, r.estado)) > 0);
  assert.ok((await gravarSaidas(st, r.saidas, r.brutos)) > 0);
  assert.ok(await st.get("saida:v1/territorios.json"));
});
