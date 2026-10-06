# Apuração em tempo real — 2º turno presidencial 2026

Painel independente (pt-BR, modo escuro, mobile) da apuração do **2º turno de 25/10/2026 — Flávio Bolsonaro (22) × Lula (13)**.

**Dados: TSE – Divulgação de Resultados. Painel independente, sem vínculo oficial.**

## Como funciona

- **Coletor (frente 2, em construção):** único, no servidor, conversa com o TSE e publica snapshots prontos
  (`api/estado.json`, `api/historico.json`, `api/governador.json`). Todas as somas, percentuais e a conferência são feitos lá.
- **Página (esta pasta):** HTML, CSS e JavaScript puro, sem build e sem dependências. Só lê os snapshots do coletor
  a cada 10 s (revalidando por ETag) e apresenta. Não consulta o TSE e não recalcula nada.
- O formato que a página consome está em [docs/interface/contrato-provisorio.md](docs/interface/contrato-provisorio.md)
  e fica isolado em `js/contrato.js`; quando o coletor fechar o contrato definitivo, muda só esse arquivo.

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

Enquanto o coletor não está publicado, a página aceita dados de teste gerados a partir dos arquivos oficiais do 1º turno
guardados em `tests/fixtures` (script descartável `dev/gerar_amostra.py`, a apagar quando o coletor existir):

- `?fonte=amostra`: resultado final real do 1º turno (04/10) no formato do painel.
- `?fonte=simulacao`: **simulação** de noite de apuração (números fictícios), com UF indisponível, UF defasada, UF sem votos e uma correção oficial no histórico, para testar os estados visuais.

Para rodar localmente: `python3 -m http.server` na raiz e abrir `http://localhost:8000/?fonte=simulacao`.

## Configuração

`config.js`: onde ler os snapshots, intervalo de releitura, limite de defasagem, candidatos e cores padrão, UFs com 2º turno para governador e links.

## Testes

- `python3 -m unittest discover -s tests`: consistência dos arquivos oficiais guardados.
- `node --test tests/interface/*.test.js`: adaptador de dados, estados visuais, cores, horários e exportação da página.

## Conferência

`python3 tools/validar.py 6257` baixa as 28 unidades e confere com o total nacional (1º turno: bate exatamente).
No dia: `python3 tools/validar.py 6258`.

## Limitações

- Frequência real = frequência com que o TSE regera os arquivos e com que o coletor os lê.
- Mapa por município não incluído.
- O painel não faz projeção: liderança parcial não é resultado.

Mapa: malha estadual do IBGE (API de malhas v3), embutida em `data/br-uf.geojson`.
