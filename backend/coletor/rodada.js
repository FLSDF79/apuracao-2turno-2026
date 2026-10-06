// Uma rodada do coletor, independente de hospedagem (Node, Cloudflare Durable Object, etc.).
// Camadas: conectores (HTTP + endereços do TSE) → normalização (validação + inteiros) → agregação
// (somas, conferência, histórico) → API (arquivos do contrato). O armazenamento fica com o adaptador.
// Tudo determinístico: nenhum modelo de linguagem participa de consulta, soma ou interpretação.
import { normalizarResultado, horarioTSE, ErroFonte } from "../normalizacao/normalizar.js";
import { descobrir, urlConfig, urlAbrangencia, urlResultado, recortesDaAbrangencia, recortesDiretos } from "../conectores/tse.js";
import { registrarVersao, pontoSerie, acrescentarPonto } from "../agregacao/historico.js";
import { montarPresidente, montarGovernador, tabelaTerritorios, avisoModo, SCHEMA } from "../api/contrato.js";
import { csvPresidente, csvGovernador } from "../api/exportar.js";
import { sha256Hex, acrescentarSnapshot } from "../armazenamento/snapshots.js";
import { COMPONENTES_BRASIL, BRASIL } from "../normalizacao/territorios.js";

export const OPCOES_PADRAO = {
  base: "https://resultados.tse.jus.br",
  ambiente: "oficial",
  ciclo: "ele2026",
  modo: "oficial", // "oficial" = 2º turno pela configuração; "simulacao" = idem, com site simulado; "ensaio" = 1º turno de 04/10
  intervaloS: 15,
  intervaloConfigS: 60,
  intervaloAbrangenciaS: 300,
  persistenciaMin: 10,
  // UFs com 2º turno de governador, conferidas pela situação "2º turno" nos arquivos oficiais do 1º turno
  // (tests/test_fixtures_tse.py). Usadas no modo ensaio (a 6259 tem as 27 UFs) e como filtro se a configuração
  // do 2º turno listar a 6260 com abrangência "br": consultar as 27 daria 20 respostas 404 e bloqueio do IP.
  ufsGovernador2T: ["ac", "am", "df", "es", "rj", "rn", "to"],
};

const DISPUTAS = ["presidente", "governador"];

export function estadoInicial() {
  return { fonte: {}, config: null, config_em: null, descoberta: null, recortes: {}, ultimos: {}, coleta: {}, historico: {}, series: {}, correcoes: [], conferencia: null, snapshots: [], eventos: [] };
}

const seg = (a, b) => (Date.parse(a) - Date.parse(b)) / 1000;
const MAX_EVENTOS = 500;

/**
 * @returns {Promise<{ estado: object, saidas: Record<string, object|string>, brutos: Record<string, string>, log: object[] }>}
 *   brutos: corpos oficiais novos nesta rodada, por SHA-256, para o adaptador guardar
 */
