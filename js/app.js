// Painel de apuração 2026 — interface.
// Lê os snapshots publicados pelo coletor (frente 2) e só apresenta.
// Não consulta o TSE, não soma territórios e não recalcula percentuais nem a conferência.
import * as F from "./formato.js";
import {
  UFS, REGIOES, REGIAO_DA_UF, NOMES, SITUACOES, CONFERENCIA, MODOS,
  normalizar, normalizarHistorico, normalizarGovernador, visualTerritorio, FAIXAS_MARGEM
} from "./contrato.js";
import { PALETAS, carregarCores, salvarCores, trocar } from "./cores.js";
import { prepararGeo, svgGeo, svgGrade, defs } from "./mapa.js";
import { csvTerritorios, csvHistorico, jsonCompleto, baixar } from "./exportar.js";

const CFG = window.PAINEL_CONFIG;
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const FONTE = CFG.fontes[params.get("fonte")] ? params.get("fonte") : CFG.fontePadrao;
const URLS = CFG.fontes[FONTE];

const E = {
  bruto: null, modelo: null, problemas: [], historico: [], gov: null,
  ultimoOk: null, erro: null, carregou: false, ciclo: 0, timer: null,
  cores: carregarCores(CFG.candidatos),
  op: { nivel: "uf", forma: "geo", intensidade: true, eixo: "tempo", regiao: "todas", busca: "", ordem: { col: "uf", asc: true } },
  geo: null, selecionado: null
};

// ---------------------------------------------------------------- utilidades
const principais = () => E.modelo?.candidatos.principais || CFG.candidatos.map((c) => ({ ...c, nomeUrna: c.nome }));
const pal = (numero) => PALETAS[E.cores[numero]] || null;
const claro = () => document.documentElement.dataset.tema === "claro";
const corTexto = (numero) => { const p = pal(numero); return p ? (claro() ? p.textoClaro : p.texto) : "var(--tinta)"; };
const nomeCand = (numero) => principais().find((c) => c.numero === numero)?.nome
  || F.nomeLegivel(E.modelo?.candidatos.outros.find((c) => c.numero === numero)?.nome) || numero;

function aplicarCoresCSS() {
  const [a, b] = principais();
  const r = document.documentElement.style;
  r.setProperty("--cand-a", pal(a.numero).base);
  r.setProperty("--cand-b", pal(b.numero).base);
  r.setProperty("--cand-a-txt", corTexto(a.numero));
  r.setProperty("--cand-b-txt", corTexto(b.numero));
}

// ---------------------------------------------------------------- carga
async function buscar(url) {
  const ctl = new AbortController();
  const to = setTimeout(() => ctl.abort(), 8000);
  try {
    // no-cache: o navegador revalida com ETag/If-Modified-Since e recebe 304 quando nada mudou.
    const r = await fetch(url, { cache: "no-cache", signal: ctl.signal });
    if (!r.ok) { const e = new Error("HTTP " + r.status); e.status = r.status; throw e; }
    return await r.json();
  } finally { clearTimeout(to); }
}

async function atualizar() {
  clearTimeout(E.timer);
  E.ciclo++;
  try {
    const snap = await buscar(URLS.estado);
    const { modelo, problemas } = normalizar(snap, CFG);
    if (!modelo) throw new Error(problemas.join(" "));
    E.bruto = snap; E.modelo = modelo; E.problemas = problemas;
    E.ultimoOk = Date.now(); E.erro = null;
  } catch (err) {
    // preserva o último dado válido e mostra a defasagem
    E.erro = err.name === "AbortError" ? "tempo esgotado" : err.message || String(err);
  }
  try { E.historico = normalizarHistorico(await buscar(URLS.historico)); } catch { /* mantém o anterior */ }
  if (E.ciclo % 3 === 1 || !E.gov) {
    try { E.gov = normalizarGovernador(await buscar(URLS.governador)); } catch { /* mantém o anterior */ }
  }
  E.carregou = true;
  renderTudo();
  const seg = document.hidden ? Math.max(CFG.atualizacaoSeg * 3, 30) : CFG.atualizacaoSeg;
  E.timer = setTimeout(atualizar, seg * 1000);
}

// ---------------------------------------------------------------- render geral
function renderTudo() {
  aplicarCoresCSS();
  renderAvisos();
  renderSaude();
  document.body.classList.toggle("carregando", !E.modelo);
  if (!E.modelo) { renderVazio(); return; }
  renderBrasil();
  renderMapa();
  renderVolume();
  renderTabelas();
  renderConferencia();
  renderHistorico();
  renderFontes();
  renderGovernador();
  if (E.selecionado && !$("gaveta").hidden) abrirDetalhe(E.selecionado, false);
  $("rodContrato").textContent = `Contrato de dados ${E.modelo.contrato || "?"} · eleição ${E.modelo.eleicao.codigo || "?"} · fonte do painel: ${URLS.estado}`;
}

function renderVazio() {
  $("placar").innerHTML = `<p class="esqueleto">${E.carregou ? "Sem dados do coletor ainda." : "Carregando dados do coletor…"}</p>`;
}

function avisoHTML(tipo, html) { return `<div class="aviso ${tipo}">${html}</div>`; }

function renderAvisos() {
  const L = [];
  const m = E.modelo;
  if (FONTE !== "api") L.push(avisoHTML("alerta forte", `${FONTE === "simulacao" ? "SIMULAÇÃO: números fictícios montados a partir do 1º turno, só para testar o painel." : "AMOSTRA: resultado final do 1º turno (04/10) no formato do painel, para pré-visualização."} <a href="./">Ver dados ao vivo</a>`));
  else if (m && MODOS[m.eleicao.modo]) L.push(avisoHTML("alerta forte", MODOS[m.eleicao.modo]));
  if (E.erro && !m) {
    L.push(avisoHTML("erro", `Não foi possível ler os dados do coletor (<span class="mono">${F.esc(URLS.estado)}</span>: ${F.esc(E.erro)}). ${FONTE === "api" ? `Se o coletor ainda não foi publicado, pré-visualize com a <a href="?fonte=amostra">amostra do 1º turno</a> ou a <a href="?fonte=simulacao">simulação de noite de apuração</a>.` : ""} Nova tentativa a cada ${CFG.atualizacaoSeg} s.`));
  } else if (E.erro) {
    L.push(avisoHTML("erro", `Sem conexão com o coletor (${F.esc(E.erro)}). Exibindo o último dado válido, recebido às ${F.h(new Date(E.ultimoOk).toISOString())}.`));
  }
  if (m) {
    const idade = F.idadeSeg(m.coleta.em);
    if (FONTE === "api" && idade !== null && idade > CFG.defasagemAvisoSeg) L.push(avisoHTML("alerta", `Dados defasados: a última coleta do TSE foi ${F.ha(m.coleta.em)} (${F.dh(m.coleta.em)}).`));
    const s = m.coleta.saude;
    if (s === "bloqueada") L.push(avisoHTML("erro", `O TSE pediu pausa ou bloqueou as consultas. O coletor aguarda antes de tentar de novo, como manda a orientação oficial. ${F.esc(m.coleta.mensagem || "")}`));
    else if (s === "indisponivel") L.push(avisoHTML("erro", `A fonte do TSE está indisponível no momento. ${F.esc(m.coleta.mensagem || "")}`));
    else if (s === "pausada" || s === "atrasada") L.push(avisoHTML("alerta", `Coletor ${s === "pausada" ? "em pausa" : "com atraso"}. ${F.esc(m.coleta.mensagem || "")}`));
    const br = m.territorios.br;
    if (br.situacao === "nao_iniciada") L.push(avisoHTML("info", "O TSE ainda não divulgou seções totalizadas desta eleição. A divulgação começa após o encerramento da votação em todo o país."));
    if (br.situacao === "concluida") L.push(avisoHTML("info", "Totalização concluída pelo TSE (100% das seções)."));
  }
  $("avisos").innerHTML = L.join("");
}

