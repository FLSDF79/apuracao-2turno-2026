// Exportação. O CSV por território e o JSON completo já saem prontos do coletor
// (export/*.csv e presidente.json, com origem e horários); aqui só o histórico vira CSV.

function celula(v) {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

// Mesmo padrão do export do coletor: ";" e decimal com vírgula, UTF-8 com BOM (abre no Excel em português).
const dec = (x) => (x === null || x === undefined ? "" : String(x).replace(".", ","));

export function linhasCSV(cab, linhas) {
  return "﻿" + [cab, ...linhas].map((l) => l.map(celula).join(";")).join("\r\n") + "\r\n";
}

export function csvHistorico(pontos, candidatos) {
  const [a, b] = candidatos;
  const cab = ["totalizacao_tse", "coletado_em", "pct_totalizadas", `votos_${a.numero}`, `pct_validos_${a.numero}`, `votos_${b.numero}`, `pct_validos_${b.numero}`, "correcao_oficial", "origem"];
  return linhasCSV(cab, pontos.map((p) => [
    new Date(p.t).toISOString(), p.em, dec(p.secoesPct), p.votos[a.numero], dec(p.pct[a.numero]), p.votos[b.numero], dec(p.pct[b.numero]),
    p.correcao ? "sim" : "nao", "TSE (arquivo nacional) via coletor do painel"
  ]));
}

export function baixar(nome, conteudo, tipo) {
  const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
  baixarURL(url, nome);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function baixarURL(url, nome) {
  const a = Object.assign(document.createElement("a"), { href: url, download: nome });
  document.body.appendChild(a);
  a.click();
  a.remove();
}
