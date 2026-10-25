// Critérios das seções 7, 8 e 9 do lado dos dados: validação, fora de ordem, snapshots com hash,
// horários separados, endereços permitidos, administração e repetição sem recontagem.
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Fonte, urlPermitida } from "../../backend/conectores/http.js";
import { rodada } from "../../backend/coletor/rodada.js";
import { fetchDeFixtures } from "../../backend/conectores/fixtures.js";
import { carregarBase, montarSite, fetchSimulado } from "../../backend/conectores/simulador.js";
import { validarResultado } from "../../backend/normalizacao/validar.js";
import { normalizarResultado, ErroFonte } from "../../backend/normalizacao/normalizar.js";
import { descobrir, urlResultado } from "../../backend/conectores/tse.js";
import { tokenConfere } from "../../backend/execucao/cloudflare/worker.js";
import { RAIZ, relogio, presidente, ler } from "./apoio.mjs";

test("resposta incompleta é rejeitada com motivo; turno errado também", () => {
  const sem = presidente("sp");
  delete sem.v;
  assert.match(validarResultado(sem).erros.join(), /bloco v ausente/);
  assert.throws(() => normalizarResultado(sem), ErroFonte);
  const semCand = presidente("sp");
  semCand.carg[0].agr = [];
  assert.match(validarResultado(semCand).erros.join(), /nenhum candidato/);
  assert.throws(() => normalizarResultado(presidente("sp"), { turno: 2 }), /turno 1, esperado 2/);
  assert.deepEqual(validarResultado(null).erros, ["resposta não é um objeto JSON"]);
});

test("identidade aritmética quebrada vira alerta, não descarta o dado oficial", () => {
  const d = presidente("ac");
  d.v.vb = String(Number(d.v.vb) + 1);
  const r = normalizarResultado(d);
  assert.ok(r.alertas.some((a) => a.includes("tv")), r.alertas.join());
  assert.equal(normalizarResultado(presidente("ac")).alertas.length, 0);
});

test("arquivo inválido no meio da noite: mantém o último válido, marca defasado e guarda o snapshot rejeitado", async () => {
  const base = await carregarBase(RAIZ);
  let site = montarSite(base, { hora: "25/10/2026 18:00:00", fracao: { padrao: 0.3 } });
  const rel = relogio("2026-10-25T21:00:30Z");
  const fonte = new Fonte({ fetch: fetchSimulado(() => site), ...rel });
  let r = await rodada(fonte, null);
  const antes = r.saidas["v1/presidente.json"].territorios.ba.resultado.votos.total;
  site = montarSite(base, { hora: "25/10/2026 18:10:00", fracao: { padrao: 0.4 } });
  delete site["oficial/ele2026/6258/dados/ba/ba-c0001-e006258-u.json"].v;
  rel.avancar(15000);
  r = await rodada(fonte, r.estado);
  const ba = r.saidas["v1/presidente.json"].territorios.ba;
  assert.equal(ba.coleta.situacao, "defasado");
  assert.match(ba.coleta.ultimo_erro.mensagem, /arquivo rejeitado: resposta incompleta/);
  assert.equal(ba.resultado.votos.total, antes);
  const snap = r.saidas["v1/snapshots.json"].snapshots.find((s) => s.recorte === "ba" && s.aceito === false);
  assert.ok(snap && snap.sha256 in r.brutos);
  assert.ok(r.saidas["v1/historico.json"].eventos.some((e) => e.tipo === "arquivo_rejeitado" && e.recorte === "ba"));
  assert.equal(r.saidas["v1/presidente.json"].conferencia.classificacao.codigo, "cobertura_incompleta");
});

test("resposta fora de ordem (geração mais antiga) não substitui a mais nova", async () => {
  const base = await carregarBase(RAIZ);
  const novo = montarSite(base, { hora: "25/10/2026 18:10:00", fracao: { padrao: 0.4 } });
  const velho = montarSite(base, { hora: "25/10/2026 18:00:00", fracao: { padrao: 0.3 } });
  let site = novo;
  const rel = relogio("2026-10-25T21:10:30Z");
  const fonte = new Fonte({ fetch: fetchSimulado(() => site), ...rel });
  let r = await rodada(fonte, null);
  const total = r.saidas["v1/presidente.json"].brasil.oficial.votos.total;
  site = { ...novo, "oficial/ele2026/6258/dados/br/br-c0001-e006258-u.json": velho["oficial/ele2026/6258/dados/br/br-c0001-e006258-u.json"] };
  rel.avancar(15000);
  r = await rodada(fonte, r.estado);
  const p = r.saidas["v1/presidente.json"];
  assert.equal(p.brasil.oficial.votos.total, total);
  assert.equal(p.brasil.coleta.fora_de_ordem.recebido, "2026-10-25T18:00:00-03:00");
  assert.equal(r.saidas["v1/historico.json"].correcoes.length, 0); // não confunde atraso de cache com correção
  assert.ok(r.saidas["v1/historico.json"].eventos.some((e) => e.tipo === "fora_de_ordem"));
});