function renderSaude() {
  const el = $("saude"), m = E.modelo;
  let cls = "", txt = "conectando";
  if (E.erro && !m) { cls = "erro"; txt = "sem dados do coletor"; }
  else if (E.erro) { cls = "erro"; txt = "sem conexão · último dado " + F.ha(new Date(E.ultimoOk).toISOString()); }
  else if (m) {
    const idade = F.idadeSeg(m.coleta.em);
    const parado = FONTE === "api" && idade !== null && idade > CFG.defasagemAvisoSeg;
    cls = parado || (m.coleta.saude && m.coleta.saude !== "ok") ? "alerta" : "ok";
    txt = FONTE !== "api" ? "dados de teste" : `coleta ${F.ha(m.coleta.em)}`;
  }
  el.className = "saude " + cls;
  $("saudeTxt").textContent = txt;
}

// ---------------------------------------------------------------- Visão Brasil
function renderBrasil() {
  const m = E.modelo, br = m.territorios.br;
  const pctSec = br.secoes.pct;
  $("totPct").textContent = F.pct(pctSec);
  $("totBarra").firstElementChild.style.width = Math.min(100, pctSec ?? 0) + "%";
  $("totBarra").setAttribute("aria-valuenow", pctSec ?? 0);
  $("totDet").textContent = `${F.int(br.secoes.totalizadas)} de ${F.int(br.secoes.previstas)} seções · ${SITUACOES[br.situacao]}`;

  const [A, B] = principais();
  const card = (c) => {
    const d = br.candidatos[c.numero] || {};
    const eleito = br.eleito === c.numero;
    const frente = !eleito && br.lider === c.numero;
    const p = pal(c.numero);
    const sitTSE = d.situacao ? `<span class="selo-sit">Situação TSE: ${F.esc(d.situacao)}</span>` : "";
    return `<article class="cand" style="--cor:${p.base};--cor-txt:${corTexto(c.numero)}" aria-label="${F.esc(c.nome)}, ${F.pct(d.pct)} dos votos válidos">
      <div class="cand-cab"><div><div class="cand-nome" title="${F.esc(c.nomeUrna)}">${F.esc(c.nome)}</div><div class="cand-meta">${F.esc(c.partido || "")} · cor ${p.nome}</div></div><span class="cand-num" aria-label="número">${F.esc(c.numero)}</span></div>
      <div class="cand-pct">${F.pct(d.pct).replace("%", "<small>%</small>")}</div>
      <div class="cand-votos">${F.int(d.votos)} <span>votos</span></div>
      ${eleito ? `<span class="selo-sit eleito">Eleito · publicado pelo TSE</span>` : frente ? `<span class="selo-sit">À frente na apuração parcial</span>` : ""}
      ${eleito ? "" : sitTSE}
    </article>`;
  };
  $("placar").innerHTML = card(A) + card(B);

  const pa = br.candidatos[A.numero]?.pct ?? 0, pb = br.candidatos[B.numero]?.pct ?? 0;
  $("disputa").innerHTML = `<div style="width:${pa}%;background:${pal(A.numero).base}"></div><div style="flex:1"></div><div style="width:${pb}%;background:${pal(B.numero).base}"></div><span class="meio"></span>`;

  const lid = br.lider;
  $("diferenca").innerHTML = !br.margem || lid === null ? "Aguardando votos totalizados."
    : lid === "empate" ? "<strong>Empate</strong> em votos neste momento."
    : `Diferença de <strong>${F.int(br.margem.votos)} votos</strong> e <strong>${F.pp(br.margem.pp)}</strong> a favor de <strong style="color:${corTexto(lid)}">${F.esc(nomeCand(lid))}</strong>`;

  const v = br.votos;
  const item = (r, val, sub) => `<div><dt>${r}</dt><dd>${val}${sub ? `<small>${sub}</small>` : ""}</dd></div>`;
  const outros = m.candidatos.outros.length;
  $("numeros").innerHTML =
    item("Votos válidos", F.int(v.validos), v.anuladosSubJudice ? `base do %: ${F.int(v.basePct)}` : "base do % dos candidatos") +
    item("Brancos", F.int(v.brancos)) +
    item("Nulos", F.int(v.nulos)) +
    item("Anulados sub judice", F.int(v.anuladosSubJudice)) +
    item("Comparecimento", F.int(br.comparecimento.votos), F.pct(br.comparecimento.pct) + " do eleitorado das seções") +
    item("Abstenção", F.int(br.abstencao.votos), F.pct(br.abstencao.pct) + " do eleitorado das seções") +
    item("Eleitorado", F.int(br.eleitorado.total), `${F.int(br.eleitorado.aptoTotalizado)} em seções totalizadas`) +
    (outros ? item("Outros candidatos", String(outros), "presentes nesta eleição") : "");
  $("origemBR").textContent = `Fonte: TSE · totalizado ${F.dh(br.totalizado)} · coletado ${F.dh(m.coleta.em)} (Brasília) · eleição ${m.eleicao.codigo || "—"}`;
}

// ---------------------------------------------------------------- Mapa
function pintura(id) {
  const m = E.modelo, t = m?.territorios[id];
  const vis = visualTerritorio(t);
  let fill = "url(#pad-indisp)", rotulo = "", escuro = false, neutro = true;
  if (vis.estado === "sem_dados") fill = "url(#pad-semdados)";
  else if (vis.estado === "empate") { fill = "url(#pad-empate)"; rotulo = "empate"; escuro = true; neutro = false; }
  else if (vis.estado === "lider") {
    neutro = false;
    const p = pal(vis.lider);
    if (p) { fill = E.op.intensidade && vis.faixa !== null ? p.faixas[vis.faixa] : p.base; escuro = !E.op.intensidade || vis.faixa >= 2; }
    else { fill = "#8a8f99"; escuro = true; } // líder fora do par configurado (só no 1º turno)
    rotulo = F.pct(t.candidatos[vis.lider]?.pct, 1).replace("%", "");
  }
  const aria = t ? `${t.nome}: ${resumoTexto(t)}` : id;
  return { fill, defasada: vis.defasada, rotulo, escuro, neutro, aria: F.esc(aria) };
}

