#!/usr/bin/env node
// Monta a pasta do site que vai para a Cloudflare (ou para o ensaio local): só os arquivos da página
// e os exemplos usados em ?fonte=ensaio / ?fonte=simulacao. Fixtures, testes e código do coletor ficam de fora.
//   node publicacao/montar-site.mjs [destino]     (padrão: dist/site)
import { cp, mkdir, rm, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
export const ARQUIVOS_SITE = ["index.html", "style.css", "config.js", "js", "data", "exemplos"];

export async function montarSite(destino = join(RAIZ, "dist/site")) {
  await rm(destino, { recursive: true, force: true });
  await mkdir(destino, { recursive: true });
  for (const item of ARQUIVOS_SITE) {
    await stat(join(RAIZ, item)); // falha alto se a página mudar de estrutura
    await cp(join(RAIZ, item), join(destino, item), { recursive: true });
  }
  return destino;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(`site montado em ${await montarSite(process.argv[2] ? resolve(process.argv[2]) : undefined)}`);
}
