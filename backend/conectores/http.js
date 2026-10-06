// Cliente HTTP do coletor: um só para todos os visitantes.
// - requisição condicional (If-None-Match / If-Modified-Since) e reaproveitamento do corpo em 304;
// - timeout por requisição, backoff exponencial com variação por URL, respeito a Retry-After;
// - pausa global diante de bloqueio (403/429) ou de 404 em sequência, porque o TSE bloqueia o IP;
// - limite global de requisições por segundo, bem abaixo do limite oficial (100 req/s por IP).
// fetch e relógio são injetáveis para os testes e para rodar em Node ou Cloudflare Workers.

export const PADRAO = {
  timeoutMs: 8000,
  backoffBaseMs: 5000,
  backoffMaxMs: 5 * 60 * 1000,
  pausaBloqueioMs: 10 * 60 * 1000, // documentação do TSE: bloqueio de 10 min
  pausa404Ms: 2 * 60 * 1000,
  limite404Seguidos: 3,
  maxPorSegundo: 10,
  userAgent: "apuracao-2turno-2026/1 (painel independente; github.com/FLSDF79/apuracao-2turno-2026)",
  // Únicos destinos que o backend consulta. Qualquer outra URL é recusada antes de sair da máquina.
  hostsPermitidos: ["resultados.tse.jus.br", "resultados-sim.tse.jus.br"],
  // Só para teste local (ex.: "127.0.0.1:8788" com wrangler dev); nunca configurado em produção.
  hostsExtras: [],
};

/** Recusa qualquer URL fora da lista de hosts do TSE (https) ou dos extras de teste. */
export function urlPermitida(url, { hostsPermitidos = PADRAO.hostsPermitidos, hostsExtras = [] } = {}) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.username || u.password) return false;
  if (u.protocol === "https:" && hostsPermitidos.includes(u.host)) return true;
  return hostsExtras.includes(u.host) && (u.protocol === "http:" || u.protocol === "https:");
}

/**
 * @typedef {Partial<typeof PADRAO> & {
 *   fetch?: (url: string, init: any) => Promise<Response>,
 *   agora?: () => number,
 *   esperar?: (ms: number) => Promise<void>,
 *   estado?: any,
 * }} OpcoesFonte
 */

export class Fonte {
  /** @param {OpcoesFonte} [opcoesFonte] */
  constructor({ fetch: f, agora = () => Date.now(), esperar, estado = {}, ...opcoes } = {}) {
    // chamado sempre como função solta: no Workers, fetch fora do globalThis dá "Illegal invocation"
    this.fetch = f ?? ((url, init) => globalThis.fetch(url, init));
    this.agora = agora;
    this.esperar = esperar ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.op = { ...PADRAO, ...opcoes };
    // estado serializável: sobrevive entre rodadas (e entre execuções, se o armazenamento guardar)
    this.estado = { urls: {}, pausaAte: 0, motivoPausa: null, seguidos404: 0, ...estado };
    this.janela = [];
  }

  pausado() {
    return this.agora() < this.estado.pausaAte ? { ate: new Date(this.estado.pausaAte).toISOString(), motivo: this.estado.motivoPausa } : null;
  }

  pausar(ms, motivo) {
    this.estado.pausaAte = Math.max(this.estado.pausaAte, this.agora() + ms);
    this.estado.motivoPausa = motivo;
  }

  async respeitarTaxa() {
    for (;;) {
      const t = this.agora();
      this.janela = this.janela.filter((x) => t - x < 1000);
      if (this.janela.length < this.op.maxPorSegundo) {
        this.janela.push(t);
        return;
      }
      await this.esperar(1000 - (t - this.janela[0]));
    }
  }

