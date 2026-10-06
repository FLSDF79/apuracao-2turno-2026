// Conferência: coluna A (soma calculada dos recortes) × coluna B (total publicado pelo TSE).
// A e B são duas representações dos mesmos votos: nunca se somam entre si.
// Os dois lados derivam da mesma base de totalização do TSE, então isto é conferência de consistência,
// não auditoria independente das urnas. Diferença temporária não é tratada como irregularidade.

export const CLASSES = {
  compativel: "Valores compatíveis no recorte comparado",
  horarios_diferentes: "Atualizações em horários diferentes",
  cobertura_incompleta: "Cobertura incompleta",
  diferenca_persistente: "Diferença persistente a investigar",
};

export const AVISO_MESMA_BASE =
  "As duas colunas vêm da mesma base de totalização do TSE. A conferência verifica a consistência entre os arquivos publicados; não é auditoria independente das urnas. Diferenças temporárias costumam vir de arquivos gerados em horários diferentes.";

const LINHAS_FIXAS = [
  ["secoes.total", "Seções previstas"],
  ["secoes.totalizadas", "Seções totalizadas"],
  ["eleitorado.total", "Eleitorado"],
  ["eleitorado.comparecimento", "Comparecimento"],
  ["eleitorado.abstencao", "Abstenção"],
  ["votos.total", "Total de votos"],
  ["votos.validos_computados", "Válidos (base do percentual)"],
  ["votos.brancos", "Brancos"],
  ["votos.nulos_total", "Nulos"],
  ["votos.anulados_sub_judice", "Anulados sub judice"],
];

function ler(r, caminho) {
  const [b, c] = caminho.split(".");
  return r?.[b]?.[c] ?? null;
}

function linha(chave, rotulo, a, b) {
  return { chave, rotulo, a, b, diferenca: a !== null && b !== null ? a - b : null };
}

/**
 * @param A          agregado de calcular.agregar (Brasil calculado)
 * @param B          resultado oficial normalizado do recorte "br" (ou null)
 * @param opcoes     { defasados: [codigos], anterior: conferência da rodada anterior, agora: ISO, persistenciaMin }
 */
export function conferir(A, B, { defasados = [], anterior = null, agora = new Date().toISOString(), persistenciaMin = 10 } = {}) {
  const numeros = [...new Set([...(A?.candidatos || []), ...(B?.candidatos || [])].map((c) => c.numero))];
  const porNumero = (r, n) => r?.candidatos.find((c) => c.numero === n) ?? null;
  const linhas = [
    ...numeros.map((n) => {
      const ca = porNumero(A, n), cb = porNumero(B, n);
      return linha(`candidato.${n}`, `${n} ${(cb || ca).nome_urna ?? ""}`.trim(), ca?.votos ?? null, cb?.votos ?? null);
    }),
    ...LINHAS_FIXAS.map(([k, r]) => linha(k, r, ler(A, k), ler(B, k))),
  ];
  const comDiferenca = linhas.filter((l) => l.diferenca !== 0);
  const assinatura = comDiferenca.map((l) => `${l.chave}:${l.diferenca}`).join("|");
  const faltando = A?.faltando ?? [];
  const horariosA = A?.horario?.totalizacao ?? { min: null, max: null };
  const horarioB = B?.horario?.totalizacao ?? null;
  const horariosIguais = horarioB !== null && horariosA.min === horarioB && horariosA.max === horarioB;

  let codigo, motivo;
  if (!B) {
    codigo = "cobertura_incompleta";
    motivo = "Total nacional do TSE indisponível nesta rodada.";
  } else if (comDiferenca.length === 0 && faltando.length === 0) {
    codigo = "compativel";
    motivo = defasados.length ? `Valores iguais, mas ${defasados.join(", ").toUpperCase()} com dado da rodada anterior.` : "Todas as linhas batem.";
  } else if (faltando.length || defasados.length) {
    codigo = "cobertura_incompleta";
    motivo = [faltando.length && `Sem dado: ${faltando.join(", ").toUpperCase()}.`, defasados.length && `Defasados: ${defasados.join(", ").toUpperCase()}.`].filter(Boolean).join(" ");
  } else {
    const mesmaDiferenca = anterior && anterior.assinatura === assinatura && ["horarios_diferentes", "diferenca_persistente"].includes(anterior.classificacao.codigo);
    const desde = mesmaDiferenca ? anterior.classificacao.desde : agora;
    const minutos = (Date.parse(agora) - Date.parse(desde)) / 60000;
    if (horariosIguais) {
      codigo = "diferenca_persistente";
      motivo = "Arquivos com o mesmo horário de totalização e somas diferentes.";
    } else if (minutos >= persistenciaMin) {
      codigo = "diferenca_persistente";
      motivo = `A mesma diferença se mantém há ${Math.floor(minutos)} min.`;
    } else {
      codigo = "horarios_diferentes";
      motivo = `UFs totalizadas entre ${horariosA.min} e ${horariosA.max}; total nacional às ${horarioB}.`;
    }
    return montar(desde);
  }
  return montar(agora);

  function montar(desde) {
    return {
      mesma_base: true,
      aviso: AVISO_MESMA_BASE,
      colunas: {
        a: {
          rotulo: "Soma calculada pelo painel (27 UFs + exterior)",
          componentes: A?.componentes ?? [],
          faltando,
          defasados,
          horario_totalizacao: horariosA,
          pct_totalizadas: A?.indicadores?.pct_totalizadas ?? null,
        },
        b: {
          rotulo: "Total nacional publicado pelo TSE",
          horario_totalizacao: horarioB,
          idg: B?.idg ?? null,
          pct_totalizadas: B?.indicadores?.pct_totalizadas ?? null,
        },
      },
      linhas,
      assinatura,
      classificacao: { codigo, texto: CLASSES[codigo], motivo, desde: codigo === "compativel" || codigo === "cobertura_incompleta" ? agora : desde },
    };
  }
}
