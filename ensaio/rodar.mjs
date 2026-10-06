#!/usr/bin/env node
// Ensaio geral da noite de apuração (frente 4), ponta a ponta e com relógio real:
//   TSE simulado (ensaio/tse-simulado.mjs + roteiro) → coletor de verdade (ensaio/coletor-ensaio.mjs: mesma rodada do backend) → arquivos do contrato
//   → página de verdade num servidor local → navegador (Playwright) tirando telas nos marcos.
// A cada rodada confere as regras do prompt sobre os arquivos gerados e, no fim, grava um relatório.
//
//   node ensaio/rodar.mjs                      # noite completa (~26 min)
//   node ensaio/rodar.mjs --escala 2           # o roteiro anda 2× mais rápido que o relógio (~13 min)
//   node ensaio/rodar.mjs --sem-telas          # sem navegador
//
// Nada aqui consulta o TSE de verdade.
import { spawn, execSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { carregarBase } from "../backend/conectores/simulador.js";
import { criarTseSimulado } from "./tse-simulado.mjs";
import { MARCOS, DURACAO_MIN } from "./roteiro.mjs";
import { montarSite } from "../publicacao/montar-site.mjs";
import { conferirSnapshot } from "./conferir.mjs";
import { servirSite } from "../publicacao/servidor-local.mjs";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const { values: a } = parseArgs({
  options: {
    escala: { type: "string", default: "1" },
    saida: { type: "string", default: join(RAIZ, "ensaio/saida") },
    "porta-tse": { type: "string", default: "8790" },
    "porta-site": { type: "string", default: "8791" },
    "sem-telas": { type: "boolean", default: false },
  },
});
const escala = Number(a.escala);
const SAIDA = a.saida;
const SITE = join(SAIDA, "site");
const TELAS = join(SAIDA, "telas");
await mkdir(TELAS, { recursive: true });
await montarSite(SITE);

// ---------- TSE simulado ----------
const base = await carregarBase(join(RAIZ, "tests/fixtures/tse-2026-10-06"));
const inicioReal = Date.now();
const relogioRoteiro = () => inicioReal + (Date.now() - inicioReal) * escala;
const requisicoes = []; // { em, t, rel, status }
const versoesTse = new Map(); // % totalizado publicado no arquivo nacional → primeira vez servido
const tse = criarTseSimulado({ base, inicioMs: inicioReal, agora: relogioRoteiro });
const minutoRoteiro = () => (relogioRoteiro() - inicioReal) / 60000;

const servidorTse = createServer(async (req, res) => {
  const r = await tse(new Request(`http://127.0.0.1${req.url}`, { headers: req.headers }));
  requisicoes.push({ em: Date.now(), t: minutoRoteiro(), rel: req.url, status: r.status });
  const corpo = r.status === 304 ? null : Buffer.from(await r.arrayBuffer());
  if (corpo && r.status === 200 && /\/br\/br-c0001-/.test(req.url)) {
    const pst = JSON.parse(corpo).s?.pst;
    if (pst && !versoesTse.has(pst)) versoesTse.set(pst, Date.now());
  }
  res.writeHead(r.status, Object.fromEntries(r.headers));
  res.end(corpo ?? undefined);
}).listen(Number(a["porta-tse"]), "127.0.0.1");

// ---------- site (página + dados do coletor, mesma origem, como na Cloudflare) ----------
const pedidosDados = []; // { em, caminho, pagina } para medir a carga que cada visitante gera
const servidorSite = await servirSite(SITE, Number(a["porta-site"]), { aoPedir: (req) => req.url.includes("/dados/") && pedidosDados.push({ em: Date.now(), caminho: req.url }) });

// ---------- coletor de verdade ----------
const logColetor = [];
await rm(join(SAIDA, "estado-coletor.json"), { force: true }); // estado limpo a cada ensaio
const coletor = spawn(process.execPath, [join(RAIZ, "ensaio/coletor-ensaio.mjs"), "--saida", join(SITE, "dados"), "--estado", join(SAIDA, "estado-coletor.json"), "--local", `http://127.0.0.1:${a["porta-tse"]}`, "--modo", "simulacao", "--intervalo", "15"], { stdio: ["ignore", "pipe", "pipe"] });
coletor.stdout.on("data", (b) => logColetor.push(...String(b).trim().split("\n")));
coletor.stderr.on("data", (b) => logColetor.push(...String(b).trim().split("\n").map((l) => `ERRO ${l}`)));

// ---------- navegador ----------
let navegador = null, paginas = null;
const errosConsole = [];
if (!a["sem-telas"]) {
  const pw = await importarPlaywright();
  navegador = await pw.chromium.launch();
  const desk = await navegador.newPage({ viewport: { width: 1440, height: 900 } });
  const cel = await navegador.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, deviceScaleFactor: 2 });
  for (const p of [desk, cel]) {
    // recurso externo (logo da NFLS.AI Arena) pode falhar neste ambiente: só conta falha de recurso do próprio painel
    p.on("console", (m) => m.type() === "error" && !m.text().startsWith("Failed to load resource") && errosConsole.push({ t: minutoRoteiro(), texto: m.text() }));
    p.on("requestfailed", (q) => new URL(q.url()).hostname === "127.0.0.1" && errosConsole.push({ t: minutoRoteiro(), texto: `falhou ${q.url()}: ${q.failure()?.errorText}` }));
    p.on("pageerror", (e) => errosConsole.push({ t: minutoRoteiro(), texto: String(e) }));
    await p.goto(`http://127.0.0.1:${a["porta-site"]}/`); // a página fica aberta a noite toda, como um visitante
  }
  paginas = { desk, cel };
}