function resumoTexto(t) {
  if (t.situacao === "indisponivel") return "dados indisponíveis";
  const [A, B] = principais();
  const a = t.candidatos[A.numero], b = t.candidatos[B.numero];
  return `${A.nome} ${F.pct(a?.pct)}, ${B.nome} ${F.pct(b?.pct)}, ${F.pct(t.secoes.pct)} das seções totalizadas`;
}

function renderMapa() {
  const svg = $("mapa");
  const [A, B] = principais();
  const nivel = E.op.nivel;
  let r;
  if (E.op.forma === "grade" || !E.geo) r = svgGrade(pintura, { nivel });
  else r = svgGeo(E.geo, pintura, { nivel });
  svg.setAttribute("viewBox", r.viewBox);
  svg.innerHTML = defs(pal(A.numero).base, pal(B.numero).base) + r.html;
  if (E.selecionado) svg.querySelectorAll(`[data-id="${E.selecionado}"]`).forEach((el) => el.classList.add("sel"));

  // Exterior em cartão próprio: não é área no mapa
  const zz = E.modelo.territorios.zz, vz = visualTerritorio(zz);
  const ext = $("extCartao");
  ext.classList.toggle("na-grade", E.op.forma === "grade" || !E.geo);
  ext.style.setProperty("--ext-cor", vz.estado === "lider" && pal(vz.lider) ? pal(vz.lider).base : "var(--regua-forte)");
  ext.innerHTML = `<b>Exterior</b>${zz.situacao === "indisponivel" ? "indisponível" : `${F.esc(A.nome)} ${F.pct(zz.candidatos[A.numero]?.pct, 1)} · ${F.esc(B.nome)} ${F.pct(zz.candidatos[B.numero]?.pct, 1)}<br><span class="mono">${F.pct(zz.secoes.pct, 1)} totalizado</span>`}`;
  ext.setAttribute("aria-label", "Exterior: " + resumoTexto(zz));
  renderLegenda();
}

function amostraPadrao(fill) {
  return `<svg viewBox="0 0 22 13" aria-hidden="true">${defs(pal(principais()[0].numero).base, pal(principais()[1].numero).base)}<rect width="22" height="13" fill="${fill}"/></svg>`;
}

function renderLegenda() {
  const lin = (c) => {
    const p = pal(c.numero);
    const esc = E.op.intensidade ? p.faixas.map((f) => `<span style="background:${f}"></span>`).join("") : `<span style="background:${p.base};width:52px"></span>`;
    return `<div class="leg-linha"><span class="leg-nome" style="color:${corTexto(c.numero)}">■ ${F.esc(c.nome)} (${c.numero})</span><span class="leg-esc">${esc}</span></div>`;
  };
  const faixas = E.op.intensidade ? `<div class="leg-faixas"><span>&lt;${FAIXAS_MARGEM[0]}</span><span>${FAIXAS_MARGEM[0]}–${FAIXAS_MARGEM[1]}</span><span>${FAIXAS_MARGEM[1]}–${FAIXAS_MARGEM[2]}</span><span>≥${FAIXAS_MARGEM[2]}</span>&nbsp;p.p. de margem</div>` : "";
  const sobre = `<svg viewBox="0 0 22 13" aria-hidden="true">${defs("#000", "#000")}<rect width="22" height="13" fill="${pal(principais()[0].numero).faixas[2]}"/><rect width="22" height="13" fill="url(#pad-defasada)"/></svg>`;
  $("legenda").innerHTML = `<p class="rotulo-mini">Cor = quem lidera ${E.op.nivel === "regiao" ? "na região" : "na UF"}. A cor é fixa por candidato.</p>` +
    principais().map(lin).join("") + faixas +
    `<div class="leg-esp">
      <div>${amostraPadrao("url(#pad-empate)")} Empate</div>
      <div>${amostraPadrao("url(#pad-semdados)")} Sem votos totalizados</div>
      <div>${amostraPadrao("url(#pad-indisp)")} Fonte indisponível</div>
      <div>${sobre} Fonte defasada</div>
    </div>`;
}

function tooltipHTML(id) {
  const t = E.modelo.territorios[id];
  if (!t) return "";
  const [A, B] = principais();
  const lin = (c) => {
    const d = t.candidatos[c.numero] || {};
    return `<div class="linha"><span class="tt-cand"><i style="background:${pal(c.numero).base}"></i>${F.esc(c.nome)}</span><span><strong>${F.pct(d.pct)}</strong> <span class="mudo">${F.int(d.votos)}</span></span></div>`;
  };
  if (t.situacao === "indisponivel") return `<h4>${F.esc(t.nome)}</h4><div class="mudo">Fonte indisponível neste momento.</div>`;
  const dif = t.margem && t.lider && t.lider !== "empate" ? `${F.int(t.margem.votos)} votos · ${F.pp(t.margem.pp)} para ${F.esc(nomeCand(t.lider))}` : t.lider === "empate" ? "empate" : "—";
  return `<h4>${F.esc(t.nome)} <span class="mudo">${SITUACOES[t.situacao]}</span></h4>${lin(A)}${lin(B)}
    <div class="linha"><span class="mudo">Diferença</span><span>${dif}</span></div>
    <div class="linha"><span class="mudo">Totalização</span><span>${F.pct(t.secoes.pct)} (${F.int(t.secoes.totalizadas)}/${F.int(t.secoes.previstas)})</span></div>
    <div class="linha"><span class="mudo">Atualização TSE</span><span>${t.totalizado ? F.dh(t.totalizado) : F.dh(t.atualizado)}</span></div>
    <div class="mudo" style="margin-top:6px;font-size:.72rem">${E.op.nivel === "uf" ? "Clique para o detalhamento" : "Clique para o detalhe da região"}</div>`;
}

function ligarMapa() {
  const svg = $("mapa"), tip = $("tooltip"), wrap = svg.parentElement;
  const alvo = (ev) => ev.target.closest?.("[data-id]");
  const mostrar = (el, x, y) => {
    tip.innerHTML = tooltipHTML(el.dataset.id);
    tip.hidden = false;
    const r = wrap.getBoundingClientRect();
    let px = x - r.left + 14, py = y - r.top + 14;
    if (px + 290 > r.width) px = Math.max(0, x - r.left - 290);
    if (py + 190 > r.height) py = Math.max(0, y - r.top - 190);
    tip.style.left = px + "px"; tip.style.top = py + "px";
  };
  svg.addEventListener("pointermove", (ev) => {
    if (ev.pointerType === "touch") return;
    const el = alvo(ev);
    if (!el || !E.modelo) { tip.hidden = true; return; }
    mostrar(el, ev.clientX, ev.clientY);
  });
  svg.addEventListener("pointerleave", () => { tip.hidden = true; });
  svg.addEventListener("click", (ev) => { const el = alvo(ev); if (el && E.modelo) { tip.hidden = true; abrirDetalhe(el.dataset.id); } });
  svg.addEventListener("keydown", (ev) => { const el = alvo(ev); if (el && (ev.key === "Enter" || ev.key === " ")) { ev.preventDefault(); abrirDetalhe(el.dataset.id); } });
  svg.addEventListener("focusin", (ev) => { const el = alvo(ev); if (el && E.modelo) { const b = el.getBoundingClientRect(); mostrar(el, b.right, b.top); } });
  svg.addEventListener("focusout", () => { tip.hidden = true; });
  $("extCartao").addEventListener("click", () => E.modelo && abrirDetalhe("zz"));
}

