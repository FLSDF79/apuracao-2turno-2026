#!/usr/bin/env node
// Gera os exemplos do contrato de dados em exemplos/:
//   exemplos/ensaio-1turno/   arquivos REAIS do 1º turno (04/10/2026), modo "ensaio"
//   exemplos/simulado-2turno/ noite de 2º turno SIMULADA a partir do 1º turno (40% apurado, SP atrasado)
// Uso: node tools/gerar-exemplo.mjs
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Fonte } from "../backend/conectores/http.js";
import { rodada } from "../backend/coletor/rodada.js";
import { fetchDeFixtures } from "../backend/conectores/fixtures.js";
import { carregarBase, montarSite, fetchSimulado } from "../backend/conectores/simulador.js";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const FIX = join(RAIZ, "tests/fixtures/tse-2026-10-06");

function relogio(iso) {
  let t = Date.parse(iso);
  return { agora: () => t, avancar: (ms) => (t += ms), ajustar: (iso2) => (t = Date.parse(iso2)), esperar: async (ms) => { t += ms; } };
}

// "25/10/2026 18:10:00" (Brasília) → ISO UTC, para o relógio do coletor andar junto com o do TSE simulado
const brasiliaParaIso = (s) => {
  const [d, h] = s.split(" ");
  return `${d.split("/").reverse().join("-")}T${h}-03:00`;
};

async function gravar(pasta, saidas) {
  for (const [caminho, conteudo] of Object.entries(saidas)) {
    const destino = join(RAIZ, "exemplos", pasta, caminho);
    await mkdir(dirname(destino), { recursive: true });
    await writeFile(destino, typeof conteudo === "string" ? conteudo : JSON.stringify(conteudo, null, 1) + "\n");
  }
}

{
  const rel = relogio("2026-10-06T13:00:00Z");
  const r = await rodada(new Fonte({ fetch: fetchDeFixtures(FIX), ...rel }), null, { modo: "ensaio" });
  await gravar("ensaio-1turno", r.saidas);
}
{
  const base = await carregarBase(FIX);
  const rel = relogio("2026-10-25T20:00:00Z");
  let site;
  const fonte = new Fonte({ fetch: fetchSimulado(() => site), ...rel });
  let estado = null;
  const passos = [
    { hora: "25/10/2026 17:20:00", fracao: { padrao: 0.1 } },
    { hora: "25/10/2026 17:40:00", fracao: { padrao: 0.25, ac: 0.3 } },
    { hora: "25/10/2026 18:00:00", fracao: { padrao: 0.4, ac: 0.28 } }, // correção no AC
    { hora: "25/10/2026 18:10:00", fracao: { padrao: 0.4, ac: 0.28 }, horaPorRecorte: { sp: "25/10/2026 18:00:00" }, brFracaoExtra: { sp: 0.45 } },
  ];
  let r;
  for (const p of passos) {
    site = montarSite(base, p);
    rel.ajustar(brasiliaParaIso(p.hora)); // coleta 30 s depois da totalização simulada
    rel.avancar(30 * 1000);
    r = await rodada(fonte, estado, { modo: "simulacao" });
    estado = r.estado;
  }
  await gravar("simulado-2turno", r.saidas);
}
console.log("exemplos gerados em exemplos/");
