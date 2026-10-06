// Descoberta das eleições e dos arquivos a consultar, sempre a partir da configuração oficial (ele-c.json)
// e da lista de abrangência (-ab.json). Nenhuma URL é montada por tentativa: 404 em série bloqueia o IP.
import { ErroFonte } from "./normalizar.js";
import { COMPONENTES_BRASIL, BRASIL, SIGLAS_UF } from "./territorios.js";

export const DISPUTAS = {
  presidente: { eleicao1T: "6257", cargo: 1, nome: "Presidente" },
  governador: { eleicao1T: "6259", cargo: 3, nome: "Governador" },
};

const pad = (v, n) => String(v).padStart(n, "0");

function diretorio(cfg, tp, { base, ambiente, ciclo, eleicao, abr }) {
  const modelo = (cfg.arq || []).find((a) => a.tp === tp)?.dir;
  if (!modelo) throw new ErroFonte(`ele-c.json sem diretório para o tipo "${tp}"`);
  return modelo
    .replace("<base>", base)
    .replace("<ambiente>", ambiente)
    .replace("<ciclo>", ciclo)
    .replace("<cd_eleicao>", eleicao)
    .replace("<uf>", abr ?? "");
}

export function urlConfig({ base, ambiente }) {
  return `${base}/${ambiente}/comum/config/ele-c.json`;
}

export function urlAbrangencia(cfg, fonte, eleicao, abr) {
  return `${diretorio(cfg, "ab", { ...fonte, eleicao, abr })}/${abr}-e${pad(eleicao, 6)}-ab.json`;
}

export function urlResultado(cfg, fonte, eleicao, cargo, abr) {
  return `${diretorio(cfg, "u", { ...fonte, eleicao, abr })}/${abr}-c${pad(cargo, 4)}-e${pad(eleicao, 6)}-u.json`;
}

/**
 * Lê o ele-c.json e diz, para cada disputa, qual eleição consultar.
 * modo "oficial": só a eleição de 2º turno (cdt2) listada na configuração; se ainda não estiver lá, "nao_publicada".
 * modo "ensaio": usa a eleição de 1º turno (para testes e simulação com dados reais de 04/10).
 */
export function descobrir(cfg, { ciclo = "ele2026", modo = "oficial" } = {}) {
  const pleitos = (cfg.pl || []).filter((p) => p.c === ciclo);
  const eleicoes = pleitos.flatMap((p) => (p.e || []).map((e) => ({ ...e, pleito: p.cd, data: p.dt })));
  const out = {};
  for (const [chave, d] of Object.entries(DISPUTAS)) {
    const e1 = eleicoes.find((e) => e.cd === d.eleicao1T);
    if (!e1) {
      out[chave] = { estado: "nao_publicada", motivo: `eleição ${d.eleicao1T} ausente da configuração`, cargo: d.cargo };
      continue;
    }
    const alvo = modo === "ensaio" ? e1 : eleicoes.find((e) => e.cd === e1.cdt2 && e1.cdt2);
    if (!alvo) {
      out[chave] = {
        estado: "nao_publicada",
        motivo: e1.cdt2 ? `configuração ainda não lista a eleição ${e1.cdt2} (2º turno)` : "a configuração não informa 2º turno",
        eleicao_esperada: e1.cdt2 || null,
        cargo: d.cargo,
      };
      continue;
    }
    const abrangencias = (alvo.abr || []).filter((a) => (a.cp || []).some((c) => Number(c.cd) === d.cargo)).map((a) => a.cd);
    out[chave] = {
      estado: abrangencias.length ? "publicada" : "sem_cargo",
      eleicao: alvo.cd,
      pleito: alvo.pleito,
      data: alvo.data,
      nome: alvo.nm,
      turno: Number(alvo.t),
      cargo: d.cargo,
      cargo_nome: d.nome,
      abrangencias,
    };
  }
  return { config: { idg: cfg.idg ?? null, geracao: cfg.dg && cfg.hg ? `${cfg.dg} ${cfg.hg}` : null }, disputas: out };
}

/**
 * A partir da lista de abrangência do recorte "br" (-ab.json), devolve os recortes com arquivo de resultado.
 * Aceita só siglas conhecidas (27 UFs, zz, br) para que um valor inesperado não vire URL.
 */
export function recortesDaAbrangencia(ab) {
  const lista = (ab?.abr || []).map((a) => String(a.cdabr));
  const conhecidos = new Set([...COMPONENTES_BRASIL, BRASIL]);
  return { recortes: lista.filter((c) => conhecidos.has(c)), ignorados: lista.filter((c) => !conhecidos.has(c)) };
}

/** Recortes de uma disputa quando a configuração já lista as UFs (sem "br"). */
export function recortesDiretos(abrangencias) {
  return abrangencias.filter((a) => SIGLAS_UF.includes(a) || a === "zz");
}
