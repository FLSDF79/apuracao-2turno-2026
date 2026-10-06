import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { descobrir, urlResultado, urlAbrangencia, urlConfig, recortesDaAbrangencia } from "../../nucleo/descoberta.js";
import { carregarBase, montarSite } from "../../coletor/simulador.js";
import { ler, RAIZ } from "./apoio.mjs";

const fonte = { base: "https://resultados.tse.jus.br", ambiente: "oficial", ciclo: "ele2026" };

test("configuração real de 06/10: 2º turno ainda não publicado, com o código esperado do cdt2", () => {
  const d = descobrir(ler("comum/config/ele-c.json"));
  assert.equal(d.disputas.presidente.estado, "nao_publicada");
  assert.equal(d.disputas.presidente.eleicao_esperada, "6258");
  assert.equal(d.disputas.governador.eleicao_esperada, "6260");
});

test("modo ensaio usa o 1º turno: 6257 presidente (br) e 6259 governador", () => {
  const d = descobrir(ler("comum/config/ele-c.json"), { modo: "ensaio" });
  assert.deepEqual([d.disputas.presidente.eleicao, d.disputas.presidente.abrangencias], ["6257", ["br"]]);
  assert.equal(d.disputas.governador.eleicao, "6259");
});

test("quando a configuração listar o 2º turno (formato de 2024), a descoberta encontra 6258 e as 7 UFs de 6260", async () => {
  const site = montarSite(await carregarBase(RAIZ), { hora: "25/10/2026 17:00:00", fracao: { padrao: 0 } });
  const d = descobrir(site["oficial/comum/config/ele-c.json"]);
  assert.equal(d.disputas.presidente.estado, "publicada");
  assert.equal(d.disputas.presidente.eleicao, "6258");
  assert.equal(d.disputas.presidente.turno, 2);
  assert.deepEqual(d.disputas.governador.abrangencias, ["ac", "am", "df", "es", "rj", "rn", "to"]);
});

test("URLs saem dos modelos 'arq' do ele-c.json e apontam para arquivos que existem", () => {
  const cfg = ler("comum/config/ele-c.json");
  const local = (url) => join(RAIZ, url.replace("https://resultados.tse.jus.br/", ""));
  assert.equal(urlConfig(fonte), "https://resultados.tse.jus.br/oficial/comum/config/ele-c.json");
  for (const [ele, cargo, abr] of [["6257", 1, "br"], ["6257", 1, "zz"], ["6257", 1, "df"], ["6259", 3, "rj"]]) {
    assert.ok(existsSync(local(urlResultado(cfg, fonte, ele, cargo, abr))), `${ele} ${abr}`);
  }
  assert.ok(existsSync(local(urlAbrangencia(cfg, fonte, "6257", "br"))));
  assert.equal(urlResultado(cfg, fonte, "6258", 1, "br"), "https://resultados.tse.jus.br/oficial/ele2026/6258/dados/br/br-c0001-e006258-u.json");
});

test("lista de abrangência: só siglas conhecidas viram recorte", () => {
  const { recortes, ignorados } = recortesDaAbrangencia(ler("ele2026/6257/dados/br/br-e006257-ab.json"));
  assert.equal(recortes.length, 29);
  assert.ok(recortes.includes("zz") && recortes.includes("br"));
  const r2 = recortesDaAbrangencia({ abr: [{ cdabr: "sp" }, { cdabr: "../x" }] });
  assert.deepEqual(r2, { recortes: ["sp"], ignorados: ["../x"] });
});
