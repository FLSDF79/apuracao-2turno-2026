#!/usr/bin/env node
// Confere um painel publicado (produção ou ensaio): página no ar, dados do coletor frescos e no contrato v1.
//   node publicacao/conferir-no-ar.mjs https://apuracao-2turno-2026.<conta>.workers.dev [--esperar 90]
// Sai com código 1 se algo essencial falhar. Usado no fim do deploy e no roteiro do dia 25.
import { parseArgs } from "node:util";

const { values: a, positionals } = parseArgs({ allowPositionals: true, options: { esperar: { type: "string", default: "0" } } });
const base = (positionals[0] || "").replace(/\/$/, "");
if (!base) {
  console.error("uso: node publicacao/conferir-no-ar.mjs <url do painel> [--esperar segundos]");
  process.exit(2);
}

async function obter(caminho) {
  const r = await fetch(base + caminho, { headers: { "cache-control": "no-cache" } });
  return { status: r.status, tipo: r.headers.get("content-type"), texto: await r.text() };
}

export async function conferir() {
  const itens = [];
  const ok = (nome, cond, detalhe = "") => itens.push({ nome, ok: !!cond, detalhe });
  const pagina = await obter("/");
  ok("página", pagina.status === 200 && /Fabiano Silva/.test(pagina.texto), `HTTP ${pagina.status}`);
  const geo = await obter("/data/br-uf.geojson");
  ok("mapa (geojson)", geo.status === 200, `HTTP ${geo.status}`);
  const r = await obter("/dados/v1/presidente.json");
  ok("presidente.json", r.status === 200, `HTTP ${r.status}`);
  if (r.status !== 200) return itens;
  const p = JSON.parse(r.texto);
  ok("contrato v1", p.schema === "apuracao-2t-2026/v1", p.schema);
  ok("coleta", ["ok", "atrasada"].includes(p.coleta_geral?.estado), `${p.coleta_geral?.estado}${p.coleta_geral?.mensagem ? `: ${p.coleta_geral.mensagem}` : ""}`);
  const s = await obter("/dados/v1/saude.json");
  if (s.status === 200) {
    const sd = JSON.parse(s.texto);
    // gerado_em só muda quando o dado muda; "rodando" é a hora da última rodada do coletor
    const idade = (Date.now() - Date.parse(sd.coletor?.rodada_em ?? 0)) / 1000;
    ok("coletor rodando (última rodada há menos de 60 s)", idade < 60, `${Math.round(idade)} s`);
    if (p.tempos) itens.push({ nome: "tempos", ok: true, detalhe: `consulta ok ${p.tempos.ultima_consulta_ok ?? "-"} · fonte ${p.tempos.publicacao_fonte ?? "-"} · última mudança ${p.tempos.ultima_mudanca ?? "-"}` });
    ok("configuração do TSE lida", sd.configuracao?.coletada_em, `${sd.configuracao?.coletada_em ?? "nunca"}${sd.configuracao?.ultimo_erro ? ` (erro: ${JSON.stringify(sd.configuracao.ultimo_erro)})` : ""}`);
    itens.push({ nome: "HTTP do TSE nesta execução", ok: true, detalhe: JSON.stringify(sd.coletor?.status_http) });
  }
  itens.push({ nome: "estado da publicação", ok: true, detalhe: `${p.estado_publicacao} · eleição ${p.eleicao?.eleicao ?? "-"} (${p.eleicao?.estado}) · modo ${p.modo}` });
  if (p.brasil?.oficial) itens.push({ nome: "totalização Brasil", ok: true, detalhe: `${p.brasil.oficial.indicadores.pct_totalizadas.toFixed(2)}% · conferência ${p.conferencia?.classificacao?.codigo}` });
  for (const f of ["governador.json", "historico.json", "export/presidente.csv"]) {
    const x = await obter(`/dados/v1/${f}`);
    ok(f, x.status === 200, `HTTP ${x.status}`);
  }
  return itens;
}

const limite = Date.now() + Number(a.esperar) * 1000;
let itens;
for (;;) {
  try {
    itens = await conferir();
  } catch (e) {
    itens = [{ nome: "acesso", ok: false, detalhe: String(e) }];
  }
  if (itens.every((i) => i.ok) || Date.now() > limite) break;
  await new Promise((r) => setTimeout(r, 10000)); // coletor recém-publicado leva alguns segundos para a 1ª rodada
}
for (const i of itens) console.log(`${i.ok ? "ok   " : "FALHA"} ${i.nome}${i.detalhe ? ` · ${i.detalhe}` : ""}`);
process.exit(itens.every((i) => i.ok) ? 0 : 1);
