import test from "node:test";
import assert from "node:assert/strict";
import { Fonte } from "../../backend/conectores/http.js";
import { rodada } from "../../backend/coletor/rodada.js";
import { fetchDeFixtures } from "../../backend/conectores/fixtures.js";
import { carregarBase, montarSite, fetchSimulado } from "../../backend/conectores/simulador.js";
import { SCHEMA } from "../../backend/api/contrato.js";
import { RAIZ, relogio } from "./apoio.mjs";

test("ensaio com os arquivos reais do 1º turno: contrato completo, conferência compatível e sem recontagem", async () => {
  const rel = relogio("2026-10-06T13:00:00Z");
  const registro = [];
  const fonte = new Fonte({ fetch: fetchDeFixtures(RAIZ, { registro }), ...rel });
  const r1 = await rodada(fonte, null, { modo: "ensaio" });
  const p = r1.saidas["v1/presidente.json"];
  assert.equal(p.schema, SCHEMA);
  assert.equal(p.estado_publicacao, "concluida");
  assert.equal(p.conferencia.classificacao.codigo, "compativel");
  assert.equal(Object.keys(p.territorios).length, 28);
  assert.equal(p.exterior.codigo, "zz");
  assert.equal(p.eleito.publicado, false); // 1º turno sem eleito para presidente
  assert.deepEqual(Object.keys(r1.saidas["v1/governador.json"].ufs), ["ac", "am", "df", "es", "rj", "rn", "to"]);
  assert.equal(registro.length, 38); // config + abrangência + 29 presidente + 7 governador
  assert.ok(r1.saidas["v1/export/presidente.csv"].startsWith("﻿recorte;nome"));

  rel.avancar(15000);
  const r2 = await rodada(fonte, r1.estado, { modo: "ensaio" });
  assert.deepEqual(r2.saidas["v1/saude.json"].coletor.status_http, { 304: 36 });
  const p2 = r2.saidas["v1/presidente.json"];
  assert.deepEqual(p2.brasil.calculado.votos, p.brasil.calculado.votos); // arquivo cumulativo não é somado de novo
  assert.equal(r2.saidas["v1/historico.json"], undefined); // nada novo: o histórico gravado continua valendo
  assert.equal(r2.estado.series["presidente:6257:br"].length, 1);
});

