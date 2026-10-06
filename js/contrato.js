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

// Faixa e marca d'água para qualquer dado que não seja a apuração oficial do 2º turno.
export const MARCAS = {
  ensaio: { faixa: "ENSAIO COM O 1º TURNO", detalhe: "Dados oficiais do 1º turno de 04/10, usados só para testar o painel. Não é a apuração do 2º turno.", marca: "ENSAIO · 1º TURNO" },
  simulacao: { faixa: "SIMULAÇÃO", detalhe: "Números fictícios gerados pelo coletor para testar o painel. Não é resultado de eleição.", marca: "SIMULAÇÃO" },
  desconhecido: { faixa: "DADOS NÃO IDENTIFICADOS", detalhe: "O arquivo não diz se é apuração oficial. O painel o trata como teste.", marca: "NÃO OFICIAL" },
  outro_turno: { faixa: "NÃO É O 2º TURNO", detalhe: "O arquivo lido é de outro turno. O painel não o apresenta como apuração do 2º turno.", marca: "OUTRO TURNO" }
};

export const PUBLICACAO = {
  aguardando_configuracao: "O TSE ainda não publicou a configuração do 2º turno. O painel começa a mostrar números assim que ela aparecer.",
  aguardando_resultados: "Eleição configurada pelo TSE, ainda sem resultados divulgados. A divulgação começa após o encerramento da votação.",
  em_apuracao: null,
  totalizada_100: "100% das seções totalizadas. O resultado ainda não foi declarado pelo TSE.",
  concluida: "Totalização concluída pelo TSE."
};

const num = (x) => (typeof x === "number" && Number.isFinite(x) ? x : null);

// Votos e contagens: inteiros não negativos. Qualquer outra coisa vira ausente (null) e é registrada
// como problema do snapshot, em vez de aparecer na tela como número.
function contagem(x, onde, problemas) {
  if (x === null || x === undefined) return null;
  if (typeof x === "number" && Number.isInteger(x) && x >= 0) return x;
  problemas?.push(`Contagem inválida em ${onde}: ${JSON.stringify(x)} (esperado inteiro ≥ 0).`);
  return null;
}

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
/**
 * @typedef {object} OpcoesTerritorio
 * @property {string} [nome] @property {string} [tipo] @property {string} [regiao]
 * @property {any} [coleta] @property {any} [resultado] @property {number} [atrasoMin] @property {string | null} [eleito]
 */
