// Testes da interface (sem dependências): node --test tests/interface/*.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizar, normalizarHistorico, visualTerritorio, faixaMargem, UFS } from "../../js/contrato.js";
import * as F from "../../js/formato.js";
import { carregarCores, trocar } from "../../js/cores.js";
import { csvTerritorios } from "../../js/exportar.js";

const CFG = {
  candidatos: [
    { numero: "22", nome: "Flávio Bolsonaro", partido: "PL", cor: "azul" },
    { numero: "13", nome: "Lula", partido: "PT", cor: "vermelho" }
  ]
};
const ler = (p) => JSON.parse(readFileSync(new URL("../../" + p, import.meta.url)));
const final1t = ler("dev/amostra/1t-final/estado.json");
const simulacao = ler("dev/amostra/simulacao-parcial/estado.json");

test("normaliza a amostra do 1º turno sem problemas", () => {
  const { modelo, problemas } = normalizar(final1t, CFG);
  assert.deepEqual(problemas, []);
  assert.equal(modelo.territorios.br.candidatos["22"].votos, 56104503);
  assert.equal(modelo.territorios.br.candidatos["13"].votos, 53879538);
  assert.equal(modelo.candidatos.principais.map((c) => c.numero).join(), "22,13");
  assert.equal(modelo.candidatos.outros.length, 10);
});

test("a tela não mostra eleito no 1º turno: 'e = s' dos classificados não conta", () => {
  const { modelo } = normalizar(final1t, CFG);
  assert.equal(modelo.territorios.br.eleito, null);
});

test("território ausente vira indisponível, não zero", () => {
  const snap = structuredClone(final1t);
  delete snap.territorios.ap;
  const { modelo, problemas } = normalizar(snap, CFG);
  assert.equal(modelo.territorios.ap.situacao, "indisponivel");
  assert.equal(visualTerritorio(modelo.territorios.ap).estado, "indisponivel");
  assert.ok(problemas.some((p) => p.includes("ap")));
});

test("campo ausente fica null e é exibido como travessão; zero confirmado aparece como 0", () => {
  const snap = structuredClone(final1t);
  delete snap.territorios.sp.votos.brancos;
  const { modelo } = normalizar(snap, CFG);
  assert.equal(modelo.territorios.sp.votos.brancos, null);
  assert.equal(F.int(modelo.territorios.sp.votos.brancos), "—");
  assert.equal(modelo.territorios.br.votos.anuladosSubJudice, 0);
  assert.equal(F.int(0), "0");
});

test("estados visuais da simulação: indisponível, defasada, sem votos e líder", () => {
  const { modelo } = normalizar(simulacao, CFG);
  assert.equal(visualTerritorio(modelo.territorios.ap).estado, "indisponivel");
  assert.equal(visualTerritorio(modelo.territorios.ma).defasada, true);
  assert.equal(visualTerritorio(modelo.territorios.rr).estado, "sem_dados");
  assert.equal(visualTerritorio(modelo.territorios.ba).estado, "lider");
});

test("empate é estado próprio, não cor de um candidato", () => {
  const t = { situacao: "em_andamento", votos: { basePct: 10 }, lider: "empate", margem: { votos: 0, pp: 0 } };
  assert.equal(visualTerritorio(t).estado, "empate");
});

test("faixas de margem para a intensidade do mapa", () => {
  assert.equal(faixaMargem(null), null);
  assert.equal(faixaMargem(0.4), 0);
  assert.equal(faixaMargem(-7), 1);
  assert.equal(faixaMargem(12), 2);
  assert.equal(faixaMargem(35), 3);
});

test("histórico mantém correções oficiais (queda) e ordena pelo horário do TSE", () => {
  const h = normalizarHistorico(ler("dev/amostra/simulacao-parcial/historico.json"));
  assert.ok(h.length > 2);
  assert.ok(h.every((p, i) => i === 0 || p.t >= h[i - 1].t));
  assert.ok(h.some((p) => p.correcao));
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

test("CSV leva origem, horário e todas as unidades, com votos inteiros", () => {
  const { modelo } = normalizar(final1t, CFG);
  const csv = csvTerritorios(modelo, "https://exemplo/api/estado.json");
  const linhas = csv.trim().split("\r\n");
  assert.equal(linhas.length, 1 + 1 + 5 + UFS.length + 1);
  assert.ok(linhas[0].includes("totalizado_tse") && linhas[0].includes("origem"));
  const br = linhas.find((l) => l.startsWith("br;"));
  assert.ok(br.includes(";56104503;"));
});
