import test from "node:test";
import assert from "node:assert/strict";
import { Fonte } from "../../coletor/fonte.js";
import { rodada } from "../../coletor/rodada.js";
import { fetchDeFixtures } from "../../coletor/fixtures.js";
import { carregarEstado, gravarEstado, gravarSaidas } from "../../coletor/cloudflare/armazenamento.js";
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