async function importarPlaywright() {
  try {
    return await import("playwright");
  } catch {
    const raiz = execSync("npm root -g").toString().trim();
    return await import(pathToFileURL(join(raiz, "playwright/index.mjs")).href);
  }
}

// ---------- latência: quando cada % totalizado aparece no arquivo do coletor e na tela ----------
const noArquivo = new Map(), naTela = new Map();
const fmt2 = (x) => x.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const amostrador = setInterval(async () => {
  try {
    const p = JSON.parse(await readFile(join(SITE, "dados/v1/presidente.json"), "utf8"));
    const v = p.brasil?.oficial?.indicadores?.pct_totalizadas;
    if (v != null && !noArquivo.has(fmt2(v))) noArquivo.set(fmt2(v), Date.now());
  } catch {}
  try {
    const v = (await paginas?.desk.$eval("#totPct", (e) => e.textContent))?.replace("%", "").trim();
    if (v && v !== "—" && !naTela.has(v)) naTela.set(v, Date.now());
  } catch {}
}, 1000);

// ---------- laço do ensaio ----------
const linhas = []; // uma por conferência
const falhas = [];
const observacoes = new Map();
const marcosVistos = [];
let anterior = null;
const fimMin = DURACAO_MIN;
console.log(`ensaio: escala ${escala}×, ~${Math.ceil(fimMin / escala)} min. Página em http://127.0.0.1:${a["porta-site"]}/`);

for (const m of MARCOS.filter((m) => m.t < fimMin)) {
  // espera até 75 s (de relógio real) depois do marco: tempo do coletor rodar e da página reler
  const alvo = inicioReal + (m.t * 60000) / escala + Math.max(35000, 75000 / escala);
  while (Date.now() < alvo) {
    await esperar(15000);
    await conferir();
  }
  await conferir(m);
  if (paginas) {
    const tv = await navegador.newPage({ viewport: { width: 1920, height: 1080 } });
    await tv.goto(`http://127.0.0.1:${a["porta-site"]}/?tv=1`);
    await esperar(2500);
    await paginas.desk.screenshot({ path: join(TELAS, `${String(m.t).padStart(2, "0")}-${m.id}-desktop.png`), fullPage: true });
    await paginas.cel.screenshot({ path: join(TELAS, `${String(m.t).padStart(2, "0")}-${m.id}-celular.png`) });
    await tv.screenshot({ path: join(TELAS, `${String(m.t).padStart(2, "0")}-${m.id}-tv.png`) });
    const pagina = await paginas.desk.evaluate(() => ({
      seloEleito: document.querySelectorAll(".selo-sit.eleito").length,
      totPct: document.getElementById("totPct")?.textContent,
      saude: document.getElementById("saudeTxt")?.textContent,
      avisos: document.getElementById("avisos")?.innerText.trim(),
      faixaSimulacao: !document.getElementById("faixaTeste")?.hidden && /SIMULA/i.test(document.getElementById("faixaTeste")?.innerText || ""),
    }));
    if (!pagina.faixaSimulacao && m.id !== "antes") falhas.push({ marco: m.id, regra: "pagina-simulacao", detalhe: "página sem a faixa de simulação" });
    marcosVistos.at(-1).pagina = pagina;
    const eleitoNoArquivo = JSON.parse(await readFile(join(SITE, "dados/v1/presidente.json"), "utf8")).eleito?.publicado;
    if (pagina.seloEleito && !eleitoNoArquivo) falhas.push({ marco: m.id, regra: "pagina-eleito", detalhe: "página mostrou Eleito sem o TSE publicar" });
    if (m.id === "final" && eleitoNoArquivo && pagina.seloEleito !== 1) falhas.push({ marco: m.id, regra: "pagina-eleito", detalhe: `esperava 1 selo de eleito, vi ${pagina.seloEleito}` });
    await tv.close();
  }
}

