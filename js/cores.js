// Associação fixa candidato → cor (azul ou vermelho). Não muda quando a liderança muda.
// A pessoa pode trocar no botão "Cores"; a escolha fica salva neste navegador.
export const PALETAS = {
  azul: { nome: "azul", base: "#3d74ff", texto: "#7ea3ff", textoClaro: "#1f4fd6", faixas: ["#c7d6ff", "#8eaaff", "#4f7dff", "#1c46c4"] },
  vermelho: { nome: "vermelho", base: "#e5383b", texto: "#ff7b7d", textoClaro: "#b51d22", faixas: ["#ffcfcf", "#ff9696", "#ec4a4d", "#a8161b"] }
};

const CHAVE = "apuracao2026.cores";

function ler(armazem) {
  try { return JSON.parse(armazem?.getItem(CHAVE) || "null"); } catch { return null; }
}

// Retorna { "22": "azul", "13": "vermelho" } a partir da config e da escolha salva.
export function carregarCores(candidatos, armazem = globalThis.localStorage) {
  const padrao = Object.fromEntries(candidatos.map((c) => [c.numero, c.cor]));
  const salvo = ler(armazem);
  const valido = salvo && candidatos.every((c) => PALETAS[salvo[c.numero]]) && new Set(candidatos.map((c) => salvo[c.numero])).size === candidatos.length;
  return valido ? { ...padrao, ...salvo } : padrao;
}

export function salvarCores(mapa, armazem = globalThis.localStorage) {
  try { armazem?.setItem(CHAVE, JSON.stringify(mapa)); } catch { /* navegador sem armazenamento: vale só nesta visita */ }
}

export function trocar(mapa) {
  const [a, b] = Object.keys(mapa);
  return { [a]: mapa[b], [b]: mapa[a] };
}

export function corDe(mapa, numero) {
  return PALETAS[mapa[numero]] || null;
}
