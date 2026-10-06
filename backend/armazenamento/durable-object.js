// Armazenamento do coletor num Durable Object (SQLite, plano gratuito da Cloudflare).
// O que cresce com a noite (resultados, histórico e séries por recorte, listas em blocos de 500) fica em
// chaves separadas, longe do limite de 2 MB por valor. Corpos oficiais ficam em "bruto:<sha256>", gravados
// uma vez só. Cada chave só é regravada quando o conteúdo muda: o plano gratuito conta linhas gravadas
// por dia, e numa rodada sem novidade do TSE só mudam a raiz (horários da coleta) e as saídas.

const DIVIDIDOS = ["ultimos", "historico", "series", "recortes"];
const LISTAS = ["snapshots", "eventos", "correcoes"];
const BLOCO = 500;

/** Último valor gravado de cada chave, por storage (o Durable Object costuma ficar vivo entre alarmes). */
const gravados = new WeakMap();
function memoria(storage) {
  if (!gravados.has(storage)) gravados.set(storage, new Map());
  return gravados.get(storage);
}

export async function carregarEstado(storage) {
  const raiz = await storage.get("estado:raiz");
  if (!raiz) return null;
  const estado = { ...raiz };
  for (const k of DIVIDIDOS) {
    estado[k] = {};
    for (const [chave, valor] of await storage.list({ prefix: `estado:${k}:` })) estado[k][chave.slice(`estado:${k}:`.length)] = valor;
  }
  for (const k of LISTAS) {
    const blocos = [...(await storage.list({ prefix: `estado:lista:${k}:` }))].sort((a, b) => Number(a[0].split(":").pop()) - Number(b[0].split(":").pop()));
    estado[k] = blocos.flatMap(([, v]) => v);
  }
  estado.fonte = { ...(raiz.fonte || {}), urls: (await storage.get("estado:urls")) || {} };
  return estado;
}

export async function gravarEstado(storage, estado) {
  const lote = {};
  const { fonte, ...resto } = estado;
  const raiz = { ...resto, fonte: { ...fonte, urls: undefined } };
  for (const k of DIVIDIDOS) {
    delete raiz[k];
    for (const [id, valor] of Object.entries(estado[k] || {})) lote[`estado:${k}:${id}`] = valor;
  }
  for (const k of LISTAS) {
    delete raiz[k];
    const lista = estado[k] || [];
    const n = Math.ceil(lista.length / BLOCO);
    for (let i = 0; i < n; i++) lote[`estado:lista:${k}:${i}`] = lista.slice(i * BLOCO, (i + 1) * BLOCO);
    const antigos = await storage.list({ prefix: `estado:lista:${k}:` });
    const sobrando = [...antigos.keys()].filter((c) => Number(c.split(":").pop()) >= n);
    if (sobrando.length) await storage.delete(sobrando);
  }
  lote["estado:raiz"] = raiz;
  lote["estado:urls"] = fonte?.urls || {};
  return gravarEmLotes(storage, lote);
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

/** Grava só as chaves que mudaram desde a última gravação; devolve quantas foram gravadas. */
async function gravarEmLotes(storage, lote) {
  const mem = memoria(storage);
  const entradas = Object.entries(lote).filter(([k, v]) => mem.get(k) !== JSON.stringify(v));
  for (let i = 0; i < entradas.length; i += 128) await storage.put(Object.fromEntries(entradas.slice(i, i + 128))); // limite de 128 chaves por put
  for (const [k, v] of entradas) mem.set(k, JSON.stringify(v));
  return entradas.length;
}
