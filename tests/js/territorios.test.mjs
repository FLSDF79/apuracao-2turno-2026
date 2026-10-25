import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tabelaTerritorios } from "../../backend/api/contrato.js";
import { ler } from "./apoio.mjs";

test("tabela TSE × IBGE: 27 UFs, códigos IBGE distintos, mesmas siglas da malha do mapa e da abrangência do TSE", () => {
  const t = tabelaTerritorios().territorios;
  const ufs = t.filter((x) => x.tipo === "uf");
  assert.equal(ufs.length, 27);
  assert.equal(new Set(ufs.map((u) => u.ibge_uf)).size, 27);
  assert.ok(ufs.every((u) => /^[1-5]\d$/.test(u.ibge_uf) && u.ibge_uf[0] === { N: "1", NE: "2", SE: "3", S: "4", CO: "5" }[u.regiao]));
  assert.ok(ufs.every((u) => u.tse !== u.ibge_uf)); // sistemas diferentes, nunca presumidos iguais
  const geo = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../../data/br-uf.geojson"), "utf8"));
  assert.deepEqual(geo.features.map((f) => f.properties.uf).sort(), ufs.map((u) => u.tse).sort());
  const ab = ler("ele2026/6257/dados/br/br-e006257-ab.json").abr.map((a) => a.cdabr);
  assert.deepEqual(t.map((x) => x.tse).sort(), ab.sort());
});
