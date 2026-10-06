# Contrato de dados v1 (`apuracao-2t-2026/v1`)

Este é o formato que o coletor publica e que a página consome. **A página só exibe:** todo número, percentual, diferença, agregação regional e classificação da conferência já sai pronto daqui. Exemplos gerados pelo próprio código:

- [`exemplos/simulado-2turno/v1/`](../../exemplos/simulado-2turno/v1/): noite de 2º turno **simulada** (40% apurado, SP atrasado em relação ao nacional, correção no AC). É o formato que a página vai ver em 25/10. Votos derivados do 1º turno: nunca exibir como resultado.
- [`exemplos/ensaio-1turno/v1/`](../../exemplos/ensaio-1turno/v1/): arquivos **reais** do 1º turno de 04/10 (12 candidatos a presidente, 7 UFs de governador).

Para regenerar: `node tools/gerar-exemplo.mjs`.

## Arquivos

Servidos em `/dados/v1/…` (Cloudflare) ou gravados em `<saida>/v1/…` (Node). Todos são regenerados a cada rodada do coletor (padrão 15 s).

| Arquivo | Conteúdo |
|---|---|
| `presidente.json` | Placar do Brasil (oficial e calculado), 27 UFs, exterior, 5 regiões, conferência |
| `governador.json` | Uma entrada por UF com 2º turno de governador (AC, AM, DF, ES, RJ, RN, TO). Nunca agregado entre UFs |
| `historico.json` | Série do arquivo nacional (um ponto por versão nova publicada pelo TSE) e correções detectadas |
| `saude.json` | Estado do coletor: rodada, códigos HTTP, pausa, situação de cada arquivo consultado |
| `export/presidente.csv`, `export/governador.csv` | Exportação pronta (`;`, decimal com vírgula, UTF-8 com BOM: abre direto no Excel em português) |

O JSON de exportação é o próprio `presidente.json`/`governador.json`: já trazem origem, horário do TSE e horário da coleta.

## Convenções

- **Votos e contagens:** inteiros. `null` = informação ausente na fonte; `0` = zero confirmado. Nunca trocar um pelo outro.
- **Percentuais:** número de 0 a 100 com precisão total (ex.: `47.02777235637371`). Arredondar só na tela (2 casas, como o TSE). Os campos `*_tse` / `oficial_tse` trazem o valor publicado pelo TSE, para conferência; os testes garantem que batem com os calculados até 10⁻⁶.
- **Horários:** `horario.*` são do TSE, em ISO com `-03:00` (Brasília). `coleta.*`, `gerado_em` e `coletado_em` são do coletor, em UTC (`Z`). Exibir tudo em America/Sao_Paulo.
- **Territórios:** chave = sigla do TSE em minúsculas (`ac`…`to`, `zz` exterior, `br` Brasil). `ibge_uf` é o código IBGE da UF, separado e explícito. O `data/br-uf.geojson` usa a mesma sigla em `properties.uf`.
- **Candidatos:** identificados por `numero` (texto) e `sqcand` (id versionado do TSE). Metadados (nome, partido, federação, vice) ficam só em `candidatos[]` no topo; nos territórios vão só número, votos e percentuais.

## Denominadores (iguais aos do TSE, conferidos nos arquivos reais)

| Indicador | Fórmula |
|---|---|
| `% dos válidos` do candidato | votos ÷ `votos.validos_computados` (vvc = válidos + anulados sub judice) |
| `% totalizadas` | `secoes.totalizadas` ÷ `secoes.total` |
| `% comparecimento` / `% abstenção` | ÷ (`comparecimento` + `abstencao`). Nos arquivos finais isso é o eleitorado das seções instaladas (`esi`), base oficial; na apuração parcial é a base sobre a qual o TSE contou a abstenção |
| `% válidos`, `% brancos`, `% nulos` | ÷ `votos.total` (= comparecimento) |
| Região e Brasil calculado | soma dos inteiros dos recortes, depois a divisão. Nunca média de percentuais |

