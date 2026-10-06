// Simulador de noite de 2º turno a partir dos arquivos REAIS do 1º turno (tests/fixtures).
// Gera arquivos no formato do TSE para as eleições 6258 (presidente) e 6260 (governador), com fração de
// totalização por UF, horários próprios por arquivo, correções e atrasos. Os votos são do 1º turno
// escalados, só dos dois finalistas: servem para testar o sistema, nunca para exibir como resultado.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { COMPONENTES_BRASIL } from "../nucleo/territorios.js";

const UFS_GOV = ["ac", "am", "df", "es", "rj", "rn", "to"];
const BASE = "https://resultados.tse.jus.br";
const fmt = (n, casas = 2) => n.toFixed(casas).replace(".", ",");
const pctTxt = (p, t) => (t ? { c: fmt((p * 100) / t), n: String(Number(((p * 100) / t).toFixed(9))).replace(".", ",") } : { c: "0,00", n: "0" });

async function ler(raiz, rel) {
  return JSON.parse(await readFile(join(raiz, "oficial", rel), "utf8"));
}

export async function carregarBase(raiz) {
  const cfg = await ler(raiz, "comum/config/ele-c.json");
  const pres = {}, gov = {};
  for (const abr of [...COMPONENTES_BRASIL, "br"]) pres[abr] = await ler(raiz, `ele2026/6257/dados/${abr}/${abr}-c0001-e006257-u.json`);
  for (const uf of UFS_GOV) gov[uf] = await ler(raiz, `ele2026/6259/dados/${uf}/${uf}-c0003-e006259-u.json`);
  return { cfg, pres, gov };
}

function finalistas(d) {
  return d.carg[0].agr.flatMap((a) => a.par.flatMap((p) => p.cand.map((c) => ({ c, p, a })))).filter(({ c }) => c.st === "2º turno");
}

// Contagens de um recorte na fração f (0..1).
function contagens(d, f) {
  const s = d.s, e = d.e, v = d.v;
  const ts = +s.ts, te = +e.te;
  const st = Math.floor(ts * f);
  const est = Math.floor(te * f);
  const cands = finalistas(d).map(({ c, p, a }) => ({ c, p, a, vap: Math.floor(+c.vap * f) }));
  const vvc = cands.reduce((t, x) => t + x.vap, 0);
  const vb = Math.floor(+v.vb * f), vn = Math.floor(+v.vn * f);
  const tv = vvc + vb + vn;
  return { ts, te, st, est, cands, vvc, vb, vn, tv, c: tv, a: est - tv };
}

function somar(lista) {
  const out = { ts: 0, te: 0, st: 0, est: 0, vvc: 0, vb: 0, vn: 0, tv: 0, c: 0, a: 0, cands: [] };
  for (const x of lista) {
    for (const k of Object.keys(out)) if (k !== "cands") out[k] += x[k];
    for (const cx of x.cands) {
      const y = out.cands.find((z) => z.c.n === cx.c.n);
      if (y) y.vap += cx.vap;
      else out.cands.push({ ...cx });
    }
  }
  return out;
}

function arquivo(modelo, k, { ele, cargo, cdabr, tpabr, hora, final, eleito }) {
  const [data, h] = hora.split(" ");
  const lider = [...k.cands].sort((x, y) => y.vap - x.vap)[0];
  const cand = (x) => {
    const p = pctTxt(x.vap, k.vvc);
    return { ...x.c, e: "n", st: eleito ? (x === lider ? "Eleito" : "Não eleito") : "", vap: String(x.vap), pvap: p.c, pvapn: p.n, dvt: "Válido" };
  };
  const p = (a, b) => pctTxt(a, b);
  return {
    ele, t: "2", f: "o", sup: "n", tpabr, cdabr, dg: data, hg: h, idg: String(Math.floor(Date.parse(`${data.split("/").reverse().join("-")}T${h}Z`) / 1000)), dt: data, ht: h,
    dv: "s", tf: "s", and: final ? "f" : "p", esae: "n", mnae: [], simulado: true,
    s: { ts: String(k.ts), st: String(k.st), pst: p(k.st, k.ts).c, pstn: p(k.st, k.ts).n, snt: String(k.ts - k.st), si: String(k.ts), sni: "0", sa: String(k.st), sna: String(k.ts - k.st) },
    e: { te: String(k.te), est: String(k.est), esnt: String(k.te - k.est), esi: String(k.te), esni: "0", esa: String(k.est), esna: String(k.te - k.est), c: String(k.c), pc: p(k.c, k.c + k.a).c, pcn: p(k.c, k.c + k.a).n, a: String(k.a), pa: p(k.a, k.c + k.a).c, pan: p(k.a, k.c + k.a).n },
    v: { tv: String(k.tv), vvc: String(k.vvc), pvvcn: p(k.vvc, k.tv).n, vv: String(k.vvc), vnom: String(k.vvc), van: "0", vansj: "0", vb: String(k.vb), pvbn: p(k.vb, k.tv).n, tvn: String(k.vn), ptvnn: p(k.vn, k.tv).n, vn: String(k.vn), vnt: "0", vsan: "0", vscv: "0" },
    carg: [{ ...modelo.carg[0], cd: String(cargo), agr: agrupar(k.cands.map((x) => ({ ...x, cand: cand(x) }))) }],
  };
}