test("noite simulada do 2º turno: espera, apuração, atraso de UF, falha, correção e eleito", async () => {
  const base = await carregarBase(RAIZ);
  let site = montarSite(base, { publicado: false });
  const registro = [];
  const rel = relogio("2026-10-25T19:00:00Z");
  const fonte = new Fonte({ fetch: fetchSimulado(() => site, registro), ...rel });
  const passo = async (estado) => {
    rel.avancar(61000);
    return rodada(fonte, estado, { modo: "oficial" });
  };

  // antes da configuração: só o ele-c.json é consultado, nenhuma URL chutada
  let r = await passo(null);
  assert.equal(r.saidas["v1/presidente.json"].estado_publicacao, "aguardando_configuracao");
  assert.equal(registro.length, 1);

  // configuração publicada, nada totalizado
  site = montarSite(base, { hora: "25/10/2026 17:00:00", fracao: { padrao: 0 } });
  r = await passo(r.estado);
  let p = r.saidas["v1/presidente.json"];
  assert.equal(p.eleicao.eleicao, "6258");
  assert.equal(p.estado_publicacao, "aguardando_resultados");
  assert.equal(p.brasil.oficial.disputa.situacao, "sem_votos");

  // 30% apurado
  site = montarSite(base, { hora: "25/10/2026 18:00:00", fracao: { padrao: 0.3 } });
  r = await passo(r.estado);
  p = r.saidas["v1/presidente.json"];
  assert.equal(p.estado_publicacao, "em_apuracao");
  assert.equal(p.conferencia.classificacao.codigo, "compativel");
  assert.deepEqual(p.candidatos.map((c) => c.numero), ["13", "22"]);
  assert.ok(Math.abs(p.brasil.oficial.indicadores.pct_totalizadas - 30) < 0.1);
  assert.equal(p.eleito.publicado, false); // liderança parcial não é vitória

  // nacional já inclui seções de SP que o arquivo de SP ainda não mostra
  site = montarSite(base, { hora: "25/10/2026 18:10:00", fracao: { padrao: 0.3 }, horaPorRecorte: { sp: "25/10/2026 18:00:00" }, brFracaoExtra: { sp: 0.5 } });
  r = await passo(r.estado);
  p = r.saidas["v1/presidente.json"];
  assert.equal(p.conferencia.classificacao.codigo, "horarios_diferentes");
  assert.equal(p.territorios.sp.atraso_vs_nacional_min, 10);
  assert.ok(p.conferencia.linhas.find((l) => l.chave === "candidato.13").diferenca < 0);

  // SP fora do ar: mantém o último dado válido, marcado como defasado
  const spAntes = p.territorios.sp.resultado.votos.total;
  const url = "https://resultados.tse.jus.br/oficial/ele2026/6258/dados/sp/sp-c0001-e006258-u.json";
  const original = fonte.fetch;
  fonte.fetch = async (u, i) => (u === url ? new Response("", { status: 500 }) : original(u, i));
  r = await passo(r.estado);
  p = r.saidas["v1/presidente.json"];
  assert.equal(p.territorios.sp.coleta.situacao, "defasado");
  assert.equal(p.territorios.sp.resultado.votos.total, spAntes);
  assert.equal(p.conferencia.classificacao.codigo, "cobertura_incompleta");
  fonte.fetch = original;

  // correção oficial para baixo no AC: aceita e registrada
  site = montarSite(base, { hora: "25/10/2026 18:20:00", fracao: { padrao: 0.3, ac: 0.2 } });
  r = await passo(r.estado);
  p = r.saidas["v1/presidente.json"];
  const h = r.saidas["v1/historico.json"];
  assert.ok(h.correcoes.some((c) => c.recorte === "ac"));
  // cada correção aponta os dois snapshots (antes e depois) para conferência
  for (const c of h.correcoes) assert.ok(/^[0-9a-f]{64}$/.test(c.de_sha256) && /^[0-9a-f]{64}$/.test(c.para_sha256) && c.de_sha256 !== c.para_sha256);
  assert.ok(h.serie_brasil.every((pt) => /^[0-9a-f]{64}$/.test(pt.sha256)));
  assert.ok(Math.abs(p.territorios.ac.resultado.indicadores.pct_totalizadas - 20) < 0.1);
  assert.equal(p.conferencia.classificacao.codigo, "compativel");
  assert.ok(h.serie_brasil.some((pt) => pt.correcao));

  // final com eleito publicado pela fonte
  site = montarSite(base, { hora: "25/10/2026 21:00:00", fracao: { padrao: 1 }, final: true, eleito: true });
  r = await passo(r.estado);
  p = r.saidas["v1/presidente.json"];
  assert.equal(p.estado_publicacao, "concluida");
  assert.equal(p.eleito.publicado, true);
  assert.equal(p.eleito.candidatos.length, 1);
  const g = r.saidas["v1/governador.json"];
  assert.equal(g.eleicao.eleicao, "6260");
  assert.ok(Object.values(g.ufs).every((u) => u.resultado.indicadores.pct_totalizadas === 100));
  // a série é crescente no tempo e tem um ponto por versão nova do arquivo nacional
  const serie = r.saidas["v1/historico.json"].serie_brasil;
  assert.ok(serie.length >= 5);
  assert.ok(serie.every((pt, i) => i === 0 || pt.coletado_em > serie[i - 1].coletado_em));
});

