// Guarda o estado do coletor no armazenamento de um Durable Object, dividido em várias chaves
// (um valor por recorte), para ficar longe do limite de tamanho por valor.

const DIVIDIDOS = ["ultimos", "coleta", "historico", "series", "recortes"];

export async function carregarEstado(storage) {
  const raiz = await storage.get("estado:raiz");
  if (!raiz) return null;
  const estado = { ...raiz };
  for (const k of DIVIDIDOS) {
    estado[k] = {};
    for (const [chave, valor] of await storage.list({ prefix: `estado:${k}:` })) estado[k][chave.slice(`estado:${k}:`.length)] = valor;
  }
  estado.fonte = { ...(raiz.fonte || {}), urls: {} };
  for (const [chave, valor] of await storage.list({ prefix: "estado:url:" })) estado.fonte.urls[chave.slice("estado:url:".length)] = valor;
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
  lote["estado:raiz"] = raiz;
  for (const [url, valor] of Object.entries(fonte?.urls || {})) lote[`estado:url:${url}`] = valor;
  await gravarEmLotes(storage, lote);
}

export async function gravarSaidas(storage, saidas) {
  const lote = {};
  for (const [caminho, conteudo] of Object.entries(saidas)) lote[`saida:${caminho}`] = typeof conteudo === "string" ? conteudo : JSON.stringify(conteudo);
  await gravarEmLotes(storage, lote);
}

async function gravarEmLotes(storage, lote) {
  const entradas = Object.entries(lote);
  for (let i = 0; i < entradas.length; i += 128) await storage.put(Object.fromEntries(entradas.slice(i, i + 128))); // limite de 128 chaves por put
}
