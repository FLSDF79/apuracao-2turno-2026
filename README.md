# Apuração em tempo real — 2º turno presidencial 2026

Painel independente (pt-BR, modo escuro, mobile) da apuração do **2º turno de 25/10/2026 — Flávio Bolsonaro (22) × Lula (13)**.

**Dados: TSE – Divulgação de Resultados. Painel independente, sem vínculo oficial.**

## Como funciona

- **Site 100% estático** (HTML + CSS + JS puro, sem bibliotecas, sem servidor, grátis no GitHub Pages).
- O navegador de cada visitante busca direto os JSON oficiais em `resultados.tse.jus.br`.
  Testado em 06/10/2026: o TSE responde `Access-Control-Allow-Origin` com a origem de quem pede
  (inclusive `*.github.io`), e aceita `If-None-Match` (responde `304` quando nada mudou). Por isso **não precisa de proxy**.
- Atualiza a cada ~45 s (com variação aleatória de até 5 s), usando `cache: "no-cache"` → o navegador revalida por ETag.
  Depois de 100% totalizado, passa a checar a cada 5 min.
- Histórico da noite (para o gráfico de evolução) fica no `localStorage` do navegador.

## Endpoints do TSE usados (estrutura de 2026)

| O quê | URL |
|---|---|
| Configuração geral (eleições, códigos, 2º turno) | `https://resultados.tse.jus.br/oficial/comum/config/ele-c.json` |
| Resultado nacional, Presidente | `https://resultados.tse.jus.br/oficial/ele2026/<ELEICAO>/dados/br/br-c0001-e<ELEICAO 6 dígitos>-u.json` |
| Resultado por UF (ac…to) e Exterior (zz) | `.../ele2026/<ELEICAO>/dados/<uf>/<uf>-c0001-e<ELEICAO>-u.json` |
| Abrangência (seções/eleitorado por UF ou município, sem votos) | `.../ele2026/<ELEICAO>/dados/<uf ou br>/<uf>-e<ELEICAO>-ab.json` |
| Resultado por município (existe, não usado no painel) | `.../ele2026/<ELEICAO>/dados/<uf>/<uf><cod_mun_TSE>-c0001-e<ELEICAO>-u.json` |
| Lista de municípios | `.../ele2026/<ELEICAO>/config/mun-e<ELEICAO>-cm.json` |

Códigos (do `ele-c.json`): ciclo `ele2026`, pleito 1º turno `3220`, **eleição 1º turno = 6257**, cargo Presidente = `1`,
**código do 2º turno informado pelo TSE (`cdt2`) = 6258**.

Obs.: o antigo caminho `dados-simplificados/...-r.json` (usado em 2022/2024) **não existe** para 2026 (404).

## Modos

- Padrão (automático): tenta o 2º turno (6258, ou o código que o `ele-c.json` indicar). Enquanto o TSE não publicar
  o arquivo, mostra o **1º turno de 04/10 como MODO TESTE** e troca sozinho quando o 2º turno aparecer.
- `?turno=1` força o 1º turno; `?turno=2` força o 2º turno; `?eleicao=NNNN` força qualquer código.
- `?demo=1` **simulação** (progressão fictícia a partir do resultado final do 1º turno), só para testar gráfico/mapa/projeção.

## Configuração

Tudo em `config.js` (códigos, candidatos/cores, intervalo, tolerância).

## Conferência

`python3 tools/validar.py 6257` baixa as 28 unidades e confere com o total nacional (1º turno: bate exatamente).
No dia: `python3 tools/validar.py 6258`.

## Limitações

- Frequência real = frequência com que o TSE regera os arquivos (o `cache-control` do TSE é de ~3–60 s); o painel checa a cada ~45 s.
- O gráfico de evolução só tem pontos a partir do momento em que o painel foi aberto naquele navegador.
- Mapa por município não incluído (seriam 5.570 arquivos por ciclo — inviável sem servidor).
- Projeção é uma conta simples (estimativa), não resultado oficial.

Mapa: malha estadual do IBGE (API de malhas v3), embutida em `data/br-uf.geojson`.
