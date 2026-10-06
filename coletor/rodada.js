// Uma rodada do coletor, independente de hospedagem (Node, Cloudflare Durable Object, etc.).
// Entrada: Fonte (HTTP), estado da rodada anterior e opções. Saída: estado novo e os arquivos do contrato.
import { normalizarResultado, ErroFonte } from "../nucleo/normalizar.js";
import { descobrir, urlConfig, urlAbrangencia, urlResultado, recortesDaAbrangencia, recortesDiretos } from "../nucleo/descoberta.js";
import { registrarVersao, pontoSerie, acrescentarPonto } from "../nucleo/historico.js";
import { montarPresidente, montarGovernador, SCHEMA } from "../nucleo/contrato.js";
import { csvPresidente, csvGovernador } from "../nucleo/exportar.js";
import { COMPONENTES_BRASIL, BRASIL } from "../nucleo/territorios.js";

export const OPCOES_PADRAO = {
  base: "https://resultados.tse.jus.br",
  ambiente: "oficial",
  ciclo: "ele2026",
  modo: "oficial", // "oficial" = 2º turno pela configuração; "ensaio" = 1º turno de 04/10 (testes e simulação)
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
  return { fonte: {}, config: null, config_em: null, descoberta: null, recortes: {}, ultimos: {}, coleta: {}, historico: {}, series: {}, correcoes: [], conferencia: null };
}

const seg = (a, b) => (Date.parse(a) - Date.parse(b)) / 1000;

export async function rodada(fonte, estadoAnterior, opcoesEntrada = {}) {
  const op = { ...OPCOES_PADRAO, ...opcoesEntrada };
  const estado = structuredClone(estadoAnterior ?? estadoInicial());
  const inicio = new Date(fonte.agora()).toISOString();
  const log = [];
  const fonteCfg = { base: op.base, ambiente: op.ambiente, ciclo: op.ciclo };

  // 1. Configuração oficial
  if (!estado.config || !estado.config_em || seg(inicio, estado.config_em) >= op.intervaloConfigS) {
    const r = await fonte.obter(urlConfig(fonteCfg));
    log.push(r);
    if (r.ok) {
      estado.config = r.dados;
      estado.config_em = r.horario_coleta;
      estado.config_erro = null;
    } else if (!r.adiado) {
      estado.config_erro = { em: r.horario_coleta, mensagem: r.erro, status: r.status };
    }
  }
  if (estado.config) estado.descoberta = descobrir(estado.config, { ciclo: op.ciclo, modo: op.modo });

  // 2. Recortes de cada disputa e 3. resultados
  for (const chave of DISPUTAS) {
    const d = estado.descoberta?.disputas?.[chave];
    if (!d || d.estado !== "publicada") continue;
    const rec = await resolverRecortes(chave, d, estado, fonte, op, fonteCfg, inicio, log);
    for (const abr of rec) {
      const id = `${chave}:${d.eleicao}:${abr}`;
      const url = urlResultado(estado.config, fonteCfg, d.eleicao, d.cargo, abr);
      const r = await fonte.obter(url);
      log.push(r);
      const anterior = estado.coleta[id] ?? {};
      const coleta = { url, ultima_tentativa: r.horario_coleta, ultimo_sucesso: anterior.ultimo_sucesso ?? null, status_http: r.status, ultimo_erro: anterior.ultimo_erro ?? null };
      if (r.ok) {
        try {
          const norm = normalizarResultado(r.dados, { eleicao: d.eleicao, cargo: d.cargo, territorio: abr });
          estado.ultimos[id] = norm;
          coleta.ultimo_sucesso = r.horario_coleta;
          coleta.situacao = "atualizado";
          coleta.sem_alteracao = r.status === 304 || !r.alterado;
          const reg = registrarVersao(estado.historico[id], norm, r.horario_coleta);
          estado.historico[id] = reg.historico;
          if (reg.correcao) estado.correcoes.push({ recorte: abr, disputa: chave, eleicao: d.eleicao, ...reg.correcao });
          coleta.nova_versao = reg.nova;
          coleta.correcao = Boolean(reg.correcao);
        } catch (e) {
          if (!(e instanceof ErroFonte)) throw e;
          coleta.ultimo_erro = { em: r.horario_coleta, mensagem: `arquivo rejeitado: ${e.message}` };
          coleta.situacao = estado.ultimos[id] ? "defasado" : "indisponivel";
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

  saidas["v1/presidente.json"] = pres;
  saidas["v1/governador.json"] = gov;
  saidas["v1/historico.json"] = {
    schema: SCHEMA,
    tipo: "historico",
    gerado_em: agora,
    eleicao: dPres ?? null,
    serie_brasil: serieBr,
    correcoes: estado.correcoes.filter((c) => !dPres?.eleicao || c.eleicao === dPres.eleicao || c.disputa === "governador").slice(-200),
  };
  const fim = new Date(fonte.agora()).toISOString();
  saidas["v1/saude.json"] = {
    schema: SCHEMA,
    tipo: "saude",
    gerado_em: agora,
    modo: op.modo,
    coletor: {
      intervalo_s: op.intervaloS,
      rodada: { inicio, fim, duracao_ms: Date.parse(fim) - Date.parse(inicio), requisicoes: log.filter((r) => !r.adiado).length, adiadas: log.filter((r) => r.adiado).length },
      status_http: contar(log.filter((r) => !r.adiado).map((r) => r.status ?? "erro")),
      pausa: fonte.pausado(),
    },
    configuracao: { url: urlConfig(fonteCfg), coletada_em: estado.config_em, ultimo_erro: estado.config_erro ?? null, ...(estado.descoberta?.config ?? {}) },
    disputas: estado.descoberta?.disputas ?? null,
    recortes: Object.entries(estado.coleta).map(([id, c]) => ({ id, ...c })),
    origem: "Todas as UFs: recorte da base de totalização do TSE. Nenhum TRE publica arquivo estruturado próprio (levantamento em docs/fontes/).",
  };
  saidas["v1/export/presidente.csv"] = csvPresidente(pres);
  saidas["v1/export/governador.csv"] = csvGovernador(gov);
  estado.fonte = fonte.estado;
  return { estado, saidas, log };
}

function contar(lista) {
  const out = {};
  for (const x of lista) out[x] = (out[x] ?? 0) + 1;
  return out;
}

async function resolverRecortes(chave, d, estado, fonte, op, fonteCfg, agora, log) {
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