async function conferir(marco = null) {
  let pres, saude, hist;
  try {
    [pres, saude, hist] = await Promise.all(["presidente", "saude", "historico"].map(async (n) => JSON.parse(await readFile(join(SITE, "dados/v1", `${n}.json`), "utf8"))));
  } catch {
    return; // primeira rodada ainda não gravou
  }
  const t = minutoRoteiro();
  const r = conferirSnapshot({ pres, saude, hist, anterior, t, modoEsperado: "simulacao" });
  anterior = { pres, saude, hist };
  for (const f of r.falhas) falhas.push({ t: +t.toFixed(2), ...f });
  for (const o of r.observacoes) observacoes.set(o.regra, { primeira_vez_t: +t.toFixed(2), ...o, ...(observacoes.get(o.regra) && { primeira_vez_t: observacoes.get(o.regra).primeira_vez_t }) });
  const linha = { t: +t.toFixed(2), em: new Date().toISOString(), ...r.resumo };
  linhas.push(linha);
  if (marco) marcosVistos.push({ ...marco, ...linha });
  console.log(`t=${t.toFixed(1)} ${r.resumo.estado_publicacao} tot=${r.resumo.pct_totalizadas ?? "-"} conf=${r.resumo.conferencia ?? "-"} coleta=${r.resumo.coleta} ${r.falhas.length ? "FALHA " + r.falhas.map((f) => f.regra).join(",") : ""}`);
}

// ---------- expectativas por marco (o que o roteiro provoca e o sistema tem de mostrar) ----------
const porId = Object.fromEntries(marcosVistos.map((m) => [m.id, m]));
const durante = (de, ate) => linhas.filter((l) => l.t >= de && l.t < ate);
const espera = (cond, regra, detalhe) => !cond && falhas.push({ regra, detalhe });
espera(porId.antes?.estado_publicacao === "aguardando_configuracao", "marco-antes", `estado ${porId.antes?.estado_publicacao}`);
espera(durante(0, 2).every((l) => l.req_resultados === 0), "marco-antes", "coletor pediu arquivo de resultado antes da configuração publicar o 2º turno");
espera(["aguardando_resultados"].includes(porId.publicada?.estado_publicacao), "marco-publicada", `estado ${porId.publicada?.estado_publicacao}`);
espera(durante(5, 22).some((l) => l.estado_publicacao === "em_apuracao"), "marco-apuracao", "nunca entrou em em_apuracao");
espera(durante(9.5, 11).some((l) => l.conferencia && l.conferencia !== "compativel"), "marco-sp-atrasado", "conferência não acusou SP atrasado");
espera(durante(11, 26).some((l) => l.correcoes_ac > 0), "marco-correcao", "correção do AC não entrou no histórico");
espera(durante(13, 15).some((l) => ["pausada", "bloqueada", "atrasada"].includes(l.coleta)), "marco-503", "coletor não sinalizou a instabilidade do TSE");
espera(durante(15.5, 17).some((l) => l.rr === "defasado"), "marco-rr", "RR não apareceu como defasado com o último dado válido");
espera(durante(17.5, 18).some((l) => l.rr === "atualizado") || durante(18, 22).some((l) => l.rr === "atualizado"), "marco-rr", "RR não voltou depois do erro");
espera(durante(18, 19.5).some((l) => l.coleta === "bloqueada" || l.coleta === "pausada"), "marco-429", "429 não pausou o coletor");
espera(porId.final?.eleito === true, "marco-final", "eleito não publicado no fim");
espera(porId.final?.conferencia === "compativel", "marco-final", `conferência final ${porId.final?.conferencia}`);
espera(durante(0, 22).every((l) => !l.eleito), "marco-eleito-cedo", "eleito apareceu antes do TSE publicar");
for (const e of errosConsole) falhas.push({ t: +e.t.toFixed(2), regra: "console-pagina", detalhe: e.texto });

