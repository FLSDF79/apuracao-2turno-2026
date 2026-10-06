// Monta os JSON que a página consome (contrato v1, documentado em docs/contrato/CONTRATO-DADOS.md).
// A página só exibe: todo número e percentual já sai calculado daqui.
import { agregar, comIndicadores } from "./calcular.js";
import { conferir } from "./conferencia.js";
import { REGIOES, COMPONENTES_BRASIL, BRASIL, descreverTerritorio } from "./territorios.js";

export const SCHEMA = "apuracao-2t-2026/v1";

export const AVISO_ORIGEM =
  "Painel independente com dados oficiais. Nenhum TRE publica arquivo estruturado próprio: os resultados de cada UF são o recorte daquela UF na base de totalização do TSE (resultados.tse.jus.br).";

const minutosEntre = (a, b) => (a && b ? Math.round((Date.parse(a) - Date.parse(b)) / 60000) : null);

/** Versão enxuta de um resultado para cada território (metadados dos candidatos ficam no topo). */
export function compactar(r) {
  if (!r) return null;
  return {
    origem: r.origem ?? "tse",
    idg: r.idg ?? null,
    andamento: r.andamento,
    horario: r.horario,
    ...(r.origem === "calculado" ? { componentes: r.componentes, faltando: r.faltando, inconsistencias: r.inconsistencias } : {}),
    secoes: r.secoes,
    eleitorado: r.eleitorado,
    votos: r.votos,
    indicadores: r.indicadores,
    ...(r.oficial ? { oficial_tse: r.oficial } : {}),
    candidatos: r.candidatos.map((c) => ({
      numero: c.numero,
      votos: c.votos,
      pct_validos: c.pct_validos,
      ...(r.origem === "calculado" ? {} : { pct_validos_tse: c.pct_validos_tse, situacao: c.situacao, eleito_publicado: c.eleito_publicado }),
      destinacao: c.destinacao ?? null,
    })),
    disputa: r.disputa,
  };
}

function metaCandidatos(resultados) {
  const vistos = new Map();
  for (const r of resultados) {
    for (const c of r?.candidatos || []) {
      if (!vistos.has(c.numero)) {
        const { votos, pct_validos, pct_validos_tse, situacao, eleito_publicado, destinacao, ...meta } = c;
        vistos.set(c.numero, meta);
      }
    }
  }
  return [...vistos.values()].sort((a, b) => a.numero.localeCompare(b.numero));
}

function estadoPublicacao(disputa, oficial) {
  if (!disputa || disputa.estado !== "publicada") return "aguardando_configuracao";
  if (!oficial) return "aguardando_resultados";
  if (oficial.andamento.final_publicado) return "concluida";
  if (oficial.indicadores.pct_totalizadas === 100) return "totalizada_100";
  if (!oficial.secoes.totalizadas) return "aguardando_resultados";
  return "em_apuracao";
}

/**
 * @param entrada {
 *   disputa      — saída de descobrir() para "presidente"
 *   resultados   — mapa recorte → resultado normalizado (só da eleição atual)
 *   coleta       — mapa recorte → { situacao, url, ultimo_sucesso, ultimo_erro, status_http }
 *   recortes     — lista de recortes esperados (inclui "br")
 *   agora, modo, fonte, conferenciaAnterior, persistenciaMin
 * }
 */
export function montarPresidente({ disputa, resultados, coleta, recortes, agora, modo, fonte, conferenciaAnterior = null, persistenciaMin = 10 }) {
  const comp = COMPONENTES_BRASIL.filter((c) => recortes.length === 0 || recortes.includes(c));
  const oficiais = Object.fromEntries(Object.entries(resultados).map(([k, r]) => [k, r ? comIndicadores({ ...r, origem: "tse" }) : null]));
  const br = oficiais[BRASIL] ?? null;
  const calculado = agregar(oficiais, COMPONENTES_BRASIL, "Brasil (soma de 27 UFs + exterior)");
  const defasados = COMPONENTES_BRASIL.filter((c) => coleta[c]?.situacao === "defasado");

  const territorios = {};
  for (const c of [...COMPONENTES_BRASIL]) {
    const r = oficiais[c] ?? null;
    territorios[c] = {
      ...descreverTerritorio(c),
      esperado: comp.includes(c),
      coleta: coleta[c] ?? { situacao: "aguardando" },
      atraso_vs_nacional_min: r && br ? minutosEntre(br.horario.totalizacao, r.horario.totalizacao) : null,
      resultado: compactar(r),
    };
  }
  const regioes = {};
  for (const [sigla, reg] of Object.entries(REGIOES)) {
    regioes[sigla] = { codigo: sigla, nome: reg.nome, ufs: reg.ufs, resultado: compactar(agregar(oficiais, reg.ufs, reg.nome)) };
  }
  const conferencia = disputa?.estado === "publicada" ? conferir(calculado, br, { defasados, anterior: conferenciaAnterior, agora, persistenciaMin }) : null;
  const eleitos = (br?.candidatos || []).filter((c) => c.eleito_publicado).map((c) => c.numero);

  return {
    schema: SCHEMA,
    tipo: "presidente",
    gerado_em: agora,
    modo,
    aviso: AVISO_ORIGEM,
    fonte: { base: fonte.base, ambiente: fonte.ambiente, portal: "https://resultados.tse.jus.br/oficial/app/index.html" },
    eleicao: disputa,
    estado_publicacao: estadoPublicacao(disputa, br),
    eleito: { publicado: eleitos.length > 0, candidatos: eleitos, fonte: eleitos.length ? "situação 'Eleito' no arquivo nacional do TSE" : null },
    candidatos: metaCandidatos([br, ...Object.values(oficiais)]),
    brasil: {
      oficial: compactar(br),
      coleta: coleta[BRASIL] ?? { situacao: "aguardando" },
      calculado: compactar(calculado),
    },
    exterior: territorios.zz,
    territorios,
    regioes,
    conferencia,
  };
}

/** Governador: um bloco por UF com 2º turno. Nunca agrega UFs entre si nem mistura com presidente. */
export function montarGovernador({ disputa, resultados, coleta, recortes, agora, modo, fonte }) {
  const ufs = {};
  for (const uf of recortes) {
    const r = resultados[uf] ? comIndicadores({ ...resultados[uf], origem: "tse" }) : null;
    ufs[uf] = {
      ...descreverTerritorio(uf),
      coleta: coleta[uf] ?? { situacao: "aguardando" },
      estado_publicacao: estadoPublicacao(disputa, r),
      candidatos: metaCandidatos([r]),
      eleito: { publicado: (r?.candidatos || []).some((c) => c.eleito_publicado), candidatos: (r?.candidatos || []).filter((c) => c.eleito_publicado).map((c) => c.numero) },
      resultado: compactar(r),
    };
  }
  return {
    schema: SCHEMA,
    tipo: "governador",
    gerado_em: agora,
    modo,
    aviso: AVISO_ORIGEM,
    fonte: { base: fonte.base, ambiente: fonte.ambiente, portal: "https://resultados.tse.jus.br/oficial/app/index.html" },
    eleicao: disputa,
    ufs,
  };
}
