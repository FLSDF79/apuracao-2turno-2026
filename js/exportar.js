// Exportação CSV/JSON do que a tela recebeu do coletor, com origem e horário.
// Não recalcula nada: serializa os números como vieram.
import { UFS, REGIOES } from "./contrato.js";

const ORDEM = ["br", ...REGIOES.map((r) => r.id), ...UFS, "zz"];

function celula(v) {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

// CSV com ";" (padrão do Excel em pt-BR) e ponto decimal (para não ambiguar com milhares).
export function linhasCSV(cab, linhas) {
  return "﻿" + [cab, ...linhas].map((l) => l.map(celula).join(";")).join("\r\n") + "\r\n";
}

export function csvTerritorios(modelo, fonteURL) {
  const [a, b] = modelo.candidatos.principais;
  const cab = [
    "territorio", "nome", "tipo", "regiao", "situacao",
    `votos_${a.numero}`, `pct_validos_${a.numero}`, `votos_${b.numero}`, `pct_validos_${b.numero}`,
    "lider", "margem_votos", "margem_pp",
    "secoes_totalizadas", "secoes_previstas", "secoes_pct",
    "votos_validos", "base_pct_validos", "brancos", "nulos", "anulados_sub_judice", "total_votos",
    "eleitorado", "comparecimento", "comparecimento_pct", "abstencao", "abstencao_pct",
    "totalizado_tse", "coletado_em", "eleicao", "turno", "modo", "origem", "arquivo_painel"
  ];
  const origens = Object.fromEntries(modelo.fontes.map((f) => [f.id, f.origem]));
  const linhas = ORDEM.map((id) => {
    const t = modelo.territorios[id];
    if (!t) return null;
    const ca = t.candidatos[a.numero] || {}, cb = t.candidatos[b.numero] || {};
    return [
      id, t.nome, t.tipo, t.regiao, t.situacao,
      ca.votos, ca.pct, cb.votos, cb.pct,
      t.lider, t.margem?.votos, t.margem?.pp,
      t.secoes?.totalizadas, t.secoes?.previstas, t.secoes?.pct,
      t.votos?.validos, t.votos?.basePct, t.votos?.brancos, t.votos?.nulos, t.votos?.anuladosSubJudice, t.votos?.total,
      t.eleitorado?.total, t.comparecimento?.votos, t.comparecimento?.pct, t.abstencao?.votos, t.abstencao?.pct,
      t.totalizado, modelo.coleta.em, modelo.eleicao.codigo, modelo.eleicao.turno, modelo.eleicao.modo,
      origens[id] || (t.tipo === "regiao" ? "soma do coletor (base TSE)" : "base TSE"), fonteURL
    ];
  }).filter(Boolean);
  return linhasCSV(cab, linhas);
}

export function csvHistorico(pontos, candidatos) {
  const [a, b] = candidatos;
  const cab = ["totalizado_tse", "coletado_em", "secoes_pct", `votos_${a.numero}`, `pct_${a.numero}`, `votos_${b.numero}`, `pct_${b.numero}`, "margem_votos", "correcao_oficial"];
  return linhasCSV(cab, pontos.map((p) => [new Date(p.t).toISOString(), p.em, p.secoesPct, p.votos[a.numero], p.pct[a.numero], p.votos[b.numero], p.pct[b.numero], p.margemVotos, p.correcao ? "sim" : "nao"]));
}

export function jsonCompleto(snapBruto, fonteURL, agoraISO) {
  return JSON.stringify({ exportado_em: agoraISO, origem_painel: fonteURL, aviso: "Dados do TSE repassados pelo coletor do painel independente. Não é publicação oficial.", snapshot: snapBruto }, null, 1);
}

export function baixar(nome, conteudo, tipo) {
  const blob = new Blob([conteudo], { type: tipo });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: nome });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
