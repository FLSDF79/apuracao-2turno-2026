import test from "node:test";
import assert from "node:assert/strict";
import { normalizarResultado } from "../../nucleo/normalizar.js";
import { agregar, comIndicadores } from "../../nucleo/calcular.js";
import { conferir, AVISO_MESMA_BASE } from "../../nucleo/conferencia.js";
import { COMPONENTES_BRASIL } from "../../nucleo/territorios.js";
import { presidente } from "./apoio.mjs";

const base = () => Object.fromEntries([...COMPONENTES_BRASIL, "br"].map((c) => [c, normalizarResultado(presidente(c))]));
const ab = (t) => [agregar(t, COMPONENTES_BRASIL), comIndicadores(t.br)];

test("arquivos reais do 1º turno: compatível, com aviso de mesma base", () => {
  const c = conferir(...ab(base()));
  assert.equal(c.classificacao.codigo, "compativel");
  assert.equal(c.mesma_base, true);
  assert.equal(c.aviso, AVISO_MESMA_BASE);
  assert.ok(c.linhas.every((l) => l.diferenca === 0));
  // A e B nunca são somados: cada linha guarda os dois lados e a diferença
  const l = c.linhas.find((x) => x.chave === "candidato.13");
  assert.equal(l.a, l.b);
  assert.equal(l.a, 53879538);
});

test("UF ausente ou defasada: cobertura incompleta, com a lista", () => {
  const t = base();
  t.am = null;
  const c = conferir(...ab(t));
  assert.equal(c.classificacao.codigo, "cobertura_incompleta");
  assert.deepEqual(c.colunas.a.faltando, ["am"]);
  const t2 = base();
  t2.sp.candidatos[0].votos += 10;
  const c2 = conferir(...ab(t2), { defasados: ["sp"] });
  assert.equal(c2.classificacao.codigo, "cobertura_incompleta");
  assert.match(c2.classificacao.motivo, /SP/);
});

test("nacional mais novo que uma UF: horários diferentes; a mesma diferença por 10 min vira persistente", () => {
  const t = base();
  t.sp.candidatos.find((c) => c.numero === "13").votos -= 500;
  t.sp.horario.totalizacao = "2026-10-05T12:40:00-03:00";
  const c1 = conferir(...ab(t), { agora: "2026-10-25T21:00:00Z" });
  assert.equal(c1.classificacao.codigo, "horarios_diferentes");
  assert.equal(c1.linhas.find((l) => l.chave === "candidato.13").diferenca, -500);
  const c2 = conferir(...ab(t), { agora: "2026-10-25T21:05:00Z", anterior: c1 });
  assert.equal(c2.classificacao.codigo, "horarios_diferentes");
  const c3 = conferir(...ab(t), { agora: "2026-10-25T21:10:00Z", anterior: c2 });
  assert.equal(c3.classificacao.codigo, "diferenca_persistente");
  assert.equal(c3.classificacao.desde, "2026-10-25T21:00:00Z");
  // se a diferença muda (chegou atualização), o relógio recomeça
  t.sp.candidatos.find((c) => c.numero === "13").votos += 200;
  const c4 = conferir(...ab(t), { agora: "2026-10-25T21:11:00Z", anterior: c3 });
  assert.equal(c4.classificacao.codigo, "horarios_diferentes");
});

test("mesmo horário de totalização e soma diferente: diferença a investigar na hora", () => {
  const t = base();
  t.zz.votos.brancos += 1;
  const c = conferir(...ab(t));
  assert.equal(c.classificacao.codigo, "diferenca_persistente");
  assert.deepEqual(c.linhas.filter((l) => l.diferenca !== 0).map((l) => l.chave), ["votos.brancos"]);
});

test("sem total nacional: cobertura incompleta", () => {
  const t = base();
  const c = conferir(agregar(t, COMPONENTES_BRASIL), null);
  assert.equal(c.classificacao.codigo, "cobertura_incompleta");
});
