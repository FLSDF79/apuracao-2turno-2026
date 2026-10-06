// Testes da página no Chromium (Playwright): valores exibidos conferidos com os arquivos de origem,
// mapa, filtros e navegação em computador e celular, cenários de falha do coletor e console limpo.
// Rodar: node --test tests/navegador/*.test.mjs   (EVIDENCIAS=1 guarda capturas e relatório em docs/evidencias/painel/)
import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import * as F from "../../js/formato.js";
import { servidor, navegador, abrir, lerJSON, evidencia, registrar } from "./apoio.mjs";

const UFS = ["ac", "al", "ap", "am", "ba", "ce", "df", "es", "go", "ma", "mt", "ms", "mg", "pa", "pb", "pr", "pe", "pi", "rj", "rn", "rs", "ro", "rr", "sc", "sp", "se", "to"];
const CANDS = ["22", "13"]; // ordem fixa da configuração da página
const relatorio = { gerado_em: new Date().toISOString(), casos: [] };
let srv, nav;

before(async () => { srv = await servidor(); nav = await navegador(); });
after(async () => { await nav?.close(); await srv?.fechar(); await registrar(relatorio); });

const anotar = (caso, detalhes) => relatorio.casos.push({ caso, ...detalhes });
const textos = (pagina, sel) => pagina.$$eval(sel, (els) => els.map((e) => e.textContent.replace(/\s+/g, " ").trim()));
const esperarDados = (pagina) => pagina.waitForFunction(() => document.querySelectorAll("#tabUFs tbody tr").length > 0);
const res = (snap, id) => (id === "br" ? snap.brasil.oficial : snap.territorios[id]?.resultado);
const cand = (r, n) => r?.candidatos.find((c) => String(c.numero) === n);

