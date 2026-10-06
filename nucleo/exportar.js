// Exportação CSV a partir dos JSON do contrato. Formato pensado para o Excel em português:
// separador ";", decimal com vírgula, UTF-8 com BOM. Cada linha leva origem e horários.

const BOM = "﻿";

function celula(v) {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : v.toFixed(4).replace(".", ",");
  const s = String(v);
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function linhaCsv(valores) {
  return valores.map(celula).join(";");
}

function colunasResultado(r, numeros) {
  const i = r?.indicadores ?? {};
  const porNumero = Object.fromEntries((r?.candidatos || []).map((c) => [c.numero, c]));
  return [
    r?.secoes?.total, r?.secoes?.totalizadas, i.pct_totalizadas,
    r?.eleitorado?.total, r?.eleitorado?.comparecimento, i.pct_comparecimento, r?.eleitorado?.abstencao, i.pct_abstencao,
    r?.votos?.total, r?.votos?.validos_computados, i.pct_validos, r?.votos?.brancos, i.pct_brancos, r?.votos?.nulos_total, i.pct_nulos,
    ...numeros.flatMap((n) => [porNumero[n]?.votos ?? null, porNumero[n]?.pct_validos ?? null]),
    r?.disputa?.situacao, r?.disputa?.lider, r?.disputa?.diferenca_votos, r?.disputa?.diferenca_pontos,
    typeof r?.horario?.totalizacao === "object" && r?.horario?.totalizacao ? `${r.horario.totalizacao.min ?? ""} a ${r.horario.totalizacao.max ?? ""}` : r?.horario?.totalizacao,
  ];
}

function cabecalho(numeros) {
  return [
    "recorte", "nome", "tipo", "origem", "regiao",
    "secoes_previstas", "secoes_totalizadas", "pct_totalizadas",
    "eleitorado", "comparecimento", "pct_comparecimento", "abstencao", "pct_abstencao",
    "votos_total", "validos", "pct_validos", "brancos", "pct_brancos", "nulos", "pct_nulos",
    ...numeros.flatMap((n) => [`votos_${n}`, `pct_validos_${n}`]),
    "situacao_disputa", "lider", "diferenca_votos", "diferenca_pontos",
    "horario_totalizacao_tse", "situacao_coleta", "coletado_em", "url_fonte", "gerado_em", "eleicao", "turno", "cargo",
  ];
}

export function csvPresidente(snap) {
  const numeros = snap.candidatos.map((c) => c.numero);
  const el = snap.eleicao ?? {};
  const fim = (coleta) => [coleta?.situacao, coleta?.ultimo_sucesso, coleta?.url, snap.gerado_em, el.eleicao, el.turno, el.cargo_nome];
  const linhas = [linhaCsv(cabecalho(numeros))];
  linhas.push(linhaCsv(["br", "Brasil", "brasil", "TSE (total nacional publicado)", "", ...colunasResultado(snap.brasil.oficial, numeros), ...fim(snap.brasil.coleta)]));
  linhas.push(linhaCsv(["br-calc", "Brasil (27 UFs + exterior)", "brasil", "calculado pelo painel", "", ...colunasResultado(snap.brasil.calculado, numeros), ...fim({})]));
  for (const reg of Object.values(snap.regioes)) {
    linhas.push(linhaCsv([reg.codigo, reg.nome, "regiao", "calculado pelo painel", reg.codigo, ...colunasResultado(reg.resultado, numeros), ...fim({})]));
  }
  for (const t of Object.values(snap.territorios)) {
    linhas.push(linhaCsv([t.codigo, t.nome, t.tipo, "TSE (recorte da base nacional)", t.regiao ?? "", ...colunasResultado(t.resultado, numeros), ...fim(t.coleta)]));
  }
  return BOM + linhas.join("\r\n") + "\r\n";
}

export function csvGovernador(snap) {
  const el = snap.eleicao ?? {};
  const linhas = [];
  for (const u of Object.values(snap.ufs)) {
    // cada UF tem seus candidatos: colunas por posição (1º e 2º mais votados) em vez de por número
    const r = u.resultado;
    const ordem = [...(r?.candidatos || [])].sort((a, b) => (b.votos ?? -1) - (a.votos ?? -1) || a.numero.localeCompare(b.numero));
    const nomes = Object.fromEntries(u.candidatos.map((c) => [c.numero, c.nome_urna]));
    linhas.push(linhaCsv([
      u.codigo, u.nome, "TSE (recorte da base nacional)",
      r?.secoes?.totalizadas, r?.secoes?.total, r?.indicadores?.pct_totalizadas,
      r?.votos?.validos_computados, r?.votos?.brancos, r?.votos?.nulos_total,
      ...[0, 1].flatMap((i) => [ordem[i]?.numero, nomes[ordem[i]?.numero], ordem[i]?.votos, ordem[i]?.pct_validos]),
      r?.disputa?.lider, r?.disputa?.diferenca_votos, r?.disputa?.diferenca_pontos,
      r?.horario?.totalizacao, u.coleta?.situacao, u.coleta?.ultimo_sucesso, u.coleta?.url, snap.gerado_em, el.eleicao, el.turno, el.cargo_nome,
    ]));
  }
  const cab = [
    "uf", "nome", "origem", "secoes_totalizadas", "secoes_previstas", "pct_totalizadas", "validos", "brancos", "nulos",
    "cand1_numero", "cand1_nome", "cand1_votos", "cand1_pct_validos", "cand2_numero", "cand2_nome", "cand2_votos", "cand2_pct_validos",
    "lider", "diferenca_votos", "diferenca_pontos", "horario_totalizacao_tse", "situacao_coleta", "coletado_em", "url_fonte", "gerado_em", "eleicao", "turno", "cargo",
  ];
  return BOM + [linhaCsv(cab), ...linhas].join("\r\n") + "\r\n";
}
