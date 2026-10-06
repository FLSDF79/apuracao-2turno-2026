#!/usr/bin/env node
// Primeira versão ponta a ponta com DADOS OFICIAIS REAIS (1º turno de 04/10/2026, baixados do TSE em 06/10):
//   arquivos do TSE (conferidos pelo MANIFEST.sha256) → coletor de verdade (modo "ensaio")
//   → normalização e cálculo (nucleo/) → contrato v1 → página de verdade → navegador.
// A tela mostra a faixa "ENSAIO · dados oficiais do 1º turno": nunca é apresentado como 2º turno.
//
//   node publicacao/ponta-a-ponta.mjs [--saida pasta] [--porta 8792]
import { spawnSync, execSync } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { montarSite } from "./montar-site.mjs";
import { servirSite } from "./servidor-local.mjs";
import { verificarPagina } from "./verificar-pagina.mjs";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const FIX = join(RAIZ, "tests/fixtures/tse-2026-10-06");
const { values: a } = parseArgs({ options: { saida: { type: "string", default: join(RAIZ, "ensaio/saida/ponta-a-ponta") }, porta: { type: "string", default: "8792" } } });
await mkdir(a.saida, { recursive: true });

console.log("1. arquivos oficiais do TSE conferidos pelo hash (sha256)");
const hash = spawnSync("sha256sum", ["-c", "--quiet", "MANIFEST.sha256"], { cwd: FIX, encoding: "utf8" });
const nArquivos = execSync("grep -c . MANIFEST.sha256", { cwd: FIX }).toString().trim();
console.log(hash.status === 0 ? `   ok: ${nArquivos} arquivos íntegros` : `   FALHA\n${hash.stdout}${hash.stderr}`);

console.log("2. coletor real lendo os arquivos oficiais (modo ensaio, 1º turno)");
const site = await montarSite(join(a.saida, "site"));
await rm(join(a.saida, "estado.json"), { force: true }); // sempre do zero: lê os arquivos de verdade (200), não o cache
const t0 = Date.now();
const col = spawnSync(process.execPath, [join(RAIZ, "coletor/node.js"), "--modo", "ensaio", "--fixtures", FIX, "--uma-vez", "--saida", join(site, "dados"), "--estado", join(a.saida, "estado.json")], { encoding: "utf8" });
console.log(`   ${col.stdout.trim()} (${Date.now() - t0} ms)`);

console.log("3. página no navegador, números na tela contra o arquivo do TSE");
const srv = await servirSite(site, Number(a.porta));
const itens = await verificarPagina(`http://127.0.0.1:${a.porta}/`, { tse: join(FIX, "oficial/ele2026/6257/dados/br/br-c0001-e006257-u.json"), telas: join(a.saida, "telas"), modo: "ensaio" });
srv.close();
itens.unshift({ nome: "arquivos oficiais íntegros (sha256)", ok: hash.status === 0, detalhe: `${nArquivos} arquivos` }, { nome: "coletor rodou sobre os arquivos oficiais", ok: col.status === 0, detalhe: col.stdout.trim() });
for (const i of itens) console.log(`   ${i.ok ? "ok   " : "FALHA"} ${i.nome}${i.detalhe ? ` · ${i.detalhe}` : ""}`);
await writeFile(join(a.saida, "resultado.json"), JSON.stringify({ quando: new Date().toISOString(), itens }, null, 1));
process.exit(itens.every((i) => i.ok) ? 0 : 1);