test("troca do ensaio para o 2º turno não mistura eleições", async () => {
  const rel = relogio("2026-10-25T19:00:00Z");
  const r1 = await rodada(new Fonte({ fetch: fetchDeFixtures(RAIZ), ...rel }), null, { modo: "ensaio" });
  const site = montarSite(await carregarBase(RAIZ), { hora: "25/10/2026 18:00:00", fracao: { padrao: 0.1 } });
  rel.avancar(61000);
  const r2 = await rodada(new Fonte({ fetch: fetchSimulado(() => site), ...rel }), r1.estado, { modo: "oficial" });
  const p = r2.saidas["v1/presidente.json"];
  assert.equal(p.eleicao.eleicao, "6258");
  assert.deepEqual(p.candidatos.map((c) => c.numero), ["13", "22"]); // nenhum dos 12 candidatos do 1º turno
  assert.equal(p.conferencia.classificacao.codigo, "compativel");
  assert.equal(r2.saidas["v1/historico.json"].serie_brasil.length, 1);
});

test("governador com abrangência 'br' na configuração: consulta só as 7 UFs com 2º turno, sem 404", async () => {
  const site = montarSite(await carregarBase(RAIZ), { hora: "25/10/2026 18:00:00", fracao: { padrao: 0.2 } });
  const cfg = site["oficial/comum/config/ele-c.json"];
  cfg.pl.at(-1).e.find((e) => e.cd === "6260").abr = [{ cd: "br", cp: [{ cd: "3", ds: "Governador" }] }];
  site["oficial/ele2026/6260/dados/br/br-e006260-ab.json"] = { abr: ["ac", "al", "am", "ba", "df", "es", "rj", "rn", "sp", "to"].map((c) => ({ cdabr: c })) };
  const registro = [];
  const r = await rodada(new Fonte({ fetch: fetchSimulado(() => site, registro), ...relogio() }), null, { modo: "oficial" });
  assert.deepEqual(Object.keys(r.saidas["v1/governador.json"].ufs), ["ac", "am", "df", "es", "rj", "rn", "to"]);
  assert.deepEqual(r.saidas["v1/saude.json"].coletor.status_http, { 200: 39 }); // config + 2 abrangências + 29 + 7
});

test("resumo da coleta para a página: ok, atrasada e bloqueada", async () => {
  const site = montarSite(await carregarBase(RAIZ), { hora: "25/10/2026 18:00:00", fracao: { padrao: 0.2 } });
  const rel = relogio();
  const f = fetchSimulado(() => site);
  let falhar = null;
  const fonte = new Fonte({ fetch: (u, i) => (falhar && u.includes(falhar.trecho) ? new Response("", { status: falhar.status }) : f(u, i)), ...rel });
  let r = await rodada(fonte, null);
  assert.equal(r.saidas["v1/presidente.json"].coleta_geral.estado, "ok");
  assert.equal(Date.parse(r.saidas["v1/presidente.json"].coleta_geral.proxima_em) - rel.agora(), 15000);
  falhar = { trecho: "/rj/", status: 500 };
  rel.avancar(15000);
  r = await rodada(fonte, r.estado);
  assert.equal(r.saidas["v1/governador.json"].coleta_geral.estado, "atrasada");
  falhar = { trecho: "/ac/", status: 403 };
  rel.avancar(15000);
  r = await rodada(fonte, r.estado);
  assert.equal(r.saidas["v1/saude.json"].coletor.estado, "bloqueada");
});

test("dados de teste nunca saem como apuração real: modo e aviso em todos os arquivos e no CSV", async () => {
  const rel = relogio("2026-10-06T13:00:00Z");
  const r = await rodada(new Fonte({ fetch: fetchDeFixtures(RAIZ), ...rel }), null, { modo: "ensaio" });
  for (const nome of ["presidente", "governador", "historico", "saude"]) {
    const j = r.saidas[`v1/${nome}.json`];
    assert.equal(j.modo, "ensaio", nome);
    assert.match(j.aviso_modo, /ENSAIO.*Não é a apuração do 2º turno/, nome);
  }
  for (const nome of ["presidente", "governador"]) {
    const [cab, ...linhas] = r.saidas[`v1/export/${nome}.csv`].replace(/^\uFEFF/, "").trim().split("\r\n").map((l) => l.split(";"));
    for (const col of ["origem", "horario_totalizacao_tse", "ultima_consulta_ok", "url_fonte", "sha256_arquivo", "modo"]) assert.ok(cab.includes(col), `${nome}.csv sem ${col}`);
    const iModo = cab.indexOf("modo"), iUrl = cab.indexOf("url_fonte");
    assert.ok(linhas.every((l) => l[iModo] === "ensaio"));
    assert.ok(linhas.some((l) => l[iUrl].startsWith("https://resultados.tse.jus.br/")));
  }
  const oficial = await rodada(new Fonte({ fetch: fetchDeFixtures(RAIZ), ...rel }), null, { modo: "oficial" });
  assert.equal(oficial.saidas["v1/presidente.json"].aviso_modo, null);
});