// Barras de vantagem em votos (o mapa não mostra volume)
function renderVolume() {
  const m = E.modelo, [A, B] = principais();
  const ids = E.op.nivel === "regiao" ? [...REGIOES.map((r) => r.id), "zz"] : [...UFS, "zz"];
  $("volUnid").textContent = E.op.nivel === "regiao" ? "região" : "UF";
  const linhas = ids.map((id) => m.territorios[id]).filter((t) => t && t.margem && t.lider && t.lider !== "empate" && t.situacao !== "indisponivel")
    .sort((x, y) => (y.margem.votos ?? 0) - (x.margem.votos ?? 0));
  const max = Math.max(1, ...linhas.map((t) => t.margem.votos ?? 0));
  const sig = (t) => (t.tipo === "regiao" ? t.nome.replace("Centro-Oeste", "C.-Oeste").slice(0, 8) : t.id === "zz" ? "EXT" : t.id.toUpperCase());
  const barra = (t, lado) => {
    const deste = lado === "esq" ? t.lider === A.numero : t.lider === B.numero;
    if (!deste) return `<div class="lado ${lado}"></div>`;
    const p = pal(t.lider);
    return `<div class="lado ${lado}"><div style="width:${((t.margem.votos / max) * 100).toFixed(2)}%;background:${p ? p.base : "#8a8f99"}"></div></div>`;
  };
  const outro = linhas.filter((t) => t.lider !== A.numero && t.lider !== B.numero);
  $("volume").innerHTML = `<div class="vol-cab"><span></span><span>${F.esc(A.nome)} ◀</span><span>▶ ${F.esc(B.nome)}</span><span style="text-align:right">votos</span></div>` +
    linhas.filter((t) => !outro.includes(t)).map((t) => `<div class="vol-linha" data-id="${t.id}" title="${F.esc(t.nome)}: ${F.int(t.margem.votos)} votos de vantagem para ${F.esc(nomeCand(t.lider))}" style="${E.op.nivel === "regiao" ? "grid-template-columns:64px 1fr 1fr 74px" : ""}"><span class="sig">${sig(t)}</span>${barra(t, "esq")}${barra(t, "dir")}<span class="v">${F.int(t.margem.votos)}</span></div>`).join("") +
    (linhas.length ? "" : `<p class="nota">Sem votos totalizados ainda.</p>`);
  $("volume").querySelectorAll(".vol-linha").forEach((el) => el.addEventListener("click", () => abrirDetalhe(el.dataset.id)));
}

// ---------------------------------------------------------------- Tabelas
function linhaTabela(t) {
  const [A, B] = principais();
  const a = t.candidatos[A.numero] || {}, b = t.candidatos[B.numero] || {};
  // margem com sinal: + para o primeiro candidato da tela, − para o segundo (só troca de sinal, sem conta)
  const sinal = t.lider === A.numero ? 1 : t.lider === B.numero ? -1 : 0;
  return {
    t, id: t.id, nome: t.nome, reg: t.id === "zz" ? "Exterior" : REGIOES.find((r) => r.sigla === (t.regiao || REGIAO_DA_UF[t.id]))?.nome || "",
    sit: t.situacao, sec: t.secoes.pct, pa: a.pct, va: a.votos, pb: b.pct, vb: b.votos,
    mpp: t.margem?.pp != null ? sinal * t.margem.pp : null, mv: t.margem?.votos != null ? sinal * t.margem.votos : null,
    val: t.votos.validos, bra: t.votos.brancos, nul: t.votos.nulos, com: t.comparecimento.pct, abs: t.abstencao.pct, atu: t.totalizado || t.atualizado
  };
}

function colunas() {
  const [A, B] = principais();
  return [
    ["nome", "Território"], ["reg", "Região"], ["sit", "Situação"], ["sec", "Totalizado"],
    ["pa", `% ${A.nome}`], ["va", `Votos ${A.nome.split(" ")[0]}`], ["pb", `% ${B.nome}`], ["vb", `Votos ${B.nome.split(" ")[0]}`],
    ["mpp", "Margem"], ["mv", "Dif. votos"], ["val", "Válidos"], ["bra", "Brancos"], ["nul", "Nulos"], ["com", "Compar."], ["abs", "Abst."], ["atu", "Atualização TSE"]
  ];
}

function celulas(r) {
  const [A, B] = principais();
  const chip = (t) => {
    const v = visualTerritorio(t);
    const fill = v.estado === "lider" && pal(v.lider) ? pal(v.lider).base : v.estado === "empate" ? "linear-gradient(90deg,var(--cand-a) 50%,var(--cand-b) 50%)" : "var(--neutro-mapa)";
    return `<span class="chip" style="background:${fill}"></span>`;
  };
  const marg = r.mpp === null ? "—" : `<span class="${r.mpp > 0 ? "t-a" : r.mpp < 0 ? "t-b" : ""}">${r.mpp === 0 ? "empate" : F.pp(r.mpp, { sinal: true }).replace(" p.p.", "")}</span>`;
  return [
    `${chip(r.t)}${F.esc(r.nome)}`, r.reg, `<span class="sit ${r.sit}">${SITUACOES[r.sit]}</span>`, F.pct(r.sec),
    `<span class="t-a">${F.pct(r.pa)}</span>`, F.int(r.va), `<span class="t-b">${F.pct(r.pb)}</span>`, F.int(r.vb),
    marg, r.mv === null ? "—" : F.int(Math.abs(r.mv)), F.int(r.val), F.int(r.bra), F.int(r.nul), F.pct(r.com), F.pct(r.abs), `<span class="mono">${F.dh(r.atu)}</span>`
  ].map((c) => `<td>${c}</td>`).join("");
}

