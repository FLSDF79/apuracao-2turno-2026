# Arquitetura do lado dos dados (frente 2)

Um coletor único consulta o TSE por todos os visitantes, valida, calcula e publica arquivos prontos (`/dados/v1/*`, ver [contrato](../contrato/CONTRATO-DADOS.md)). A página só exibe.

## Camadas

Cada camada é uma pasta em `backend/` e só conversa com a de baixo pelos dados que recebe. O cálculo não sabe de HTTP nem de Cloudflare; por isso o mesmo código roda nos testes, no Node e no Worker.

| Camada | Pasta | Faz | Não faz |
|---|---|---|---|
| Conectores | `backend/conectores/` | `http.js`: requisição condicional (ETag/304), timeout, backoff, Retry-After, pausa global em 403/429 ou 404 em série, limite de 10 req/s, lista de hosts permitidos. `tse.js`: descoberta pela configuração oficial (`ele-c.json` + abrangência) e montagem das URLs pelos modelos `arq` do próprio TSE. `simulador.js` e `fixtures.js`: fontes de teste, sempre marcadas como tal | interpretar números |
| Normalização | `backend/normalizacao/` | `validar.js`: esquema mínimo (rejeita resposta incompleta, turno ou eleição errados) e identidades aritméticas (viram alerta). `normalizar.js`: inteiros, `null` para ausente, horários em ISO, "eleito" só por `st === "Eleito"`. `territorios.js`: tabela TSE × IBGE e regiões | somar recortes |
| Agregação | `backend/agregacao/` | `calcular.js`: soma de inteiros antes do percentual, regiões, Brasil calculado (27 UFs + exterior). `conferencia.js`: soma territorial × total do TSE, 4 classes. `historico.js`: versões, correções oficiais, série | gravar nada |
| Armazenamento | `backend/armazenamento/` | `snapshots.js`: SHA-256 do corpo recebido e índice. `durable-object.js` (Cloudflare) e `arquivos.js` (Node): estado, saídas e corpos oficiais por hash | decidir o que mostrar |
| API | `backend/api/` | `contrato.js`: monta `presidente.json`, `governador.json`, `territorios.json`. `exportar.js`: CSV com origem e horários | consultar a fonte |
| Orquestração | `backend/coletor/rodada.js` | Uma rodada: conectores → normalização → agregação → saídas, com os três horários e os eventos | |
| Execução | `backend/execucao/` | `node.js` (linha de comando) e `cloudflare/` (Worker + Durable Object com alarme, cron de vigia, administração) | |

**Nenhum LLM** participa da consulta, da soma ou da interpretação numérica. Tudo é código determinístico coberto por testes; a mesma entrada gera a mesma saída byte a byte (o CI regenera `exemplos/` e falha se mudar).

## Pilha

JavaScript puro em módulos ES, sem etapa de build e **sem dependência de produção**: o mesmo arquivo roda no Node 22 e no runtime da Cloudflare. TypeScript entra só como verificador (`npm run tipos`, `tsc` com `checkJs` sobre anotações JSDoc) no CI. Testes com `node:test`.

## Os três horários

| Campo | Avança quando |
|---|---|
| `tempos.ultima_consulta_ok` / `coleta.ultimo_sucesso` | Toda consulta bem-sucedida (200 ou 304) |
| `tempos.publicacao_fonte` / `horario.geracao` | O TSE gera um arquivo novo (vem do próprio arquivo) |
| `tempos.ultima_mudanca` / `coleta.ultima_mudanca` | O conteúdo recebido muda de fato (outra versão aceita) |

`gerado_em` dos arquivos é a última mudança efetiva, não o relógio da rodada: o painel nunca parece "mais novo" sem dado novo.

## Rastreabilidade (snapshots)

Cada corpo recebido do TSE vira uma entrada em `snapshots.json`: URL oficial, ETag, horário da coleta, horário da fonte, `idg`, SHA-256 do corpo e se foi aceito. O corpo exato fica em `/dados/v1/snapshots/<sha256>.json` (imutável). Quem quiser conferir baixa o arquivo do TSE e compara o hash. Respostas rejeitadas (incompletas, fora de ordem) também ficam registradas, com `aceito: false`, e geram evento em `historico.json`.

## Segurança

