// Converte o arquivo de resultado do TSE (EA20, "-u.json") num objeto normalizado.
// Regras: contagens viram inteiros (Number, exatas até 2^53); campo ausente vira null, nunca 0;
// percentuais do TSE são guardados só para conferência, os do painel saem de calcular.js.

const SECOES = { ts: "total", st: "totalizadas", snt: "nao_totalizadas", si: "instaladas", sni: "nao_instaladas", sa: "apuradas", sna: "nao_apuradas" };
const ELEITORADO = {
  te: "total", est: "secoes_totalizadas", esnt: "secoes_nao_totalizadas", esi: "secoes_instaladas",
  esni: "secoes_nao_instaladas", esa: "secoes_apuradas", esna: "secoes_nao_apuradas", c: "comparecimento", a: "abstencao",
};
const VOTOS = {
  tv: "total", vvc: "validos_computados", vv: "validos", vnom: "nominais", van: "anulados", vansj: "anulados_sub_judice",
  vb: "brancos", tvn: "nulos_total", vn: "nulos", vnt: "nulos_tecnicos", vsan: "vsan", vscv: "vscv",
};
export const BLOCOS = { secoes: SECOES, eleitorado: ELEITORADO, votos: VOTOS };

export class ErroFonte extends Error {}

export function inteiro(v, campo = "") {
  if (v === undefined || v === null || v === "") return null;
  const s = String(v).trim();
  if (!/^\d+$/.test(s)) throw new ErroFonte(`campo ${campo} não é inteiro: ${JSON.stringify(v)}`);
  const n = Number(s);
  if (!Number.isSafeInteger(n)) throw new ErroFonte(`campo ${campo} fora do intervalo seguro: ${s}`);
  return n;
}

export function percentual(v) {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

// "05/10/2026" + "12:51:40" (horário de Brasília, sem horário de verão desde 2019) → ISO com -03:00.
export function horarioTSE(data, hora) {
  const d = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(data || "");
  const h = /^(\d{2}):(\d{2}):(\d{2})$/.exec(hora || "");
  if (!d || !h) return null;
  return `${d[3]}-${d[2]}-${d[1]}T${h[1]}:${h[2]}:${h[3]}-03:00`;
}

function bloco(bruto, mapa, nomeBloco) {
  const out = {};
  for (const [k, nome] of Object.entries(mapa)) out[nome] = inteiro(bruto?.[k], `${nomeBloco}.${k}`);
  return out;
}

export function candidatosBrutos(cargo) {
  const lista = [];
  for (const agr of cargo.agr || []) {
    for (const par of agr.par || []) {
      for (const c of par.cand || []) lista.push({ c, par, agr });
    }
  }
  return lista;
}

/**
 * @param bruto  JSON do TSE já parseado
 * @param esperado { eleicao, cargo, territorio } — se o arquivo declarar outra coisa, é rejeitado
 */
export function normalizarResultado(bruto, esperado = {}) {
  if (!bruto || typeof bruto !== "object") throw new ErroFonte("arquivo vazio ou não é JSON");
  const cargo = (bruto.carg || [])[0];
  if (!cargo) throw new ErroFonte("arquivo sem cargo (carg)");
  const declarado = { eleicao: String(bruto.ele), cargo: Number(cargo.cd), territorio: String(bruto.cdabr) };
  for (const k of ["eleicao", "cargo", "territorio"]) {
    if (esperado[k] !== undefined && String(esperado[k]) !== String(declarado[k])) {
      throw new ErroFonte(`arquivo declara ${k}=${declarado[k]}, esperado ${esperado[k]}`);
    }
  }
  const federacoes = {};
  for (const f of cargo.fed || []) for (const n of f.npar || []) federacoes[n] = { numero: f.n, sigla: f.sg, nome: f.nm };

  const candidatos = candidatosBrutos(cargo).map(({ c, par, agr }) => ({
    numero: String(c.n),
    sqcand: c.sqcand ?? null,
    nome: c.nm ?? null,
    nome_urna: c.nmu ?? null,
    partido: { numero: String(par.n), sigla: par.sg ?? null, nome: par.nm ?? null },
    federacao: federacoes[String(par.n)] ?? null,
    coligacao: agr.tp === "c" ? agr.com ?? null : null,
    vice: (c.vs || []).map((v) => ({ sqcand: v.sqcand ?? null, nome: v.nm ?? null, nome_urna: v.nmu ?? null, partido: v.sgp ?? null }))[0] ?? null,
    destinacao: c.dvt ?? null, // "Válido", "Anulado sub judice", ...
    situacao: c.st ?? null, // texto oficial: "Eleito", "Não eleito", "2º turno", ...
    eleito_publicado: c.st === "Eleito", // só a situação textual conta; o campo "e" vale "s" até para quem foi ao 2º turno
    votos: inteiro(c.vap, `cand ${c.n}.vap`),
    pct_validos_tse: percentual(c.pvapn ?? c.pvap),
  }));

  return {
    eleicao: declarado.eleicao,
    turno: Number(bruto.t),
    cargo: { codigo: declarado.cargo, nome: cargo.nmn ?? null },
    territorio: declarado.territorio,
    tipo_abrangencia: bruto.tpabr ?? null,
    idg: bruto.idg ?? null,
    andamento: { codigo: bruto.and ?? null, final_publicado: bruto.and === "f" },
    horario: { geracao: horarioTSE(bruto.dg, bruto.hg), totalizacao: horarioTSE(bruto.dt, bruto.ht) },
    secoes: bloco(bruto.s, SECOES, "s"),
    eleitorado: bloco(bruto.e, ELEITORADO, "e"),
    votos: bloco(bruto.v, VOTOS, "v"),
    candidatos,
    oficial: {
      pct_totalizadas: percentual(bruto.s?.pstn ?? bruto.s?.pst),
      pct_comparecimento: percentual(bruto.e?.pcn ?? bruto.e?.pc),
      pct_abstencao: percentual(bruto.e?.pan ?? bruto.e?.pa),
      pct_validos: percentual(bruto.v?.pvvcn ?? bruto.v?.pvvc),
      pct_brancos: percentual(bruto.v?.pvbn ?? bruto.v?.pvb),
      pct_nulos: percentual(bruto.v?.ptvnn ?? bruto.v?.ptvn),
    },
  };
}
