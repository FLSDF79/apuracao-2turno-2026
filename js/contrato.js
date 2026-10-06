// Adaptador entre os arquivos publicados pelo coletor (contrato v1, docs/contrato/CONTRATO-DADOS.md) e a tela.
// É o ÚNICO arquivo que conhece o formato dos dados: se o contrato mudar, muda só aqui.
// Regra: nada de recalcular votos, totais regionais ou a conferência. A tela só lê.

export const UFS = ["ac", "al", "ap", "am", "ba", "ce", "df", "es", "go", "ma", "mt", "ms", "mg", "pa", "pb", "pr", "pe", "pi", "rj", "rn", "rs", "ro", "rr", "sc", "sp", "se", "to"];
export const REGIOES = [
  { id: "reg-n", sigla: "n", nome: "Norte" },
  { id: "reg-ne", sigla: "ne", nome: "Nordeste" },
  { id: "reg-co", sigla: "co", nome: "Centro-Oeste" },
  { id: "reg-se", sigla: "se", nome: "Sudeste" },
  { id: "reg-s", sigla: "s", nome: "Sul" }
];
export const REGIAO_DA_UF = {
  ac: "n", ap: "n", am: "n", pa: "n", ro: "n", rr: "n", to: "n",
  al: "ne", ba: "ne", ce: "ne", ma: "ne", pb: "ne", pe: "ne", pi: "ne", rn: "ne", se: "ne",
  df: "co", go: "co", mt: "co", ms: "co",
  es: "se", mg: "se", rj: "se", sp: "se",
  pr: "s", rs: "s", sc: "s"
};
export const NOMES = {
  ac: "Acre", al: "Alagoas", ap: "Amapá", am: "Amazonas", ba: "Bahia", ce: "Ceará", df: "Distrito Federal",
  es: "Espírito Santo", go: "Goiás", ma: "Maranhão", mt: "Mato Grosso", ms: "Mato Grosso do Sul", mg: "Minas Gerais",
  pa: "Pará", pb: "Paraíba", pr: "Paraná", pe: "Pernambuco", pi: "Piauí", rj: "Rio de Janeiro", rn: "Rio Grande do Norte",
  rs: "Rio Grande do Sul", ro: "Rondônia", rr: "Roraima", sc: "Santa Catarina", sp: "São Paulo", se: "Sergipe",
  to: "Tocantins", zz: "Exterior", br: "Brasil"
};

export const SITUACOES = {
  nao_iniciada: "Aguardando divulgação",
  em_andamento: "Em andamento",
  concluida: "Concluída",
  indisponivel: "Indisponível",
  defasada: "Fonte defasada"
};

export const CONFERENCIA = {
  compativel: { rotulo: "Valores compatíveis no recorte comparado", nivel: "ok" },
  horarios_diferentes: { rotulo: "Atualizações em horários diferentes", nivel: "info" },
  cobertura_incompleta: { rotulo: "Cobertura incompleta", nivel: "alerta" },
  diferenca_persistente: { rotulo: "Diferença persistente a investigar", nivel: "erro" }
};

export const MODOS = {
  oficial: null,
  ensaio: "ENSAIO · dados oficiais do 1º turno (04/10), para testar o painel",
  simulacao: "SIMULAÇÃO · noite de apuração com números fictícios, só para testar o painel. Não é resultado."
};

export const PUBLICACAO = {
  aguardando_configuracao: "O TSE ainda não publicou a configuração do 2º turno. O painel começa a mostrar números assim que ela aparecer.",
  aguardando_resultados: "Eleição configurada pelo TSE, ainda sem resultados divulgados. A divulgação começa após o encerramento da votação.",
  em_apuracao: null,
  totalizada_100: "100% das seções totalizadas. O resultado ainda não foi declarado pelo TSE.",
  concluida: "Totalização concluída pelo TSE."
};

const num = (x) => (typeof x === "number" && Number.isFinite(x) ? x : null);

// Contrato v1 do coletor (frente 2): docs/contrato/CONTRATO-DADOS.md
export const SCHEMA = "apuracao-2t-2026/v1";
const COD_REGIAO = { N: "n", NE: "ne", CO: "co", SE: "se", S: "s" };

// Horário do TSE: no arquivo oficial é texto; no calculado é {min,max}. A tela mostra o mais antigo.
const horario = (h) => (h && typeof h === "object" ? h.min || h.max || null : h || null);

