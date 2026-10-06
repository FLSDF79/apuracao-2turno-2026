import test from "node:test";
import assert from "node:assert/strict";
import { normalizarResultado } from "../../nucleo/normalizar.js";
import { comIndicadores, agregar, disputa } from "../../nucleo/calcular.js";
import { COMPONENTES_BRASIL, REGIOES, SIGLAS_UF } from "../../nucleo/territorios.js";
import { presidente, governador, UFS_2T_GOV } from "./apoio.mjs";

const norm = (d) => normalizarResultado(d);
const todos = () => Object.fromEntries([...COMPONENTES_BRASIL, "br"].map((c) => [c, norm(presidente(c))]));

test("percentuais calculados batem com os oficiais do TSE em todos os recortes (presidente e governador)", () => {
  const casos = [...[...COMPONENTES_BRASIL, "br"].map(presidente), ...SIGLAS_UF.map(governador)];
  for (const bruto of casos) {
    const r = comIndicadores(norm(bruto));
    const id = `${r.eleicao}/${r.territorio}`;
    for (const c of r.candidatos) assert.ok(Math.abs(c.pct_validos - c.pct_validos_tse) < 1e-6, `${id} cand ${c.numero}`);
    for (const k of ["pct_comparecimento", "pct_abstencao", "pct_validos", "pct_brancos", "pct_nulos", "pct_totalizadas"]) {
      assert.ok(Math.abs(r.indicadores[k] - r.oficial[k]) < 1e-6, `${id} ${k}: ${r.indicadores[k]} × ${r.oficial[k]}`);
    }
  }
});

test("base do percentual é vvc (válidos + anulados sub judice): caso real do RJ", () => {
  const rj = comIndicadores(norm(governador("rj")));
  assert.ok(rj.votos.anulados_sub_judice > 0);
  const ruas = rj.candidatos.find((c) => c.numero === "22");
  assert.equal(ruas.pct_validos.toFixed(2), "49.27");
  assert.equal(((ruas.votos * 100) / rj.votos.validos).toFixed(2), "50.88"); // o que daria sobre vv: errado
});

test("Brasil calculado (27 UFs + exterior) é idêntico ao total nacional, campo a campo", () => {
  const t = todos();
  const a = agregar(t, COMPONENTES_BRASIL, "Brasil");
  const b = comIndicadores(t.br);
  assert.deepEqual(a.faltando, []);
  assert.deepEqual(a.secoes, b.secoes);
  assert.deepEqual(a.eleitorado, b.eleitorado);
  assert.deepEqual(a.votos, b.votos);
  const votos = (r) => Object.fromEntries(r.candidatos.map((c) => [c.numero, c.votos]));
  assert.deepEqual(votos(a), votos(b));
  assert.deepEqual(a.indicadores, b.indicadores);
  assert.deepEqual(a.inconsistencias, []);
});

test("região soma votos antes do percentual; média simples dos percentuais das UFs daria outro número", () => {
  const t = todos();
  const ufs = REGIOES.NE.ufs;
  const reg = agregar(t, ufs, "Nordeste");
  const v22 = ufs.reduce((s, u) => s + t[u].candidatos.find((c) => c.numero === "22").votos, 0);
  const vvc = ufs.reduce((s, u) => s + t[u].votos.validos_computados, 0);
  const flavio = reg.candidatos.find((c) => c.numero === "22");
  assert.equal(flavio.votos, v22);
  assert.equal(flavio.pct_validos, (v22 * 100) / vvc);
  const media = ufs.reduce((s, u) => s + comIndicadores(t[u]).candidatos.find((c) => c.numero === "22").pct_validos, 0) / ufs.length;
  assert.ok(Math.abs(media - flavio.pct_validos) > 0.1, "a média simples precisa ser diferente para o teste ter sentido");
  // totalização regional pelas seções
  const st = ufs.reduce((s, u) => s + t[u].secoes.totalizadas, 0), ts = ufs.reduce((s, u) => s + t[u].secoes.total, 0);
  assert.equal(reg.indicadores.pct_totalizadas, (st * 100) / ts);
});

test("as cinco regiões + exterior somam o Brasil, sem dupla contagem do DF", () => {
  const t = todos();
  const ufsRegioes = Object.values(REGIOES).flatMap((r) => r.ufs);
  assert.equal(new Set(ufsRegioes).size, 27);
  assert.equal(ufsRegioes.filter((u) => u === "df").length, 1);
  const somaReg = Object.values(REGIOES).reduce((s, r) => s + agregar(t, r.ufs).votos.total, 0) + t.zz.votos.total;
  assert.equal(somaReg, t.br.votos.total);
});

test("recorte ausente fica listado e não vira zero; campo ausente em um componente anula a soma do campo", () => {
  const t = todos();
  t.sp = null;
  const a = agregar(t, COMPONENTES_BRASIL);
  assert.deepEqual(a.faltando, ["sp"]);
  assert.ok(a.votos.total < t.br.votos.total);
  const t2 = todos();
  t2.ac.votos.brancos = null;
  assert.equal(agregar(t2, COMPONENTES_BRASIL).votos.brancos, null);
  assert.equal(agregar({}, ["ac"]).votos.total, null);
});

test("disputa: liderança, empate e ausência de votos", () => {
  const c = (n, votos, pct) => ({ numero: n, votos, pct_validos: pct });
  assert.deepEqual(disputa([c("13", 10, 50), c("22", 10, 50)]).situacao, "empate");
  assert.equal(disputa([c("13", 10, 50), c("22", 10, 50)]).lider, null);
  const d = disputa([c("13", 9, 45), c("22", 11, 55)]);
  assert.deepEqual([d.lider, d.diferenca_votos, d.diferenca_pontos], ["22", 2, 10]);
  assert.equal(disputa([c("13", 0, null), c("22", 0, null)]).situacao, "sem_votos");
});

test("governador: os 7 arquivos das UFs com 2º turno ficam separados de presidente", () => {
  for (const uf of UFS_2T_GOV) {
    const r = norm(governador(uf));
    assert.equal(r.cargo.codigo, 3);
    assert.equal(r.candidatos.filter((c) => c.situacao === "2º turno").length, 2, uf);
  }
});
