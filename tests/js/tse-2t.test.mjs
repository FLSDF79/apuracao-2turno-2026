import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { descobrir, urlResultado } from "../../backend/conectores/tse.js";
import { normalizarResultado } from "../../backend/normalizacao/normalizar.js";

// Arquivos oficiais baixados em 23/10/2026 (MD5 = ETag do TSE; ver tests/fixtures/tse-2026-10-23/MANIFEST.sha256).
const RAIZ_2T = join(import.meta.dirname, "../fixtures/tse-2026-10-23/oficial");
const ler = (p) => JSON.parse(readFileSync(join(RAIZ_2T, p), "utf8"));
const fonte = { base: "https://resultados.tse.jus.br", ambiente: "oficial", ciclo: "ele2026" };

test("configuração real de 23/10: 2º turno publicado, 6258 no Brasil e 6260 em 6 UFs (sem RJ)", () => {
  const cfg = ler("comum/config/ele-c.json");
  const d = descobrir(cfg);
  const p = d.disputas.presidente, g = d.disputas.governador;
  assert.deepEqual([p.estado, p.eleicao, p.turno], ["publicada", "6258", 2]);
  assert.deepEqual(p.abrangencias, ["br"]);
  assert.deepEqual([g.estado, g.eleicao, g.turno], ["publicada", "6260", 2]);
  assert.deepEqual([...g.abrangencias].sort(), ["ac", "am", "df", "es", "rn", "to"]);
  assert.equal(urlResultado(cfg, fonte, "6258", 1, "br"), "https://resultados.tse.jus.br/oficial/ele2026/6258/dados/br/br-c0001-e006258-u.json");
});

test("arquivo real do presidente no 2º turno (antes da votação): 22 × 13, zero votos, ninguém eleito", () => {
  const r = normalizarResultado(ler("ele2026/6258/dados/br/br-c0001-e006258-u.json"), { eleicao: "6258" });
  assert.deepEqual(r.candidatos.map((c) => c.numero).sort(), ["13", "22"]);
  assert.ok(r.candidatos.every((c) => c.votos === 0 && c.situacao !== "Eleito"));
});

test("RJ retotalizado em 10/10/2026: governador decidido no 1º turno (st Eleito), por isso fora do 2º turno", () => {
  const r = normalizarResultado(ler("ele2026/6259/dados/rj/rj-c0003-e006259-u.json"), { eleicao: "6259" });
  const eleitos = r.candidatos.filter((c) => c.situacao === "Eleito");
  assert.equal(eleitos.length, 1);
  assert.equal(eleitos[0].numero, "22");
});
