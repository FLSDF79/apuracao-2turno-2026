// Armazenamento em pasta local (adaptador Node): arquivos do contrato, corpos oficiais por hash e estado.
import { mkdir, readFile, writeFile, rename, access } from "node:fs/promises";
import { dirname, join } from "node:path";

async function gravarAtomico(caminho, conteudo) {
  await mkdir(dirname(caminho), { recursive: true });
  const tmp = `${caminho}.tmp`;
  await writeFile(tmp, typeof conteudo === "string" ? conteudo : JSON.stringify(conteudo));
  await rename(tmp, caminho);
}

export async function gravarSaidas(pasta, saidas, brutos = {}) {
  for (const [caminho, conteudo] of Object.entries(saidas)) await gravarAtomico(join(pasta, caminho), conteudo);
  for (const [sha, texto] of Object.entries(brutos)) {
    const destino = join(pasta, "v1", "snapshots", `${sha}.json`);
    try {
      await access(destino); // já guardado: o conteúdo é o mesmo por definição do hash
    } catch {
      await gravarAtomico(destino, texto);
    }
  }
}

export async function carregarEstado(arquivo) {
  try {
    return JSON.parse(await readFile(arquivo, "utf8"));
  } catch {
    return null;
  }
}

export async function gravarEstado(arquivo, estado) {
  await gravarAtomico(arquivo, estado);
}
