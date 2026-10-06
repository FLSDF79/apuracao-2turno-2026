// Indicadores e agregações. Tudo parte das contagens inteiras:
// - percentual de candidato = votos / válidos computados (vvc = válidos + anulados sub judice), como o TSE;
// - comparecimento e abstenção sobre (comparecimento + abstenção), que nos arquivos finais é o eleitorado
//   das seções instaladas (esi), a mesma base do percentual oficial; durante a apuração parcial é a base
//   sobre a qual o próprio TSE contou a abstenção;
// - válidos, brancos e nulos sobre o total de votos (tv = comparecimento);
// - região e Brasil calculado somam votos e seções antes de qualquer percentual. Nunca média de percentuais.
import { BLOCOS } from "../normalizacao/normalizar.js";

export function pct(parte, todo) {
  if (parte === null || parte === undefined || !todo) return null;
  return (parte * 100) / todo;
}

function soma(a, b) {
  return a === null || b === null ? null : a + b;
}

export function disputa(candidatos) {
  const ordem = [...candidatos].filter((c) => c.votos !== null).sort((x, y) => y.votos - x.votos || x.numero.localeCompare(y.numero));
  if (ordem.length < 2) return null;
  const [p, s] = ordem;
  const total = ordem.reduce((t, c) => t + c.votos, 0);
  if (total === 0) return { situacao: "sem_votos", lider: null, segundo: null, diferenca_votos: 0, diferenca_pontos: null };
  const empate = p.votos === s.votos;
  return {
    situacao: empate ? "empate" : "lideranca",
    lider: empate ? null : p.numero,
    segundo: empate ? null : s.numero,
    diferenca_votos: p.votos - s.votos,
    diferenca_pontos: p.pct_validos !== null && s.pct_validos !== null ? p.pct_validos - s.pct_validos : null,
  };
}

/** Acrescenta os percentuais calculados a um resultado (oficial ou agregado). Não altera o original. */
export function comIndicadores(r) {
  const { secoes: s, eleitorado: e, votos: v } = r;
  const baseComparecimento = soma(e.comparecimento, e.abstencao);
  const candidatos = r.candidatos.map((c) => ({ ...c, pct_validos: pct(c.votos, v.validos_computados) }));
  return {
    ...r,
    candidatos,
    indicadores: {
      pct_totalizadas: pct(s.totalizadas, s.total),
      pct_comparecimento: pct(e.comparecimento, baseComparecimento),
      pct_abstencao: pct(e.abstencao, baseComparecimento),
      base_comparecimento: baseComparecimento,
      pct_validos: pct(v.validos_computados, v.total),
      pct_brancos: pct(v.brancos, v.total),
      pct_nulos: pct(v.nulos_total, v.total),
    },
    disputa: disputa(candidatos),
  };
}

function extremos(lista) {
  const ok = lista.filter(Boolean).sort();
  return ok.length ? { min: ok[0], max: ok[ok.length - 1] } : { min: null, max: null };
}

/**
 * Soma resultados normalizados de vários recortes (ex.: UFs de uma região; 27 UFs + exterior).
 * @param {Record<string, any>} itens  mapa codigo → resultado normalizado (ou null se o recorte não está disponível)
 * @param {string[]} codigos  recortes que compõem o agregado
 * @param {string} [rotulo]
 */
export function agregar(itens, codigos, rotulo) {
  const presentes = codigos.filter((c) => itens[c]);
  const faltando = codigos.filter((c) => !itens[c]);
  const base = { secoes: {}, eleitorado: {}, votos: {} };
  for (const [nomeBloco, mapa] of Object.entries(BLOCOS)) {
    for (const campo of Object.values(mapa)) {
      base[nomeBloco][campo] = presentes.length ? presentes.reduce((t, c) => soma(t, itens[c][nomeBloco][campo]), 0) : null;
    }
  }
  const cands = new Map();
  const inconsistencias = [];
  for (const c of presentes) {
    for (const cand of itens[c].candidatos) {
      const atual = cands.get(cand.numero);
      if (!atual) {
        const { pct_validos_tse, pct_validos, eleito_publicado, situacao, ...meta } = cand;
        cands.set(cand.numero, { ...meta, situacao: null, eleito_publicado: false, votos: cand.votos });
      } else {
        if (atual.sqcand !== cand.sqcand) inconsistencias.push(`candidato ${cand.numero}: sqcand ${atual.sqcand} em um recorte e ${cand.sqcand} em ${c}`);
        atual.votos = soma(atual.votos, cand.votos);
      }
    }
  }
  const primeiro = presentes[0] ? itens[presentes[0]] : null;
  return comIndicadores({
    origem: "calculado",
    rotulo,
    componentes: codigos,
    presentes,
    faltando,
    inconsistencias,
    eleicao: primeiro?.eleicao ?? null,
    turno: primeiro?.turno ?? null,
    cargo: primeiro?.cargo ?? null,
    andamento: { codigo: null, final_publicado: presentes.length === codigos.length && presentes.every((c) => itens[c].andamento.final_publicado) },
    horario: {
      totalizacao: extremos(presentes.map((c) => itens[c].horario.totalizacao)),
      geracao: extremos(presentes.map((c) => itens[c].horario.geracao)),
    },
    ...base,
    candidatos: [...cands.values()],
  });
}