// Situação de exibição a partir da coleta (quando o arquivo existe ou não) e do andamento.
function situacao(coleta, r) {
  const c = coleta?.situacao;
  if (!r) return c === "nao_publicado" || c === "aguardando" ? "nao_iniciada" : "indisponivel";
  if (c === "defasado") return "defasada";
  if (!r.secoes?.totalizadas) return "nao_iniciada";
  if ((r.indicadores?.pct_totalizadas ?? 0) >= 100) return "concluida";
  return "em_andamento";
}

function disputa(d) {
  if (!d || d.situacao === "sem_votos") return { lider: null, margem: null };
  if (d.situacao === "empate") return { lider: "empate", margem: { votos: 0, pp: 0 } };
  return { lider: String(d.lider), margem: { votos: num(d.diferenca_votos), pp: num(d.diferenca_pontos) } };
}

// Resultado (+ coleta) do contrato → território da tela.
function territorio(id, { nome, tipo, regiao, coleta, resultado, atrasoMin, eleito } = {}) {
  const r = resultado || null;
  const cand = {};
  for (const c of r?.candidatos || []) {
    // "Eleito" só quando o texto oficial diz "Eleito"; qualquer outro valor é "não definido".
    cand[String(c.numero)] = { votos: num(c.votos), pct: num(c.pct_validos), situacao: c.situacao || null };
  }
  const d = disputa(r?.disputa);
  const v = r?.votos || {}, e = r?.eleitorado || {}, i = r?.indicadores || {};
  return {
    id, tipo: tipo || null, nome: nome || NOMES[id] || id,
    regiao: regiao ? COD_REGIAO[regiao] || String(regiao).toLowerCase() : REGIAO_DA_UF[id] || null,
    situacao: situacao(coleta, r),
    ausente: !r,
    origem: r?.origem || null,
    totalizado: horario(r?.horario?.totalizacao),
    gerado: horario(r?.horario?.geracao),
    atualizado: coleta?.ultimo_sucesso || null,
    atrasoMin: num(atrasoMin),
    coleta: coleta ? {
      situacao: coleta.situacao || null, url: coleta.url || null, http: coleta.status_http ?? null,
      ultimoSucesso: coleta.ultimo_sucesso || null, erro: coleta.ultimo_erro?.mensagem || null, correcao: !!coleta.correcao
    } : null,
    faltando: r?.faltando || [],
    secoes: { previstas: num(r?.secoes?.total), totalizadas: num(r?.secoes?.totalizadas), pct: num(i.pct_totalizadas) },
    eleitorado: { total: num(e.total), aptoTotalizado: num(e.secoes_totalizadas) },
    comparecimento: { votos: num(e.comparecimento), pct: num(i.pct_comparecimento) },
    abstencao: { votos: num(e.abstencao), pct: num(i.pct_abstencao) },
    votos: {
      validos: num(v.validos), basePct: num(v.validos_computados), brancos: num(v.brancos), nulos: num(v.nulos_total),
      anuladosSubJudice: num(v.anulados_sub_judice), total: num(v.total),
      pctValidos: num(i.pct_validos), pctBrancos: num(i.pct_brancos), pctNulos: num(i.pct_nulos)
    },
    candidatos: cand,
    lider: d.lider, margem: d.margem,
    eleito: eleito || null
  };
}

function metaCandidato(c) {
  return { numero: String(c.numero), nomeUrna: c.nome_urna || c.nome, nomeCompleto: c.nome || null, partido: c.partido?.sigla || null, vice: c.vice?.nome_urna || null, sqcand: c.sqcand || null };
}

// Junta candidatos do contrato com a ordem e o nome amigável da configuração da página.
function candidatos(lista, cfg) {
  const doSnap = new Map((lista || []).map((c) => [String(c.numero), metaCandidato(c)]));
  const principais = cfg.candidatos.map((c) => ({ ...doSnap.get(c.numero), numero: c.numero, nome: c.nome, partido: doSnap.get(c.numero)?.partido || c.partido, nomeUrna: doSnap.get(c.numero)?.nomeUrna || c.nome }));
  const outros = [...doSnap.values()].filter((c) => !cfg.candidatos.some((p) => p.numero === c.numero)).map((c) => ({ ...c, nome: c.nomeUrna }));
  return { principais, outros };
}

const ITEM_CONF = { "votos.validos_computados": "Válidos + anulados sub judice (base do %)" };

