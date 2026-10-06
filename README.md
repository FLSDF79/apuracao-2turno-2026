# Apuração em tempo real — 2º turno presidencial 2026

Painel independente (pt-BR, modo escuro, mobile) da apuração do **2º turno de 25/10/2026 — Flávio Bolsonaro (22) × Lula (13)**.

**Dados: TSE – Divulgação de Resultados. Painel independente, sem vínculo oficial.**

## Coletor e motor de cálculo

Um coletor único consulta o TSE para todos os visitantes e publica JSON prontos para a página: placar, UFs, regiões, exterior, conferência soma × TSE, histórico com correções e exportação CSV. A página não recalcula nada.

- Contrato de dados: [docs/contrato/CONTRATO-DADOS.md](docs/contrato/CONTRATO-DADOS.md), com exemplos em `exemplos/` (1º turno real e 2º turno simulado).
- `backend/`, em camadas: `conectores/` (HTTP com ETag/304, backoff, pausa diante de bloqueio, só hosts do TSE; descoberta pela configuração oficial; simulador), `normalizacao/` (validação de esquema, inteiros, tabela TSE × IBGE), `agregacao/` (regiões, Brasil calculado, conferência, histórico), `armazenamento/` (snapshots com SHA-256, Durable Object ou pasta), `api/` (JSON e CSV do contrato), `coletor/rodada.js` e `execucao/` (Node e Cloudflare Worker com Durable Object, alarme e administração protegida).
- Arquitetura, segurança e orçamento do plano gratuito: [docs/arquitetura/DADOS.md](docs/arquitetura/DADOS.md). Critérios × testes: [docs/testes/CRITERIOS.md](docs/testes/CRITERIOS.md).
- Sem LLM em nenhuma etapa de consulta, soma ou interpretação dos números.
- Descoberta só pela configuração oficial (`ele-c.json` e lista de abrangência). Enquanto o 2º turno não estiver na configuração, o coletor só consulta o `ele-c.json`.

```bash
npm ci && npm test                                           # testes do coletor (Node 22)
npm run tipos                                                # checagem de tipos (TypeScript sobre JSDoc)
python3 -m unittest discover -s tests                        # testes das fontes
node backend/execucao/node.js --saida public/dados                    # 2º turno, a cada 15 s
node backend/execucao/node.js --modo ensaio --fixtures tests/fixtures/tse-2026-10-06 --uma-vez   # 1º turno offline
node tools/gerar-exemplo.mjs                                 # regenera exemplos/
```

## Página

- HTML, CSS e JavaScript puro (`index.html`, `style.css`, `config.js`, `js/`), sem build e sem dependências.
- Lê os arquivos do contrato v1 publicados pelo coletor (`dados/v1/presidente.json`, `historico.json`, `governador.json`, `saude.json`
  e `export/*.csv`) a cada 10 s, revalidando por ETag, e só apresenta: não consulta o TSE e não recalcula nada.
- Só `js/contrato.js` conhece o formato dos arquivos; se o contrato mudar de versão, muda só ele.
- Mostra três horários separados, todos em horário de Brasília: **publicado pelo TSE** (geração do arquivo nacional),
  **última mudança nos números** (do snapshot do coletor ou, sem ele, do último ponto do histórico) e **última consulta ao TSE**.
  Não há relógio de parede: nada na tela avança se os números não mudaram. Só a idade da consulta cresce.
- Atualiza sem recarregar. Se o coletor cair ou mandar arquivo incompleto, mantém o último dado válido com aviso.
  Resposta fora de ordem (snapshot mais velho que o da tela) é ignorada. Contagem que não for inteiro ≥ 0 aparece como “—”
  e o problema é listado em Fontes e saúde.
- Ensaio (1º turno), simulação, arquivo de outro turno ou modo desconhecido ganham faixa listrada no topo, selo fixo nas abas,
  marca d'água no placar e no mapa e prefixo no título da aba. Nunca aparecem como apuração do 2º turno.
- Sem dados pessoais de visitantes, sem segredos e sem recursos de terceiros além das fontes do Google Fonts.
  O logo da NFLS.AI Arena está em `assets/` (cópia do arquivo oficial).

## Áreas do painel

