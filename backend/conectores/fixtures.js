// fetch falso que serve os arquivos oficiais guardados em tests/fixtures, pelo mesmo caminho da URL.
// Arquivo ausente responde 404, como o armazenamento do TSE. Serve para testes e para o modo ensaio offline.
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export function fetchDeFixtures(raiz, { base = "https://resultados.tse.jus.br", sobrescrever = {}, registro = [] } = {}) {
  return async (url, init = {}) => {
    registro.push(url);
    if (sobrescrever[url]) return sobrescrever[url](url, init);
    if (!url.startsWith(base + "/")) return new Response("fora da base", { status: 404 });
    const caminho = join(raiz, url.slice(base.length + 1));
    let corpo;
    try {
      corpo = await readFile(caminho, "utf8");
    } catch {
      return new Response("<Error><Code>NoSuchKey</Code></Error>", { status: 404, headers: { "content-type": "application/xml" } });
    }
    const etag = `"${hash(corpo)}"`;
    const inm = init.headers?.["If-None-Match"];
    if (inm && inm === etag) return new Response(null, { status: 304, headers: { etag } });
    return new Response(corpo, { status: 200, headers: { etag, "content-type": "application/json" } });
  };
}

function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return h.toString(16);
}
