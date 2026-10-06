// Adaptador entre o snapshot publicado pelo coletor (frente 2) e a tela.
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
  nao_iniciada: "Não iniciada",
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
  "teste-1t": "TESTE · dados oficiais do 1º turno (04/10)",
  simulacao: "SIMULAÇÃO · números fictícios para testar o painel"
};

const num = (x) => (typeof x === "number" && Number.isFinite(x) ? x : null);

function territorio(bruto, id) {
  if (!bruto || typeof bruto !== "object") {
    return { id, nome: NOMES[id] || id, situacao: "indisponivel", ausente: true, candidatos: {} };
  }
  const t = bruto;
  const cand = {};
  for (const [n, c] of Object.entries(t.candidatos || {})) {
    cand[n] = { votos: num(c?.votos), pct: num(c?.pct), situacao: c?.situacao || null };
  }
  return {
    id,
    tipo: t.tipo || null,
    nome: t.nome || NOMES[id] || id,
    regiao: t.regiao || REGIAO_DA_UF[id] || null,
    situacao: SITUACOES[t.situacao] ? t.situacao : "indisponivel",
    totalizado: t.totalizado_tse || null,
    atualizado: t.atualizado_em || null,
    secoes: { previstas: num(t.secoes?.previstas), totalizadas: num(t.secoes?.totalizadas), pct: num(t.secoes?.pct) },
    eleitorado: { total: num(t.eleitorado?.total), aptoTotalizado: num(t.eleitorado?.apto_secoes_totalizadas) },
    comparecimento: { votos: num(t.comparecimento?.votos), pct: num(t.comparecimento?.pct) },
    abstencao: { votos: num(t.abstencao?.votos), pct: num(t.abstencao?.pct) },
    votos: {
      validos: num(t.votos?.validos), basePct: num(t.votos?.base_pct), brancos: num(t.votos?.brancos),
      nulos: num(t.votos?.nulos), anuladosSubJudice: num(t.votos?.anulados_sub_judice), total: num(t.votos?.total)
    },
    candidatos: cand,
    lider: t.lider ?? null,
    margem: t.margem ? { votos: num(t.margem.votos), pp: num(t.margem.pp) } : null,
    eleito: t.eleito || null,
    candidatosInfo: t.candidatos_info || null
  };
}

// Junta candidatos do snapshot com a ordem e o nome amigável da configuração.
function candidatos(snap, cfg) {
  const doSnap = new Map((snap.candidatos || []).map((c) => [String(c.numero), c]));
  const principais = cfg.candidatos.map((c) => {
    const s = doSnap.get(c.numero) || {};
    return { numero: c.numero, nome: c.nome, nomeUrna: s.nome_urna || c.nome, partido: s.partido || c.partido, situacao: s.situacao || null, sqcand: s.sqcand || null };
  });
  const outros = [...doSnap.values()].filter((c) => !cfg.candidatos.some((p) => p.numero === String(c.numero)))
    .map((c) => ({ numero: String(c.numero), nome: c.nome_urna, nomeUrna: c.nome_urna, partido: c.partido, situacao: c.situacao || null }));
  return { principais, outros };
}

// Valida e normaliza. Retorna { modelo, problemas }. Nunca lança por campo ausente:
// a tela mostra "—" e lista o problema na área Fontes e saúde.
export function normalizar(snap, cfg) {
  const problemas = [];
  if (!snap || typeof snap !== "object") return { modelo: null, problemas: ["Snapshot vazio ou inválido."] };
  if (!snap.contrato) problemas.push("Snapshot sem versão de contrato.");
  if (!snap.territorios?.br) problemas.push("Snapshot sem o total nacional (br).");

  const terr = {};
  for (const id of [...UFS, "zz", "br", ...REGIOES.map((r) => r.id)]) {
    terr[id] = territorio(snap.territorios?.[id], id);
    if (!snap.territorios?.[id]) problemas.push(`Território ${id} ausente no snapshot.`);
  }
  const conf = snap.conferencia || null;
  return {
    problemas,
    modelo: {
      contrato: snap.contrato || null,
      amostra: !!snap.amostra,
      eleicao: {
        codigo: snap.eleicao?.codigo || null, turno: snap.eleicao?.turno ?? null, cargo: snap.eleicao?.cargo || "presidente",
        modo: snap.eleicao?.modo || "oficial", data: snap.eleicao?.data || null
      },
      coleta: {
        em: snap.coleta?.em || null, proxima: snap.coleta?.proxima_em || null, intervaloS: num(snap.coleta?.intervalo_s),
        saude: snap.coleta?.saude || null, mensagem: snap.coleta?.mensagem || null
      },
      candidatos: candidatos(snap, cfg),
      territorios: terr,
      conferencia: conf && {
        situacao: CONFERENCIA[conf.situacao] ? conf.situacao : null,
        mesmaBase: conf.mesma_base !== false,
        linhas: (conf.linhas || []).map((l) => ({
          item: String(l.item), rotulo: l.rotulo || null, soma: num(l.soma_territorial), tse: num(l.tse_nacional), diferenca: num(l.diferenca)
        })),
        ausentes: conf.ufs_ausentes || [], defasadas: conf.ufs_defasadas || [],
        horarioTSE: conf.horario_tse || null, horarioSomaMaisAntiga: conf.horario_soma_mais_antiga || null
      },
      fontes: (snap.fontes || []).map((f) => ({
        id: f.id, url: f.url || null, http: f.http ?? null, gerado: f.gerado_tse || null, totalizado: f.totalizado_tse || null,
        coletado: f.coletado_em || null, defasagemS: num(f.defasagem_s), origem: f.origem || null, erro: f.erro || null
      }))
    }
  };
}

export function normalizarHistorico(h) {
  const pontos = Array.isArray(h) ? h : h?.pontos || [];
  return pontos
    .filter((p) => p && p.totalizado_tse)
    .map((p) => ({
      t: Date.parse(p.totalizado_tse), em: p.em || null, secoesPct: num(p.secoes_pct),
      votos: p.votos || {}, pct: p.pct || {}, margemVotos: num(p.margem_votos), correcao: !!p.correcao
    }))
    .filter((p) => Number.isFinite(p.t))
    .sort((a, b) => a.t - b.t);
}

export function normalizarGovernador(g) {
  const ufs = {};
  for (const [uf, t] of Object.entries(g?.ufs || {})) ufs[uf] = territorio(t, uf);
  return { modo: g?.eleicao?.modo || "oficial", turno: g?.eleicao?.turno ?? null, coleta: g?.coleta?.em || null, ufs };
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