Visão Brasil · Mapa (estados ou regiões, geográfico ou em grade, intensidade pela margem opcional, barras de vantagem em votos,
exterior em cartão próprio) · Estados e regiões (tabelas ordenáveis com filtro) · Conferência (A soma territorial × B total do TSE,
classificada) · Histórico (por horário ou por % totalizado, com correções oficiais marcadas) · Fontes e saúde · Governador (AC, AM, DF, ES, RJ, RN e TO, em módulo separado).

Também: modo TV (`?tv=1` ou botão), tema claro e escuro, cores fixas e trocáveis por candidato (salvas no navegador),
exportação CSV/JSON com origem e horário, horário de Brasília, crédito de autoria e selo da NFLS.AI Arena.

## Endpoints do TSE usados (estrutura de 2026)

Inventário completo das fontes (TSE e 27 TREs), códigos conferidos, campos e limites de acesso: [docs/fontes/INVENTARIO.md](docs/fontes/INVENTARIO.md).


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

## Pré-visualização sem coletor

A página aceita os exemplos que o próprio coletor gera em `exemplos/` (`node tools/gerar-exemplo.mjs`):

- `?fonte=ensaio`: arquivos reais do 1º turno de 04/10.
- `?fonte=simulacao`: noite de 2º turno **simulada** (números fictícios).

Para rodar localmente: `python3 -m http.server` na raiz e abrir `http://localhost:8000/?fonte=simulacao`. `?tv=1` abre no modo TV.

## Configuração

`config.js`: pasta de onde ler os arquivos do coletor, intervalo de releitura, limite de defasagem, candidatos e cores padrão, UFs com 2º turno para governador e links.

## Testes

- `python3 -m unittest discover -s tests`: consistência dos arquivos oficiais guardados.
- `npm test`: coletor e motor de cálculo.
- `node --test tests/interface/*.test.js`: leitura do contrato v1 pela página, estados visuais, cores, horários e exportação.
- `npm run tipos`: checagem de tipos do TypeScript sobre o JavaScript da página (JSDoc + `checkJs`, `js/tsconfig.json`).
- `node --test tests/navegador/*.test.mjs`: Chromium via Playwright (`npm i --no-save playwright axe-core`). Confere os valores
  exibidos com os arquivos de origem (placar, 27 UFs + exterior, regiões, conferência e horários), mapa, tooltip, detalhe, teclado,
  filtros, ordenação e abas no computador e no celular, modo TV, cenários do coletor (conteúdo igual, conteúdo novo, fora de ordem,
  fora do ar, incompleto, campo inválido, outro turno, “eleito” só publicado), acessibilidade com axe-core nos dois temas e console sem erros.
  Com `EVIDENCIAS=1`, guarda capturas e `relatorio.json` em `docs/evidencias/painel/`. O CI roda tudo e anexa as evidências.

## Conferência

`python3 tools/validar.py 6257` baixa as 28 unidades e confere com o total nacional (1º turno: bate exatamente).
No dia: `python3 tools/validar.py 6258`.

## Limitações

- Frequência real = frequência com que o TSE regera os arquivos e com que o coletor os lê.
- Mapa por município não incluído.
- O painel não faz projeção: liderança parcial não é resultado.

Mapa: malha estadual do IBGE (API de malhas v3), embutida em `data/br-uf.geojson`.

## Publicação, ensaio e operação (frente 4)

- Arquitetura, camadas e segurança: [docs/ARQUITETURA.md](docs/ARQUITETURA.md)
- Publicar na Cloudflare, roteiro e checklist de 25/10: [docs/publicacao/ROTEIRO-25-10.md](docs/publicacao/ROTEIRO-25-10.md)
- Operação, configuração, custos e manutenção: [docs/publicacao/OPERACAO.md](docs/publicacao/OPERACAO.md)
- Indisponibilidade das fontes: [docs/publicacao/CONTINGENCIA.md](docs/publicacao/CONTINGENCIA.md)
- Evidências dos testes das três frentes: [docs/evidencias/EVIDENCIAS.md](docs/evidencias/EVIDENCIAS.md)

```bash
node publicacao/ponta-a-ponta.mjs   # dados oficiais do 1º turno → coletor → página → navegador
node ensaio/rodar.mjs               # noite de 2º turno simulada, relógio real (~26 min)
node publicacao/evidencias.mjs      # todas as baterias, com logs e capturas em docs/evidencias/
```
