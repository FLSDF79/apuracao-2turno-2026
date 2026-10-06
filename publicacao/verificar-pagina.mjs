#!/usr/bin/env node
// Verifica a página de verdade num navegador (Playwright/Chromium): números na tela contra o contrato e,
// opcionalmente, contra o arquivo bruto do TSE; mapa (passar o cursor, clicar), filtros, ordenação,
// exportação, modo TV, celular sem rolagem lateral, faixa de ensaio/simulação e console sem erros.
//
//   node publicacao/verificar-pagina.mjs <url> [--tse arquivo-br-do-tse.json] [--telas pasta] [--modo ensaio]
//
// Sai com 1 se alguma verificação falhar. Imprime e devolve a lista de verificações.
import { execSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

export async function importarPlaywright() {
  try {
    return await import("playwright");
  } catch {
    return await import(pathToFileURL(join(execSync("npm root -g").toString().trim(), "playwright/index.mjs")).href);
  }
}

const soDigitos = (s) => Number(String(s).replace(/\D/g, ""));
const pct2 = (x) => x.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export async function verificarPagina(url, { tse = null, telas = null, modo = null } = {}) {
  const itens = [];
  const ok = (nome, cond, detalhe = "") => itens.push({ nome, ok: !!cond, detalhe: String(detalhe) });
  const origem = new URL(url).origin;
  const dados = await (await fetch(`${origem}/dados/v1/presidente.json`)).json();
  const bruto = tse ? JSON.parse(await readFile(tse, "utf8")) : null;
  if (telas) await mkdir(telas, { recursive: true });

  const pw = await importarPlaywright();
  const nav = await pw.chromium.launch();
  const erros = [], externos = [];
  const abrir = async (opcoes, caminho = "") => {
    const p = await nav.newPage(opcoes);
    p.on("console", (m) => {
      if (m.type() !== "error") return;
      if (!m.text().startsWith("Failed to load resource")) erros.push(m.text()); // falha de recurso é tratada em requestfailed, com a URL
    });
    p.on("pageerror", (e) => erros.push(String(e)));
    p.on("requestfailed", (q) => (new URL(q.url()).origin === origem ? erros.push(`${q.url()} ${q.failure()?.errorText}`) : externos.push(new URL(q.url()).host)));
    await p.goto(url + caminho);
    await p.waitForSelector("#placar .cand", { timeout: 15000 });
    await p.waitForTimeout(1200);
    return p;
  };

  // ---------- computador ----------
  const d = await abrir({ viewport: { width: 1440, height: 900 } });
  const cards = await d.$$eval("#placar .cand", (cs) => cs.map((c) => ({ num: c.querySelector(".cand-num")?.textContent.trim(), pct: c.querySelector(".cand-pct")?.textContent.trim(), votos: c.querySelector(".cand-votos")?.textContent.trim(), eleito: !!c.querySelector(".selo-sit.eleito") })));
  ok("placar com dois candidatos", cards.length === 2, cards.map((c) => c.num).join(" × "));
  for (const c of cards) {
    const ct = dados.brasil.oficial.candidatos.find((x) => x.numero === c.num);
    ok(`votos de ${c.num} na tela = contrato`, ct && soDigitos(c.votos) === ct.votos, `${c.votos} · contrato ${ct?.votos}`);
    ok(`% de ${c.num} na tela = contrato`, ct && c.pct === pct2(ct.pct_validos) + "%", `${c.pct} · contrato ${ct && pct2(ct.pct_validos)}%`);
    if (bruto) {
      const cb = bruto.carg[0].agr.flatMap((a) => a.par.flatMap((p) => p.cand)).find((x) => x.n === c.num);
      ok(`votos de ${c.num} na tela = arquivo do TSE (vap)`, cb && soDigitos(c.votos) === Number(cb.vap), `${c.votos} · TSE ${cb?.vap}`);
      ok(`% de ${c.num} na tela = arquivo do TSE (pvap)`, cb && c.pct === `${cb.pvap}%`, `${c.pct} · TSE ${cb?.pvap}%`);
    }
    if (c.eleito) ok(`"Eleito" de ${c.num} só com situação oficial`, dados.eleito?.publicado && dados.eleito.candidatos.includes(c.num), JSON.stringify(dados.eleito));
  }
  const tot = await d.$eval("#totPct", (e) => e.textContent.trim());
  ok("% totalizado na tela = contrato", tot === pct2(dados.brasil.oficial.indicadores.pct_totalizadas) + "%", tot);
  if (bruto) ok("% totalizado na tela = arquivo do TSE (pst)", tot === `${bruto.s.pst}%`, `${tot} · TSE ${bruto.s.pst}%`);
  if (modo && modo !== "oficial") {
    const faixa = await d.$eval("#faixaTeste", (e) => ({ visivel: !e.hidden, texto: e.innerText.replace(/\s+/g, " ").trim() })).catch(() => ({ visivel: false, texto: "sem #faixaTeste" }));
    ok(`faixa de teste "${modo}" visível`, faixa.visivel && new RegExp(modo === "ensaio" ? "ENSAIO" : "SIMULA", "i").test(faixa.texto), faixa.texto.slice(0, 120));
  } else ok("sem faixa de teste nos dados oficiais", await d.$eval("#faixaTeste", (e) => e.hidden).catch(() => true));
  ok("crédito do autor", await d.$eval("footer", (e) => /Fabiano Silva/.test(e.innerText)).catch(() => false));
  ok("selo NFLS.AI Arena", await d.$("#selo"));
  if (telas) await d.screenshot({ path: join(telas, "computador.png"), fullPage: true });

  // mapa: cursor e clique
  const sp = await d.$('#mapa [data-id="sp"]');
  ok("mapa desenhado com SP", sp);
  if (sp) {
    await sp.hover();
    await d.waitForTimeout(300);
    const tip = await d.$eval("#tooltip", (e) => ({ visivel: !e.hidden, texto: e.innerText }));
    ok("passar o cursor em SP mostra votos e totalização", tip.visivel && /São Paulo/.test(tip.texto) && /%/.test(tip.texto), tip.texto.replace(/\s+/g, " ").slice(0, 100));
    if (telas) await d.screenshot({ path: join(telas, "mapa-cursor-sp.png") });
    await sp.click();
    await d.waitForTimeout(400);
    const gav = await d.$eval("#gaveta", (e) => ({ visivel: !e.hidden, texto: e.innerText }));
    ok("clicar em SP abre o detalhamento estadual", gav.visivel && /São Paulo/.test(gav.texto), gav.texto.replace(/\s+/g, " ").slice(0, 100));
    if (telas) await d.screenshot({ path: join(telas, "detalhe-sp.png") });
    await d.keyboard.press("Escape");
    await d.waitForTimeout(200);
    ok("Esc fecha o detalhamento", await d.$eval("#gaveta", (e) => e.hidden));
  }
  ok("DF visível no mapa", await d.$('#mapa [data-id="df"]'));

  // filtro e ordenação
  await d.click('#filtroRegiao button[data-reg="n"]');
  await d.waitForTimeout(200);
  const linhasN = await d.$$eval("#tabUFs tbody tr", (t) => t.map((r) => r.dataset.id));
  ok("filtro Norte mostra as 7 UFs do Norte", linhasN.length === 7 && ["ac", "am", "ap", "pa", "ro", "rr", "to"].every((u) => linhasN.includes(u)), linhasN.join(","));
  await d.click('#filtroRegiao button[data-reg="todas"]');
  const botaoOrdem = await d.$("#tabUFs th button");
  if (botaoOrdem) {
    await botaoOrdem.click();
    await d.waitForTimeout(200);
    ok("tabela ordenável", await d.$("#tabUFs th[aria-sort]"));
  }
  // exportação
  await d.click("#btnExportar");
  await d.waitForTimeout(200);
  const exp = await d.$eval("#popExportar", (e) => ({ visivel: !e.hidden, texto: e.innerText }));
  ok("exportação CSV e JSON oferecida", exp.visivel && /CSV/i.test(exp.texto) && /JSON/i.test(exp.texto), exp.texto.replace(/\s+/g, " ").slice(0, 80));

  // ---------- celular ----------
  const c = await abrir({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const larg = await c.evaluate(() => ({ doc: document.documentElement.scrollWidth, tela: innerWidth }));
  ok("celular sem rolagem lateral", larg.doc <= larg.tela + 1, `${larg.doc}px em ${larg.tela}px`);
  const spCel = await c.$('#mapa [data-id="sp"]');
  if (spCel) {
    await spCel.tap();
    await c.waitForTimeout(400);
    ok("tocar em SP no celular abre detalhe", await c.$eval("#gaveta", (e) => !e.hidden));
  }
  if (telas) {
    await c.keyboard.press("Escape");
    await c.screenshot({ path: join(telas, "celular.png"), fullPage: true });
  }

  // ---------- modo TV ----------
  const tv = await abrir({ viewport: { width: 1920, height: 1080 } }, (url.includes("?") ? "&" : "?") + "tv=1");
  ok("modo TV ativo", await tv.evaluate(() => document.documentElement.className + " " + document.body.className).then((cl) => /tv/.test(cl)));
  if (telas) await tv.screenshot({ path: join(telas, "tv.png") });

  ok("console sem erros da página (inclui violação de CSP)", erros.length === 0, erros.slice(0, 3).join(" | "));
  if (externos.length) itens.push({ nome: "recursos externos que não carregaram (fonte/selo; rede deste ambiente)", ok: true, detalhe: [...new Set(externos)].join(", ") });
  await nav.close();
  return itens;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { values: a, positionals } = parseArgs({ allowPositionals: true, options: { tse: { type: "string" }, telas: { type: "string" }, modo: { type: "string" }, json: { type: "string" } } });
  const itens = await verificarPagina(positionals[0], a);
  for (const i of itens) console.log(`${i.ok ? "ok   " : "FALHA"} ${i.nome}${i.detalhe ? ` · ${i.detalhe}` : ""}`);
  if (a.json) await writeFile(a.json, JSON.stringify(itens, null, 1));
  process.exit(itens.every((i) => i.ok) ? 0 : 1);
}