test("configuração do 2º turno publicada antes dos arquivos: um 404 por disputa, sem pausa, leitura na rodada seguinte", async () => {
  const base = await carregarBase(RAIZ);
  const completo = montarSite(base, { hora: "25/10/2026 17:00:00", fracao: { padrao: 0 } });
  const soConfig = Object.fromEntries(Object.entries(completo).filter(([k]) => !k.endsWith("-u.json")));
  let site = soConfig;
  const registro = [];
  const rel = relogio("2026-10-25T19:59:00Z");
  const fonte = new Fonte({ fetch: fetchSimulado(() => site, registro), ...rel });
  let r = await rodada(fonte, null, { modo: "oficial" });
  const resultados = registro.filter((u) => u.endsWith("-u.json"));
  assert.equal(resultados.length, 2, resultados.join("\n")); // nacional de presidente + primeira UF de governador
  const s = r.saidas["v1/saude.json"];
  assert.equal(s.coletor.pausa, null);
  assert.equal(r.saidas["v1/presidente.json"].territorios.sp.coleta.situacao, "nao_publicado");

  site = completo;
  rel.avancar(15000);
  r = await rodada(fonte, r.estado, { modo: "oficial" });
  const p = r.saidas["v1/presidente.json"];
  assert.equal(p.estado_publicacao, "aguardando_resultados");
  assert.equal(p.territorios.sp.coleta.situacao, "atualizado");
  assert.equal(Object.values(r.saidas["v1/governador.json"].ufs).filter((u) => u.coleta.situacao === "atualizado").length, 7);
});

test("limite de arquivos novos por execução: continua em execuções seguintes e chega ao mesmo resultado", async () => {
  const base = await carregarBase(RAIZ);
  const site = montarSite(base, { hora: "25/10/2026 18:00:00", fracao: { padrao: 0.4 } });
  const rodar = async (limite) => {
    const rel = relogio("2026-10-25T21:00:00Z");
    const fonte = new Fonte({ fetch: fetchSimulado(() => site), ...rel });
    let r = await rodada(fonte, null, { modo: "oficial", maxNovosPorExecucao: limite });
    let execucoes = 1;
    while (r.continuar) {
      assert.deepEqual(r.saidas, {}); // parcial: nada público é refeito pela metade
      rel.avancar(1000);
      r = await rodada(fonte, r.estado, { modo: "oficial", maxNovosPorExecucao: limite });
      execucoes++;
    }
    return { r, execucoes };
  };
  const tudo = await rodar(Infinity);
  const partes = await rodar(10);
  assert.equal(tudo.execucoes, 1);
  assert.equal(partes.execucoes, 4); // 36 arquivos novos de resultado + config/abrangência
  const a = tudo.r.saidas["v1/presidente.json"], b = partes.r.saidas["v1/presidente.json"];
  assert.deepEqual(b.brasil.calculado.votos, a.brasil.calculado.votos);
  assert.equal(b.conferencia.classificacao.codigo, "compativel");
  assert.equal(Object.values(b.territorios).filter((t) => t.coleta.situacao === "atualizado").length, 28);
  assert.equal(partes.r.estado.series["presidente:6258:br"].length, 1);
  assert.equal(partes.r.estado.snapshots.length, tudo.r.estado.snapshots.length);
});