// ------------------------------------------------------------------ valores × arquivos
for (const [nome, q, pasta] of [["ensaio", "?fonte=ensaio", "exemplos/ensaio-1turno/v1/"], ["simulacao", "?fonte=simulacao", "exemplos/simulado-2turno/v1/"]]) {
  describe(`valores exibidos = arquivos de origem (${nome})`, () => {
    let p, snap, hist;
    before(async () => {
      snap = await lerJSON(pasta + "presidente.json");
      hist = await lerJSON(pasta + "historico.json");
      p = await abrir(nav, srv.url + q);
      await esperarDados(p.pagina);
    });
    after(() => p.fechar());

    test("placar nacional", async () => {
      const br = snap.brasil.oficial;
      const pcts = await textos(p.pagina, "#placar .cand-pct");
      const votos = await textos(p.pagina, "#placar .cand-votos");
      CANDS.forEach((n, i) => {
        assert.equal(pcts[i], F.pct(cand(br, n).pct_validos), `% do ${n}`);
        assert.equal(votos[i], `${F.int(cand(br, n).votos)} votos`, `votos do ${n}`);
      });
      assert.equal(await p.pagina.textContent("#totPct"), F.pct(br.indicadores.pct_totalizadas));
      const d = br.disputa;
      if (d?.situacao === "lideranca") assert.match(await p.pagina.textContent("#diferenca"), new RegExp(F.int(d.diferenca_votos).replace(/\./g, "\\.") + " votos"));
      anotar(`placar ${nome}`, { esperado: CANDS.map((n) => [n, cand(br, n).votos, F.pct(cand(br, n).pct_validos)]), exibido: { pcts, votos } });
    });

    test("tabela das 27 UFs e exterior", async () => {
      const linhas = await p.pagina.$$eval("#tabUFs tbody tr", (trs) => trs.map((tr) => ({ id: tr.dataset.id, c: [...tr.cells].map((td) => td.textContent.trim()) })));
      assert.equal(linhas.length, 28);
      let conferidas = 0;
      for (const { id, c } of linhas) {
        const r = res(snap, id);
        if (!r) { assert.equal(c[4], "—"); continue; }
        const a = cand(r, "22"), b = cand(r, "13");
        assert.equal(c[3], F.pct(r.indicadores.pct_totalizadas), `${id} totalizado`);
        assert.equal(c[4], F.pct(a?.pct_validos ?? null), `${id} % 22`);
        assert.equal(c[5], F.int(a?.votos ?? null), `${id} votos 22`);
        assert.equal(c[6], F.pct(b?.pct_validos ?? null), `${id} % 13`);
        assert.equal(c[7], F.int(b?.votos ?? null), `${id} votos 13`);
        assert.equal(c[10], F.int(r.votos.validos), `${id} válidos`);
        assert.equal(c[11], F.int(r.votos.brancos), `${id} brancos`);
        conferidas++;
      }
      anotar(`tabela UFs ${nome}`, { linhas: linhas.length, conferidas, campos: ["totalizado", "% e votos dos 2 candidatos", "válidos", "brancos"] });
    });

    test("regiões e Brasil (soma) vêm prontos do coletor", async () => {
      const linhas = await p.pagina.$$eval("#tabRegioes tbody tr", (trs) => trs.map((tr) => ({ id: tr.dataset.id, c: [...tr.cells].map((td) => td.textContent.trim()) })));
      const COD = { "reg-n": "N", "reg-ne": "NE", "reg-co": "CO", "reg-se": "SE", "reg-s": "S" };
      for (const { id, c } of linhas) {
        const r = COD[id] ? snap.regioes[COD[id]].resultado : id === "br-calculado" ? snap.brasil.calculado : id === "br" ? snap.brasil.oficial : snap.territorios[id]?.resultado;
        assert.ok(r, id);
        assert.equal(c[5], F.int(cand(r, "22").votos), `${id} votos 22`);
        assert.equal(c[7], F.int(cand(r, "13").votos), `${id} votos 13`);
        assert.equal(c[3], F.pct(r.indicadores.pct_totalizadas), `${id} totalizado`);
      }
      assert.deepEqual(linhas.map((l) => l.id), ["reg-n", "reg-ne", "reg-co", "reg-se", "reg-s", "zz", "br-calculado", "br"]);
    });

    test("conferência A × B linha a linha", async () => {
      const linhas = await p.pagina.$$eval("#tabConf tbody tr", (trs) => trs.map((tr) => [...tr.cells].map((td) => td.textContent.trim())));
      assert.equal(linhas.length, snap.conferencia.linhas.length);
      snap.conferencia.linhas.forEach((l, i) => {
        assert.equal(linhas[i][1], F.int(l.a), `${l.chave} A`);
        assert.equal(linhas[i][2], F.int(l.b), `${l.chave} B`);
        assert.equal(linhas[i][3], l.diferenca === 0 ? "0" : F.intSinal(l.diferenca), `${l.chave} A−B`);
      });
      assert.match(await p.pagina.textContent("#confCab"), /mesma base|consistência/i);
    });

    test("três horários separados e sem relógio de parede", async () => {
      assert.equal(await p.pagina.textContent("#tPub"), F.dh(snap.brasil.oficial.horario.geracao));
      assert.equal(await p.pagina.textContent("#tCon"), F.dh(snap.brasil.coleta.ultimo_sucesso));
      assert.equal(await p.pagina.textContent("#tMud"), F.dh(snap.snapshot?.mudou_em || hist.serie_brasil.at(-1).coletado_em));
      assert.equal(await p.pagina.$("#relogio"), null);
    });

    test("identificação de teste destacada", async () => {
      assert.equal(await p.pagina.isVisible("#faixaTeste"), true);
      const tit = await p.pagina.textContent("#faixaTit");
      assert.match(tit, nome === "ensaio" ? /ENSAIO/ : /SIMULAÇÃO/);
      assert.match(await p.pagina.title(), /^\[/);
      const marca = await p.pagina.$eval(".bloco-brasil", (el) => getComputedStyle(el, "::after").content);
      assert.notEqual(marca, "none");
      assert.equal(await p.pagina.textContent("#saudeTxt"), "dados de teste");
    });

    test("console sem erros", () => {
      assert.deepEqual(p.erros, []);
      anotar(`console ${nome}`, { erros: p.erros });
    });

    test("captura", async () => { await evidencia(p.pagina, `desktop-${nome}`); });
  });
}

// ------------------------------------------------------------------ mapa, filtros e navegação
describe("mapa, filtros e navegação no computador", () => {
  let p, snap;
  before(async () => {
    snap = await lerJSON("exemplos/simulado-2turno/v1/presidente.json");
    p = await abrir(nav, srv.url + "?fonte=simulacao", { viewport: { width: 1440, height: 900 } });
    await esperarDados(p.pagina);
  });
  after(() => p.fechar());

  test("27 UFs no mapa, cada uma acessível pelo teclado e com nome", async () => {
    const ids = await p.pagina.$$eval("#mapa [data-id]", (els) => [...new Set(els.map((e) => e.dataset.id))]);
    for (const uf of UFS) assert.ok(ids.includes(uf), uf);
    const semNome = await p.pagina.$$eval("#mapa [data-id][tabindex]", (els) => els.filter((e) => !e.getAttribute("aria-label")).length);
    assert.equal(semNome, 0);
  });

  test("passar o cursor mostra votos e totalização", async () => {
    await p.pagina.hover('#mapa [data-id="mg"]');
    const tip = await p.pagina.textContent("#tooltip");
    const r = snap.territorios.mg.resultado;
    assert.match(tip, /Minas Gerais/);
    assert.ok(tip.includes(F.pct(cand(r, "22").pct_validos)), "pct no tooltip");
    assert.ok(tip.includes(F.int(cand(r, "22").votos)), "votos no tooltip");
    assert.ok(tip.includes(F.pct(r.indicadores.pct_totalizadas)), "totalização no tooltip");
    await evidencia(p.pagina, "mapa-tooltip");
  });

  test("clicar abre o detalhamento estadual; Esc fecha e devolve o foco", async () => {
    await p.pagina.click('#mapa [data-id="sp"]');
    await p.pagina.waitForSelector("#gaveta:not([hidden])");
    const txt = await p.pagina.textContent("#gavConteudo");
    assert.match(txt, /São Paulo/);
    assert.ok(txt.includes(F.int(cand(snap.territorios.sp.resultado, "13").votos)));
    await evidencia(p.pagina, "detalhe-sp");
    await p.pagina.keyboard.press("Escape");
    assert.equal(await p.pagina.isHidden("#gaveta"), true);
  });

  test("teclado: Tab chega a uma UF e Enter abre o detalhe", async () => {
    await p.pagina.focus('#mapa [data-id="df"]');
    await p.pagina.keyboard.press("Enter");
    await p.pagina.waitForSelector("#gaveta:not([hidden])");
    assert.match(await p.pagina.textContent("#gavTitulo"), /Distrito Federal/);
    await p.pagina.keyboard.press("Escape");
  });

  test("visão por região e mapa em grade", async () => {
    await p.pagina.click('[data-nivel="regiao"]');
    const regs = await p.pagina.$$eval("#mapa [data-id^='reg-']", (els) => new Set(els.map((e) => e.dataset.id)).size);
    assert.equal(regs, 5);
    await p.pagina.click('[data-forma="grade"]');
    await p.pagina.click('[data-nivel="uf"]');
    const tiles = await p.pagina.$$eval("#mapa [data-id]", (els) => new Set(els.map((e) => e.dataset.id)).size);
    assert.ok(tiles >= 27);
    await evidencia(p.pagina, "mapa-grade", { clip: await p.pagina.$eval("#mapa-area", (e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y + scrollY, width: r.width, height: Math.min(r.height, 900) }; }), fullPage: true });
    await p.pagina.click('[data-forma="geo"]');
  });

  test("legenda explica cores, intensidade, empate, sem dados e defasagem", async () => {
    const leg = await p.pagina.textContent("#legenda");
    for (const t of ["Flávio Bolsonaro (22)", "Lula (13)", "p.p. de margem", "Empate", "Sem votos totalizados", "Fonte indisponível", "Fonte defasada"]) assert.ok(leg.includes(t), t);
  });

  test("barras por volume de votos ordenadas pela vantagem", async () => {
    const v = await p.pagina.$$eval("#volume .vol-linha .v", (els) => els.map((e) => Number(e.textContent.replace(/\./g, ""))));
    assert.ok(v.length > 10);
    for (let i = 1; i < v.length; i++) assert.ok(v[i - 1] >= v[i]);
  });

  test("filtro por região, busca e ordenação da tabela", async () => {
    await p.pagina.click('#filtroRegiao [data-reg="ne"]');
    assert.equal(await p.pagina.$$eval("#tabUFs tbody tr", (t) => t.length), 9);
    await p.pagina.click('#filtroRegiao [data-reg="todas"]');
    await p.pagina.fill("#busca", "rio");
    const nomes = await p.pagina.$$eval("#tabUFs tbody tr td:first-child", (t) => t.map((x) => x.textContent.trim()));
    assert.deepEqual(nomes.sort(), ["Rio de Janeiro", "Rio Grande do Norte", "Rio Grande do Sul"].sort());
    await p.pagina.fill("#busca", "");
    // coluna numérica: o primeiro clique ordena do maior para o menor
    await p.pagina.click('#tabUFs button[data-col="va"]');
    assert.equal(await p.pagina.getAttribute('#tabUFs th[aria-sort]', "aria-sort"), "descending");
    const primeira = await p.pagina.$eval("#tabUFs tbody tr", (tr) => tr.dataset.id);
    assert.equal(primeira, "sp");
  });

  test("abas levam a cada área", async () => {
    for (const id of ["conferencia", "historico", "fontes", "governador", "brasil"]) {
      await p.pagina.click(`.abas a[href="#${id}"]`);
      await p.pagina.waitForFunction((i) => { const r = document.getElementById(i).getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; }, id);
    }
  });

  test("governador em módulo separado, só nas 7 UFs", async () => {
    const ufs = await p.pagina.$$eval("#govLista .gov", (els) => els.map((e) => e.id));
    assert.deepEqual(ufs, ["gov-ac", "gov-am", "gov-df", "gov-es", "gov-rj", "gov-rn", "gov-to"]);
  });

  test("selo NFLS.AI Arena servido pelo próprio site", async () => {
    const src = await p.pagina.$eval("#selo img", (i) => ({ src: i.src, ok: i.complete && i.naturalWidth > 0 }));
    assert.ok(src.src.startsWith(srv.url), src.src);
    assert.ok(src.ok, "logo carregou");
  });

  test("nenhum recurso de terceiros além das fontes", async () => {
    const externos = await p.pagina.evaluate(() => performance.getEntriesByType("resource").map((r) => r.name).filter((n) => !n.startsWith(location.origin) && !/fonts\.(googleapis|gstatic)\.com/.test(n)));
    assert.deepEqual(externos, []);
  });

  test("modo TV", async () => {
    const tv = await abrir(nav, srv.url + "?fonte=simulacao&tv=1", { viewport: { width: 1920, height: 1080 } });
    await esperarDados(tv.pagina);
    assert.equal(await tv.pagina.isHidden("#estados"), true);
    assert.equal(await tv.pagina.isVisible("#mapa"), true);
    assert.equal(await tv.pagina.isVisible("#faixaTeste"), true);
    await evidencia(tv.pagina, "modo-tv");
    assert.deepEqual(tv.erros, []);
    await tv.fechar();
  });

  test("console sem erros", () => assert.deepEqual(p.erros, []));
});