clearInterval(amostrador);
// disponível no TSE simulado = início do bloco de 30 s em que a versão passou a existir (o roteiro muda a cada 30 s)
const bloco = 30000 / escala;
const latencias = [...versoesTse].map(([pst, servido]) => {
  const disponivel = inicioReal + Math.floor((servido - inicioReal) / bloco) * bloco;
  return { pct: pst, disponivel_em: new Date(disponivel).toISOString(), coletor_s: noArquivo.has(pst) ? (noArquivo.get(pst) - disponivel) / 1000 : null, tela_s: naTela.has(pst) ? (naTela.get(pst) - disponivel) / 1000 : null };
}).filter((l) => l.pct !== "0,00");
const est = (xs) => {
  const v = xs.filter((x) => x != null).sort((x, y) => x - y);
  return v.length ? { n: v.length, mediana: v[Math.floor(v.length / 2)], p90: v[Math.floor(v.length * 0.9)], max: v.at(-1) } : null;
};
const latencia = { coletor: est(latencias.map((l) => l.coletor_s)), tela: est(latencias.map((l) => l.tela_s)), versoes_sem_tela: latencias.filter((l) => l.tela_s == null).map((l) => l.pct) };

// carga que cada visitante gera no Worker: pedidos a /dados por página aberta
const minutosAbertos = (Date.now() - inicioReal) / 60000;
const porVisitante = pedidosDados.length / (paginas ? 2 : 1) / minutosAbertos;
const cargaVisitante = { pedidos_por_minuto: +porVisitante.toFixed(1), pedidos_por_hora: Math.round(porVisitante * 60), por_arquivo: pedidosDados.reduce((o, q) => ((o[q.caminho.replace(/\?.*/, "")] = (o[q.caminho.replace(/\?.*/, "")] ?? 0) + 1), o), {}) };

// ---------- carga no TSE ----------
const porMinuto = {};
for (const q of requisicoes) porMinuto[Math.floor((q.em - inicioReal) / 60000)] = (porMinuto[Math.floor((q.em - inicioReal) / 60000)] ?? 0) + 1;
const maxPorMin = Math.max(...Object.values(porMinuto));
const statusTse = requisicoes.reduce((o, q) => ((o[q.status] = (o[q.status] ?? 0) + 1), o), {});

const resultado = { inicio: new Date(inicioReal).toISOString(), escala, falhas, observacoes: [...observacoes.values()], marcos: marcosVistos, linhas, carga: { total: requisicoes.length, max_por_minuto: maxPorMin, status: statusTse }, latencia, latencias, cargaVisitante, errosConsole, logColetor: logColetor.slice(-400) };
await writeFile(join(SAIDA, "resultado.json"), JSON.stringify(resultado, null, 1));
console.log(`\nfalhas: ${falhas.length}`);
for (const f of falhas) console.log(" -", JSON.stringify(f));
for (const o of observacoes.values()) console.log(" observação:", JSON.stringify(o));
console.log("latência (s):", JSON.stringify(latencia));
console.log("carga por visitante:", JSON.stringify(cargaVisitante));
console.log(`carga no TSE simulado: ${requisicoes.length} requisições, pico ${maxPorMin}/min, status ${JSON.stringify(statusTse)}`);

coletor.kill();
servidorTse.close();
servidorSite.close();
await navegador?.close();
process.exit(falhas.length ? 1 : 0);

function esperar(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
