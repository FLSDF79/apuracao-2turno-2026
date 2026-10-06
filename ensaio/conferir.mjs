// Regras do prompt conferidas sobre cada snapshot do contrato v1 durante o ensaio.
// Independe do código do coletor: refaz as contas a partir dos inteiros publicados.
import { REGIOES, COMPONENTES_BRASIL } from "../nucleo/territorios.js";

const inteiro = (v) => v === null || Number.isInteger(v);

export function conferirSnapshot({ pres, saude, hist, anterior, t, modoEsperado = null }) {
  const falhas = [];
  const falha = (regra, detalhe) => falhas.push({ regra, detalhe });
  // observação: comportamento que diverge do texto do contrato mas não quebra regra do prompt (vai para o dono do código)
  const observacoes = [];
  const observar = (regra, detalhe) => observacoes.push({ regra, detalhe });

  if (pres.schema !== "apuracao-2t-2026/v1") falha("schema", pres.schema);
  // teste ou 1º turno nunca podem sair rotulados como apuração real do 2º turno
  if (modoEsperado && pres.modo !== modoEsperado) falha("modo", `arquivo diz modo "${pres.modo}", esperado "${modoEsperado}"`);
  const br = pres.brasil ?? {};
  const terr = pres.territorios ?? {};

  // votos sempre inteiros (null = ausente)
  for (const [id, r] of [["br", br.oficial], ["calc", br.calculado], ...Object.entries(terr).map(([k, v]) => [k, v.resultado])]) {
    if (!r) continue;
    for (const c of r.candidatos ?? []) if (!inteiro(c.votos)) falha("inteiros", `${id} ${c.numero} = ${c.votos}`);
    for (const [k, v] of Object.entries(r.votos ?? {})) if (!inteiro(v)) falha("inteiros", `${id} votos.${k} = ${v}`);
  }

  const completos = COMPONENTES_BRASIL.every((abr) => terr[abr]?.resultado);
  if (completos && br.calculado) {
    // soma dos 27 + exterior = coluna A (sem dupla contagem do DF nem do exterior)
    for (const c of br.calculado.candidatos) {
      const soma = COMPONENTES_BRASIL.reduce((s, abr) => s + (terr[abr].resultado.candidatos.find((x) => x.numero === c.numero)?.votos ?? 0), 0);
      if (soma !== c.votos) falha("soma-territorial", `${c.numero}: soma ${soma} ≠ calculado ${c.votos}`);
    }
    // regiões: soma dos inteiros das UFs, percentual depois; regiões + exterior = Brasil calculado
    let somaRegioes = {};
    for (const [sig, def] of Object.entries(REGIOES)) {
      const reg = pres.regioes?.[sig]?.resultado;
      if (!reg) {
        falha("regiao", `${sig} sem resultado`);
        continue;
      }
      const vvc = def.ufs.reduce((s, uf) => s + terr[uf].resultado.votos.validos_computados, 0);
      if (vvc !== reg.votos.validos_computados) falha("regiao", `${sig} vvc ${reg.votos.validos_computados} ≠ soma ${vvc}`);
      const st = def.ufs.reduce((s, uf) => s + terr[uf].resultado.secoes.totalizadas, 0);
      const ts = def.ufs.reduce((s, uf) => s + terr[uf].resultado.secoes.total, 0);
      if (ts && Math.abs(reg.indicadores.pct_totalizadas - (st * 100) / ts) > 1e-9) falha("regiao-totalizacao", `${sig} ${reg.indicadores.pct_totalizadas} ≠ ${(st * 100) / ts} (seções, não média)`);
      for (const c of reg.candidatos) {
        const v = def.ufs.reduce((s, uf) => s + (terr[uf].resultado.candidatos.find((x) => x.numero === c.numero)?.votos ?? 0), 0);
        if (v !== c.votos) falha("regiao", `${sig} ${c.numero} ${c.votos} ≠ ${v}`);
        if (vvc && Math.abs(c.pct_validos - (v * 100) / vvc) > 1e-9) falha("regiao-pct", `${sig} ${c.numero} pct ${c.pct_validos}`);
        somaRegioes[c.numero] = (somaRegioes[c.numero] ?? 0) + c.votos;
      }
    }
    for (const c of br.calculado.candidatos) {
      const v = (somaRegioes[c.numero] ?? 0) + (terr.zz.resultado.candidatos.find((x) => x.numero === c.numero)?.votos ?? 0);
      if (v !== c.votos) falha("regioes+exterior", `${c.numero} ${v} ≠ ${c.votos}`);
    }
  }

  // conferência: A e B nunca somados; diferença = A − B; "compatível" só com tudo igual e cobertura completa
  const conf = pres.conferencia;
  if (conf) {
    for (const l of conf.linhas) if (l.a !== null && l.b !== null && l.diferenca !== l.a - l.b) falha("conferencia-diferenca", `${l.chave}: ${l.diferenca} ≠ ${l.a} − ${l.b}`);
    if (conf.classificacao.codigo === "compativel") {
      if (conf.linhas.some((l) => l.diferenca !== 0)) falha("conferencia-compativel", "compatível com diferença ≠ 0");
      if (conf.colunas.a.faltando?.length) falha("conferencia-compativel", "compatível com recorte faltando");
      // O contrato diz "defasado → cobertura_incompleta"; o coletor hoje mantém "compatível" (com o aviso no motivo)
      // quando os valores guardados batem. Registrado como observação para a frente 2.
      if (conf.colunas.a.defasados?.length) observar("conferencia-compativel-defasado", `compatível com ${conf.colunas.a.defasados.length} recorte(s) defasado(s); contrato pede cobertura_incompleta`);
    }
  }

  // eleito só com a situação oficial "Eleito" no arquivo nacional
  const situacoes = (br.oficial?.candidatos ?? []).filter((c) => c.situacao === "Eleito").map((c) => c.numero);
  if (pres.eleito?.publicado && JSON.stringify(situacoes) !== JSON.stringify(pres.eleito.candidatos)) falha("eleito", `publicado ${pres.eleito.candidatos} mas situação ${situacoes}`);
  if (!pres.eleito?.publicado && situacoes.length) falha("eleito", "TSE publicou Eleito e o contrato não");

  // histórico não soma de novo: o último ponto é igual ao arquivo nacional da rodada
  const ult = hist.serie_brasil?.at(-1);
  if (ult && br.oficial) for (const c of br.oficial.candidatos) if (ult.votos[c.numero] !== c.votos && ult.idg === br.oficial.idg) falha("historico", `último ponto ${c.numero} ${ult.votos[c.numero]} ≠ nacional ${c.votos}`);

  // último dado válido preservado: um recorte que tinha resultado não pode sumir por erro
  if (anterior) for (const abr of COMPONENTES_BRASIL) if (anterior.pres.territorios?.[abr]?.resultado && !terr[abr]?.resultado) falha("ultimo-valido", `${abr} perdeu o resultado (${terr[abr]?.coleta?.situacao})`);

  return {
    falhas,
    observacoes,
    resumo: {
      estado_publicacao: pres.estado_publicacao,
      pct_totalizadas: br.oficial?.indicadores?.pct_totalizadas != null ? +br.oficial.indicadores.pct_totalizadas.toFixed(2) : null,
      conferencia: conf?.classificacao?.codigo ?? null,
      coleta: pres.coleta_geral?.estado,
      eleito: !!pres.eleito?.publicado,
      lider: br.oficial?.disputa?.lider ?? null,
      req_resultados: (saude.recortes ?? []).filter((r) => r.status_http != null).length,
      correcoes_ac: (hist.correcoes ?? []).filter((c) => c.recorte === "ac").length,
      rr: terr.rr?.coleta?.situacao ?? null,
      pausa: saude.coletor?.pausa?.motivo ?? null,
      http: saude.coletor?.status_http,
    },
  };
}
