// Servidor estático mínimo para ensaio e verificação local: serve a pasta do site (página + dados/ do coletor)
// na mesma origem, como a Cloudflare, com os mesmos cabeçalhos de segurança. Só para uso local.
import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { CABECALHOS } from "./seguranca.mjs";

const TIPOS = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".csv": "text/csv; charset=utf-8", ".geojson": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };

export function servirSite(pasta, porta, { aoPedir } = {}) {
  const raiz = resolve(pasta);
  return new Promise((ok) => {
    const s = createServer((req, res) => {
      aoPedir?.(req);
      const caminho = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname));
      let arq = join(raiz, caminho);
      if (existsSync(arq) && statSync(arq).isDirectory()) arq = join(arq, "index.html");
      if (!arq.startsWith(raiz) || !existsSync(arq)) return res.writeHead(404, CABECALHOS).end("não encontrado");
      res.writeHead(200, { ...CABECALHOS, "content-type": TIPOS[extname(arq)] ?? "application/octet-stream", "cache-control": "no-store" });
      createReadStream(arq).pipe(res);
    });
    s.listen(porta, "127.0.0.1", () => ok(s));
  });
}
