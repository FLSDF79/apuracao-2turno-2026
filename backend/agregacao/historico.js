// Histórico por recorte. Cada arquivo do TSE é cumulativo: a versão nova SUBSTITUI a anterior, nunca se soma.
// Uma versão nova com menos votos ou menos seções que a anterior é registrada como correção oficial e aceita
// como está; o painel não força crescimento monotônico.

const MAX_VERSOES = 400;
const MAX_PONTOS = 3000;

function resumo(r, coletadoEm) {
  return {
    idg: r.idg,
    totalizacao: r.horario.totalizacao,
    geracao: r.horario.geracao,
    coletado_em: coletadoEm,
    secoes_totalizadas: r.secoes.totalizadas,
    total_votos: r.votos.total,
    votos: Object.fromEntries(r.candidatos.map((c) => [c.numero, c.votos])),
  };
}

function mesmaVersao(a, b) {
  return a.idg === b.idg && a.totalizacao === b.totalizacao && JSON.stringify(a.votos) === JSON.stringify(b.votos) && a.secoes_totalizadas === b.secoes_totalizadas;
}

/** Devolve { historico, nova, correcao }; historico é um objeto novo e o anterior não é alterado. */
export function registrarVersao(historico, resultado, coletadoEm) {
  const h = { versoes: [...(historico?.versoes || [])], correcoes: [...(historico?.correcoes || [])] };
  const atual = resumo(resultado, coletadoEm);
  const ultima = h.versoes[h.versoes.length - 1];
  if (ultima && mesmaVersao(ultima, atual)) return { historico: historico ?? h, nova: false, correcao: null };
  let correcao = null;
  if (ultima) {
    const quedas = [];
    for (const [n, v] of Object.entries(atual.votos)) {
      const antes = ultima.votos[n];
      if (antes !== undefined && antes !== null && v !== null && v < antes) quedas.push({ campo: `candidato.${n}`, antes, depois: v });
    }
    for (const campo of ["secoes_totalizadas", "total_votos"]) {
      if (ultima[campo] !== null && atual[campo] !== null && atual[campo] < ultima[campo]) quedas.push({ campo, antes: ultima[campo], depois: atual[campo] });
    }
    if (quedas.length) correcao = { coletado_em: coletadoEm, de_idg: ultima.idg, para_idg: atual.idg, totalizacao: atual.totalizacao, quedas };
  }
  h.versoes.push(atual);
  if (h.versoes.length > MAX_VERSOES) h.versoes.splice(0, h.versoes.length - MAX_VERSOES);
  if (correcao) h.correcoes.push(correcao);
  return { historico: h, nova: true, correcao };
}

/** Ponto da série que a página usa no gráfico de evolução. */
export function pontoSerie(r, coletadoEm, correcao) {
  return {
    coletado_em: coletadoEm,
    totalizacao: r.horario.totalizacao,
    idg: r.idg,
    pct_totalizadas: r.indicadores.pct_totalizadas,
    votos: Object.fromEntries(r.candidatos.map((c) => [c.numero, c.votos])),
    pct_validos: Object.fromEntries(r.candidatos.map((c) => [c.numero, c.pct_validos])),
    disputa: r.disputa,
    correcao: Boolean(correcao),
  };
}

export function acrescentarPonto(serie, ponto) {
  const s = [...(serie || []), ponto];
  if (s.length > MAX_PONTOS) s.splice(0, s.length - MAX_PONTOS);
  return s;
}