function agrupar(lista) {
  const agr = new Map();
  for (const x of lista) {
    const ka = x.a.n;
    if (!agr.has(ka)) agr.set(ka, { ...x.a, par: [] });
    agr.get(ka).par.push({ ...x.p, cand: [x.cand] });
  }
  return [...agr.values()];
}

/**
 * Monta o "site do TSE" simulado num instante.
 * @param cenario {
 *   publicado: false → configuração sem 2º turno (como em 06/10)
 *   fracao: { padrao: 0..1, [uf]: 0..1 }       fração de totalização por recorte
 *   hora: "25/10/2026 18:30:00"                 horário de geração/totalização
 *   horaPorRecorte: { sp: "25/10/2026 18:29:00" } recortes atrasados
 *   brFracaoExtra: { sp: 0.5 }                  frações usadas SÓ no nacional (simula nacional mais novo que a UF)
 *   final, eleito
 * }
 */
export function montarSite(base, cenario) {
  const arquivos = {};
  const { publicado = true, fracao = { padrao: 1 }, hora, horaPorRecorte = {}, brFracaoExtra = {}, final = false, eleito = false } = cenario;
  const cfg = structuredClone(base.cfg);
  if (publicado) {
    cfg.pl.push({
      cd: "3221", cdpr: "1219", c: "ele2026", dt: "25/10/2026", dtlim: "25/10/2034",
      e: [
        { cd: "6258", cdt2: "", sqele: "", nm: "Eleição Ordinária Federal - 2026 2º Turno (SIMULADA)", t: "2", tp: "8", abr: [{ cd: "br", cp: [{ cd: "1", ds: "Presidente" }] }] },
        { cd: "6260", cdt2: "", sqele: "", nm: "Eleição Ordinária Estadual - 2026 2º Turno (SIMULADA)", t: "2", tp: "1", abr: UFS_GOV.map((uf) => ({ cd: uf, cp: [{ cd: "3", ds: "Governador" }] })) },
      ],
    });
  }
  arquivos["oficial/comum/config/ele-c.json"] = cfg;
  if (!publicado) return arquivos;

  const fr = (abr) => fracao[abr] ?? fracao.padrao ?? 1;
  const hr = (abr) => horaPorRecorte[abr] ?? hora;
  const ks = {};
  for (const abr of COMPONENTES_BRASIL) {
    ks[abr] = contagens(base.pres[abr], fr(abr));
    arquivos[`oficial/ele2026/6258/dados/${abr}/${abr}-c0001-e006258-u.json`] = arquivo(base.pres[abr], ks[abr], { ele: "6258", cargo: 1, cdabr: abr, tpabr: "uf", hora: hr(abr), final });
  }
  const paraBr = COMPONENTES_BRASIL.map((abr) => (brFracaoExtra[abr] !== undefined ? contagens(base.pres[abr], brFracaoExtra[abr]) : ks[abr]));
  arquivos["oficial/ele2026/6258/dados/br/br-c0001-e006258-u.json"] = arquivo(base.pres.br, somar(paraBr), { ele: "6258", cargo: 1, cdabr: "br", tpabr: "br", hora, final, eleito });
  arquivos["oficial/ele2026/6258/dados/br/br-e006258-ab.json"] = { ele: "6258", t: "2", f: "o", abr: [...COMPONENTES_BRASIL, "br"].map((c) => ({ cdabr: c, tpabr: c === "br" ? "br" : "uf" })) };
  for (const uf of UFS_GOV) {
    arquivos[`oficial/ele2026/6260/dados/${uf}/${uf}-c0003-e006260-u.json`] = arquivo(base.gov[uf], contagens(base.gov[uf], fr(uf)), { ele: "6260", cargo: 3, cdabr: uf, tpabr: "uf", hora: hr(uf), final, eleito });
  }
  return arquivos;
}

/** fetch que serve um site simulado (trocável entre rodadas: passe uma função que devolve o site atual). */
export function fetchSimulado(siteAtual, registro = []) {
  const etags = new Map();
  return async (url, init = {}) => {
    registro.push(url);
    const rel = url.startsWith(BASE + "/") ? url.slice(BASE.length + 1) : null;
    const site = siteAtual();
    if (!rel || !(rel in site)) return new Response("<Error><Code>NoSuchKey</Code></Error>", { status: 404 });
    const corpo = JSON.stringify(site[rel]);
    const etag = `"${corpo.length}-${corpo.slice(-40).replace(/\W/g, "")}-${simplesHash(corpo)}"`;
    etags.set(url, etag);
    if (init.headers?.["If-None-Match"] === etag) return new Response(null, { status: 304, headers: { etag } });
    return new Response(corpo, { status: 200, headers: { etag, "content-type": "application/json" } });
  };
}

function simplesHash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16);
}
