import test from "node:test";
import assert from "node:assert/strict";
import { normalizarResultado, inteiro, horarioTSE, ErroFonte } from "../../nucleo/normalizar.js";
import { presidente, governador } from "./apoio.mjs";

test("contagens viram inteiros e campo ausente vira null, não zero", () => {
  assert.equal(inteiro("0"), 0);
  assert.equal(inteiro(undefined), null);
  assert.equal(inteiro(""), null);
  assert.throws(() => inteiro("12,5"), ErroFonte);
  assert.throws(() => inteiro("-3"), ErroFonte);
  const bruto = presidente("df");
  delete bruto.v.vansj;
  const r = normalizarResultado(bruto);
  assert.equal(r.votos.anulados_sub_judice, null);
  assert.equal(r.votos.anulados, 0); // zero confirmado continua zero
});

test("horário do TSE vira ISO em Brasília (-03:00)", () => {
  assert.equal(horarioTSE("05/10/2026", "12:51:05"), "2026-10-05T12:51:05-03:00");
  assert.equal(horarioTSE("", "12:00:00"), null);
  const r = normalizarResultado(presidente("df"));
  assert.equal(r.horario.totalizacao, "2026-10-05T12:51:05-03:00");
});

test("arquivo de outra eleição, cargo ou recorte é rejeitado", () => {
  assert.throws(() => normalizarResultado(presidente("df"), { eleicao: "6258" }), /eleicao=6257/);
  assert.throws(() => normalizarResultado(presidente("df"), { territorio: "go" }), /territorio=df/);
  assert.throws(() => normalizarResultado(governador("df"), { cargo: 1 }), /cargo=3/);
  assert.doesNotThrow(() => normalizarResultado(presidente("zz"), { eleicao: "6257", cargo: 1, territorio: "zz" }));
});

test("'eleito' só vem da situação textual: o campo e='s' aparece até para quem foi ao 2º turno", () => {
  const r = normalizarResultado(presidente("df"));
  const flavio = r.candidatos.find((c) => c.numero === "22");
  assert.equal(flavio.situacao, "2º turno");
  assert.equal(flavio.eleito_publicado, false);
  const eleitos = ["ac", "es", "df"].flatMap((uf) => normalizarResultado(governador(uf)).candidatos.filter((c) => c.eleito_publicado));
  assert.deepEqual(eleitos, []);
});

test("metadados do candidato: partido, federação e vice", () => {
  const lula = normalizarResultado(presidente("br")).candidatos.find((c) => c.numero === "13");
  assert.equal(lula.partido.sigla, "PT");
  assert.equal(lula.federacao.numero, "101");
  assert.equal(lula.vice.nome_urna, "GERALDO ALCKMIN");
  assert.match(lula.sqcand, /^\d+$/);
});
