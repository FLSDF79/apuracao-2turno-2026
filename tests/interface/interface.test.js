// Testes da interface (sem dependências): node --test tests/interface/*.test.js
// Usam os exemplos que o próprio coletor gera no contrato v1 (exemplos/).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizar, normalizarHistorico, normalizarGovernador, normalizarSaude, visualTerritorio, faixaMargem, assinaturaConteudo, MARCAS, UFS, REGIOES } from "../../js/contrato.js";
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

test("contagem que não é inteiro ≥ 0 vira ausente e é registrada", () => {
  const snap = structuredClone(simulado);
  snap.brasil.oficial.candidatos.find((c) => c.numero === "22").votos = "23051556";
  snap.territorios.ac.resultado.votos.brancos = 12.5;
  snap.territorios.sp.resultado.secoes.totalizadas = -1;
  const { modelo, problemas } = normalizar(snap, CFG);
  assert.equal(modelo.territorios.br.candidatos["22"].votos, null);
  assert.equal(modelo.territorios.ac.votos.brancos, null);
  assert.equal(modelo.territorios.sp.secoes.totalizadas, null);
  assert.equal(problemas.filter((p) => p.startsWith("Contagem inválida")).length, 3);
  assert.equal(modelo.territorios.br.candidatos["13"].votos, 22010901, "o resto continua");
});

test("resposta sem brasil e sem territórios é rejeitada inteira", () => {
  const r = normalizar({ schema: simulado.schema, gerado_em: "2026-10-25T21:00:00Z" }, CFG);
  assert.equal(r.modelo, null);
  assert.match(r.problemas.join(" "), /incompleta/);
});

test("marca de teste: simulação, ensaio, outro turno e modo desconhecido; oficial do 2º turno sem marca", () => {
  assert.equal(normalizar(simulado, CFG).modelo.teste, "simulacao");
  assert.equal(normalizar(ensaio, CFG).modelo.teste, "ensaio");
  const outro = structuredClone(ensaio); outro.modo = "oficial";
  assert.equal(normalizar(outro, CFG).modelo.teste, "outro_turno");
  const estranho = structuredClone(simulado); estranho.modo = "producao";
  assert.equal(normalizar(estranho, CFG).modelo.teste, "desconhecido");
  const oficial = structuredClone(simulado); oficial.modo = "oficial";
  assert.equal(normalizar(oficial, CFG).modelo.teste, null);
  for (const k of ["ensaio", "simulacao", "outro_turno", "desconhecido"]) assert.ok(MARCAS[k].faixa && MARCAS[k].detalhe);
});

test("três horários separados: publicação do TSE, consulta e mudança, do bloco tempos do coletor", () => {
  const { modelo } = normalizar(simulado, CFG);
  assert.equal(modelo.tempos.publicacaoTSE, simulado.tempos.publicacao_fonte);
  assert.equal(modelo.tempos.consultaOk, simulado.tempos.ultima_consulta_ok);
  assert.equal(modelo.tempos.mudanca, simulado.tempos.ultima_mudanca);
  assert.equal(modelo.avisoModo, simulado.aviso_modo);
  assert.equal(modelo.sha256BR, simulado.brasil.coleta.sha256);
  // sem o bloco tempos (coletor antigo): cai nos campos do arquivo nacional
  const antigo = structuredClone(simulado);
  delete antigo.tempos; delete antigo.brasil.coleta.ultima_mudanca;
  const m2 = normalizar(antigo, CFG).modelo;
  assert.equal(m2.tempos.publicacaoTSE, simulado.brasil.oficial.horario.geracao);
  assert.equal(m2.tempos.consultaOk, simulado.brasil.coleta.ultimo_sucesso);
  assert.equal(m2.tempos.mudanca, null);
});

test("assinatura do conteúdo ignora horários de coleta e muda com os números", () => {
  const a = structuredClone(simulado), b = structuredClone(simulado);
  b.gerado_em = "2030-01-01T00:00:00Z";
  b.coleta_geral.rodada_em = "2030-01-01T00:00:00Z";
  b.tempos.ultima_consulta_ok = "2030-01-01T00:00:00Z";
  b.brasil.coleta.ultimo_sucesso = "2030-01-01T00:00:00Z";
  assert.equal(assinaturaConteudo(a), assinaturaConteudo(b));
  b.brasil.oficial.candidatos[0].votos += 1;
  assert.notEqual(assinaturaConteudo(a), assinaturaConteudo(b));
});
