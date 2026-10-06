#!/usr/bin/env node
// Coletor para Node (Mac, servidor próprio ou CI). Grava os arquivos do contrato numa pasta.
//
//   node coletor/node.js --saida public/dados                 # 2º turno, a cada 15 s
//   node coletor/node.js --saida public/dados --uma-vez
//   node coletor/node.js --modo ensaio --fixtures tests/fixtures/tse-2026-10-06 --uma-vez
//   node coletor/node.js --ambiente simulado --base https://resultados-sim.tse.jus.br --modo ensaio
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { dirname, join } from "node:path";
import { parseArgs } from "node:util";
import { Fonte } from "./fonte.js";
import { rodada, OPCOES_PADRAO } from "./rodada.js";
import { fetchDeFixtures } from "./fixtures.js";

const { values: a } = parseArgs({
  options: {
    saida: { type: "string", default: "public/dados" },
    estado: { type: "string" },
    intervalo: { type: "string", default: String(OPCOES_PADRAO.intervaloS) },
    modo: { type: "string", default: "oficial" },
    base: { type: "string", default: OPCOES_PADRAO.base },
    ambiente: { type: "string", default: OPCOES_PADRAO.ambiente },
    fixtures: { type: "string" },
    "uma-vez": { type: "boolean", default: false },
  },
});

const intervaloS = Math.max(10, Number(a.intervalo)); // nunca abaixo de 10 s
const arquivoEstado = a.estado ?? join(a.saida, "..", "estado-coletor.json");

async function gravarAtomico(caminho, conteudo) {
  await mkdir(dirname(caminho), { recursive: true });
  const tmp = `${caminho}.tmp`;
  await writeFile(tmp, typeof conteudo === "string" ? conteudo : JSON.stringify(conteudo));
  await rename(tmp, caminho);
}

let estado = null;
try {
  estado = JSON.parse(await readFile(arquivoEstado, "utf8"));
} catch {}

const fonte = new Fonte({
  fetch: a.fixtures ? fetchDeFixtures(join(a.fixtures), { base: a.base }) : undefined,
  estado: estado?.fonte,
});

for (;;) {
  const t0 = Date.now();
  const r = await rodada(fonte, estado, { modo: a.modo, base: a.base, ambiente: a.ambiente, intervaloS });
  estado = r.estado;
  for (const [caminho, conteudo] of Object.entries(r.saidas)) await gravarAtomico(join(a.saida, caminho), conteudo);
  await gravarAtomico(arquivoEstado, estado);
  const s = r.saidas["v1/saude.json"].coletor;
  const pres = r.saidas["v1/presidente.json"];
  console.log(`${new Date().toISOString()} ${pres.estado_publicacao} req=${s.rodada.requisicoes} http=${JSON.stringify(s.status_http)} conferência=${pres.conferencia?.classificacao.codigo ?? "-"}${s.pausa ? ` PAUSA até ${s.pausa.ate}` : ""}`);
  if (a["uma-vez"]) break;
  await new Promise((res) => setTimeout(res, Math.max(1000, intervaloS * 1000 - (Date.now() - t0))));
}
