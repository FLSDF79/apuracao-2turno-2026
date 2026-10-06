// Testes da interface (sem dependências): node --test tests/interface/*.test.js
// Usam os exemplos que o próprio coletor gera no contrato v1 (exemplos/).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizar, normalizarHistorico, normalizarGovernador, normalizarSaude, visualTerritorio, faixaMargem, UFS, REGIOES } from "../../js/contrato.js";
import * as F from "../../js/formato.js";
import { carregarCores, trocar } from "../../js/cores.js";
import { csvHistorico } from "../../js/exportar.js";

const CFG = {
  candidatos: [
    { numero: "22", nome: "Flávio Bolsonaro", partido: "PL", cor: "azul" },
    { numero: "13", nome: "Lula", partido: "PT", cor: "vermelho" }
  ]
};
const ler = (p) => JSON.parse(readFileSync(new URL("../../" + p, import.meta.url)));
const ensaio = ler("exemplos/ensaio-1turno/v1/presidente.json");
const simulado = ler("exemplos/simulado-2turno/v1/presidente.json");

test("lê o ensaio do 1º turno sem problemas e com os votos oficiais", () => {
  const { modelo, problemas } = normalizar(ensaio, CFG);
  assert.deepEqual(problemas, []);
  assert.equal(modelo.territorios.br.candidatos["22"].votos, 56104503);
  assert.equal(modelo.territorios.br.candidatos["13"].votos, 53879538);
  assert.equal(modelo.candidatos.principais.map((c) => c.numero).join(), "22,13");
  assert.equal(modelo.candidatos.outros.length, 10);
  assert.equal(modelo.eleicao.modo, "ensaio");
});

test("todos os territórios, regiões e Brasil calculado chegam à tela", () => {
  const { modelo } = normalizar(simulado, CFG);
  for (const id of [...UFS, "zz", "br", "br-calculado", ...REGIOES.map((r) => r.id)]) {
    assert.ok(modelo.territorios[id] && !modelo.territorios[id].ausente, id);
  }
  assert.equal(modelo.territorios.sp.regiao, "se");
});

test("não mostra eleito sem publicação oficial (o campo e = s dos classificados não conta)", () => {
  assert.equal(normalizar(ensaio, CFG).modelo.territorios.br.eleito, null);
  const snap = structuredClone(simulado);
  snap.eleito = { publicado: true, candidatos: ["13"], fonte: "br" };
  assert.equal(normalizar(snap, CFG).modelo.territorios.br.eleito, "13");
});

test("percentuais e diferença vêm do coletor, sem recálculo", () => {
  const { modelo } = normalizar(simulado, CFG);
  const r = simulado.brasil.oficial;
  assert.equal(modelo.territorios.br.candidatos["22"].pct, r.candidatos.find((c) => c.numero === "22").pct_validos);
  assert.equal(modelo.territorios.br.margem.votos, r.disputa.diferenca_votos);
  assert.equal(modelo.territorios.br.secoes.pct, r.indicadores.pct_totalizadas);
});

test("recorte que falhou fica defasado, e sem arquivo fica indisponível ou aguardando, nunca zero", () => {
  const snap = structuredClone(simulado);
  snap.territorios.ma.coleta.situacao = "defasado";
  snap.territorios.ap.coleta.situacao = "indisponivel";
  snap.territorios.ap.resultado = null;
  snap.territorios.rr.coleta.situacao = "nao_publicado";
  snap.territorios.rr.resultado = null;
  const { modelo } = normalizar(snap, CFG);
  assert.equal(visualTerritorio(modelo.territorios.ma).defasada, true);
  assert.equal(visualTerritorio(modelo.territorios.ap).estado, "indisponivel");
  assert.equal(modelo.territorios.rr.situacao, "nao_iniciada");
  assert.equal(F.int(modelo.territorios.ap.votos.brancos), "—");
});