export async function rodada(fonte, estadoAnterior, opcoesEntrada = {}) {
  const op = { ...OPCOES_PADRAO, ...opcoesEntrada };
  const estado = { ...estadoInicial(), ...structuredClone(estadoAnterior ?? {}) };
  const inicio = new Date(fonte.agora()).toISOString();
  const log = [];
  /** @type {Record<string, string>} */
  const brutos = {};
  const fonteCfg = { base: op.base, ambiente: op.ambiente, ciclo: op.ciclo };
  const evento = (tipo, dados) => {
    estado.eventos.push({ em: new Date(fonte.agora()).toISOString(), tipo, ...dados });
    if (estado.eventos.length > MAX_EVENTOS) estado.eventos.splice(0, estado.eventos.length - MAX_EVENTOS);
  };

  /** Guarda o corpo e registra o snapshot quando o conteúdo mudou (200 com corpo novo). */
  const snapshot = async (r, meta) => {
    if (!r.ok || r.status !== 200 || !r.alterado || typeof r.texto !== "string") return null;
    const sha256 = await sha256Hex(r.texto);
    brutos[sha256] = r.texto;
    const entrada = { coletado_em: r.horario_coleta, url: r.url, etag: r.etag ?? null, sha256, bytes: r.texto.length, ...meta };
    estado.snapshots = acrescentarSnapshot(estado.snapshots, entrada);
    return entrada;
  };

  // 1. Configuração oficial
  if (!estado.config || !estado.config_em || seg(inicio, estado.config_em) >= op.intervaloConfigS) {
    const r = await fonte.obter(urlConfig(fonteCfg));
    log.push(r);
    if (r.ok) {
      try {
        descobrir(r.dados, { ciclo: op.ciclo, modo: op.modo }); // valida antes de aceitar
        await snapshot(r, { tipo: "configuracao", geracao: horarioTSE(r.dados.dg, r.dados.hg), idg: r.dados.idg ?? null, aceito: true });
        estado.config = r.dados;
        estado.config_em = r.horario_coleta;
        estado.config_erro = null;
      } catch (e) {
        if (!(e instanceof ErroFonte) && !(e instanceof TypeError)) throw e;
        estado.config_erro = { em: r.horario_coleta, mensagem: `configuração rejeitada: ${e.message}`, status: r.status };
        evento("configuracao_rejeitada", { mensagem: e.message });
      }
    } else if (!r.adiado) {
      estado.config_erro = { em: r.horario_coleta, mensagem: r.erro, status: r.status };
    }
  }
  if (estado.config) estado.descoberta = descobrir(estado.config, { ciclo: op.ciclo, modo: op.modo });

  // 2. Recortes de cada disputa e 3. resultados
  for (const chave of DISPUTAS) {
    const d = estado.descoberta?.disputas?.[chave];
    if (!d || d.estado !== "publicada") continue;
    const rec = await resolverRecortes(chave, d, estado, fonte, op, fonteCfg, inicio, log, snapshot);
    for (const abr of rec) {
      const id = `${chave}:${d.eleicao}:${abr}`;
      const url = urlResultado(estado.config, fonteCfg, d.eleicao, d.cargo, abr);
      const r = await fonte.obter(url);
      log.push(r);
      const anterior = estado.coleta[id] ?? {};
      const coleta = {
        url,
        ultima_tentativa: r.horario_coleta,
        ultimo_sucesso: anterior.ultimo_sucesso ?? null,
        ultima_mudanca: anterior.ultima_mudanca ?? null,
        status_http: r.status,
        ultimo_erro: anterior.ultimo_erro ?? null,
        alertas: anterior.alertas ?? [],
        sha256: anterior.sha256 ?? null,
      };
      if (r.ok) {
        let norm = null;
        try {
          norm = normalizarResultado(r.dados, { eleicao: d.eleicao, cargo: d.cargo, territorio: abr, turno: d.turno });
        } catch (e) {
          if (!(e instanceof ErroFonte)) throw e;
          coleta.ultimo_erro = { em: r.horario_coleta, mensagem: `arquivo rejeitado: ${e.message}`, status: r.status };
          coleta.situacao = estado.ultimos[id] ? "defasado" : "indisponivel";
          await snapshot(r, { tipo: "resultado", disputa: chave, eleicao: d.eleicao, recorte: abr, aceito: false, motivo: e.message });
          evento("arquivo_rejeitado", { recorte: abr, disputa: chave, mensagem: e.message });
        }
        if (norm) {
          const guardado = estado.ultimos[id];
          // Resposta fora de ordem (ex.: cache servindo versão anterior): geração mais antiga que a guardada.
          if (guardado && norm.horario.geracao && guardado.horario.geracao && norm.horario.geracao < guardado.horario.geracao) {
            coleta.ultimo_sucesso = r.horario_coleta;
            coleta.situacao = "atualizado";
            coleta.sem_alteracao = true;
            coleta.nova_versao = false;
            coleta.fora_de_ordem = { em: r.horario_coleta, recebido: norm.horario.geracao, mantido: guardado.horario.geracao };
            await snapshot(r, { tipo: "resultado", disputa: chave, eleicao: d.eleicao, recorte: abr, idg: norm.idg, geracao: norm.horario.geracao, totalizacao: norm.horario.totalizacao, aceito: false, motivo: "fora de ordem: geração mais antiga que a já publicada" });
            evento("fora_de_ordem", { recorte: abr, disputa: chave, recebido: norm.horario.geracao, mantido: guardado.horario.geracao });
          } else {
            estado.ultimos[id] = norm;
            coleta.ultimo_sucesso = r.horario_coleta;
            coleta.situacao = "atualizado";
            coleta.sem_alteracao = r.status === 304 || !r.alterado;
            coleta.alertas = norm.alertas;
            coleta.fora_de_ordem = null;
            const reg = registrarVersao(estado.historico[id], norm, r.horario_coleta);
            estado.historico[id] = reg.historico;
            if (reg.nova) coleta.ultima_mudanca = r.horario_coleta;
            if (reg.correcao) {
              estado.correcoes.push({ recorte: abr, disputa: chave, eleicao: d.eleicao, ...reg.correcao });
              evento("correcao_oficial", { recorte: abr, disputa: chave });
            }
            if (norm.alertas.length) evento("alerta_aritmetico", { recorte: abr, disputa: chave, alertas: norm.alertas });
            coleta.nova_versao = reg.nova;
            coleta.correcao = Boolean(reg.correcao);
            const snap = await snapshot(r, { tipo: "resultado", disputa: chave, eleicao: d.eleicao, recorte: abr, idg: norm.idg, geracao: norm.horario.geracao, totalizacao: norm.horario.totalizacao, aceito: true });
            if (snap) coleta.sha256 = snap.sha256;
          }
        }
      } else {
        if (!r.adiado) coleta.ultimo_erro = { em: r.horario_coleta, mensagem: r.erro, status: r.status };
        coleta.situacao = estado.ultimos[id] ? "defasado" : r.nao_publicado ? "nao_publicado" : r.adiado && !anterior.situacao ? "aguardando" : "indisponivel";
        if (r.adiado) coleta.adiado = r.erro;
      }
      estado.coleta[id] = coleta;
    }
  }

  // 4. Contrato
  const agora = new Date(fonte.agora()).toISOString();
  const saidas = {};
  const montar = (chave) => {
    const d = estado.descoberta?.disputas?.[chave] ?? null;
    const prefixo = d?.eleicao ? `${chave}:${d.eleicao}:` : null;
    const resultados = {}, coleta = {};
    if (prefixo) {
      for (const [id, r] of Object.entries(estado.ultimos)) if (id.startsWith(prefixo)) resultados[id.slice(prefixo.length)] = r;
      for (const [id, c] of Object.entries(estado.coleta)) if (id.startsWith(prefixo)) coleta[id.slice(prefixo.length)] = c;
    }
    return { disputa: d, resultados, coleta, recortes: (d?.eleicao && estado.recortes[`${chave}:${d.eleicao}`]?.lista) || [], agora, modo: op.modo, fonte: fonteCfg };
  };

  const pres = montarPresidente({ ...montar("presidente"), conferenciaAnterior: estado.conferencia, persistenciaMin: op.persistenciaMin });
  estado.conferencia = pres.conferencia;
  const gov = montarGovernador(montar("governador"));

  // Série para o gráfico de evolução: um ponto por versão nova do arquivo nacional
  const dPres = estado.descoberta?.disputas?.presidente;
  if (dPres?.eleicao) {
    const idBr = `presidente:${dPres.eleicao}:${BRASIL}`;
    if (estado.coleta[idBr]?.nova_versao && pres.brasil.oficial) {
      estado.series[idBr] = acrescentarPonto(estado.series[idBr], pontoSerie(pres.brasil.oficial, estado.coleta[idBr].ultimo_sucesso, estado.coleta[idBr].correcao));
      estado.coleta[idBr].nova_versao = false;
    }
  }
  const serieBr = dPres?.eleicao ? estado.series[`presidente:${dPres.eleicao}:${BRASIL}`] ?? [] : [];

  const fimRodada = new Date(fonte.agora()).toISOString();
  const pausa = fonte.pausado();
  const situacoes = Object.values(estado.coleta).map((c) => c.situacao);
  const resumoColeta = {
    estado: pausa ? (/40[3]|429/.test(pausa.motivo) ? "bloqueada" : "pausada")
      : !estado.config ? "indisponivel"
      : situacoes.some((x) => x === "defasado" || x === "indisponivel") ? "atrasada" : "ok",
    mensagem: pausa ? `${pausa.motivo} (até ${pausa.ate})` : !estado.config ? estado.config_erro?.mensagem ?? "configuração do TSE ainda não lida" : null,
    rodada_em: fimRodada,
    proxima_em: new Date(Date.parse(fimRodada) + op.intervaloS * 1000).toISOString(),
    intervalo_s: op.intervaloS,
  };
  pres.coleta_geral = resumoColeta;
  gov.coleta_geral = resumoColeta;
  saidas["v1/presidente.json"] = pres;
  saidas["v1/governador.json"] = gov;
  saidas["v1/historico.json"] = {
    schema: SCHEMA,
    tipo: "historico",
    gerado_em: pres.gerado_em,
    modo: op.modo,
    aviso_modo: avisoModo(op.modo),
    eleicao: dPres ?? null,
    serie_brasil: serieBr,
    correcoes: estado.correcoes.filter((c) => !dPres?.eleicao || c.eleicao === dPres.eleicao || c.disputa === "governador").slice(-200),
    eventos: estado.eventos.slice(-200),
  };
  saidas["v1/snapshots.json"] = {
    schema: SCHEMA,
    tipo: "snapshots",
    modo: op.modo,
    total: estado.snapshots.length,
    como_conferir: "Cada entrada traz a URL oficial, o horário da fonte, o horário da coleta e o SHA-256 do corpo recebido. O corpo exato fica em snapshots/<sha256>.json.",
    snapshots: estado.snapshots.slice(-500).reverse(),
  };
  saidas["v1/territorios.json"] = tabelaTerritorios();
  const consultas = log.filter((r) => !r.adiado && !r.recusado);
  const tempos = consultas.map((r) => r.ms).filter((x) => typeof x === "number").sort((a, b) => a - b);
  saidas["v1/saude.json"] = {
    schema: SCHEMA,
    tipo: "saude",
    gerado_em: fimRodada,
    modo: op.modo,
    aviso_modo: avisoModo(op.modo),
    coletor: {
      ...resumoColeta,
      rodada: { inicio, fim: fimRodada, duracao_ms: Date.parse(fimRodada) - Date.parse(inicio), requisicoes: consultas.length, adiadas: log.filter((r) => r.adiado).length, recusadas: log.filter((r) => r.recusado).length },
      status_http: contar(consultas.map((r) => r.status ?? "erro")),
      latencia_ms: tempos.length ? { mediana: tempos[Math.floor(tempos.length / 2)], max: tempos[tempos.length - 1] } : null,
      pausa,
    },
    configuracao: { url: urlConfig(fonteCfg), coletada_em: estado.config_em, ultimo_erro: estado.config_erro ?? null, ...(estado.descoberta?.config ?? {}) },
    disputas: estado.descoberta?.disputas ?? null,
    recortes: Object.entries(estado.coleta).map(([id, c]) => ({ id, ...c })),
    origem: "Todas as UFs: recorte da base de totalização do TSE. Nenhum TRE publica arquivo estruturado próprio (levantamento em docs/fontes/).",
  };
  saidas["v1/export/presidente.csv"] = csvPresidente(pres);
  saidas["v1/export/governador.csv"] = csvGovernador(gov);
  estado.fonte = fonte.estado;
  return { estado, saidas, brutos, log };
}