## `presidente.json`

```text
schema, tipo:"presidente", gerado_em, modo ("oficial" | "simulacao" | "ensaio"), aviso
fonte: { base, ambiente, portal }
eleicao: { estado: "publicada" | "nao_publicada" | "sem_cargo", eleicao:"6258", turno:2, cargo:1, cargo_nome, nome, pleito, data,
           eleicao_esperada (quando não publicada), motivo }
estado_publicacao: "aguardando_configuracao" | "aguardando_resultados" | "em_apuracao" | "totalizada_100" | "concluida"
eleito: { publicado: bool, candidatos: [numero], fonte }   ← só true quando o arquivo nacional traz situação "Eleito"
candidatos: [ { numero, sqcand, nome, nome_urna, partido{numero,sigla,nome}, federacao, coligacao, vice{nome_urna,…} } ]
brasil: {
  oficial:   Resultado (origem "tse": arquivo br do TSE)       ← placar principal
  coleta:    Coleta
  calculado: Resultado (origem "calculado": 27 UFs + exterior) ← coluna A da conferência
}
exterior: Territorio (o mesmo objeto de territorios.zz)
territorios: { ac…to, zz: Territorio }
regioes: { N, NE, CO, SE, S: { codigo, nome, ufs[], resultado: Resultado (calculado) } }
conferencia: Conferencia | null (null enquanto a eleição não está publicada)
coleta_geral: { estado: "ok" | "atrasada" | "pausada" | "bloqueada" | "indisponivel", mensagem, rodada_em, proxima_em, intervalo_s }
```

`coleta_geral` também vem em `governador.json` e em `saude.json` (dentro de `coletor`). `atrasada` = algum recorte `defasado` ou `indisponivel`; `bloqueada` = o TSE respondeu 403/429 e o coletor está em pausa; `indisponivel` = a configuração do TSE nunca foi lida.

**Territorio:** `{ codigo, tipo: "uf"|"exterior", nome, regiao, ibge_uf, esperado, coleta: Coleta, atraso_vs_nacional_min, resultado: Resultado | null }`. `atraso_vs_nacional_min` = minutos entre a totalização do arquivo nacional e a do recorte (0 = mesmo horário).

**Coleta:** `{ situacao, url, ultima_tentativa, ultimo_sucesso, status_http, ultimo_erro{em,mensagem,status}, sem_alteracao, adiado }`

| `situacao` | Significado | Tratamento visual sugerido |
|---|---|---|
| `atualizado` | Arquivo lido nesta rodada (200 ou 304) | normal |
| `defasado` | Falhou nesta rodada; `resultado` é o último válido (ver `ultimo_sucesso`) | hachura/aviso de defasagem |
| `nao_publicado` | 404 e nada guardado: o TSE ainda não publicou | "aguardando divulgação" |
| `indisponivel` | Erro e nada guardado | "indisponível" |
| `aguardando` | Ainda não consultado (coletor em pausa ou começando) | carregando |

**Resultado:**

```text
origem: "tse" | "calculado"
idg (id da geração do arquivo no TSE, não sequencial), andamento: { codigo, final_publicado }
horario: { geracao, totalizacao }            ← no calculado: { totalizacao: {min,max}, geracao: {min,max} }
componentes, faltando[], inconsistencias[]   ← só no calculado
secoes:     { total, totalizadas, nao_totalizadas, instaladas, nao_instaladas, apuradas, nao_apuradas }
eleitorado: { total, secoes_totalizadas, secoes_nao_totalizadas, secoes_instaladas, secoes_nao_instaladas, secoes_apuradas, secoes_nao_apuradas, comparecimento, abstencao }
votos:      { total, validos_computados, validos, nominais, anulados, anulados_sub_judice, brancos, nulos_total, nulos, nulos_tecnicos, vsan, vscv }
indicadores: { pct_totalizadas, pct_comparecimento, pct_abstencao, base_comparecimento, pct_validos, pct_brancos, pct_nulos }
oficial_tse: { mesmos pct_* publicados pelo TSE }   ← só origem "tse"
candidatos: [ { numero, votos, pct_validos, destinacao, pct_validos_tse*, situacao*, eleito_publicado* } ]  (* só origem "tse")
disputa: { situacao: "lideranca" | "empate" | "sem_votos", lider, segundo, diferenca_votos, diferenca_pontos } | null
```