  /**
   * Busca uma URL. Devolve sempre um objeto, nunca lança:
   * { ok, status, url, dados?, alterado?, erro?, adiado?, horario_coleta, etag }
   */
  async obter(url) {
    if (!urlPermitida(url, this.op)) {
      return { ok: false, url, status: null, recusado: true, erro: "URL fora dos endereços oficiais do TSE: recusada", horario_coleta: new Date(this.agora()).toISOString() };
    }
    const st = (this.estado.urls[url] ||= { etag: null, modificado: null, corpo: null, falhas: 0, proximaEm: 0, ultimoOk: null });
    const coleta = new Date(this.agora()).toISOString();
    const pausa = this.pausado();
    if (pausa) return { ok: false, url, status: null, adiado: true, erro: `coletor em pausa até ${pausa.ate}: ${pausa.motivo}`, horario_coleta: coleta };
    if (this.agora() < st.proximaEm) return { ok: false, url, status: null, adiado: true, erro: `aguardando backoff até ${new Date(st.proximaEm).toISOString()}`, horario_coleta: coleta };

    await this.respeitarTaxa();
    const headers = { "User-Agent": this.op.userAgent, Accept: "application/json" };
    if (st.etag && st.corpo) headers["If-None-Match"] = st.etag;
    if (st.modificado && st.corpo) headers["If-Modified-Since"] = st.modificado;

    const t0 = this.agora();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.op.timeoutMs);
    let r;
    try {
      r = await this.fetch(url, { headers, signal: ctrl.signal });
    } catch (e) {
      clearTimeout(timer);
      return this.falha(st, url, null, e.name === "AbortError" ? `timeout de ${this.op.timeoutMs} ms` : `erro de rede: ${e.message}`, coleta);
    }
    try {
      const retryAfter = r.headers.get("retry-after");
      if (r.status === 304 && st.corpo) {
        this.estado.seguidos404 = 0;
        st.falhas = 0;
        st.ultimoOk = coleta;
        return { ok: true, url, status: 304, alterado: false, dados: JSON.parse(st.corpo), texto: st.corpo, etag: st.etag, horario_coleta: coleta, ms: this.agora() - t0 };
      }
      if (r.status === 200) {
        const texto = await r.text();
        let dados;
        try {
          dados = JSON.parse(texto);
        } catch {
          return this.falha(st, url, 200, "resposta 200 que não é JSON válido", coleta);
        }
        this.estado.seguidos404 = 0;
        const alterado = texto !== st.corpo;
        Object.assign(st, { etag: r.headers.get("etag"), modificado: r.headers.get("last-modified"), corpo: texto, falhas: 0, proximaEm: 0, ultimoOk: coleta });
        return { ok: true, url, status: 200, alterado, dados, texto, etag: st.etag, horario_coleta: coleta, ms: this.agora() - t0 };
      }
      if (r.status === 404) {
        this.estado.seguidos404 += 1;
        if (this.estado.seguidos404 >= this.op.limite404Seguidos) {
          this.pausar(this.op.pausa404Ms, `${this.estado.seguidos404} respostas 404 seguidas`);
        }
        st.falhas += 1;
        st.proximaEm = this.agora() + 60000; // fixo: o disjuntor global já segura sequências; atraso máximo de 1 min quando o arquivo surgir
        return { ok: false, url, status: 404, nao_publicado: true, erro: "arquivo ainda não publicado (404)", horario_coleta: coleta };
      }
      const espera = segundosRetryAfter(retryAfter, this.agora());
      if (r.status === 403 || r.status === 429) {
        this.pausar(espera ?? this.op.pausaBloqueioMs, `TSE respondeu ${r.status}${espera ? ` com Retry-After` : ""}; pausa preventiva`);
        return this.falha(st, url, r.status, `bloqueio ou limite (${r.status})`, coleta, espera);
      }
      if (r.status === 503 && espera) this.pausar(espera, "TSE respondeu 503 com Retry-After");
      return this.falha(st, url, r.status, `HTTP ${r.status}`, coleta, espera);
    } finally {
      clearTimeout(timer);
    }
  }

  falha(st, url, status, erro, coleta, esperaMs = null) {
    st.falhas += 1;
    const exp = Math.min(this.op.backoffMaxMs, this.op.backoffBaseMs * 2 ** (st.falhas - 1));
    const variacao = exp * 0.2 * Math.random();
    st.proximaEm = this.agora() + Math.max(esperaMs ?? 0, exp + variacao);
    return { ok: false, url, status, erro, horario_coleta: coleta };
  }
}

export function segundosRetryAfter(valor, agora) {
  if (!valor) return null;
  if (/^\d+$/.test(valor.trim())) return Number(valor) * 1000;
  const t = Date.parse(valor);
  return Number.isFinite(t) ? Math.max(0, t - agora) : null;
}
