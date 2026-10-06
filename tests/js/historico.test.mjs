import test from "node:test";
import assert from "node:assert/strict";
import { normalizarResultado } from "../../backend/normalizacao/normalizar.js";
import { registrarVersao } from "../../backend/agregacao/historico.js";
import { presidente } from "./apoio.mjs";

test("mesma versão não duplica; versão nova substitui (não soma); queda vira correção aceita", () => {
  const v1 = normalizarResultado(presidente("ac"));
  let r = registrarVersao(null, v1, "t1");
  assert.equal(r.nova, true);
  r = registrarVersao(r.historico, v1, "t2");
  assert.equal(r.nova, false);
  assert.equal(r.historico.versoes.length, 1);

  const v2 = structuredClone(v1);
  v2.idg = "999";
  v2.candidatos[0].votos -= 7; // correção oficial para baixo
  const r2 = registrarVersao(r.historico, v2, "t3");
  assert.equal(r2.nova, true);
  assert.ok(r2.correcao);
  assert.equal(r2.correcao.quedas[0].antes - r2.correcao.quedas[0].depois, 7);
  // o valor guardado é o novo, sem forçar crescimento
  assert.equal(r2.historico.versoes.at(-1).votos[v1.candidatos[0].numero], v1.candidatos[0].votos - 7);
  assert.equal(r2.historico.correcoes.length, 1);
});