`disputa.lider` é **liderança parcial**, nunca vitória. A cor do mapa vem do `lider` + cor fixa do candidato (configuração da página); `empate` e `sem_votos` têm tratamento próprio. `situacao` do candidato é o texto oficial (`"Eleito"`, `"Não eleito"`, `"2º turno"`); o texto usado durante a apuração parcial ainda não foi observado em arquivo real, então a página deve tratar qualquer valor diferente de `"Eleito"` como "não definido". O campo `e` do TSE não é usado: vem `"s"` até para quem foi ao 2º turno.

**Conferencia:**

```text
mesma_base: true, aviso (texto pronto: conferência de consistência, não auditoria independente)
colunas: { a: { rotulo, componentes, faltando, defasados, horario_totalizacao{min,max}, pct_totalizadas },
           b: { rotulo, horario_totalizacao, idg, pct_totalizadas } }
linhas: [ { chave: "candidato.22" | "votos.brancos" | …, rotulo, a, b, diferenca (= a − b) } ]
classificacao: { codigo, texto, motivo, desde }
```

| `codigo` | Quando |
|---|---|
| `compativel` | Todas as linhas com diferença zero e nenhum recorte faltando |
| `cobertura_incompleta` | Falta o nacional, falta algum recorte, ou algum está `defasado` |
| `horarios_diferentes` | Há diferença, a cobertura está completa e os arquivos têm horários de totalização diferentes |
| `diferenca_persistente` | A mesma diferença dura 10 min ou mais (configurável), ou os arquivos têm o mesmo horário e somas diferentes |

A e B **nunca** se somam: são duas representações dos mesmos votos.

## `governador.json`

```text
schema, tipo:"governador", gerado_em, modo, aviso, fonte, eleicao (6260, cargo 3)
ufs: { ac, am, df, es, rj, rn, to: { codigo, nome, regiao, ibge_uf, coleta, estado_publicacao, candidatos[], eleito{publicado,candidatos}, resultado: Resultado } }
```

As UFs saem da configuração oficial do 2º turno (`abr` da eleição 6260 no `ele-c.json`). No modo ensaio, são as 7 que foram ao 2º turno no 1º turno.

## `historico.json`

```text
serie_brasil: [ { coletado_em, totalizacao, idg, pct_totalizadas, votos{numero:int}, pct_validos{numero:float}, disputa, correcao: bool } ]
correcoes: [ { recorte, disputa, eleicao, coletado_em, de_idg, para_idg, totalizacao, quedas: [ {campo, antes, depois} ] } ]
```

Um ponto entra só quando o TSE publica versão nova do arquivo nacional. Correções (votos ou seções que diminuem) são aceitas como vieram e ficam registradas; o painel não força crescimento.

## `saude.json`

```text
coletor: { estado, mensagem, rodada_em, proxima_em, intervalo_s, rodada{inicio,fim,duracao_ms,requisicoes,adiadas}, status_http{"200":n,"304":n,…}, pausa: {ate,motivo} | null }
configuracao: { url, coletada_em, ultimo_erro, idg, geracao }
disputas: { presidente, governador }   (saída da descoberta)
recortes: [ { id: "presidente:6258:sp", ...Coleta } ]
origem: texto pronto sobre a origem (base do TSE, nenhum TRE com arquivo próprio)
```

## Mudanças no contrato

Campos novos podem ser acrescentados sem mudar a versão. Renomear ou remover campo muda `schema` para `v2` e o caminho para `/dados/v2/`.