function renderTabelas() {
  const m = E.modelo, cols = colunas();
  const cab = (ordenavel) => `<thead><tr>${cols.map(([k, r]) => {
    const ativo = ordenavel && E.op.ordem.col === k;
    return `<th scope="col" ${ativo ? `aria-sort="${E.op.ordem.asc ? "ascending" : "descending"}"` : ""}>${ordenavel ? `<button type="button" data-col="${k}">${F.esc(r)}</button>` : F.esc(r)}</th>`;
  }).join("")}</tr></thead>`;

  const regs = [...REGIOES.map((r) => m.territorios[r.id]), m.territorios.zz].map(linhaTabela);
  const br = linhaTabela(m.territorios.br);
  $("tabRegioes").innerHTML = `<caption class="rotulo-mini" style="text-align:left;padding:8px 10px">Regiões, exterior e Brasil</caption>` + cab(false) +
    `<tbody>${regs.map((r) => `<tr data-id="${r.id}">${celulas(r)}</tr>`).join("")}<tr class="total" data-id="br">${celulas({ ...br, nome: "Brasil (TSE)" })}</tr></tbody>`;

  let ufs = [...UFS, "zz"].map((u) => linhaTabela(m.territorios[u]));
  if (E.op.regiao !== "todas") ufs = ufs.filter((r) => (r.id === "zz" ? "ex" : REGIAO_DA_UF[r.id]) === E.op.regiao);
  if (E.op.busca) { const q = E.op.busca.toLowerCase(); ufs = ufs.filter((r) => r.nome.toLowerCase().includes(q) || r.id.includes(q)); }
  const { col, asc } = E.op.ordem;
  ufs.sort((x, y) => {
    const a = x[col], b = y[col];
    if (a == null && b == null) return 0;
    if (a == null) return 1; if (b == null) return -1; // ausentes sempre no fim
    const r = typeof a === "string" ? a.localeCompare(b, "pt-BR") : a - b;
    return asc ? r : -r;
  });
  $("tabUFs").innerHTML = `<caption class="rotulo-mini" style="text-align:left;padding:8px 10px">Estados, DF e exterior · ${ufs.length} linha(s)</caption>` + cab(true) +
    `<tbody>${ufs.map((r) => `<tr data-id="${r.id}" tabindex="0">${celulas(r)}</tr>`).join("")}</tbody>`;

  const chips = [["todas", "Todas"], ...REGIOES.map((r) => [r.sigla, r.nome]), ["ex", "Exterior"]];
  $("filtroRegiao").innerHTML = chips.map(([k, r]) => `<button type="button" data-reg="${k}" aria-pressed="${E.op.regiao === k}">${r}</button>`).join("");
}

function ligarTabelas() {
  $("tabUFs").addEventListener("click", (ev) => {
    const b = ev.target.closest("button[data-col]");
    if (b) {
      const c = b.dataset.col;
      E.op.ordem = { col: c, asc: E.op.ordem.col === c ? !E.op.ordem.asc : ["nome", "reg", "sit"].includes(c) };
      renderTabelas();
      return;
    }
    const tr = ev.target.closest("tr[data-id]");
    if (tr) abrirDetalhe(tr.dataset.id);
  });
  $("tabUFs").addEventListener("keydown", (ev) => { const tr = ev.target.closest("tr[data-id]"); if (tr && ev.key === "Enter") abrirDetalhe(tr.dataset.id); });
  $("tabRegioes").addEventListener("click", (ev) => { const tr = ev.target.closest("tr[data-id]"); if (tr) abrirDetalhe(tr.dataset.id); });
  $("filtroRegiao").addEventListener("click", (ev) => { const b = ev.target.closest("button[data-reg]"); if (b) { E.op.regiao = b.dataset.reg; renderTabelas(); } });
  $("busca").addEventListener("input", (ev) => { E.op.busca = ev.target.value.trim(); renderTabelas(); });
}

// ---------------------------------------------------------------- Conferência
function renderConferencia() {
  const c = E.modelo.conferencia;
  if (!c) { $("confCab").innerHTML = `<p class="nota">O coletor ainda não publicou a conferência.</p>`; $("tabConf").innerHTML = ""; $("confCobertura").innerHTML = ""; return; }
  const info = CONFERENCIA[c.situacao] || { rotulo: "Situação não informada", nivel: "info" };
  $("confCab").innerHTML = `<div class="conf-selo ${info.nivel}">${info.rotulo}</div>
    <p class="conf-base">${c.mesmaBase ? "<strong>Os dois lados vêm da mesma base do TSE.</strong> Isto é conferência de consistência entre arquivos, não auditoria independente das urnas." : "Os lados vêm de bases diferentes; diferenças podem refletir a origem."}</p>`;
  const rot = (l) => principais().some((p) => p.numero === l.item) ? `${nomeCand(l.item)} (${l.item})` : l.rotulo || l.item;
  $("tabConf").innerHTML = `<thead><tr><th scope="col">Item</th><th scope="col" class="col-a">A · Soma territorial (painel)</th><th scope="col" class="col-b">B · Total nacional (TSE)</th><th scope="col">Diferença A − B</th></tr></thead><tbody>` +
    c.linhas.map((l) => `<tr><td>${F.esc(rot(l))}</td><td>${F.int(l.soma)}</td><td>${F.int(l.tse)}</td><td class="${l.diferenca === 0 ? "dif0" : l.diferenca === null ? "" : "difx"}">${l.diferenca === 0 ? "0" : F.intSinal(l.diferenca)}</td></tr>`).join("") + `</tbody>`;
  const lista = (xs) => (xs.length ? xs.map((u) => (NOMES[u] ? `${u.toUpperCase()}` : u)).join(", ") : "nenhuma");
  $("confCobertura").innerHTML = `
    <div><b>Horário do total TSE (B)</b>${F.dh(c.horarioTSE)}</div>
    <div><b>Recorte mais antigo na soma (A)</b>${F.dh(c.horarioSomaMaisAntiga)}</div>
    <div><b>UFs ausentes</b>${lista(c.ausentes)}</div>
    <div><b>UFs defasadas</b>${lista(c.defasadas)}</div>`;
}

