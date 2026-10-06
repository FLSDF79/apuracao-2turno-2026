// Testes da frente 4: roteiro da noite simulada, TSE simulado, montagem do site e a noite inteira
// passada pelo coletor de verdade com relógio simulado (sem rede, sem navegador). A versão com
// relógio real, página e telas é `node ensaio/rodar.mjs`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { noite, MARCOS, DURACAO_MIN, horaTSE } from "../../ensaio/roteiro.mjs";
import { criarTseSimulado } from "../../ensaio/tse-simulado.mjs";
import { conferirSnapshot } from "../../ensaio/conferir.mjs";
import { carregarBase } from "../../coletor/simulador.js";
import { Fonte } from "../../coletor/fonte.js";
import { rodada } from "../../coletor/rodada.js";
import { COMPONENTES_BRASIL } from "../../nucleo/territorios.js";
import { montarSite } from "../../publicacao/montar-site.mjs";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "../..");
const base = await carregarBase(join(RAIZ, "tests/fixtures/tse-2026-10-06"));
const INICIO = Date.parse("2026-10-25T20:00:00Z"); // 17:00 em Brasília

test("horário publicado sai em Brasília, no formato do TSE", () => {
  assert.equal(horaTSE(new Date("2026-10-25T21:05:09Z")), "25/10/2026 18:05:09");
});

test("roteiro: sem 2º turno antes do minuto 2; eleito só no fim; frações nunca passam de 1", () => {
  assert.equal(noite(1, INICIO, COMPONENTES_BRASIL).cenario.publicado, false);
  assert.equal(noite(3, INICIO, COMPONENTES_BRASIL).falha.status, 404);
  for (let t = 0; t < DURACAO_MIN; t += 0.25) {
    const { cenario } = noite(t, INICIO, COMPONENTES_BRASIL);
    assert.equal(!!cenario.eleito, t >= 22, `eleito em t=${t}`);
    for (const f of Object.values(cenario.fracao ?? {})) assert.ok(f >= 0 && f <= 1);
  }
  assert.deepEqual(MARCOS.map((m) => m.t), [...MARCOS.map((m) => m.t)].sort((x, y) => x - y));
});

test("roteiro: SP atrasado deixa o nacional mais novo que a UF; correção faz o AC recuar", () => {
  const { cenario } = noite(10, INICIO, COMPONENTES_BRASIL);
  assert.ok(cenario.brFracaoExtra.sp > cenario.fracao.sp);
  assert.notEqual(cenario.horaPorRecorte.sp, cenario.hora);
  assert.ok(noite(11.5, INICIO, COMPONENTES_BRASIL).cenario.fracao.ac < noite(10.5, INICIO, COMPONENTES_BRASIL).cenario.fracao.ac);
});

test("TSE simulado: ETag/304 e falhas injetadas com Retry-After", async () => {
  let agora = INICIO + 6 * 60000;
  const tse = criarTseSimulado({ base, inicioMs: INICIO, agora: () => agora });
  const url = "https://x/oficial/ele2026/6258/dados/br/br-c0001-e006258-u.json";
  const r1 = await tse(new Request(url));
  assert.equal(r1.status, 200);
  const r2 = await tse(new Request(url, { headers: { "if-none-match": r1.headers.get("etag") } }));
  assert.equal(r2.status, 304);
  agora = INICIO + 13.2 * 60000;
  const r3 = await tse(new Request(url));
  assert.equal(r3.status, 503);
  assert.equal(r3.headers.get("retry-after"), "30");
  agora = INICIO + 1 * 60000;
  assert.equal((await tse(new Request(url))).status, 404, "antes da configuração publicar, resultado não existe");
});

test("TSE simulado cíclico recomeça a noite", async () => {
  let agora = INICIO + (DURACAO_MIN + 4 + 0.5) * 60000;
  const tse = criarTseSimulado({ base, inicioMs: INICIO, agora: () => agora, ciclico: true });
  const m = await (await tse(new Request("https://x/_ensaio"))).json();
  assert.equal(m.id, "antes");
});

test("noite inteira pelo coletor de verdade: regras do prompt valem em todas as rodadas", async () => {
  let agora = INICIO;
  const tse = criarTseSimulado({ base, inicioMs: INICIO, agora: () => agora });
  const fonte = new Fonte({ fetch: (u, init) => tse(new Request(u, init)), agora: () => agora, esperar: async (ms) => { agora += ms; } });
  let estado = null, anterior = null;
  const linhas = [];
  for (; agora < INICIO + DURACAO_MIN * 60000; agora += 15000) {
    const r = await rodada(fonte, estado, { modo: "simulacao" });
    estado = r.estado;
    const snap = { pres: r.saidas["v1/presidente.json"], saude: r.saidas["v1/saude.json"], hist: r.saidas["v1/historico.json"] };
    const t = (agora - INICIO) / 60000;
    const c = conferirSnapshot({ ...snap, anterior, t, modoEsperado: "simulacao" });
    assert.deepEqual(c.falhas, [], `t=${t}`);
    linhas.push({ t, ...c.resumo });
    anterior = snap;
  }
  const em = (de, ate) => linhas.filter((l) => l.t >= de && l.t < ate);
  assert.ok(em(0, 2).every((l) => l.estado_publicacao === "aguardando_configuracao" && l.req_resultados === 0));
  assert.ok(em(9.5, 11).some((l) => l.conferencia !== "compativel"), "conferência acusa SP atrasado");
  assert.ok(em(11, 26).some((l) => l.correcoes_ac > 0), "correção do AC registrada");
  assert.ok(em(13, 15).some((l) => l.coleta !== "ok"), "instabilidade sinalizada");
  assert.ok(em(15.5, 17).some((l) => l.rr === "defasado"), "RR defasado com último valor válido");
  assert.ok(em(18, 19.5).some((l) => l.coleta === "bloqueada" || l.coleta === "pausada"), "429 pausa o coletor");
  assert.ok(em(0, 22).every((l) => !l.eleito), "eleito antes da hora");
  const fim = linhas.at(-1);
  assert.equal(fim.eleito, true);
  assert.equal(fim.conferencia, "compativel");
  assert.equal(fim.pct_totalizadas, 100);
});

test("site montado só com a página e os exemplos (sem fixtures, testes ou coletor)", async () => {
  const destino = await montarSite(join(tmpdir(), `site-${process.pid}`));
  const itens = (await readdir(destino)).sort();
  assert.deepEqual(itens, ["_headers", "config.js", "data", "exemplos", "index.html", "js", "style.css"]);
});

test("wrangler.toml aponta para arquivos que existem e para a pasta que o montador gera", async () => {
  const toml = await readFile(join(RAIZ, "wrangler.toml"), "utf8");
  assert.match(toml, /directory = "dist\/site"/);
  for (const m of toml.matchAll(/^main = "([^"]+)"/gm)) await readFile(join(RAIZ, m[1]));
  assert.match(toml, /class_name = "Coletor"/);
});