/** @param {string} id @param {OpcoesTerritorio} [opcoes] @param {string[] | null} [problemas] */
function territorio(id, { nome, tipo, regiao, coleta, resultado, atrasoMin, eleito } = {}, problemas = null) {
  const r = resultado && typeof resultado === "object" ? resultado : null;
  const cand = {};
  const n = (x, campo) => contagem(x, `${id}.${campo}`, problemas);
  if (r && r.candidatos !== undefined && !Array.isArray(r.candidatos)) problemas?.push(`${id}: lista de candidatos em formato inesperado.`);
  for (const c of Array.isArray(r?.candidatos) ? r.candidatos : []) {
    // "Eleito" só quando o texto oficial diz "Eleito"; qualquer outro valor é "não definido".
    cand[String(c.numero)] = { votos: n(c.votos, `candidato ${c.numero}`), pct: num(c.pct_validos), situacao: c.situacao || null };
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
      ultimoSucesso: coleta.ultimo_sucesso || null, erro: coleta.ultimo_erro?.mensagem || null, correcao: !!coleta.correcao,
      mudanca: coleta.ultima_mudanca || null, sha256: coleta.sha256 || null, alertas: Array.isArray(coleta.alertas) ? coleta.alertas : [],
      foraDeOrdem: coleta.fora_de_ordem || null
    } : null,
    faltando: r?.faltando || [],
    secoes: { previstas: n(r?.secoes?.total, "secoes.total"), totalizadas: n(r?.secoes?.totalizadas, "secoes.totalizadas"), pct: num(i.pct_totalizadas) },
    eleitorado: { total: n(e.total, "eleitorado.total"), aptoTotalizado: n(e.secoes_totalizadas, "eleitorado.secoes_totalizadas") },
    comparecimento: { votos: n(e.comparecimento, "comparecimento"), pct: num(i.pct_comparecimento) },
    abstencao: { votos: n(e.abstencao, "abstencao"), pct: num(i.pct_abstencao) },
    votos: {
      validos: n(v.validos, "votos.validos"), basePct: n(v.validos_computados, "votos.validos_computados"), brancos: n(v.brancos, "votos.brancos"), nulos: n(v.nulos_total, "votos.nulos_total"),
      anuladosSubJudice: n(v.anulados_sub_judice, "votos.anulados_sub_judice"), total: n(v.total, "votos.total"),
      pctValidos: num(i.pct_validos), pctBrancos: num(i.pct_brancos), pctNulos: num(i.pct_nulos)
    },
    candidatos: cand,
    lider: d.lider, margem: d.margem,
    eleito: eleito || null,
    idg: r?.idg ?? null
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
  // Resposta incompleta: sem o bloco nacional e sem territórios não há o que mostrar com segurança.
  const temBrasil = snap.brasil && typeof snap.brasil === "object";
  const temTerr = snap.territorios && typeof snap.territorios === "object";
  if (!temBrasil && !temTerr) return { modelo: null, problemas: [...problemas, "Arquivo sem os blocos brasil e territorios: resposta incompleta, ignorada."] };
  if (!temBrasil) problemas.push("Bloco brasil ausente: resposta incompleta.");
  if (snap.eleicao?.estado === "publicada" && !snap.brasil?.oficial && snap.brasil?.coleta?.situacao === "atualizado") problemas.push("Arquivo nacional marcado como lido, mas sem resultado.");

  const eleitoBR = snap.eleito?.publicado ? String(snap.eleito.candidatos?.[0] ?? "") || null : null;
  const terr = {};
  terr.br = territorio("br", { nome: "Brasil", tipo: "brasil", coleta: snap.brasil?.coleta, resultado: snap.brasil?.oficial, eleito: eleitoBR }, problemas);
  terr["br-calculado"] = territorio("br-calculado", { nome: "Brasil (soma)", tipo: "brasil", resultado: snap.brasil?.calculado, coleta: { situacao: "atualizado" } }, problemas);
  for (const id of [...UFS, "zz"]) {
    const t = snap.territorios?.[id];
    if (!t) problemas.push(`Território ${id} ausente no arquivo.`);
    terr[id] = territorio(id, { nome: t?.nome, tipo: t?.tipo, regiao: t?.regiao, coleta: t?.coleta, resultado: t?.resultado, atrasoMin: t?.atraso_vs_nacional_min }, problemas);
  }
  for (const r of REGIOES) {
    const cod = Object.keys(COD_REGIAO).find((k) => COD_REGIAO[k] === r.sigla);
    const g = snap.regioes?.[cod];
    if (!g) problemas.push(`Região ${cod} ausente no arquivo.`);
    terr[r.id] = territorio(r.id, { nome: g?.nome || r.nome, tipo: "regiao", resultado: g?.resultado, coleta: g ? { situacao: "atualizado" } : null }, problemas);
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
      mudanca: c?.ultima_mudanca || null, sha256: c?.sha256 || null, alertas: Array.isArray(c?.alertas) ? c.alertas : [],
      origem: id === "br" || id === "zz" ? "base TSE" : `base TSE (recorte ${id.toUpperCase()}; TRE-${id.toUpperCase()} sem arquivo próprio)`
    }));

  // Modo desconhecido nunca é tratado como oficial.
  const modo = snap.modo === undefined || snap.modo === null ? "oficial" : MODOS[snap.modo] !== undefined ? snap.modo : "desconhecido";
  if (modo === "desconhecido") problemas.push(`Modo de dados desconhecido: ${JSON.stringify(snap.modo)}. Tratado como teste.`);
  const turno = snap.eleicao?.turno ?? null;
  const sn = snap.snapshot && typeof snap.snapshot === "object" ? snap.snapshot : null;
  return {
    problemas,
    modelo: {
      contrato: snap.schema || null,
      gerado: snap.gerado_em || null,
      // Identificação do snapshot (contrato v1, campo opcional): hash só muda quando os números mudam.
      snapshot: sn ? { id: sn.id ?? null, sha256: sn.sha256 || null, mudouEm: sn.mudou_em || null, anterior: sn.anterior_sha256 || null } : null,
      // Os três horários que a tela mostra separados (seção 7): publicação da fonte, última consulta
      // bem-sucedida e última mudança efetiva (esta vem do snapshot ou do histórico, ver app.js).
      // Preferência: bloco tempos do coletor; sem ele, os campos equivalentes do arquivo nacional.
      tempos: {
        publicacaoTSE: snap.tempos?.publicacao_fonte || terr.br.gerado || terr.br.totalizado,
        totalizacaoTSE: snap.tempos?.totalizacao_fonte || terr.br.totalizado,
        consultaOk: snap.tempos?.ultima_consulta_ok || snap.brasil?.coleta?.ultimo_sucesso || null,
        mudanca: snap.tempos?.ultima_mudanca || sn?.mudou_em || snap.brasil?.coleta?.ultima_mudanca || null,
        mudancaQualquer: snap.tempos?.ultima_mudanca_qualquer_recorte || null
      },
      avisoModo: snap.aviso_modo || null,
      sha256BR: snap.brasil?.coleta?.sha256 || sn?.sha256 || null,
      // Marca de teste: tudo que não é o 2º turno oficial ganha faixa e marca d'água.
      teste: modo !== "oficial" ? modo : turno !== null && turno !== 2 ? "outro_turno" : null,
      aviso: snap.aviso || null,
      eleicao: {
        codigo: snap.eleicao?.eleicao || null, turno: snap.eleicao?.turno ?? null, cargo: snap.eleicao?.cargo_nome || "Presidente",
        nome: snap.eleicao?.nome || null, data: snap.eleicao?.data || null,
        estado: snap.eleicao?.estado || null, esperada: snap.eleicao?.eleicao_esperada || null, motivo: snap.eleicao?.motivo || null,
        modo, publicacao: snap.estado_publicacao || null
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

// Assinatura do conteúdo de um snapshot, sem os campos que mudam a cada rodada mesmo sem número novo
// (horários de coleta, gerado_em). Serve só para a página saber se algo mudou de fato; não é segurança.
const VOLATEIS = new Set(["gerado_em", "tempos", "coleta", "coleta_geral", "snapshot", "atraso_vs_nacional_min"]);
export function assinaturaConteudo(snap) {
  const txt = JSON.stringify(snap ?? null, (k, v) => (VOLATEIS.has(k) ? undefined : v));
  let h = 0x811c9dc5; // FNV-1a 32 bits
  for (let i = 0; i < txt.length; i++) { h ^= txt.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, "0");
}

export function normalizarHistorico(h) {
  const pontos = h?.serie_brasil || [];
  return pontos
    .filter((p) => p && p.totalizacao)
    .map((p) => ({
      t: Date.parse(p.totalizacao), em: p.coletado_em || null, secoesPct: num(p.pct_totalizadas),
      votos: p.votos || {}, pct: p.pct_validos || {}, margemVotos: num(p.disputa?.diferenca_votos), correcao: !!p.correcao,
      idg: p.idg ?? null, sha256: p.sha256 || null, snapshotId: p.snapshot_id ?? null
    }))
    .filter((p) => Number.isFinite(p.t))
    .sort((a, b) => a.t - b.t);
}

export function eventosHistorico(h) {
  return (Array.isArray(h?.eventos) ? h.eventos : []).map((e) => ({ em: e.em || null, tipo: e.tipo || "?", recorte: e.recorte || null, detalhe: e.motivo || e.mensagem || e.detalhe || null }));
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
    latenciaMs: c.latencia_ms ? { mediana: num(c.latencia_ms.mediana), max: num(c.latencia_ms.max) } : null,
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