test("snapshot: SHA-256 igual ao do arquivo oficial byte a byte; rodadas repetidas não duplicam nem recontam", async () => {
  const rel = relogio("2026-10-06T13:00:00Z");
  const fonte = new Fonte({ fetch: fetchDeFixtures(RAIZ), ...rel });
  const r1 = await rodada(fonte, null, { modo: "ensaio" });
  const arq = readFileSync(join(RAIZ, "oficial/ele2026/6257/dados/br/br-c0001-e006257-u.json"));
  const esperado = createHash("sha256").update(arq).digest("hex");
  const snap = r1.saidas["v1/snapshots.json"].snapshots.find((s) => s.recorte === "br" && s.disputa === "presidente");
  assert.equal(snap.sha256, esperado);
  assert.equal(snap.url, "https://resultados.tse.jus.br/oficial/ele2026/6257/dados/br/br-c0001-e006257-u.json");
  assert.equal(snap.geracao, "2026-10-05T12:51:47-03:00");
  assert.ok(snap.idg && snap.coletado_em);
  assert.equal(r1.brutos[esperado], arq.toString("utf8"));
  let r = r1;
  for (let i = 0; i < 3; i++) {
    rel.avancar(15000);
    r = await rodada(fonte, r.estado, { modo: "ensaio" });
  }
  // sem conteúdo novo: índice e histórico não são refeitos (o adaptador mantém os já gravados)
  assert.equal(r.saidas["v1/snapshots.json"], undefined);
  assert.equal(r.saidas["v1/historico.json"], undefined);
  assert.equal(r.estado.snapshots.length, r1.saidas["v1/snapshots.json"].total);
  assert.deepEqual(Object.keys(r.brutos), []);
  assert.deepEqual(r.saidas["v1/presidente.json"].brasil.calculado.votos, r1.saidas["v1/presidente.json"].brasil.calculado.votos);
  assert.equal(r.estado.series[`presidente:6257:br`].length, 1);
});

test("três horários separados: consulta avança, publicação e mudança só quando o dado muda", async () => {
  const base = await carregarBase(RAIZ);
  let site = montarSite(base, { hora: "25/10/2026 18:00:00", fracao: { padrao: 0.3 } });
  const rel = relogio("2026-10-25T21:00:30Z");
  const fonte = new Fonte({ fetch: fetchSimulado(() => site), ...rel });
  const r1 = await rodada(fonte, null);
  rel.avancar(15000);
  const r2 = await rodada(fonte, r1.estado);
  const [t1, t2] = [r1, r2].map((r) => r.saidas["v1/presidente.json"].tempos);
  assert.notEqual(t2.ultima_consulta_ok, t1.ultima_consulta_ok);
  assert.equal(t2.ultima_mudanca, t1.ultima_mudanca);
  assert.equal(t2.publicacao_fonte, "2026-10-25T18:00:00-03:00");
  assert.equal(r2.saidas["v1/presidente.json"].gerado_em, r1.saidas["v1/presidente.json"].gerado_em);
  site = montarSite(base, { hora: "25/10/2026 18:01:00", fracao: { padrao: 0.31 } });
  rel.avancar(15000);
  const r3 = await rodada(fonte, r2.estado);
  const p3 = r3.saidas["v1/presidente.json"];
  assert.ok(p3.tempos.ultima_mudanca > t2.ultima_mudanca);
  assert.equal(p3.tempos.ultima_mudanca, p3.brasil.coleta.ultimo_sucesso);
  assert.equal(r3.saidas["v1/presidente.json"].tempos.publicacao_fonte, "2026-10-25T18:01:00-03:00");
});

test("o backend só consulta endereços do TSE: URL arbitrária é recusada sem sair da máquina", async () => {
  assert.equal(urlPermitida("https://resultados.tse.jus.br/oficial/comum/config/ele-c.json"), true);
  assert.equal(urlPermitida("http://resultados.tse.jus.br/x"), false); // só https
  assert.equal(urlPermitida("https://resultados.tse.jus.br.evil.com/x"), false);
  assert.equal(urlPermitida("https://user:pw@resultados.tse.jus.br/x"), false);
  assert.equal(urlPermitida("https://169.254.169.254/latest"), false);
  let chamadas = 0;
  const fonte = new Fonte({ fetch: async () => (chamadas++, new Response("{}")), ...relogio() });
  const r = await fonte.obter("https://exemplo.com/dados.json");
  assert.deepEqual([r.ok, r.recusado, chamadas], [false, true, 0]);
});

test("configuração com modelo de diretório apontando para outro host é rejeitada", () => {
  const cfg = ler("comum/config/ele-c.json");
  cfg.arq.find((a) => a.tp === "u").dir = "https://evil.example/<uf>";
  const fonte = { base: "https://resultados.tse.jus.br", ambiente: "oficial", ciclo: "ele2026" };
  assert.throws(() => urlResultado(cfg, fonte, "6257", 1, "br"), /modelo de diretório inesperado/);
  assert.doesNotThrow(() => descobrir(cfg));
});

test("token de administração: comparação exige segredo configurado com 32+ caracteres", () => {
  const segredo = "x".repeat(40);
  assert.equal(tokenConfere(segredo, segredo), true);
  assert.equal(tokenConfere("x".repeat(39), segredo), false);
  assert.equal(tokenConfere("", undefined), false); // sem segredo, administração desligada
  assert.equal(tokenConfere("curto", "curto"), false);
});