// Valida e normaliza presidente.json. Retorna { modelo, problemas }. Nunca lança por campo ausente:
// a tela mostra "—" e lista o problema na área Fontes e saúde.
export function normalizar(snap, cfg) {
  const problemas = [];
  if (!snap || typeof snap !== "object") return { modelo: null, problemas: ["Arquivo vazio ou inválido."] };
  if (snap.schema !== SCHEMA) problemas.push(`Versão de contrato inesperada: ${snap.schema || "ausente"} (esperado ${SCHEMA}).`);

  const eleitoBR = snap.eleito?.publicado ? String(snap.eleito.candidatos?.[0] ?? "") || null : null;
  const terr = {};
  terr.br = territorio("br", { nome: "Brasil", tipo: "brasil", coleta: snap.brasil?.coleta, resultado: snap.brasil?.oficial, eleito: eleitoBR });
  terr["br-calculado"] = territorio("br-calculado", { nome: "Brasil (soma)", tipo: "brasil", resultado: snap.brasil?.calculado, coleta: { situacao: "atualizado" } });
  for (const id of [...UFS, "zz"]) {
    const t = snap.territorios?.[id];
    if (!t) problemas.push(`Território ${id} ausente no arquivo.`);
    terr[id] = territorio(id, { nome: t?.nome, tipo: t?.tipo, regiao: t?.regiao, coleta: t?.coleta, resultado: t?.resultado, atrasoMin: t?.atraso_vs_nacional_min });
  }
  for (const r of REGIOES) {
    const cod = Object.keys(COD_REGIAO).find((k) => COD_REGIAO[k] === r.sigla);
    const g = snap.regioes?.[cod];
    if (!g) problemas.push(`Região ${cod} ausente no arquivo.`);
    terr[r.id] = territorio(r.id, { nome: g?.nome || r.nome, tipo: "regiao", resultado: g?.resultado, coleta: g ? { situacao: "atualizado" } : null });
    if (g?.resultado?.faltando?.length) terr[r.id].situacao = "defasada";
  }

  const conf = snap.conferencia || null;
  const colA = conf?.colunas?.a || {}, colB = conf?.colunas?.b || {};
  const cg = snap.coleta_geral || {};
  const fontes = [["br", snap.brasil?.coleta, snap.brasil?.oficial], ...[...UFS, "zz"].map((id) => [id, snap.territorios?.[id]?.coleta, snap.territorios?.[id]?.resultado])]
    .map(([id, c, r]) => ({
      id, url: c?.url || null, http: c?.status_http ?? null, situacao: c?.situacao || null,
      gerado: horario(r?.horario?.geracao), totalizado: horario(r?.horario?.totalizacao), coletado: c?.ultimo_sucesso || null,
      atrasoMin: id === "br" ? 0 : num(snap.territorios?.[id]?.atraso_vs_nacional_min), erro: c?.ultimo_erro?.mensagem || null,
      origem: id === "br" || id === "zz" ? "base TSE" : `base TSE (recorte ${id.toUpperCase()}; TRE-${id.toUpperCase()} sem arquivo próprio)`
    }));

  return {
    problemas,
    modelo: {
      contrato: snap.schema || null,
      aviso: snap.aviso || null,
      eleicao: {
        codigo: snap.eleicao?.eleicao || null, turno: snap.eleicao?.turno ?? null, cargo: snap.eleicao?.cargo_nome || "Presidente",
        nome: snap.eleicao?.nome || null, data: snap.eleicao?.data || null,
        estado: snap.eleicao?.estado || null, esperada: snap.eleicao?.eleicao_esperada || null, motivo: snap.eleicao?.motivo || null,
        modo: snap.modo || "oficial", publicacao: snap.estado_publicacao || null
      },
      eleito: { publicado: !!snap.eleito?.publicado, candidatos: (snap.eleito?.candidatos || []).map(String) },
      coleta: { em: cg.rodada_em || snap.gerado_em || null, proxima: cg.proxima_em || null, intervaloS: num(cg.intervalo_s), saude: cg.estado || null, mensagem: cg.mensagem || null },
      candidatos: candidatos(snap.candidatos, cfg),
      territorios: terr,
      conferencia: conf && {
        situacao: CONFERENCIA[conf.classificacao?.codigo] ? conf.classificacao.codigo : null,
        texto: conf.classificacao?.texto || null, motivo: conf.classificacao?.motivo || null, desde: conf.classificacao?.desde || null,
        aviso: conf.aviso || null, mesmaBase: conf.mesma_base !== false,
        rotuloA: colA.rotulo || null, rotuloB: colB.rotulo || null,
        linhas: (conf.linhas || []).map((l) => {
          const chave = String(l.chave || "");
          const item = chave.startsWith("candidato.") ? chave.slice(10) : chave;
          return { item, rotulo: ITEM_CONF[chave] || l.rotulo || chave, soma: num(l.a), tse: num(l.b), diferenca: num(l.diferenca) };
        }),
        ausentes: colA.faltando || [], defasadas: colA.defasados || [],
        horarioTSE: colB.horario_totalizacao || null, horarioSomaMaisAntiga: horario(colA.horario_totalizacao),
        pctA: num(colA.pct_totalizadas), pctB: num(colB.pct_totalizadas)
      },
      fontes,
      exportCSV: "export/presidente.csv"
    }
  };
}