describe("celular", () => {
  let p;
  before(async () => {
    p = await abrir(nav, srv.url + "?fonte=simulacao", { viewport: { width: 390, height: 844 } });
    await esperarDados(p.pagina);
  });
  after(() => p.fechar());

  test("sem rolagem horizontal da página", async () => {
    const { sw, iw } = await p.pagina.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth }));
    assert.ok(sw <= iw, `scrollWidth ${sw} > ${iw}`);
  });

  test("mapa em grade por padrão e toque abre o detalhe", async () => {
    assert.equal(await p.pagina.getAttribute('[data-forma="grade"]', "aria-pressed"), "true");
    await p.pagina.click('#mapa [data-id="ba"]');
    await p.pagina.waitForSelector("#gaveta:not([hidden])");
    assert.match(await p.pagina.textContent("#gavTitulo"), /Bahia/);
    await evidencia(p.pagina, "celular-detalhe");
    await p.pagina.click("#gaveta .fechar");
  });

  test("três horários visíveis e legíveis", async () => {
    const caixas = await p.pagina.$$eval(".tempos > div", (els) => els.map((e) => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right }; }));
    assert.equal(caixas.length, 3);
    for (const c of caixas) assert.ok(c.l >= 0 && c.r <= 390, JSON.stringify(c));
    await evidencia(p.pagina, "celular-topo");
  });

  test("console sem erros", () => assert.deepEqual(p.erros, []));
});

