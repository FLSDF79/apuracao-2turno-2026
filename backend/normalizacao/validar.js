// Validação de esquema do arquivo de resultado do TSE (EA20, "-u.json") antes da normalização.
// - erros: o arquivo não pode ser usado (resposta incompleta, outro turno, campo obrigatório ausente).
//   O coletor rejeita e mantém o último dado válido.
// - alertas: identidades aritméticas conferidas nos arquivos reais do 1º turno que falharam. O arquivo é
//   aceito (é o dado oficial publicado), mas o alerta vai para a saúde da coleta. Rejeitar por alerta
//   poderia esconder a apuração inteira se o TSE publicar um parcial com convenção diferente.

const OBRIGATORIOS = {
  raiz: ["ele", "t", "cdabr", "dg", "hg"],
  s: ["ts", "st"],
  e: ["te", "c", "a"],
  v: ["tv", "vvc", "vb", "tvn"],
};

const temValor = (v) => v !== undefined && v !== null && v !== "";

/**
 * @param {any} bruto JSON do TSE já parseado
 * @param {{ eleicao?: string|number, cargo?: number, territorio?: string, turno?: number }} [esperado]
 * @returns {{ erros: string[], alertas: string[] }}
 */
export function validarResultado(bruto, esperado = {}) {
  const erros = [];
  const alertas = [];
  if (!bruto || typeof bruto !== "object" || Array.isArray(bruto)) return { erros: ["resposta não é um objeto JSON"], alertas };
  for (const k of OBRIGATORIOS.raiz) if (!temValor(bruto[k])) erros.push(`resposta incompleta: campo ${k} ausente`);
  for (const bloco of ["s", "e", "v"]) {
    if (!bruto[bloco] || typeof bruto[bloco] !== "object") {
      erros.push(`resposta incompleta: bloco ${bloco} ausente`);
      continue;
    }
    for (const k of OBRIGATORIOS[bloco]) if (!temValor(bruto[bloco][k])) erros.push(`resposta incompleta: campo ${bloco}.${k} ausente`);
  }
  const cargo = Array.isArray(bruto.carg) ? bruto.carg[0] : null;
  if (!cargo) erros.push("resposta incompleta: lista de cargos (carg) vazia");
  const cands = cargo ? (cargo.agr || []).flatMap((a) => (a.par || []).flatMap((p) => p.cand || [])) : [];
  if (cargo && cands.length === 0) erros.push("resposta incompleta: nenhum candidato");
  for (const c of cands) {
    if (!temValor(c.n)) erros.push("candidato sem número");
    if (!temValor(c.vap)) erros.push(`candidato ${c.n ?? "?"} sem votos (vap)`);
  }
  if (esperado.turno !== undefined && temValor(bruto.t) && Number(bruto.t) !== Number(esperado.turno)) {
    erros.push(`arquivo declara turno ${bruto.t}, esperado ${esperado.turno}`);
  }
  if (erros.length) return { erros, alertas };

  const n = (x) => (temValor(x) && /^\d+$/.test(String(x)) ? Number(x) : null);
  const { s, e, v } = bruto;
  const confere = (rotulo, a, b) => {
    if (a !== null && b !== null && a !== b) alertas.push(`${rotulo}: ${a} ≠ ${b}`);
  };
  const somaVap = cands.reduce((t, c) => (t === null || n(c.vap) === null ? null : t + n(c.vap)), 0);
  confere("soma dos votos dos candidatos = válidos computados (vvc)", somaVap, n(v.vvc));
  confere("total de votos (tv) = vvc + brancos + nulos", n(v.tv), [n(v.vvc), n(v.vb), n(v.tvn)].some((x) => x === null) ? null : n(v.vvc) + n(v.vb) + n(v.tvn));
  if (temValor(v.vn) && temValor(v.vnt)) confere("nulos (tvn) = vn + vnt", n(v.tvn), n(v.vn) + n(v.vnt));
  if (temValor(v.vv) && temValor(v.vansj)) confere("vvc = válidos + anulados sub judice", n(v.vvc), n(v.vv) + n(v.vansj));
  confere("total de votos (tv) = comparecimento (c)", n(v.tv), n(e.c));
  if (n(s.st) !== null && n(s.ts) !== null && n(s.st) > n(s.ts)) alertas.push(`seções totalizadas (${s.st}) maiores que as previstas (${s.ts})`);
  return { erros, alertas };
}
