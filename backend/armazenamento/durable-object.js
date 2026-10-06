// Armazenamento do coletor num Durable Object (SQLite, plano gratuito da Cloudflare).
// O que cresce com a noite (resultados, histórico e séries por recorte, listas em blocos de 100) fica em
// chaves separadas, longe do limite de 2 MB por valor. Corpos oficiais ficam em "bruto:<sha256>", gravados
// uma vez só. Cada chave só é regravada quando o conteúdo muda: o plano gratuito conta linhas gravadas
// por dia, e numa rodada sem novidade do TSE só mudam a raiz (horários da coleta) e as saídas.

const DIVIDIDOS = ["ultimos", "historico", "series", "recortes"];
const LISTAS = ["snapshots", "eventos", "correcoes"];
const BLOCO = 100; // bloco pequeno: entrada nova num índice regrava no máximo 100 entradas

/** Último valor gravado de cada chave, por storage (o Durable Object costuma ficar vivo entre alarmes). */
const gravados = new WeakMap();
function memoria(storage) {
  if (!gravados.has(storage)) gravados.set(storage, new Map());
  return gravados.get(storage);
}

// Valores do estado são gravados como texto JSON: a rodada já precisa do texto para saber se mudou, e
// gravar o texto evita uma segunda serialização pelo storage.
const ler = (v) => (typeof v === "string" ? JSON.parse(v) : v);

/** Esquece o que já foi gravado neste storage (use depois de storage.deleteAll()): tudo volta a ser gravado. */
export function esquecerGravados(storage) {
  gravados.delete(storage);
}

export async function carregarEstado(storage) {
  const raiz = ler(await storage.get("estado:raiz"));
  if (!raiz) return null;
  const estado = { ...raiz };
  for (const k of DIVIDIDOS) {
    estado[k] = {};
    for (const [chave, valor] of await storage.list({ prefix: `estado:${k}:` })) estado[k][chave.slice(`estado:${k}:`.length)] = ler(valor);
  }
  for (const k of LISTAS) {
    const blocos = [...(await storage.list({ prefix: `estado:lista:${k}:` }))].sort((a, b) => Number(a[0].split(":").pop()) - Number(b[0].split(":").pop()));
    estado[k] = blocos.flatMap(([, v]) => ler(v));
  }
  estado.config = ler(await storage.get("estado:config")) ?? raiz.config ?? null;
  estado.fonte = { ...(raiz.fonte || {}), urls: ler(await storage.get("estado:urls")) || {} };
  return estado;
}

export async function gravarEstado(storage, estado) {
  const mem = memoria(storage);
  const lote = {};
  const listas = [];
  const { fonte, ...resto } = estado;
  const raiz = { ...resto, config: undefined, fonte: { ...fonte, urls: undefined } };
  lote["estado:config"] = estado.config ?? null;
  for (const k of DIVIDIDOS) {
    delete raiz[k];
    for (const [id, valor] of Object.entries(estado[k] || {})) lote[`estado:${k}:${id}`] = valor;
  }
  for (const k of LISTAS) {
    delete raiz[k];
    const lista = estado[k] || [];
    const marca = mem.get(`lista:${k}`);
    if (marca && marca.ref === lista) continue; // lista não mudou nesta rodada
    const n = Math.ceil(lista.length / BLOCO);
    for (let i = 0; i < n; i++) {
      const bloco = lista.slice(i * BLOCO, (i + 1) * BLOCO);
      const chave = `estado:lista:${k}:${i}`;
      const m = mem.get(chave);
      // bloco igual ao gravado: mesmas entradas (imutáveis) nas pontas e mesmo tamanho
      if (m && m.ref && m.ref.length === bloco.length && m.ref[0] === bloco[0] && m.ref[m.ref.length - 1] === bloco[bloco.length - 1]) continue;
      lote[chave] = bloco;
    }
    if (!marca || marca.n !== n) {
      const antigos = await storage.list({ prefix: `estado:lista:${k}:` });
      const sobrando = [...antigos.keys()].filter((c) => Number(c.split(":").pop()) >= n);
      if (sobrando.length) await storage.delete(sobrando);
    }
    listas.push([`lista:${k}`, { ref: lista, n }]);
  }
  lote["estado:raiz"] = raiz;
  lote["estado:urls"] = fonte?.urls || {};
  const n = await gravarEmLotes(storage, lote, { mutaveis: ["estado:urls"] });
  for (const [k, v] of listas) mem.set(k, v);
  return n;
}

export async function gravarSaidas(storage, saidas, brutos = {}) {
  const lote = {};
  for (const [caminho, conteudo] of Object.entries(saidas)) lote[`saida:${caminho}`] = typeof conteudo === "string" ? conteudo : JSON.stringify(conteudo);
  for (const [sha, texto] of Object.entries(brutos)) lote[`bruto:${sha}`] = texto;
  return gravarEmLotes(storage, lote);
}

export async function lerBruto(storage, sha) {
  return /^[0-9a-f]{64}$/.test(sha) ? storage.get(`bruto:${sha}`) : undefined;
}

/**
 * Grava só as chaves que mudaram desde a última gravação; devolve quantas foram gravadas.
 * Valor que é o mesmo objeto da gravação anterior não mudou (a rodada nunca altera valores no lugar),
 * exceto as chaves em `mutaveis` (estado do cliente HTTP), que são comparadas pelo conteúdo.
 */
async function gravarEmLotes(storage, lote, { mutaveis = [] } = {}) {
  const mem = memoria(storage);
  const entradas = [];
  for (const [k, v] of Object.entries(lote)) {
    const m = mem.get(k);
    if (m && m.ref === v && typeof v === "object" && !mutaveis.includes(k)) continue;
    const texto = typeof v === "string" ? v : JSON.stringify(v);
    if (m && m.texto === texto) {
      m.ref = v;
      continue;
    }
    entradas.push([k, v, texto]);
  }
  for (let i = 0; i < entradas.length; i += 128) await storage.put(Object.fromEntries(entradas.slice(i, i + 128).map(([k, , texto]) => [k, texto]))); // limite de 128 chaves por put
  for (const [k, v, texto] of entradas) mem.set(k, { ref: v, texto });
  return entradas.length;
}