test("campo ausente vira null (travessão); zero confirmado continua 0", () => {
  const snap = structuredClone(ensaio);
  delete snap.territorios.sp.resultado.votos.brancos;
  const { modelo } = normalizar(snap, CFG);
  assert.equal(modelo.territorios.sp.votos.brancos, null);
  assert.equal(F.int(modelo.territorios.sp.votos.brancos), "—");
  assert.equal(modelo.territorios.br.votos.anuladosSubJudice, 0);
  assert.equal(F.int(0), "0");
});

test("empate e sem votos são estados próprios, não cor de candidato", () => {
  const snap = structuredClone(simulado);
  snap.territorios.ac.resultado.disputa = { situacao: "empate", lider: null, segundo: null, diferenca_votos: 0, diferenca_pontos: 0 };
  snap.territorios.am.resultado.disputa = { situacao: "sem_votos" };
  const { modelo } = normalizar(snap, CFG);
  assert.equal(visualTerritorio(modelo.territorios.ac).estado, "empate");
  assert.equal(visualTerritorio(modelo.territorios.am).estado, "sem_dados");
});

test("conferência: classificação, aviso e linhas A × B vêm prontos", () => {
  const { modelo } = normalizar(simulado, CFG);
  const c = modelo.conferencia;
  assert.equal(c.situacao, simulado.conferencia.classificacao.codigo);
  assert.ok(c.aviso.includes("não é auditoria"));
  const l22 = c.linhas.find((l) => l.item === "22");
  assert.equal(l22.diferenca, l22.soma - l22.tse);
});

test("faixas de margem para a intensidade do mapa", () => {
  assert.equal(faixaMargem(null), null);
  assert.equal(faixaMargem(0.4), 0);
  assert.equal(faixaMargem(-7), 1);
  assert.equal(faixaMargem(12), 2);
  assert.equal(faixaMargem(35), 3);
});

test("histórico ordenado pelo horário do TSE e com correções mantidas", () => {
  const h = normalizarHistorico(ler("exemplos/simulado-2turno/v1/historico.json"));
  assert.ok(h.length > 2);
  assert.ok(h.every((p, i) => i === 0 || p.t >= h[i - 1].t));
  const csv = csvHistorico(h, CFG.candidatos);
  assert.equal(csv.trim().split("\r\n").length, h.length + 1);
});

test("governador: 7 UFs, separado do presidente, com nomes dos candidatos", () => {
  const g = normalizarGovernador(ler("exemplos/simulado-2turno/v1/governador.json"));
  assert.deepEqual(Object.keys(g.ufs).sort(), ["ac", "am", "df", "es", "rj", "rn", "to"]);
  assert.equal(g.ufs.df.candidatosInfo["11"].partido, "PP");
});

test("saúde do coletor", () => {
  const s = normalizarSaude(ler("exemplos/simulado-2turno/v1/saude.json"));
  assert.equal(s.estado, "ok");
  assert.ok(s.origem.includes("TRE"));
});

test("cores fixas: troca persiste e não aceita duas cores iguais", () => {
  const mem = new Map();
  const armazem = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  assert.deepEqual(carregarCores(CFG.candidatos, armazem), { 22: "azul", 13: "vermelho" });
  assert.deepEqual(trocar({ 22: "azul", 13: "vermelho" }), { 22: "vermelho", 13: "azul" });
  mem.set("apuracao2026.cores", JSON.stringify({ 22: "azul", 13: "azul" }));
  assert.deepEqual(carregarCores(CFG.candidatos, armazem), { 22: "azul", 13: "vermelho" });
  mem.set("apuracao2026.cores", JSON.stringify({ 22: "vermelho", 13: "azul" }));
  assert.deepEqual(carregarCores(CFG.candidatos, armazem), { 22: "vermelho", 13: "azul" });
});

test("horários sempre em Brasília", () => {
  assert.equal(F.dh("2026-10-25T22:03:12Z"), "25/10 19:03:12");
  assert.equal(F.h("2026-10-25T19:03:12-03:00"), "19:03:12");
});

test("versão de contrato errada é avisada", () => {
  const snap = structuredClone(ensaio);
  snap.schema = "apuracao-2t-2026/v2";
  assert.ok(normalizar(snap, CFG).problemas.some((p) => p.includes("v2")));
});