// ------------------------------------------------------------------ cenários do coletor
// O coletor é simulado com page.route: cada consulta da página recebe o snapshot que o cenário manda.
describe("cenários de atualização e falha", () => {
  let base;
  before(async () => { base = await lerJSON("exemplos/simulado-2turno/v1/presidente.json"); });
  const json = (corpo) => ({ status: 200, contentType: "application/json", body: JSON.stringify(corpo) });
  // consulta = horário da consulta ao TSE; mudanca = última mudança efetiva (o coletor põe a mesma em gerado_em)
  const comHorario = (snap, consulta, mudanca = consulta) => ({
    ...structuredClone(snap), gerado_em: mudanca, coleta_geral: { ...snap.coleta_geral, rodada_em: consulta },
    tempos: { ...snap.tempos, ultima_consulta_ok: consulta, ultima_mudanca: mudanca, ultima_mudanca_qualquer_recorte: mudanca },
    brasil: { ...structuredClone(snap.brasil), coleta: { ...snap.brasil.coleta, ultimo_sucesso: consulta, ultima_mudanca: mudanca } }
  });
  async function cenario(respostas, nome) {
    let i = 0;
    const rotas = [
      ["**/dados/v1/presidente.json", (r) => { const x = respostas[Math.min(i++, respostas.length - 1)]; return typeof x === "function" ? x(r) : r.fulfill(json(x)); }],
      ["**/dados/v1/historico.json", (r) => r.fulfill(json({ serie_brasil: [], correcoes: [] }))],
      ["**/dados/v1/governador.json", (r) => r.fulfill(json({ ufs: {} }))],
      ["**/dados/v1/saude.json", (r) => r.fulfill(json({ coletor: {} }))]
    ];
    const p = await abrir(nav, srv.url, { config: { atualizacaoSeg: 0.4 }, rotas });
    await esperarDados(p.pagina);
    const proxima = async () => { const n = i; await p.pagina.waitForFunction(() => true); while (i <= n) await p.pagina.waitForTimeout(100); await p.pagina.waitForTimeout(150); };
    return { ...p, proxima, nome };
  }

  test("conteúdo igual: consulta avança, 'última mudança' não", async () => {
    const a = comHorario(base, "2026-10-25T21:10:32.000Z"), b = comHorario(base, "2026-10-25T21:10:45.000Z", "2026-10-25T21:10:32.000Z");
    const c = await cenario([a, b, b]);
    const mud1 = await c.pagina.textContent("#tMud"), con1 = await c.pagina.textContent("#tCon");
    await c.proxima(); await c.proxima();
    assert.equal(await c.pagina.textContent("#tMud"), mud1);
    assert.notEqual(await c.pagina.textContent("#tCon"), con1);
    assert.equal(await c.pagina.textContent("#anuncio"), "", "não anuncia mudança que não houve");
    assert.deepEqual(c.erros, []);
    anotar("conteúdo igual", { ultima_mudanca: mud1, consulta_antes: con1, consulta_depois: await c.pagina.textContent("#tCon") });
    await c.fechar();
  });

  test("conteúdo novo: 'última mudança' segue o coletor, o hash aponta a cópia do TSE e o leitor de tela é avisado", async () => {
    const a = comHorario(base, "2026-10-25T21:10:32.000Z");
    const b = comHorario(base, "2026-10-25T21:11:02.000Z");
    b.brasil.oficial.candidatos.find((x) => x.numero === "13").votos += 1000;
    b.brasil.coleta.sha256 = "ab".repeat(32);
    const c = await cenario([a, b]);
    await c.proxima();
    assert.equal(await c.pagina.textContent("#tMud"), F.dh("2026-10-25T21:11:02.000Z"));
    assert.match(await c.pagina.textContent("#anuncio"), /Números atualizados/);
    assert.match(await c.pagina.textContent("#fontesResumo"), /sha256 abababababab/);
    assert.equal(await c.pagina.getAttribute("#fontesResumo a[href*='snapshots/']", "href"), "dados/v1/snapshots/" + "ab".repeat(32) + ".json");
    await c.fechar();
  });

  test("resposta fora de ordem é ignorada", async () => {
    const novo = comHorario(base, "2026-10-25T21:12:00.000Z");
    const velho = comHorario(base, "2026-10-25T21:05:00.000Z");
    velho.brasil.oficial.candidatos.find((x) => x.numero === "22").votos = 1;
    const c = await cenario([novo, velho, velho]);
    await c.proxima();
    assert.equal((await textos(c.pagina, "#placar .cand-votos"))[0], `${F.int(cand(base.brasil.oficial, "22").votos)} votos`);
    assert.match(await c.pagina.textContent("#fontesResumo"), /fora de ordem ignoradas\s*[1-9]/);
    await c.fechar();
  });

  test("coletor fora do ar: mantém o último dado válido e avisa", async () => {
    const c = await cenario([comHorario(base, "2026-10-25T21:10:32.000Z"), (r) => r.fulfill({ status: 503, body: "fora" })]);
    await c.proxima();
    await c.pagina.waitForSelector("#avisos .aviso.erro");
    assert.match(await c.pagina.textContent("#avisos"), /último dado válido/);
    assert.equal((await textos(c.pagina, "#placar .cand-votos"))[0], `${F.int(cand(base.brasil.oficial, "22").votos)} votos`);
    await evidencia(c.pagina, "coletor-fora-do-ar");
    // o 503 aparece no console do navegador como recurso que falhou; nenhuma exceção da página
    assert.deepEqual(c.erros.filter((e) => !/503/.test(e)), []);
    await c.fechar();
  });

  test("resposta incompleta não substitui o último dado válido", async () => {
    const c = await cenario([comHorario(base, "2026-10-25T21:10:32.000Z"), { schema: base.schema, gerado_em: "2026-10-25T21:11:00.000Z" }]);
    await c.proxima();
    assert.match(await c.pagina.textContent("#avisos"), /último dado válido/);
    assert.equal((await textos(c.pagina, "#placar .cand-votos"))[1], `${F.int(cand(base.brasil.oficial, "13").votos)} votos`);
    await c.fechar();
  });

  test("campo inválido vira “—” e o problema é mostrado", async () => {
    const x = comHorario(base, "2026-10-25T21:10:32.000Z");
    x.brasil.oficial.candidatos.find((k) => k.numero === "22").votos = "23051556";
    x.territorios.ac.resultado.votos.brancos = 12.5;
    const c = await cenario([x]);
    assert.equal((await textos(c.pagina, "#placar .cand-votos"))[0], "— votos");
    assert.match(await c.pagina.textContent("#avisos"), /problema\(s\) de formato/);
    assert.match(await c.pagina.textContent("#fontesResumo"), /Contagem inválida em br\.candidato 22/);
    await c.fechar();
  });

  test("arquivo oficial de outro turno nunca aparece como 2º turno", async () => {
    const x = comHorario(base, "2026-10-25T21:10:32.000Z");
    x.modo = "oficial"; x.eleicao = { ...x.eleicao, turno: 1, eleicao: "6257" };
    const c = await cenario([x]);
    assert.equal(await c.pagina.isVisible("#faixaTeste"), true);
    assert.match(await c.pagina.textContent("#faixaTit"), /NÃO É O 2º TURNO/);
    await c.fechar();
  });

  test("modo desconhecido é tratado como teste", async () => {
    const x = comHorario(base, "2026-10-25T21:10:32.000Z");
    x.modo = "qualquer";
    const c = await cenario([x]);
    assert.match(await c.pagina.textContent("#faixaTit"), /NÃO IDENTIFICADOS/);
    await c.fechar();
  });

  test("“eleito” só quando o TSE publica", async () => {
    const x = comHorario(base, "2026-10-25T21:10:32.000Z");
    const c = await cenario([x]);
    assert.doesNotMatch(await c.pagina.textContent("#placar"), /Eleito/);
    assert.match(await c.pagina.textContent("#placar"), /À frente na apuração parcial/);
    await c.fechar();
    const y = comHorario(base, "2026-10-25T21:10:32.000Z");
    y.eleito = { publicado: true, candidatos: ["13"], fonte: "teste" };
    const d = await cenario([y]);
    assert.match(await d.pagina.textContent("#placar"), /Eleito · publicado pelo TSE/);
    await d.fechar();
  });

  test("sem coletor publicado: estado vazio explicado, sem quebrar", async () => {
    const p = await abrir(nav, srv.url);
    await p.pagina.waitForSelector("#avisos .aviso.erro");
    assert.match(await p.pagina.textContent("#avisos"), /Não foi possível ler os dados do coletor/);
    assert.deepEqual(p.erros.filter((e) => !/404/.test(e)), []);
    await evidencia(p.pagina, "sem-coletor");
    await p.fechar();
  });
});

// ------------------------------------------------------------------ acessibilidade (axe-core, quando instalado)
describe("acessibilidade", () => {
  test("axe-core sem violações sérias ou críticas (tema escuro e claro)", async (t) => {
    let axe;
    try { axe = (await import("axe-core")).default; } catch { t.skip("axe-core não instalado"); return; }
    for (const tema of ["dark", "light"]) {
      const p = await abrir(nav, srv.url + "?fonte=simulacao", { tema });
      await esperarDados(p.pagina);
      await p.pagina.addScriptTag({ content: axe.source });
      const r = await p.pagina.evaluate(async () => await window.axe.run(document, { resultTypes: ["violations"] }));
      const graves = r.violations.filter((v) => ["serious", "critical"].includes(v.impact));
      anotar(`axe ${tema}`, { violacoes: r.violations.map((v) => ({ id: v.id, impacto: v.impact, nos: v.nodes.length })) });
      assert.deepEqual(graves.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`), []);
      await p.fechar();
    }
  });
});