function contar(lista) {
  const out = {};
  for (const x of lista) out[x] = (out[x] ?? 0) + 1;
  return out;
}

async function resolverRecortes(chave, d, estado, fonte, op, fonteCfg, agora, log, snapshot) {
  const id = `${chave}:${d.eleicao}`;
  const atual = estado.recortes[id];
  if (op.modo === "ensaio" && chave === "governador") {
    return (estado.recortes[id] = { lista: op.ufsGovernador2T, origem: "UFs com 2º turno no 1º turno (ensaio)", em: agora }).lista;
  }
  if (!d.abrangencias.includes(BRASIL)) {
    return (estado.recortes[id] = { lista: recortesDiretos(d.abrangencias), origem: "ele-c.json (abr)", em: agora }).lista;
  }
  if (atual && seg(agora, atual.em) < op.intervaloAbrangenciaS && atual.origem === "abrangencia") return atual.lista;
  const r = await fonte.obter(urlAbrangencia(estado.config, fonteCfg, d.eleicao, BRASIL));
  log.push(r);
  if (r.ok) {
    await snapshot(r, { tipo: "abrangencia", disputa: chave, eleicao: d.eleicao, recorte: BRASIL, idg: r.dados?.idg ?? null, geracao: horarioTSE(r.dados?.dg, r.dados?.hg), aceito: true });
    let { recortes } = recortesDaAbrangencia(r.dados);
    if (chave === "governador") recortes = recortes.filter((c) => op.ufsGovernador2T.includes(c));
    return (estado.recortes[id] = { lista: recortes, origem: "abrangencia", em: agora }).lista;
  }
  if (atual) return atual.lista;
  // Sem lista de abrangência: para presidente, só consulta as UFs depois que o arquivo nacional existir,
  // e o disjuntor de 404 da Fonte protege contra sequência de erros.
  if (chave === "presidente") {
    const br = await fonte.obter(urlResultado(estado.config, fonteCfg, d.eleicao, d.cargo, BRASIL));
    log.push(br);
    if (br.ok) return (estado.recortes[id] = { lista: [BRASIL, ...COMPONENTES_BRASIL], origem: "estrutura fixa após nacional publicado", em: agora }).lista;
  }
  return [];
}
