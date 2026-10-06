#!/usr/bin/env node
// Roda todas as baterias de teste das três frentes e grava as evidências em docs/evidencias/:
//   execucao.md (resumo com contagens e comandos), logs/*.txt (saída completa), telas/ (capturas).
// Inclui, se existirem, os resultados de `node ensaio/rodar.mjs`, `node publicacao/ponta-a-ponta.mjs`
// e do teste de carga (ensaio/saida/carga.json).
//   node publicacao/evidencias.mjs
import { spawnSync } from "node:child_process";
import { cp, mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const DEST = join(RAIZ, "docs/evidencias");
await mkdir(join(DEST, "logs"), { recursive: true });

const BATERIAS = [
  { id: "fontes", frente: "1 · fontes", titulo: "Consistência dos arquivos oficiais guardados", cmd: ["python3", ["-m", "unittest", "discover", "-s", "tests", "-v"]] },
  { id: "coletor", frente: "2 · coletor e cálculo", titulo: "Coletor, normalização, agregação, conferência, histórico", cmd: ["node", ["--test", ...lista("tests/js", ".test.mjs")]] },
  { id: "interface", frente: "3 · painel", titulo: "Leitura do contrato pela página, estados, cores, horários, exportação", cmd: ["node", ["--test", ...lista("tests/interface", ".test.js")]] },
  { id: "navegador", frente: "3 · painel", titulo: "Página no navegador (Chromium): estados, mapa, acessibilidade", cmd: ["node", ["--test", ...lista("tests/navegador", ".test.mjs")]] },
  { id: "publicacao", frente: "4 · publicação", titulo: "Noite simulada inteira pelo coletor, TSE simulado, site e deploy", cmd: ["node", ["--test", ...lista("tests/publicacao", ".test.mjs")]] },
  { id: "exemplos", frente: "2 · coletor e cálculo", titulo: "Exemplos do contrato regenerados sem diferença", cmd: ["sh", ["-c", "node tools/gerar-exemplo.mjs && git diff --exit-code --stat exemplos && echo 'exemplos atualizados'"]] },
];

function lista(pasta, sufixo) {
  try {
    return require_ls(join(RAIZ, pasta)).filter((f) => f.endsWith(sufixo)).map((f) => join(pasta, f));
  } catch {
    return [];
  }
}
function require_ls(p) {
  return spawnSync("ls", [p], { encoding: "utf8" }).stdout.trim().split("\n").filter(Boolean);
}

// capturas em JPEG (qualidade 80) para o repositório; usa Pillow se houver, senão copia o PNG
async function jpegs(origem, destino, filtro) {
  await mkdir(destino, { recursive: true });
  for (const f of (await readdir(origem)).filter((x) => x.endsWith(".png") && filtro(x))) {
    const r = spawnSync("python3", ["-c", "import sys;from PIL import Image;im=Image.open(sys.argv[1]).convert('RGB');im=im.resize((1280,int(im.height*1280/im.width))) if im.width>1280 else im;im.save(sys.argv[2],quality=75,optimize=True)", join(origem, f), join(destino, f.replace(/\.png$/, ".jpg"))]);
    if (r.status !== 0) await cp(join(origem, f), join(destino, f));
  }
}

const linhas = [];
for (const b of BATERIAS) {
  const t0 = Date.now();
  const r = spawnSync(b.cmd[0], b.cmd[1], { cwd: RAIZ, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const saida = `${r.stdout}\n${r.stderr}`;
  await writeFile(join(DEST, "logs", `${b.id}.txt`), `$ ${b.cmd[0]} ${b.cmd[1].join(" ")}\n\n${saida}`);
  const node = saida.match(/^# pass (\d+)[\s\S]*?^# fail (\d+)/m);
  const py = saida.match(/^Ran (\d+) tests?/m);
  const passou = node ? `${node[1]} ok, ${node[2]} falha(s)` : py ? `${py[1]} testes, ${/^OK/m.test(saida) ? "todos ok" : "com falhas"}` : r.status === 0 ? "ok" : "falhou";
  linhas.push(`| ${b.frente} | ${b.titulo} | ${r.status === 0 ? "✅" : "❌"} ${passou} | ${((Date.now() - t0) / 1000).toFixed(1)} s | [log](logs/${b.id}.txt) |`);
  console.log(`${r.status === 0 ? "ok   " : "FALHA"} ${b.id}: ${passou}`);
}

const extras = [];
const pap = join(RAIZ, "ensaio/saida/ponta-a-ponta/resultado.json");
if (existsSync(pap)) {
  const r = JSON.parse(await readFile(pap, "utf8"));
  extras.push(`## Ponta a ponta com dados oficiais reais (1º turno)\n\n${r.quando} · \`node publicacao/ponta-a-ponta.mjs\`\n\n| | Verificação | Detalhe |\n|---|---|---|\n${r.itens.map((i) => `| ${i.ok ? "✅" : "❌"} | ${i.nome} | ${String(i.detalhe).replace(/\|/g, "/").replace(/\n/g, " ").slice(0, 140)} |`).join("\n")}`);
  await jpegs(join(RAIZ, "ensaio/saida/ponta-a-ponta/telas"), join(DEST, "telas/ponta-a-ponta"), () => true);
}
const ens = join(RAIZ, "ensaio/saida/resultado.json");
if (existsSync(ens)) {
  const r = JSON.parse(await readFile(ens, "utf8"));
  const marcos = r.marcos.map((m) => `| ${m.t} | ${m.titulo} | ${m.estado_publicacao} | ${m.pct_totalizadas ?? "—"} | ${m.conferencia ?? "—"} | ${m.coleta} | ${m.eleito ? "sim" : "não"} | ${m.pagina ? `${m.pagina.saude ?? ""}` : ""} |`).join("\n");
  extras.push(`## Noite simulada completa, relógio real (\`node ensaio/rodar.mjs\`)\n\nInício ${r.inicio} · escala ${r.escala}× · ${r.linhas.length} conferências · **${r.falhas.length} falha(s)**\n\n| min | Marco | Estado | % tot. | Conferência | Coleta | Eleito | Página |\n|---|---|---|---|---|---|---|---|\n${marcos}\n\n${r.falhas.length ? "Falhas:\n\n" + r.falhas.map((f) => `- ${JSON.stringify(f)}`).join("\n") + "\n\n" : ""}${r.observacoes?.length ? "Observações (para o dono do código):\n\n" + r.observacoes.map((o) => `- \`${o.regra}\` (min ${o.primeira_vez_t}): ${o.detalhe}`).join("\n") + "\n\n" : ""}**Latência de atualização** (do arquivo novo no TSE simulado até aparecer): coletor ${JSON.stringify(r.latencia?.coletor)} s; tela ${JSON.stringify(r.latencia?.tela)} s.\n\n**Carga no TSE simulado:** ${r.carga.total} requisições, pico ${r.carga.max_por_minuto}/min, status ${JSON.stringify(r.carga.status)}.\n\n**Carga por visitante no Worker:** ${JSON.stringify(r.cargaVisitante)}.`);
  // só a TV de cada marco e o celular do fim: o suficiente para conferir sem pesar o repositório
  if (existsSync(join(RAIZ, "ensaio/saida/telas"))) await jpegs(join(RAIZ, "ensaio/saida/telas"), join(DEST, "telas/ensaio"), (f) => f.endsWith("-tv.png") || f === "22-final-celular.png");
}
const carga = join(RAIZ, "ensaio/saida/carga.json");
if (existsSync(carga)) extras.push(`## Teste de carga\n\n\`\`\`json\n${await readFile(carga, "utf8")}\n\`\`\``);

await writeFile(join(DEST, "execucao.md"), `# Execução das baterias de teste\n\nGerado por \`node publicacao/evidencias.mjs\` em ${new Date().toISOString()} (commit ${spawnSync("git", ["rev-parse", "--short", "HEAD"], { cwd: RAIZ, encoding: "utf8" }).stdout.trim()}).\n\n| Frente | Bateria | Resultado | Tempo | Saída |\n|---|---|---|---|---|\n${linhas.join("\n")}\n\n${extras.join("\n\n")}\n`);
console.log(`evidências em ${DEST}`);