- **Só endereços do TSE.** O conector recusa, sem sair da máquina, qualquer URL que não seja `https://resultados.tse.jus.br` ou `https://resultados-sim.tse.jus.br`, ou que tenha usuário/senha. Os modelos de diretório da configuração também são validados (mesmo host, sem `..`, `?`, `#`). Não existe parâmetro público que escolha URL.
- **Rotas públicas fechadas.** O Worker só serve `GET`/`HEAD` em `/dados/v1/<nome>.json`, `/dados/v1/export/<nome>.csv` e `/dados/v1/snapshots/<sha256>.json`; o resto é 404.
- **Administração protegida.** `/admin/estado` (GET) e `/admin/{pausar,retomar,rodada}` (POST) exigem `Authorization: Bearer <ADMIN_TOKEN>`, comparado em tempo constante. O token é segredo do Worker (`wrangler secret put ADMIN_TOKEN`, 32+ caracteres) e nunca vai para o frontend. Sem o segredo, a administração fica desligada. Pausa de emergência sem token: variável `PAUSADO = "sim"`.
- **Sem dados pessoais.** O coletor não recebe nem guarda nada de quem visita; só arquivos públicos do TSE.

## Armazenamento e plano gratuito da Cloudflare

Limites do plano gratuito usados na conta (conferir na página de preços da Cloudflare antes do deploy): Durable Objects SQLite com 5 GB, 100 mil linhas gravadas/dia, 5 milhões de linhas lidas/dia; Workers com 100 mil requisições/dia e 10 ms de CPU por requisição.

| Item | Estimativa | Folga |
|---|---|---|
| Linhas gravadas | Rodada sem novidade: ~8 chaves (medido no teste `plano gratuito: …`). A cada 15 s = ~46 mil/dia. Rodadas com arquivo novo gravam mais, só nos recortes que mudaram | cabe, ~2× |
| Linhas lidas | O estado fica na memória do Durable Object; o storage só é lido quando ele reinicia | ampla |
| Armazenamento | Corpos oficiais por hash: ~38 arquivos × poucos KB por versão nova. Uma noite inteira fica na casa de dezenas de MB | ampla |
| Requisições ao TSE | ~38 por rodada, quase todas 304, limitadas a 10/s | não conta na Cloudflare como requisição de visitante |

**Riscos para a frente 4 decidir (não são do lado dos dados):**

1. **Requisições de visitantes.** Cada leitura de `/dados/v1/*` passa pelo Worker e conta no limite de 100 mil/dia, mesmo com cache. Uma página que lê `presidente.json` a cada 15 s gasta 240 requisições por visitante por hora, então o limite acaba em cerca de 400 visitantes-hora. Para uma noite com público, o plano pago de Workers (US$ 5/mês) resolve; é contratação e precisa de aprovação do Fabiano.
2. **CPU de 10 ms.** A rodada monta ~250 KB de JSON. Em `wrangler dev` não há limite; o consumo real só aparece no primeiro deploy (o log do Worker imprime cada rodada).

## Tabela TSE × IBGE

Fonte única: `backend/normalizacao/territorios.js`, publicada em `/dados/v1/territorios.json`. Chave do TSE = sigla em minúsculas usada nos caminhos e no campo `cdabr`; código IBGE = código de UF de 2 dígitos. O teste `tabela TSE × IBGE` confere as 27 UFs contra a malha do mapa (`data/br-uf.geojson`) e contra a abrangência oficial do TSE. Exterior (`zz`) e Brasil (`br`) não têm código IBGE de UF.

| TSE | IBGE | Nome | Tipo | Região |
|---|---|---|---|---|
| `ac` | 12 | Acre | uf | N |
| `al` | 27 | Alagoas | uf | NE |
| `am` | 13 | Amazonas | uf | N |
| `ap` | 16 | Amapá | uf | N |
| `ba` | 29 | Bahia | uf | NE |
| `ce` | 23 | Ceará | uf | NE |
| `df` | 53 | Distrito Federal | uf | CO |
| `es` | 32 | Espírito Santo | uf | SE |
| `go` | 52 | Goiás | uf | CO |
| `ma` | 21 | Maranhão | uf | NE |
| `mg` | 31 | Minas Gerais | uf | SE |
| `ms` | 50 | Mato Grosso do Sul | uf | CO |
| `mt` | 51 | Mato Grosso | uf | CO |
| `pa` | 15 | Pará | uf | N |
| `pb` | 25 | Paraíba | uf | NE |
| `pe` | 26 | Pernambuco | uf | NE |
| `pi` | 22 | Piauí | uf | NE |
| `pr` | 41 | Paraná | uf | S |
| `rj` | 33 | Rio de Janeiro | uf | SE |
| `rn` | 24 | Rio Grande do Norte | uf | NE |
| `ro` | 11 | Rondônia | uf | N |
| `rr` | 14 | Roraima | uf | N |
| `rs` | 43 | Rio Grande do Sul | uf | S |
| `sc` | 42 | Santa Catarina | uf | S |
| `se` | 28 | Sergipe | uf | NE |
| `sp` | 35 | São Paulo | uf | SE |
| `to` | 17 | Tocantins | uf | N |
| `zz` | — | Exterior | exterior | — |
| `br` | — | Brasil | brasil | — |