export function normalizarHistorico(h) {
  const pontos = h?.serie_brasil || [];
  return pontos
    .filter((p) => p && p.totalizacao)
    .map((p) => ({
      t: Date.parse(p.totalizacao), em: p.coletado_em || null, secoesPct: num(p.pct_totalizadas),
      votos: p.votos || {}, pct: p.pct_validos || {}, margemVotos: num(p.disputa?.diferenca_votos), correcao: !!p.correcao
    }))
    .filter((p) => Number.isFinite(p.t))
    .sort((a, b) => a.t - b.t);
}

export function correcoesHistorico(h) {
  return (h?.correcoes || []).map((c) => ({ recorte: c.recorte, em: c.coletado_em, totalizacao: c.totalizacao, quedas: c.quedas || [] }));
}

export function normalizarGovernador(g) {
  const ufs = {};
  for (const [uf, u] of Object.entries(g?.ufs || {})) {
    const eleito = u.eleito?.publicado ? String(u.eleito.candidatos?.[0] ?? "") || null : null;
    ufs[uf] = territorio(uf, { nome: u.nome, tipo: "uf", regiao: u.regiao, coleta: u.coleta, resultado: u.resultado, eleito });
    ufs[uf].candidatosInfo = Object.fromEntries((u.candidatos || []).map((c) => [String(c.numero), { nome_urna: c.nome_urna, partido: c.partido?.sigla || null }]));
    ufs[uf].publicacao = u.estado_publicacao || null;
  }
  return { modo: g?.modo || "oficial", turno: g?.eleicao?.turno ?? null, estado: g?.eleicao?.estado || null, coleta: g?.coleta_geral?.rodada_em || g?.gerado_em || null, ufs };
}

export function normalizarSaude(s) {
  if (!s) return null;
  const c = s.coletor || {};
  return {
    estado: c.estado || null, mensagem: c.mensagem || null, rodadaEm: c.rodada_em || null, intervaloS: num(c.intervalo_s),
    duracaoMs: num(c.rodada?.duracao_ms), requisicoes: num(c.rodada?.requisicoes), statusHttp: c.status_http || {},
    pausa: c.pausa ? { ate: c.pausa.ate || null, motivo: c.pausa.motivo || null } : null,
    configuracao: s.configuracao ? { url: s.configuracao.url, coletada: s.configuracao.coletada_em, erro: s.configuracao.ultimo_erro } : null,
    origem: s.origem || null
  };
}

// ------- Classificação visual de um território (sem contas sobre votos) -------
// Faixas de margem em p.p. para a intensidade opcional do mapa.
export const FAIXAS_MARGEM = [5, 10, 20]; // <5 | 5–10 | 10–20 | ≥20

export function faixaMargem(pp) {
  if (pp === null || pp === undefined) return null;
  const a = Math.abs(pp);
  let i = 0;
  while (i < FAIXAS_MARGEM.length && a >= FAIXAS_MARGEM[i]) i++;
  return i; // 0..3
}

// estado visual: "lider" | "empate" | "sem_dados" | "indisponivel"; defasada é um marcador extra.
export function visualTerritorio(t) {
  if (!t || t.ausente || t.situacao === "indisponivel") return { estado: "indisponivel", defasada: false };
  const defasada = t.situacao === "defasada";
  const temVotos = (t.votos?.basePct ?? 0) > 0;
  if (!temVotos || t.lider === null) return { estado: "sem_dados", defasada };
  if (t.lider === "empate") return { estado: "empate", defasada };
  return { estado: "lider", lider: String(t.lider), faixa: faixaMargem(t.margem?.pp), defasada };
}
