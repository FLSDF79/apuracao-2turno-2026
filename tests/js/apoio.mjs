import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "tse-2026-10-06");
export const ler = (rel) => JSON.parse(readFileSync(join(RAIZ, "oficial", rel), "utf8"));
export const presidente = (abr) => ler(`ele2026/6257/dados/${abr}/${abr}-c0001-e006257-u.json`);
export const governador = (uf) => ler(`ele2026/6259/dados/${uf}/${uf}-c0003-e006259-u.json`);
export const UFS_2T_GOV = ["ac", "am", "df", "es", "rj", "rn", "to"];

/** Relógio controlável para Fonte e rodada. */
export function relogio(inicio = "2026-10-25T20:00:00Z") {
  let t = Date.parse(inicio);
  return { agora: () => t, avancar: (ms) => (t += ms), esperar: async (ms) => { t += ms; } };
}
