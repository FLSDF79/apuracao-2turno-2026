// Registro de snapshots: cada arquivo oficial que muda de conteúdo ganha uma entrada com origem (URL),
// horário da fonte, horário da coleta, identificador da geração (idg), ETag e SHA-256 do corpo recebido.
// O corpo bruto é guardado pelo adaptador de armazenamento sob o próprio hash, então qualquer número
// exibido pode ser conferido contra o arquivo exato que o originou.

const MAX_INDICE = 5000;

/** SHA-256 em hexadecimal (Web Crypto: igual em Node 20+ e Cloudflare Workers). */
export async function sha256Hex(texto) {
  const dados = new TextEncoder().encode(texto);
  const h = await globalThis.crypto.subtle.digest("SHA-256", dados);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * @param {any[]} indice  lista atual (não é alterada)
 * @param {object} entrada  campos: tipo, disputa, eleicao, recorte, url, etag, idg, geracao, totalizacao, coletado_em, sha256, bytes, aceito, motivo
 */
export function acrescentarSnapshot(indice, entrada) {
  const novo = [...(indice || []), entrada];
  if (novo.length > MAX_INDICE) novo.splice(0, novo.length - MAX_INDICE);
  return novo;
}
