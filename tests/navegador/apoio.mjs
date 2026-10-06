// Apoio dos testes no navegador: servidor estático da raiz do repositório e abertura de páginas
// no Chromium do Playwright, com fontes externas neutralizadas (o teste não depende da rede).
import http from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

export const RAIZ = fileURLToPath(new URL("../../", import.meta.url));
export const EVIDENCIAS = process.env.EVIDENCIAS ? join(RAIZ, "docs/evidencias/painel") : null;

const TIPOS = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".geojson": "application/json", ".svg": "image/svg+xml", ".csv": "text/csv", ".png": "image/png" };

export async function servidor() {
  const srv = http.createServer(async (req, res) => {
    const caminho = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^([/\\])+/, "") || "index.html";
    if (caminho.startsWith("..")) { res.writeHead(403).end(); return; }
    try {
      const corpo = await readFile(join(RAIZ, caminho));
      res.writeHead(200, { "content-type": TIPOS[extname(caminho)] || "application/octet-stream" }).end(corpo);
    } catch { res.writeHead(404).end("nao encontrado"); }
  });
  await new Promise((ok) => srv.listen(0, "127.0.0.1", ok));
  return { url: `http://127.0.0.1:${srv.address().port}/`, fechar: () => new Promise((ok) => srv.close(ok)) };
}

export async function navegador() {
  const exe = process.env.CHROMIUM_PATH || undefined;
  return chromium.launch(exe ? { executablePath: exe } : {});
}

// Abre uma página e registra todo erro de console e exceção não tratada.
// opcoes.config: trechos que substituem valores do config.js (ex.: intervalo curto para os cenários).
export async function abrir(nav, url, { viewport = { width: 1440, height: 900 }, tema = "dark", config, rotas } = {}) {
  const ctx = await nav.newContext({ viewport, colorScheme: tema, reducedMotion: "reduce" });
  const pagina = await ctx.newPage();
  const erros = [];
  pagina.on("pageerror", (e) => erros.push("exceção: " + e.message));
  pagina.on("console", (m) => { if (m.type() === "error") erros.push("console: " + m.text()); });
  await pagina.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  if (config) {
    await pagina.route("**/config.js", async (r) => {
      const orig = await readFile(join(RAIZ, "config.js"), "utf8");
      r.fulfill({ status: 200, contentType: "text/javascript", body: orig + `\nObject.assign(window.PAINEL_CONFIG, ${JSON.stringify(config)});` });
    });
  }
  for (const [padrao, tratar] of rotas || []) await pagina.route(padrao, tratar);
  await pagina.goto(url);
  return { pagina, erros, fechar: () => ctx.close() };
}

export async function lerJSON(rel) { return JSON.parse(await readFile(join(RAIZ, rel), "utf8")); }

export async function evidencia(pagina, nome, opcoes = {}) {
  if (!EVIDENCIAS) return;
  await mkdir(EVIDENCIAS, { recursive: true });
  await pagina.screenshot({ path: join(EVIDENCIAS, nome + ".jpg"), type: "jpeg", quality: 72, ...opcoes });
}

export async function registrar(relatorio) {
  if (!EVIDENCIAS) return;
  await mkdir(EVIDENCIAS, { recursive: true });
  await writeFile(join(EVIDENCIAS, "relatorio.json"), JSON.stringify(relatorio, null, 2) + "\n");
}