// ---------------------------------------------------------------- Histórico
function grafico(svg, pontos, { x, series, faixaY, ticksY, fmtY, zero, correcoes }) {
  const W = 560, H = 250, L = 64, R = 12, T = 12, B = 30;
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  if (pontos.length < 2) { svg.innerHTML = `<text x="${W / 2}" y="${H / 2}" text-anchor="middle">Histórico aparece quando houver duas ou mais totalizações.</text>`; return; }
  const xs = pontos.map(x), [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  const [y0, y1] = faixaY;
  const X = (v) => L + ((v - x0) / (x1 - x0 || 1)) * (W - L - R);
  const Y = (v) => T + (1 - (v - y0) / (y1 - y0 || 1)) * (H - T - B);
  let s = "";
  for (const v of ticksY || [0, 1, 2, 3, 4].map((i) => y0 + ((y1 - y0) * i) / 4)) {
    s += `<line class="grade" x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}"/><text x="${L - 6}" y="${Y(v) + 3}" text-anchor="end">${fmtY(v)}</text>`;
  }
  if (zero !== undefined && zero > y0 && zero < y1) s += `<line class="eixo0" x1="${L}" x2="${W - R}" y1="${Y(zero)}" y2="${Y(zero)}"/>`;
  for (let i = 0; i <= 4; i++) {
    const v = x0 + ((x1 - x0) * i) / 4;
    s += `<text x="${X(v)}" y="${H - 10}" text-anchor="${i === 0 ? "start" : i === 4 ? "end" : "middle"}">${E.op.eixo === "tempo" ? F.h(new Date(v).toISOString()).slice(0, 5) : F.pct(v, 0)}</text>`;
  }
  for (const p of pontos.filter((p) => p.correcao && correcoes)) {
    s += `<line class="correcao" x1="${X(x(p))}" x2="${X(x(p))}" y1="${T}" y2="${H - B}"/><text class="rot-cor" x="${X(x(p)) + 3}" y="${H - B - 4}">correção</text>`;
  }
  for (const { val, cor, rot } of series) {
    const pts = pontos.filter((p) => val(p) !== null && Number.isFinite(val(p)));
    s += `<polyline fill="none" stroke="${cor}" stroke-width="2.2" stroke-linejoin="round" points="${pts.map((p) => `${X(x(p)).toFixed(1)},${Y(val(p)).toFixed(1)}`).join(" ")}"/>`;
    const u = pts[pts.length - 1];
    if (u) s += `<circle cx="${X(x(u))}" cy="${Y(val(u))}" r="3.5" fill="${cor}"/>${rot ? `<text x="${Math.min(X(x(u)) - 4, W - R - 4)}" y="${Y(val(u)) - 8}" text-anchor="end" style="fill:${cor};font-weight:600">${rot(u)}</text>` : ""}`;
  }
  svg.innerHTML = s;
}

function renderHistorico() {
  const h = E.historico, [A, B] = principais();
  const x = E.op.eixo === "tempo" ? (p) => p.t : (p) => p.secoesPct ?? 0;
  const pts = h.filter((p) => x(p) !== null);
  const vals = pts.flatMap((p) => [p.pct[A.numero], p.pct[B.numero]]).filter(Number.isFinite);
  const lo = Math.max(0, Math.floor((Math.min(50, ...vals) - 2) / 5) * 5), hi = Math.min(100, Math.ceil((Math.max(50, ...vals) + 2) / 5) * 5);
  grafico($("grafPct"), pts, {
    x, faixaY: [lo, hi], ticksY: Array.from({ length: Math.floor((hi - lo) / (hi - lo > 25 ? 10 : 5)) + 1 }, (_, i) => lo + i * (hi - lo > 25 ? 10 : 5)),
    fmtY: (v) => F.pct(v, 0), zero: 50, correcoes: true,
    series: [A, B].map((c) => ({ val: (p) => p.pct[c.numero] ?? null, cor: pal(c.numero).base, rot: (p) => `${c.nome.split(" ")[0]} ${F.pct(p.pct[c.numero], 2)}` }))
  });
  const dif = (p) => (Number.isFinite(p.votos[A.numero]) && Number.isFinite(p.votos[B.numero]) ? p.votos[A.numero] - p.votos[B.numero] : null);
  const ds = pts.map(dif).filter(Number.isFinite);
  const amp = Math.max(1, ...ds.map(Math.abs)) * 1.1;
  const curto = (v) => (Math.abs(v) >= 1e6 ? (v / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " mi" : Math.abs(v) >= 1e3 ? Math.round(v / 1e3) + " mil" : String(Math.round(v)));
  grafico($("grafMargem"), pts, {
    x, faixaY: [-amp, amp], fmtY: (v) => (v > 0 ? "+" : "") + curto(v), zero: 0, correcoes: true,
    series: [{ val: dif, cor: "var(--tinta-2)", rot: (p) => { const d = dif(p); return d === 0 ? "empate" : `${nomeCand(d > 0 ? A.numero : B.numero).split(" ")[0]} +${F.int(Math.abs(d))}`; } }]
  });
  const correcoes = h.filter((p) => p.correcao).length;
  $("histNota").textContent = h.length
    ? `${h.length} totalizações observadas pelo coletor${correcoes ? `, ${correcoes} com correção oficial (queda de votos publicada pelo TSE, mantida como veio)` : ""}. Acima de zero no gráfico de diferença, ${A.nome} à frente; abaixo, ${B.nome}.`
    : "O histórico começa quando o coletor registrar a primeira totalização.";
}

// ---------------------------------------------------------------- Fontes e saúde
function renderFontes() {
  const m = E.modelo;
  const ok = m.fontes.filter((f) => f.http === 200 || f.http === 304).length;
  const saude = { ok: "operando", atrasada: "com atraso", pausada: "em pausa", bloqueada: "bloqueado pelo TSE", indisponivel: "fonte indisponível" }[m.coleta.saude] || "—";
  $("fontesResumo").innerHTML = `
    <div><b>Coletor</b><span>${saude}</span></div>
    <div><b>Última coleta</b><span class="mono">${F.dh(m.coleta.em)}</span></div>
    <div><b>Intervalo</b><span>${m.coleta.intervaloS ? m.coleta.intervaloS + " s" : "—"}</span></div>
    <div><b>Arquivos respondendo</b><span>${ok} de ${m.fontes.length}</span></div>
    <div><b>Página relê o coletor</b><span>a cada ${CFG.atualizacaoSeg} s</span></div>
    <div><b>Contrato de dados</b><span class="mono">${F.esc(m.contrato || "—")}</span></div>` +
    (E.problemas.length ? `<div style="grid-column:1/-1"><b>Inconsistências no snapshot</b><span class="nota">${E.problemas.map(F.esc).join(" ")}</span></div>` : "");
  const nomeF = (id) => (id === "br" ? "Brasil" : NOMES[id] || id);
  $("tabFontes").innerHTML = `<thead><tr><th scope="col">Recorte</th><th scope="col">Origem efetiva</th><th scope="col">HTTP</th><th scope="col">Totalizado TSE</th><th scope="col">Arquivo gerado</th><th scope="col">Coletado</th><th scope="col">Defasagem</th><th scope="col">Arquivo</th></tr></thead><tbody>` +
    m.fontes.map((f) => `<tr><td>${F.esc(nomeF(f.id))}</td><td>${F.esc(f.origem || "—")}${f.erro ? `<br><span class="sit indisponivel">${F.esc(f.erro)}</span>` : ""}</td><td>${f.http ?? "—"}</td><td class="mono">${F.dh(f.totalizado)}</td><td class="mono">${F.dh(f.gerado)}</td><td class="mono">${F.dh(f.coletado)}</td><td>${f.defasagemS == null ? "—" : f.defasagemS < 60 ? f.defasagemS + " s" : Math.round(f.defasagemS / 60) + " min"}</td><td>${f.url ? `<a href="${F.esc(f.url)}" target="_blank" rel="noopener">JSON</a>` : "—"}</td></tr>`).join("") + `</tbody>`;
}

function renderLinksFixos() {
  const L = CFG.links;
  $("linksOficiais").innerHTML = `
    <li><a href="${L.portalTSE}" target="_blank" rel="noopener">Portal de resultados do TSE</a></li>
    <li><a href="${L.docTSE}" target="_blank" rel="noopener">Informações técnicas da divulgação (TSE)</a></li>
    <li><a href="${L.inventario}" target="_blank" rel="noopener">Inventário de fontes do painel</a></li>`;
  $("lnkInventario").href = L.inventario;
  $("lnkAutor").href = L.autor; $("lnkAutor2").href = L.autor; $("lnkLinkedin").href = L.linkedin;
  const selo = $("selo"); selo.href = L.nfls;
  const img = $("seloImg");
  img.addEventListener("error", () => img.remove(), { once: true });
  img.src = L.nflsLogo;
}

// ---------------------------------------------------------------- Governador
function renderGovernador() {
  const g = E.gov;
  if (!g) { $("govLista").innerHTML = `<p class="nota">Aguardando os dados de governador do coletor.</p>`; return; }
  const aviso = g.modo !== "oficial" && MODOS[g.modo] ? `<p class="aviso alerta" style="grid-column:1/-1;margin:0">${MODOS[g.modo]}</p>` : "";
  $("govLista").innerHTML = aviso + CFG.governadorUFs.map((uf) => {
    const t = g.ufs[uf];
    if (!t || t.situacao === "indisponivel") return `<article class="gov" id="gov-${uf}"><h3>${NOMES[uf]} <span>indisponível</span></h3></article>`;
    const info = t.candidatosInfo || {};
    const cands = Object.entries(t.candidatos).sort((a, b) => (b[1].votos ?? -1) - (a[1].votos ?? -1));
    const top = cands.slice(0, 2), resto = cands.length - 2;
    const eleito = t.eleito;
    return `<article class="gov" id="gov-${uf}"><h3>${NOMES[uf]} <span>${F.pct(t.secoes.pct, 1)} totalizado · ${SITUACOES[t.situacao]}</span></h3>
      ${top.map(([n, c]) => `<div class="g-cand ${t.lider === n ? "lider" : ""}"><span>${F.esc(F.nomeLegivel(info[n]?.nome_urna || n))} <span class="mono">${n}</span> <span style="color:var(--mudo)">${F.esc(info[n]?.partido || "")}</span>${eleito === n ? " · <strong>eleito (TSE)</strong>" : ""}</span><strong>${F.pct(c.pct)}</strong><div class="barra"><div style="width:${c.pct ?? 0}%"></div></div><span class="mono" style="color:var(--mudo);font-size:.76rem">${F.int(c.votos)} votos</span></div>`).join("")}
      ${resto > 0 ? `<div class="g-outros">+ ${resto} candidato(s) nesta eleição</div>` : ""}
      ${t.margem && t.lider !== "empate" ? `<div class="g-outros">Diferença: ${F.int(t.margem.votos)} votos · ${F.pp(t.margem.pp)}</div>` : ""}
      <div class="g-rodape">TSE ${F.dh(t.totalizado)}</div></article>`;
  }).join("");
}

// ---------------------------------------------------------------- Detalhe
function abrirDetalhe(id, foco = true) {
  const m = E.modelo, t = m?.territorios[id];
  if (!t) return;
  E.selecionado = id;
  const [A, B] = principais();
  const fonte = m.fontes.find((f) => f.id === id);
  const c = (cand) => {
    const d = t.candidatos[cand.numero] || {};
    return `<div class="gav-cand" style="--cor:${pal(cand.numero).base};--cor-txt:${corTexto(cand.numero)}"><strong>${F.esc(cand.nome)} <span class="mono">${cand.numero}</span></strong><span class="p">${F.pct(d.pct)}</span><span class="v">${F.int(d.votos)} votos${t.eleito === cand.numero ? " · eleito (publicado pelo TSE)" : t.lider === cand.numero ? " · à frente" : ""}</span></div>`;
  };
  const dl = (pares) => `<dl class="gav-dl">${pares.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("")}</dl>`;
  const tipo = t.tipo === "regiao" ? "Região (soma do coletor)" : t.id === "zz" ? "Votos no exterior" : t.id === "br" ? "Total nacional" : `UF · região ${REGIOES.find((r) => r.sigla === REGIAO_DA_UF[t.id])?.nome || ""}`;
  const gov = CFG.governadorUFs.includes(id) ? `<p><a href="#gov-${id}" data-fechar>Ver 2º turno para governador em ${NOMES[id]}</a></p>` : "";
  $("gavConteudo").innerHTML = `<h3 class="gav-tit" id="gavTitulo">${F.esc(t.nome)}</h3><p class="gav-sub">${tipo} · ${SITUACOES[t.situacao]}</p>
    ${t.situacao === "indisponivel" ? `<p class="aviso erro">Fonte indisponível neste momento. ${fonte?.erro ? F.esc(fonte.erro) : ""}</p>` : `
    <div class="gav-cands">${c(A)}${c(B)}</div>
    ${dl([
      ["Diferença", t.margem && t.lider !== "empate" ? `${F.int(t.margem.votos)} votos · ${F.pp(t.margem.pp)}` : t.lider === "empate" ? "empate" : "—"],
      ["Seções totalizadas", `${F.int(t.secoes.totalizadas)} de ${F.int(t.secoes.previstas)} (${F.pct(t.secoes.pct)})`],
      ["Votos válidos", F.int(t.votos.validos)], ["Base do % (válidos + anulados sub judice)", F.int(t.votos.basePct)],
      ["Brancos", F.int(t.votos.brancos)], ["Nulos", F.int(t.votos.nulos)], ["Anulados sub judice", F.int(t.votos.anuladosSubJudice)],
      ["Total de votos", F.int(t.votos.total)],
      ["Comparecimento", `${F.int(t.comparecimento.votos)} (${F.pct(t.comparecimento.pct)})`],
      ["Abstenção", `${F.int(t.abstencao.votos)} (${F.pct(t.abstencao.pct)})`],
      ["Eleitorado", F.int(t.eleitorado.total)], ["Eleitorado em seções totalizadas", F.int(t.eleitorado.aptoTotalizado)],
      ["Totalizado pelo TSE", F.dh(t.totalizado)], ["Coletado pelo painel", F.dh(fonte?.coletado || m.coleta.em)]
    ])}`}
    ${gov}
    <p class="gav-origem">Origem: ${F.esc(fonte?.origem || (t.tipo === "regiao" ? "soma de votos absolutos e seções das UFs, feita pelo coletor sobre a base do TSE" : "base TSE"))}${fonte?.url ? `<br><a href="${F.esc(fonte.url)}" target="_blank" rel="noopener">${F.esc(fonte.url)}</a>` : ""}</p>`;
  const g = $("gaveta");
  const estavaFechada = g.hidden;
  g.hidden = false;
  $("mapa").querySelectorAll(".sel").forEach((e) => e.classList.remove("sel"));
  $("mapa").querySelectorAll(`[data-id="${id}"]`).forEach((e) => e.classList.add("sel"));
  if (foco && estavaFechada) { E.voltarFoco = document.activeElement; g.querySelector(".fechar").focus(); }
}

function fecharDetalhe() {
  $("gaveta").hidden = true;
  E.selecionado = null;
  $("mapa").querySelectorAll(".sel").forEach((e) => e.classList.remove("sel"));
  E.voltarFoco?.focus?.();
}

// ---------------------------------------------------------------- Cores, tema, TV, exportar
function renderPopCores() {
  const p = $("popCores");
  p.innerHTML = `<h3>Cores dos candidatos</h3><p>Cada candidato tem uma cor fixa, que não muda quando a liderança muda. A escolha fica salva neste navegador.</p>` +
    principais().map((c) => `<div class="cor-linha"><span>${F.esc(c.nome)} (${c.numero})</span><span><i style="background:${pal(c.numero).base}"></i> ${pal(c.numero).nome}</span></div>`).join("") +
    `<div class="pop-acoes"><button class="btn" type="button" id="corTrocar">Trocar as cores</button><button class="btn" type="button" id="corPadrao">Voltar ao padrão</button><button class="btn" type="button" data-fecha-pop>Fechar</button></div>`;
}

function alternarPop(id) {
  const alvo = $(id);
  for (const p of document.querySelectorAll(".pop")) if (p !== alvo) p.hidden = true;
  if (id === "popCores") renderPopCores();
  alvo.hidden = !alvo.hidden;
  if (!alvo.hidden) alvo.querySelector("button")?.focus();
}

function ligarControles() {
  document.querySelectorAll("[data-nivel]").forEach((b) => b.addEventListener("click", () => {
    E.op.nivel = b.dataset.nivel;
    document.querySelectorAll("[data-nivel]").forEach((x) => x.setAttribute("aria-pressed", x === b));
    if (E.modelo) { renderMapa(); renderVolume(); }
  }));
  document.querySelectorAll("[data-forma]").forEach((b) => b.addEventListener("click", () => {
    E.op.forma = b.dataset.forma;
    document.querySelectorAll("[data-forma]").forEach((x) => x.setAttribute("aria-pressed", x === b));
    guardarPref("forma", E.op.forma);
    if (E.modelo) renderMapa();
  }));
  $("chkIntensidade").addEventListener("change", (ev) => { E.op.intensidade = ev.target.checked; guardarPref("intensidade", E.op.intensidade); if (E.modelo) renderMapa(); });
  document.querySelectorAll("[data-eixo]").forEach((b) => b.addEventListener("click", () => {
    E.op.eixo = b.dataset.eixo;
    document.querySelectorAll("[data-eixo]").forEach((x) => x.setAttribute("aria-pressed", x === b));
    if (E.modelo) renderHistorico();
  }));

  $("btnCores").addEventListener("click", () => alternarPop("popCores"));
  $("popCores").addEventListener("click", (ev) => {
    if (ev.target.id === "corTrocar") E.cores = trocar(E.cores);
    else if (ev.target.id === "corPadrao") E.cores = Object.fromEntries(CFG.candidatos.map((c) => [c.numero, c.cor]));
    else if (ev.target.hasAttribute("data-fecha-pop")) { $("popCores").hidden = true; return; }
    else return;
    salvarCores(E.cores);
    renderPopCores();
    renderTudo();
  });

  $("btnExportar").addEventListener("click", () => {
    $("popExportar").innerHTML = `<h3>Exportar</h3><p>Os arquivos levam a origem e o horário dos dados. Não são publicação oficial.</p><div class="menu">
      <button class="btn" type="button" data-exp="csv">Territórios (CSV)</button>
      <button class="btn" type="button" data-exp="hist">Histórico (CSV)</button>
      <button class="btn" type="button" data-exp="json">Snapshot completo (JSON)</button>
      <button class="btn" type="button" data-fecha-pop>Fechar</button></div>`;
    alternarPop("popExportar");
  });
  $("popExportar").addEventListener("click", (ev) => {
    const b = ev.target.closest("button"); if (!b) return;
    if (b.hasAttribute("data-fecha-pop")) { $("popExportar").hidden = true; return; }
    if (!E.modelo) return;
    const carimbo = (E.modelo.coleta.em || new Date().toISOString()).replace(/[:]/g, "-").slice(0, 19);
    const base = `apuracao-${E.modelo.eleicao.codigo || "x"}-${carimbo}`;
    const url = new URL(URLS.estado, location.href).href;
    if (b.dataset.exp === "csv") baixar(base + "-territorios.csv", csvTerritorios(E.modelo, url), "text/csv;charset=utf-8");
    if (b.dataset.exp === "hist") baixar(base + "-historico.csv", csvHistorico(E.historico, principais()), "text/csv;charset=utf-8");
    if (b.dataset.exp === "json") baixar(base + ".json", jsonCompleto(E.bruto, url, new Date().toISOString()), "application/json");
  });

  $("btnTema").addEventListener("click", () => {
    const novo = claro() ? "escuro" : "claro";
    document.documentElement.dataset.tema = novo;
    guardarPref("tema", novo);
    document.querySelector('meta[name="theme-color"]').content = novo === "claro" ? "#f5f3ee" : "#0b0d12";
    if (E.modelo) renderTudo();
  });

  $("btnTV").addEventListener("click", () => modoTV(!document.body.classList.contains("tv")));
  document.addEventListener("fullscreenchange", () => { if (!document.fullscreenElement && document.body.classList.contains("tv") && !params.has("tv")) modoTV(false); });

  $("gaveta").addEventListener("click", (ev) => { if (ev.target.closest("[data-fechar]")) fecharDetalhe(); });
  document.addEventListener("keydown", (ev) => {
    if (ev.key !== "Escape") return;
    if (!$("gaveta").hidden) fecharDetalhe();
    document.querySelectorAll(".pop").forEach((p) => (p.hidden = true));
  });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) atualizar(); });
}

