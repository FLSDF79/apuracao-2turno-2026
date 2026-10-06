/* Painel de apuração — 2º turno presidencial 2026
   Site estático: busca os JSON oficiais do TSE direto no navegador (o TSE libera CORS).
   Sem dependências externas. */
(function () {
  "use strict";
  const CFG = window.PAINEL_CONFIG;
  const UFS = ["ac","al","ap","am","ba","ce","df","es","go","ma","mt","ms","mg","pa","pb","pr","pe","pi","rj","rn","rs","ro","rr","sc","sp","se","to","zz"];
  const NOMES = {ac:"Acre",al:"Alagoas",ap:"Amapá",am:"Amazonas",ba:"Bahia",ce:"Ceará",df:"Distrito Federal",es:"Espírito Santo",go:"Goiás",ma:"Maranhão",mt:"Mato Grosso",ms:"Mato Grosso do Sul",mg:"Minas Gerais",pa:"Pará",pb:"Paraíba",pr:"Paraná",pe:"Pernambuco",pi:"Piauí",rj:"Rio de Janeiro",rn:"Rio Grande do Norte",rs:"Rio Grande do Sul",ro:"Rondônia",rr:"Roraima",sc:"Santa Catarina",sp:"São Paulo",se:"Sergipe",to:"Tocantins",zz:"Exterior"};
  const REGIAO = {ac:"N",ap:"N",am:"N",pa:"N",ro:"N",rr:"N",to:"N",al:"NE",ba:"NE",ce:"NE",ma:"NE",pb:"NE",pe:"NE",pi:"NE",rn:"NE",se:"NE",df:"CO",go:"CO",mt:"CO",ms:"CO",es:"SE",mg:"SE",rj:"SE",sp:"SE",pr:"S",rs:"S",sc:"S",zz:"EX"};
  const NOME_REG = {N:"Norte",NE:"Nordeste",CO:"Centro-Oeste",SE:"Sudeste",S:"Sul",EX:"Exterior"};
  const [CA, CB] = CFG.candidatos; // CA = azul (Flávio), CB = vermelho (Lula)
  const params = new URLSearchParams(location.search);
  const DEMO = params.get("demo") === "1";

  const fmt = new Intl.NumberFormat("pt-BR");
  const f2 = (x) => (isFinite(x) ? x.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "–");
  const fi = (x) => (isFinite(x) ? fmt.format(Math.round(x)) : "–");
  const $ = (id) => document.getElementById(id);
  const n = (s) => { if (s == null || s === "") return 0; const v = Number(String(s).replace(",", ".")); return isFinite(v) ? v : 0; };
  const pad = (s, k) => String(s).padStart(k, "0");
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  const estado = {
    ele: null, modo: null, // modo: "2t" | "teste1t" | "forcado" | "demo"
    ele2T: CFG.eleicao2T, br: null, ufs: {}, ultimoOk: 0, erros: 0,
    ultimaDescoberta: 0, sort: { col: "uf", asc: true }, sel: null, timer: null
  };

  // ---------------- URLs ----------------
  const urlU = (ele, uf) => `${CFG.base}/${CFG.ciclo}/${ele}/dados/${uf}/${uf}-c${pad(CFG.cargo, 4)}-e${pad(ele, 6)}-u.json`;

  async function getJSON(url) {
    // cache:"no-cache" => o navegador revalida com If-None-Match/ETag (304 quando não mudou)
    const r = await fetch(url, { cache: "no-cache", mode: "cors" });
    if (r.status === 404 || r.status === 403) return { status: r.status, data: null };
    if (!r.ok) throw new Error("HTTP " + r.status);
    return { status: r.status, data: await r.json() };
  }

  // ---------------- Parse do arquivo "-u.json" do TSE ----------------
  function parseU(d) {
    const cands = {};
    const carg = (d.carg || []).find((c) => String(c.cd) === String(CFG.cargo)) || (d.carg || [])[0];
    (carg && carg.agr || []).forEach((a) => (a.par || []).forEach((p) => (p.cand || []).forEach((c) => {
      cands[c.n] = { n: c.n, nome: c.nmu || c.nm, vap: n(c.vap), st: c.st };
    })));
    const s = d.s || {}, e = d.e || {}, v = d.v || {};
    return {
      uf: d.cdabr, dg: d.dg, hg: d.hg, dt: d.dt, ht: d.ht, and: d.and,
      ts: n(s.ts), st: n(s.st), pstOficial: s.pstn != null ? n(s.pstn) : null,
      te: n(e.te), est: n(e.est), c: n(e.c), a: n(e.a),
      tv: n(v.tv), vv: n(v.vv), vb: n(v.vb), tvn: n(v.tvn), van: n(v.van),
      cands
    };
  }

  // Soma de vários registros (regiões, soma das UFs, simulação)
  function agrega(lista, uf) {
    const r = { uf, ts: 0, st: 0, te: 0, est: 0, c: 0, a: 0, tv: 0, vv: 0, vb: 0, tvn: 0, van: 0, cands: {} };
    lista.forEach((x) => {
      if (!x) return;
      ["ts","st","te","est","c","a","tv","vv","vb","tvn","van"].forEach((k) => (r[k] += x[k]));
      Object.values(x.cands).forEach((c) => {
        r.cands[c.n] = r.cands[c.n] || { n: c.n, nome: c.nome, vap: 0 };
        r.cands[c.n].vap += c.vap;
      });
    });
    return r;
  }

  const pst = (x) => (x.pstOficial != null ? x.pstOficial : x.ts ? (x.st / x.ts) * 100 : 0);
  const votos = (x, num) => (x.cands[num] ? x.cands[num].vap : 0);
  const pctV = (x, num) => (x.vv ? (votos(x, num) / x.vv) * 100 : NaN);
  const margem = (x) => pctV(x, CA.n) - pctV(x, CB.n); // >0 azul, <0 vermelho

  function dataTSE(dt, ht) { // "25/10/2026","19:03:12" (Brasília, UTC-3)
    if (!dt || !ht) return null;
    const [d, m, y] = dt.split("/");
    const t = Date.parse(`${y}-${m}-${d}T${ht}-03:00`);
    return isFinite(t) ? t : null;
  }

  // ---------------- Avisos ----------------
  function avisos(lista) {
    $("avisos").innerHTML = lista.map((a) => `<div class="aviso ${a.tipo}">${a.html}</div>`).join("");
  }
  function status(tipo, txt) { $("status").className = "status " + tipo; $("statusTxt").textContent = txt; }

  // ---------------- Descoberta do 2º turno (ele-c.json) ----------------
  async function descobrir2T() {
    if (!CFG.descobrirAuto) return;
    try {
      const { data } = await getJSON(CFG.configGeral);
      if (!data) return;
      let achado = null;
      (data.pl || []).filter((p) => p.c === CFG.ciclo).forEach((p) => (p.e || []).forEach((e) => {
        const temPres = (e.abr || []).some((a) => a.cd === "br" && (a.cp || []).some((c) => String(c.cd) === String(CFG.cargo)));
        if (String(e.cd) === String(CFG.eleicao1T) && e.cdt2) achado = achado || String(e.cdt2);
        if (String(e.t) === "2" && temPres) achado = String(e.cd); // eleição explícita de 2º turno para Presidente
      }));
      if (achado) estado.ele2T = achado;
    } catch (err) { /* mantém o código configurado */ }
    estado.ultimaDescoberta = Date.now();
  }

  // ---------------- Histórico (localStorage) ----------------
  const chaveHist = () => `apuracao-hist-${CFG.ciclo}-${estado.ele}${DEMO ? "-demo" : ""}`;
  let memHist = {};
  function lerHist() {
    if (DEMO) return memHist[chaveHist()] || [];
    try { return JSON.parse(localStorage.getItem(chaveHist()) || "[]"); } catch (e) { return []; }
  }
  function gravarHist(h) {
    if (DEMO) { memHist[chaveHist()] = h; return; }
    try { localStorage.setItem(chaveHist(), JSON.stringify(h.slice(-2000))); } catch (e) {}
  }
  function registrarHist(br, agora) {
    const h = lerHist();
    const k = `${br.dt} ${br.ht}`;
    const ult = h[h.length - 1];
    if (ult && ult.k === k) { ult.ate = agora; }
    else {
      h.push({ k, t: dataTSE(br.dt, br.ht), p: +pst(br).toFixed(4), a: +pctV(br, CA.n).toFixed(4), b: +pctV(br, CB.n).toFixed(4), de: agora, ate: agora });
    }
    gravarHist(h);
    return h;
  }

  // ---------------- Ciclo de atualização ----------------
  async function ciclo() {
    clearTimeout(estado.timer);
    if (estado.rodando) return;
    estado.rodando = true;
    const agora = Date.now();
    try {
      if (DEMO) { await cicloDemo(agora); }
      else { await cicloReal(agora); }
    } catch (err) {
      estado.erros++;
      console.error(err);
    }
    estado.rodando = false;
    render(agora);
    const fim = estado.br && pst(estado.br) >= 100;
    const seg = DEMO ? 3 : (fim ? CFG.intervaloFinalSeg : CFG.intervaloSeg);
    estado.timer = setTimeout(ciclo, (seg + (DEMO ? 0 : Math.random() * 5)) * 1000);
  }

  async function resolverEleicao() {
    const forc = params.get("eleicao") || (params.get("turno") === "1" ? CFG.eleicao1T : params.get("turno") === "2" ? estado.ele2T : null);
    if (forc) { estado.ele = forc; estado.modo = "forcado"; return; }
    if (estado.modo === "2t") return;
    if (!estado.ultimaDescoberta || Date.now() - estado.ultimaDescoberta > 10 * 60 * 1000) await descobrir2T();
    // tenta o 2º turno; se o TSE ainda não publicou (404), usa o 1º turno como teste
    const r = await getJSON(urlU(estado.ele2T, "br"));
    if (r.data) { trocarEleicao(estado.ele2T, "2t"); estado._brPre = r.data; }
    else { trocarEleicao(CFG.eleicao1T, "teste1t"); }
  }
  function trocarEleicao(ele, modo) {
    if (estado.ele !== ele) { estado.br = null; estado.ufs = {}; }
    estado.ele = ele; estado.modo = modo;
  }

  async function cicloReal(agora) {
    await resolverEleicao();
    let brData = estado._brPre; estado._brPre = null;
    if (!brData) {
      const r = await getJSON(urlU(estado.ele, "br"));
      brData = r.data;
      if (!brData) { estado.semArquivo = true; throw new Error("arquivo nacional ausente"); }
    }
    estado.semArquivo = false;
    const res = await Promise.allSettled(UFS.map((uf) => getJSON(urlU(estado.ele, uf))));
    res.forEach((r, i) => { if (r.status === "fulfilled" && r.value.data) estado.ufs[UFS[i]] = parseU(r.value.data); });
    estado.br = parseU(brData);
    estado.falhasUF = res.filter((r) => r.status === "rejected" || !r.value.data).length;
    estado.ultimoOk = agora; estado.erros = 0;
    registrarHist(estado.br, agora);
  }

  // ---------------- Modo simulação (?demo=1) ----------------
  // Usa o resultado FINAL do 1º turno e "revela" cada UF em ritmos diferentes.
  // Serve só para testar gráfico/mapa/projeção. Não são dados reais da apuração.
  let demoBase = null, demoPasso = 0;
  async function cicloDemo(agora) {
    estado.ele = CFG.eleicao1T; estado.modo = "demo";
    if (!demoBase) {
      demoBase = {};
      const res = await Promise.all(UFS.map((uf) => getJSON(urlU(CFG.eleicao1T, uf))));
      res.forEach((r, i) => { if (r.data) demoBase[UFS[i]] = parseU(r.data); });
    }
    demoPasso++;
    const minutos = demoPasso * 4 + (demoPasso > 9 ? 15 : 0); // pausa artificial de 15 min no passo 10
    UFS.forEach((uf, i) => {
      const b = demoBase[uf]; if (!b) return;
      const vel = 0.04 + ((i * 37) % 11) / 100; // ritmos diferentes por UF
      const atraso = (i * 13) % 4;
      const f = Math.max(0, Math.min(1, (demoPasso - atraso) * vel));
      const x = JSON.parse(JSON.stringify(b));
      ["st","est","c","a","tv","vv","vb","tvn","van"].forEach((k) => (x[k] = Math.round(b[k] * f)));
      Object.values(x.cands).forEach((c) => (c.vap = Math.round(b.cands[c.n].vap * f)));
      x.pstOficial = b.ts ? (x.st / b.ts) * 100 : 0;
      estado.ufs[uf] = x;
    });
    const br = agrega(UFS.map((u) => estado.ufs[u]), "br");
    const t = new Date(Date.parse("2026-10-25T17:00:00-03:00") + minutos * 60000);
    const hhmm = t.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo" });
    br.dt = "25/10/2026"; br.ht = hhmm; br.dg = br.dt; br.hg = hhmm;
    estado.br = br; estado.ultimoOk = agora; estado.falhasUF = 0;
    registrarHist(br, agora);
  }

  // ---------------- Render ----------------
  function render(agora) {
    const br = estado.br;
    const lista = [];
    if (DEMO) lista.push({ tipo: "alerta", html: "<strong>SIMULAÇÃO</strong> — progressão fictícia gerada a partir do resultado final do 1º turno, só para testar o painel. <strong>Não são dados reais.</strong> <a href='./'>Sair da simulação</a>" });
    if (estado.modo === "teste1t") lista.push({ tipo: "info", html: `<strong>MODO TESTE</strong>: o TSE ainda não publicou os resultados do 2º turno (eleição ${esc(estado.ele2T)}). Exibindo o <strong>1º turno de 04/10/2026</strong> (eleição ${esc(CFG.eleicao1T)}). O painel troca sozinho para o 2º turno quando os arquivos aparecerem.` });
    if (estado.erros > 0) {
      const desde = estado.ultimoOk ? Math.round((agora - estado.ultimoOk) / 60000) : null;
      lista.push({ tipo: "erro", html: `<strong>Falha ao acessar a fonte do TSE.</strong> ${desde != null ? `Último dado obtido há ${desde} min. ` : ""}Tentando novamente automaticamente.` });
    }
    if (estado.semArquivo) lista.push({ tipo: "alerta", html: `O arquivo nacional da eleição ${esc(estado.ele)} ainda não existe no TSE (404).` });
    if (br) {
      const tTot = dataTSE(br.dt, br.ht);
      const p = pst(br);
      if (!DEMO && tTot && p > 0 && p < 100 && agora - tTot > CFG.pausaMin * 60000) {
        lista.push({ tipo: "alerta", html: `<strong>TSE sem nova totalização há ${Math.round((agora - tTot) / 60000)} min</strong> (última: ${esc(br.ht)} de ${esc(br.dt)}). Os números podem estar parados.` });
      }
      if (estado.falhasUF > 0) lista.push({ tipo: "alerta", html: `${estado.falhasUF} arquivo(s) de UF não carregaram neste ciclo; usando o último valor obtido.` });
    }
    avisos(lista);

    if (estado.erros > 0) status("erro", "fonte fora do ar");
    else if (br) status(lista.some((a) => a.tipo === "alerta" && !DEMO) ? "alerta" : "ok", "ao vivo · " + new Date(agora).toLocaleTimeString("pt-BR"));

    const tituloModo = { "2t": "2º turno · 25/10/2026", teste1t: "MODO TESTE · 1º turno · 04/10/2026", forcado: "Eleição " + estado.ele, demo: "SIMULAÇÃO" }[estado.modo] || "";
    $("subtitulo").textContent = `${tituloModo} · ${CA.nome} × ${CB.nome}`;
    $("fonteInfo").innerHTML = estado.ele ? `Fonte: <a href="${urlU(estado.ele, "br")}" target="_blank" rel="noopener">${esc(urlU(estado.ele, "br"))}</a> (+ 27 UFs e Exterior)` : "";
    if (!br) return;

    renderPlacar(br, agora);
    const ufsArr = UFS.map((u) => estado.ufs[u]).filter(Boolean);
    renderConferencia(br, ufsArr);
    renderProjecao(br);
    renderMapa();
    renderGrafico();
    renderRegioes();
    renderTabelaUF();
  }

  function renderPlacar(br, agora) {
    const p = pst(br);
    $("pctSecoes").textContent = f2(p) + "%";
    $("secoesNum").textContent = `(${fi(br.st)} de ${fi(br.ts)})`;
    $("barraSecoes").style.width = Math.min(100, p) + "%";
    const pa = pctV(br, CA.n), pb = pctV(br, CB.n);
    const va = votos(br, CA.n), vb = votos(br, CB.n);
    const card = (c, pct, v, lider) => `<div class="cand ${c.lado}">
      <div class="nome">${esc(c.nome)} <span class="mut">${esc(c.n)}</span></div>
      <div class="pct">${f2(pct)}%</div><div class="votos">${fi(v)} votos</div>${lider ? '<span class="lider">à frente</span>' : ""}</div>`;
    $("cands").innerHTML = card(CA, pa, va, va > vb) + card(CB, pb, vb, vb > va);
    const outros = br.vv - va - vb;
    const wa = br.vv ? (va / br.vv) * 100 : 0, wb = br.vv ? (vb / br.vv) * 100 : 0;
    $("barraDisputa").innerHTML = `<div style="width:${wa}%;background:${CA.cor}"></div><div style="width:${100 - wa - wb}%;background:#555"></div><div style="width:${wb}%;background:${CB.cor}"></div><span class="meio"></span>`;
    const dv = Math.abs(va - vb), dp = Math.abs(pa - pb);
    const lider = va === vb ? null : va > vb ? CA : CB;
    $("diferenca").innerHTML = lider ? `Diferença: <strong>${fi(dv)} votos</strong> · <strong>${f2(dp)} p.p.</strong> a favor de <strong style="color:${lider.cor}">${esc(lider.nome)}</strong>` : (br.vv ? "Empate" : "Aguardando votos totalizados");
    const mini = (r, v, s) => `<div class="mini"><div class="r">${r}</div><div class="v">${v}</div>${s ? `<div class="r">${s}</div>` : ""}</div>`;
    $("miniGrid").innerHTML =
      mini("Votos válidos", fi(br.vv), br.tv ? f2((br.vv / br.tv) * 100) + "% dos votos" : "") +
      mini("Brancos", fi(br.vb), br.tv ? f2((br.vb / br.tv) * 100) + "% dos votos" : "") +
      mini("Nulos", fi(br.tvn), br.tv ? f2((br.tvn / br.tv) * 100) + "% dos votos" : "") +
      mini("Abstenção", fi(br.a), br.est ? f2((br.a / br.est) * 100) + "% do eleitorado apurado" : "") +
      mini("Comparecimento", fi(br.c), br.est ? f2((br.c / br.est) * 100) + "%" : "") +
      mini("Eleitorado", fi(br.te), "") +
      (outros > 0 ? mini("Outros candidatos", fi(outros), f2((outros / br.vv) * 100) + "% dos válidos") : "") +
      mini("Anulados (sub judice)", fi(br.van), "");
    $("ultimaAtualizacao").innerHTML = `Última totalização do TSE: <strong>${esc(br.dt || "–")} ${esc(br.ht || "")}</strong> (Brasília) · arquivo gerado ${esc(br.dg || "–")} ${esc(br.hg || "")} · verificado às ${new Date(agora).toLocaleTimeString("pt-BR")}`;
  }

  function renderConferencia(br, ufsArr) {
    const soma = agrega(ufsArr, "soma");
    const linhas = [
      [CA.nome, votos(br, CA.n), votos(soma, CA.n)],
      [CB.nome, votos(br, CB.n), votos(soma, CB.n)],
      ["Votos válidos", br.vv, soma.vv], ["Total de votos", br.tv, soma.tv],
      ["Brancos", br.vb, soma.vb], ["Nulos", br.tvn, soma.tvn],
      ["Seções totalizadas", br.st, soma.st], ["Abstenção", br.a, soma.a]
    ];
    let algumErro = false;
    const tr = linhas.map(([r, of, sm]) => {
      const dif = sm - of, rel = of ? Math.abs(dif) / of : Math.abs(dif) > 0 ? 1 : 0;
      const bad = rel > CFG.toleranciaDivergencia; if (bad) algumErro = true;
      return `<tr><td>${esc(r)}</td><td>${fi(of)}</td><td>${fi(sm)}</td><td>${dif > 0 ? "+" : ""}${fi(dif)}</td><td class="${bad ? "erro-txt" : "ok-txt"}">${bad ? "⚠ " + f2(rel * 100) + "%" : "✔"}</td></tr>`;
    }).join("");
    const cab = `<p class="peq ${algumErro ? "erro-txt" : "ok-txt"}">${algumErro ? `⚠ DIVERGÊNCIA acima de 0,01% entre a soma das ${ufsArr.length} unidades e o total nacional oficial. Pode ser defasagem momentânea entre arquivos do TSE; confira no próximo ciclo.` : `✔ Soma das ${ufsArr.length} unidades (27 UFs + Exterior) confere com o total nacional oficial (tolerância 0,01%).`}</p>`;
    $("confConteudo").innerHTML = cab + `<div class="tabela-wrap"><table><thead><tr><th>Item</th><th>Nacional (TSE)</th><th>Soma UFs (app)</th><th>Dif.</th><th></th></tr></thead><tbody>${tr}</tbody></table></div>`;
  }

  function projetar() {
    const br = estado.br;
    const natC = br.est ? br.c / br.est : 0.79, natV = br.tv ? br.vv / br.tv : 0.95;
    const natA = br.vv ? votos(br, CA.n) / br.vv : 0.5, natB = br.vv ? votos(br, CB.n) / br.vv : 0.5;
    let A = 0, B = 0, V = 0, falt = 0;
    UFS.forEach((uf) => {
      const x = estado.ufs[uf]; if (!x) return;
      const rest = Math.max(0, x.te - x.est);
      const temDado = x.est > 0 && x.vv > 0;
      const rc = temDado ? x.c / x.est : natC, rv = temDado ? x.vv / x.tv : natV;
      const sa = temDado ? votos(x, CA.n) / x.vv : natA, sb = temDado ? votos(x, CB.n) / x.vv : natB;
      const fv = rest * rc * rv;
      falt += fv;
      A += votos(x, CA.n) + fv * sa; B += votos(x, CB.n) + fv * sb; V += x.vv + fv;
    });
    return { A, B, V, falt };
  }

  function renderProjecao(br) {
    const pr = projetar();
    const p = pst(br);
    const linha = (c, v) => `<div class="proj-linha"><span style="color:${c.cor}"><strong>${esc(c.nome)}</strong></span><span><strong>${f2((v / pr.V) * 100)}%</strong> <span class="mut">≈ ${fi(v)} votos</span></span></div>`;
    $("projConteudo").innerHTML = pr.V > 0 ? (
      (p >= 100 ? `<p class="peq ok-txt">Totalização concluída: a projeção coincide com o resultado.</p>` : `<p class="peq mut">Estimativa de % de votos válidos ao final, com ${f2(p)}% das seções totalizadas. Votos válidos ainda não totalizados (estimados): ≈ ${fi(pr.falt)}.</p>`) +
      linha(CA, pr.A) + linha(CB, pr.B)
    ) : `<p class="mut">Aguardando as primeiras seções totalizadas.</p>`;
  }

  // ---------------- Mapa ----------------
  let geo = null, geoProm = null;
  const COS = Math.cos((15 * Math.PI) / 180), K = 10;
  const proj = ([lon, lat]) => [(lon + 74.5) * COS * K, (5.8 - lat) * K];
  function hexMix(a, b, t) {
    const pa = a.match(/\w\w/g).map((h) => parseInt(h, 16)), pb = b.match(/\w\w/g).map((h) => parseInt(h, 16));
    return "#" + pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, "0")).join("");
  }
  const ESCALA = { azul: ["#a9c1ff", "#0b3bd1"], vermelho: ["#ffb4b5", "#a4161a"] };
  function corUF(x) {
    if (!x || !x.vv) return "#3a3f47";
    const m = margem(x);
    if (!isFinite(m)) return "#3a3f47";
    const t = Math.sqrt(Math.min(Math.abs(m) / 40, 1));
    const lado = m >= 0 ? CA.lado : CB.lado;
    return hexMix(ESCALA[lado][0], ESCALA[lado][1], t);
  }
  function caminho(geom) {
    const polys = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
    let d = "", melhor = null, area = -1;
    polys.forEach((poly) => poly.forEach((ring, ri) => {
      const pts = ring.map(proj);
      d += "M" + pts.map((p) => p[0].toFixed(1) + "," + p[1].toFixed(1)).join("L") + "Z";
      if (ri === 0) {
        let xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
        const a = (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
        if (a > area) { area = a; melhor = [(Math.max(...xs) + Math.min(...xs)) / 2, (Math.max(...ys) + Math.min(...ys)) / 2]; }
      }
    }));
    return { d, c: melhor };
  }
  const AJUSTE_ROTULO = { df: [3, 4], go: [-4, 6], rn: [4, -2], pb: [8, 0], pe: [10, 0], al: [7, 2], se: [4, 3], es: [3, 0], rj: [4, 2], sc: [3, 0], mt: [0, 4], pa: [0, 6], ma: [2, 6], ap: [0, 0] };
  async function carregarGeo() {
    if (!geoProm) geoProm = fetch("data/br-uf.geojson").then((r) => r.json()).then((g) => (geo = g));
    return geoProm;
  }
  function tooltipHTML(uf) {
    const x = estado.ufs[uf];
    if (!x) return `<strong>${NOMES[uf]}</strong><br>sem dados`;
    const va = votos(x, CA.n), vb = votos(x, CB.n), m = margem(x);
    return `<strong>${NOMES[uf]}</strong> · ${f2(pst(x))}% apurado<br>
      <span style="color:${CA.cor}">■</span> ${esc(CA.nome)}: <strong>${f2(pctV(x, CA.n))}%</strong> (${fi(va)})<br>
      <span style="color:${CB.cor}">■</span> ${esc(CB.nome)}: <strong>${f2(pctV(x, CB.n))}%</strong> (${fi(vb)})<br>
      ${x.vv ? `Margem: ${f2(Math.abs(m))} p.p. (${fi(Math.abs(va - vb))} votos)<br>` : ""}
      Abstenção: ${x.est ? f2((x.a / x.est) * 100) + "%" : "–"}`;
  }
  async function renderMapa() {
    await carregarGeo();
    const svg = $("mapa");
    if (!svg.dataset.pronto) {
      let html = "";
      geo.features.forEach((f) => {
        const uf = f.properties.uf, { d, c } = caminho(f.geometry), aj = AJUSTE_ROTULO[uf] || [0, 0];
        html += `<path data-uf="${uf}" d="${d}"><title>${NOMES[uf]}</title></path>`;
        html += `<text x="${(c[0] + aj[0]).toFixed(1)}" y="${(c[1] + aj[1] + 3).toFixed(1)}">${uf.toUpperCase()}</text>`;
      });
      // Exterior: quadro à parte
      html += `<rect data-uf="zz" x="330" y="330" width="60" height="34" rx="5" style="cursor:pointer;stroke:#0d1117"></rect><text x="360" y="351">EXTERIOR</text>`;
      svg.setAttribute("viewBox", "0 0 400 400");
      svg.innerHTML = html;
      svg.dataset.pronto = "1";
      const tip = $("tooltip"), wrap = svg.parentElement;
      const mostrar = (ev) => {
        const el = ev.target.closest("[data-uf]"); if (!el) { tip.hidden = true; return; }
        const uf = el.dataset.uf;
        tip.innerHTML = tooltipHTML(uf); tip.hidden = false;
        const r = wrap.getBoundingClientRect();
        let x = ev.clientX - r.left + 12, y = ev.clientY - r.top + 12;
        if (x + 240 > r.width) x = Math.max(0, ev.clientX - r.left - 200);
        tip.style.left = x + "px"; tip.style.top = y + "px";
        svg.querySelectorAll(".sel").forEach((e) => e.classList.remove("sel")); el.classList.add("sel");
      };
      svg.addEventListener("mousemove", mostrar);
      svg.addEventListener("click", mostrar);
      svg.addEventListener("mouseleave", () => { tip.hidden = true; });
      const desen = () => {
        const s = (t) => `<span class="sw" style="background:${t}"></span>`;
        $("legenda").innerHTML = `${esc(CA.nome)} ${s(ESCALA.azul[1])}${s(hexMix(ESCALA.azul[0], ESCALA.azul[1], 0.55))}${s(ESCALA.azul[0])} margem ${s(ESCALA.vermelho[0])}${s(hexMix(ESCALA.vermelho[0], ESCALA.vermelho[1], 0.55))}${s(ESCALA.vermelho[1])} ${esc(CB.nome)} &nbsp; ${s("#3a3f47")} sem apuração`;
      };
      desen();
    }
    svg.querySelectorAll("[data-uf]").forEach((el) => { el.style.fill = corUF(estado.ufs[el.dataset.uf]); });
  }

  // ---------------- Gráfico de evolução ----------------
  function renderGrafico() {
    const h = lerHist();
    const W = 600, H = 300, L = 40, R = 12, T = 14, B = 34;
    const svg = $("grafico");
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    if (!h.length) { svg.innerHTML = `<text x="${W / 2}" y="${H / 2}" text-anchor="middle">Sem histórico ainda</text>`; return; }
    const vals = h.flatMap((e) => [e.a, e.b]).filter(isFinite);
    let lo = Math.min(...vals, 50), hi = Math.max(...vals, 50);
    lo = Math.max(0, Math.floor((lo - 2) / 5) * 5); hi = Math.min(100, Math.ceil((hi + 2) / 5) * 5);
    const X = (p) => L + (p / 100) * (W - L - R), Y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
    let s = "";
    for (let v = lo; v <= hi; v += 5) s += `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="${v === 50 ? "#8b949e" : "#30363d"}" stroke-width="${v === 50 ? 1 : 0.6}"/><text x="${L - 4}" y="${Y(v) + 3}" text-anchor="end">${v}%</text>`;
    for (let p = 0; p <= 100; p += 20) s += `<text x="${X(p)}" y="${H - B + 14}" text-anchor="middle">${p}%</text>`;
    s += `<text x="${(L + W - R) / 2}" y="${H - 4}" text-anchor="middle">% das seções totalizadas</text>`;
    // pausas (> pausaMin) entre totalizações consecutivas
    const tolObs = (CFG.intervaloSeg * 2 + 30) * 1000;
    for (let i = 1; i < h.length; i++) {
      const a = h[i - 1], b = h[i];
      if (a.t && b.t && b.t - a.t > CFG.pausaMin * 60000 && a.p < 100) {
        const real = b.de - a.ate <= tolObs; // estávamos observando: pausa real do TSE
        const min = Math.round((b.t - a.t) / 60000);
        s += `<line x1="${X(b.p)}" x2="${X(b.p)}" y1="${T}" y2="${H - B}" stroke="${real ? "#d29922" : "#6e7681"}" stroke-dasharray="4 3"/><text x="${X(b.p) + 3}" y="${T + 10}" fill="${real ? "#d29922" : "#6e7681"}">${real ? "pausa" : "lacuna"} ${min} min</text>`;
      }
    }
    [[CA, "a"], [CB, "b"]].forEach(([c, k]) => {
      const pts = h.filter((e) => isFinite(e[k])).map((e) => `${X(e.p).toFixed(1)},${Y(e[k]).toFixed(1)}`);
      if (pts.length > 1) s += `<polyline fill="none" stroke="${c.cor}" stroke-width="2" points="${pts.join(" ")}"/>`;
      const u = h[h.length - 1];
      if (isFinite(u[k])) s += `<circle cx="${X(u.p)}" cy="${Y(u[k])}" r="3.5" fill="${c.cor}"/><text x="${Math.min(X(u.p) + 6, W - R - 60)}" y="${Y(u[k]) - 6}" fill="${c.cor}">${esc(c.nome.split(" ")[0])} ${f2(u[k])}%</text>`;
    });
    svg.innerHTML = s;
    $("grafNota").textContent = `${h.length} ponto(s) guardados neste navegador desde que o painel foi aberto. Tracejado amarelo = pausa de mais de ${CFG.pausaMin} min na totalização do TSE observada ao vivo; cinza = lacuna (painel fechado no intervalo).`;
  }

  // ---------------- Tabelas ----------------
  function linhaDados(rotulo, x, extra) {
    const va = votos(x, CA.n), vb = votos(x, CB.n), m = margem(x);
    return { rotulo, x, va, vb, pa: pctV(x, CA.n), pb: pctV(x, CB.n), m, dif: va - vb, pst: pst(x), abst: x.est ? (x.a / x.est) * 100 : NaN, ...extra };
  }
  function celMargem(r) {
    if (!isFinite(r.m)) return "–";
    const c = r.m >= 0 ? CA : CB;
    return `<span style="color:${c.cor}">${r.m >= 0 ? "+" : "−"}${f2(Math.abs(r.m))}</span>`;
  }
  function renderRegioes() {
    const grupos = ["N", "NE", "CO", "SE", "S", "EX"].map((r) => linhaDados(NOME_REG[r], agrega(UFS.filter((u) => REGIAO[u] === r).map((u) => estado.ufs[u]), r)));
    const tot = linhaDados("Total (soma)", agrega(UFS.map((u) => estado.ufs[u]), "t"));
    const tr = (r, cls) => `<tr class="${cls || ""}"><td>${esc(r.rotulo)}</td><td>${f2(r.pst)}%</td><td>${f2(r.pa)}%</td><td>${fi(r.va)}</td><td>${f2(r.pb)}%</td><td>${fi(r.vb)}</td><td>${celMargem(r)}</td><td>${fi(Math.abs(r.dif))}</td></tr>`;
    $("tabRegioes").innerHTML = `<thead><tr><th>Região</th><th>Apurado</th><th>${esc(CA.nome)}</th><th>votos</th><th>${esc(CB.nome)}</th><th>votos</th><th>Margem p.p.</th><th>Dif. votos</th></tr></thead><tbody>${grupos.map((g) => tr(g)).join("")}${tr(tot, "total")}</tbody>`;
  }
  const COLS = [
    ["uf", "UF", (r) => r.rotulo], ["reg", "Região", (r) => r.reg], ["pst", "Apurado", (r) => r.pst],
    ["pa", "% " + CA.nome, (r) => r.pa], ["va", "Votos " + CA.nome.split(" ")[0], (r) => r.va],
    ["pb", "% " + CB.nome, (r) => r.pb], ["vb", "Votos " + CB.nome.split(" ")[0], (r) => r.vb],
    ["m", "Margem p.p.", (r) => r.m], ["dif", "Dif. votos", (r) => r.dif],
    ["vbr", "Brancos", (r) => r.x.vb], ["vnu", "Nulos", (r) => r.x.tvn], ["abst", "Abstenção", (r) => r.abst], ["te", "Eleitorado", (r) => r.x.te]
  ];
  function renderTabelaUF() {
    const rows = UFS.filter((u) => estado.ufs[u]).map((u) => linhaDados(u.toUpperCase(), estado.ufs[u], { reg: REGIAO[u] === "EX" ? "Ext." : REGIAO[u], uf: u }));
    const col = COLS.find((c) => c[0] === estado.sort.col) || COLS[0];
    rows.sort((a, b) => { const x = col[2](a), y = col[2](b); const r = typeof x === "string" ? x.localeCompare(y) : (isFinite(x) ? x : -1e15) - (isFinite(y) ? y : -1e15); return estado.sort.asc ? r : -r; });
    const th = COLS.map((c) => `<th data-col="${c[0]}" class="${c[0] === estado.sort.col ? "ord" + (estado.sort.asc ? " asc" : "") : ""}">${esc(c[1])}</th>`).join("");
    const tb = rows.map((r) => `<tr title="${NOMES[r.uf]}"><td><span class="chip" style="background:${corUF(r.x)}"></span>${r.rotulo}</td><td>${r.reg}</td><td>${f2(r.pst)}%</td><td>${f2(r.pa)}%</td><td>${fi(r.va)}</td><td>${f2(r.pb)}%</td><td>${fi(r.vb)}</td><td>${celMargem(r)}</td><td>${fi(Math.abs(r.dif))}</td><td>${fi(r.x.vb)}</td><td>${fi(r.x.tvn)}</td><td>${f2(r.abst)}%</td><td>${fi(r.x.te)}</td></tr>`).join("");
    const t = $("tabUFs");
    t.innerHTML = `<thead><tr>${th}</tr></thead><tbody>${tb}</tbody>`;
    t.querySelectorAll("th").forEach((el) => el.addEventListener("click", () => {
      const c = el.dataset.col;
      estado.sort = { col: c, asc: estado.sort.col === c ? !estado.sort.asc : c === "uf" || c === "reg" };
      renderTabelaUF();
    }));
  }

  $("limparHist").addEventListener("click", () => {
    if (confirm("Apagar o histórico de evolução guardado neste navegador?")) { try { localStorage.removeItem(chaveHist()); } catch (e) {} memHist = {}; renderGrafico(); }
  });
  document.addEventListener("visibilitychange", () => { if (!document.hidden && !DEMO) ciclo(); });

  carregarGeo().catch(() => {});
  ciclo();
})();