function modoTV(ligar) {
  document.body.classList.toggle("tv", ligar);
  $("btnTV").textContent = ligar ? "Sair do modo TV" : "Modo TV";
  if (ligar && document.documentElement.requestFullscreen && !document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
  if (!ligar && document.fullscreenElement) document.exitFullscreen().catch(() => {});
  if (E.modelo) renderMapa();
}

function guardarPref(k, v) { try { localStorage.setItem("apuracao2026.pref." + k, JSON.stringify(v)); } catch { /* sem armazenamento */ } }
function lerPref(k) { try { return JSON.parse(localStorage.getItem("apuracao2026.pref." + k)); } catch { return null; } }

function aplicarPreferencias() {
  const tema = lerPref("tema");
  if (tema) document.documentElement.dataset.tema = tema;
  else if (matchMedia("(prefers-color-scheme: light)").matches) document.documentElement.dataset.tema = "claro";
  // no celular a grade lê melhor que o mapa geográfico; a escolha da pessoa prevalece
  const forma = lerPref("forma") || (matchMedia("(max-width: 640px)").matches ? "grade" : null);
  if (forma === "grade" || forma === "geo") {
    E.op.forma = forma;
    document.querySelectorAll("[data-forma]").forEach((x) => x.setAttribute("aria-pressed", x.dataset.forma === forma));
  }
  const intens = lerPref("intensidade");
  if (typeof intens === "boolean") { E.op.intensidade = intens; $("chkIntensidade").checked = intens; }
}

// ---------------------------------------------------------------- relógio e navegação
function relogio() {
  $("relogio").textContent = new Intl.DateTimeFormat("pt-BR", { timeZone: F.FUSO, hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date());
  if (E.modelo || E.erro) renderSaude();
}

function scrollspy() {
  const links = [...document.querySelectorAll(".abas a")];
  const obs = new IntersectionObserver((ents) => {
    for (const e of ents) if (e.isIntersecting) links.forEach((a) => a.classList.toggle("ativa", a.getAttribute("href") === "#" + e.target.id));
  }, { rootMargin: "-45% 0px -50% 0px" });
  document.querySelectorAll("main > section").forEach((s) => obs.observe(s));
}

// ---------------------------------------------------------------- início
async function iniciar() {
  aplicarPreferencias();
  renderLinksFixos();
  ligarMapa();
  ligarTabelas();
  ligarControles();
  scrollspy();
  if (params.get("tv") === "1") modoTV(true);
  setInterval(relogio, 1000);
  relogio();
  try { E.geo = prepararGeo(await (await fetch("data/br-uf.geojson")).json()); }
  catch { E.op.forma = "grade"; /* sem malha: usa a grade */ }
  atualizar();
}

iniciar();
