# Roteiro de publicação e da noite de 25/10/2026

Dono: frente 4 (publicação e ensaio). Código de coleta e cálculo: frente 2. Página: frente 3.

## Como fica no ar

Um único Worker da Cloudflare (`wrangler.toml` na raiz) faz duas coisas:

1. Serve a página (`index.html`, `js/`, `data/`…, montados em `dist/site` por `publicacao/montar-site.mjs`).
2. Serve `/dados/v1/*`, gerado pelo **coletor único** (Durable Object com alarme a cada 15 s). Só ele consulta o TSE, não importa quantos visitantes o painel tenha. As respostas ficam 5 s em cache.

Página e dados ficam na mesma origem, então não há CORS nem configuração extra.

| Ambiente | Worker | Lê de | Para quê |
|---|---|---|---|
| Produção | `apuracao-2turno-2026` | TSE oficial (`resultados.tse.jus.br`) | 25/10 |
| Ensaio | `apuracao-2turno-2026-ensaio` | TSE simulado dentro do próprio Worker (noite de 26 min repetindo a cada 30 min) | ensaio geral e demonstração |

O ensaio usa o mesmo coletor e a mesma página da produção. Muda só a origem: um "TSE simulado" (`ensaio/tse-simulado.mjs` + `ensaio/roteiro.mjs`) que publica a configuração do 2º turno, os arquivos com 0%, a apuração subindo, SP atrasado, correção no AC, 503, erro em RR, 429 e, no fim, "Eleito". Os votos são os do 1º turno, escalados. **Não são resultado.**

## Antes de 18/10 (uma vez)

1. **Conta Cloudflare.** Em *My Profile > API Tokens > Create Token*, modelo **Edit Cloudflare Workers**. Copie também o **Account ID** (página *Workers & Pages*, barra lateral).
2. **Segredos no GitHub.** Em *Settings > Secrets and variables > Actions* do repositório, crie `CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID`.
3. **Merge na ordem** #1 (fontes), #3 (coletor), #2 (página) e por último o PR desta frente.
4. **Publicar o ensaio.** Em *Actions > Publicar na Cloudflare > Run workflow*, escolha `ensaio`. O fluxo roda todos os testes, publica e confere o site no ar.
5. **Publicar a produção.** Acontece sozinho a cada push na `main`, ou pelo mesmo botão com `producao`.
6. **Variáveis do GitHub** (*Settings > Secrets and variables > Actions > Variables*): `URL_PAINEL` e `URL_ENSAIO`, com os endereços que o deploy mostrar (`https://<nome>.<sua-conta>.workers.dev`). Com elas, todo deploy confere o site sozinho.

Pelo terminal, o mesmo:

```bash
node publicacao/montar-site.mjs
npx wrangler deploy --env ensaio      # ensaio
npx wrangler deploy --env=""          # produção
node publicacao/conferir-no-ar.mjs https://apuracao-2turno-2026.<conta>.workers.dev --esperar 90
```

## Pendência que decide a hospedagem: o TSE aceita consulta vinda da Cloudflare?

Ainda sem resposta (teste em `tools/teste-cloudflare/`, conduzido pela frente 2). Depois do primeiro deploy de produção, a resposta aparece sozinha: `conferir-no-ar` mostra `HTTP do TSE nesta execução`. Se vier `{"200":…}` ou `{"304":…}`, está aceito. Se vier 403, 429 ou erro de conexão, o TSE recusa a Cloudflare e entra o plano B (fim deste roteiro).

## Como saber que o TSE publicou a configuração do 2º turno

O coletor lê só a configuração oficial (`/oficial/comum/config/ele-c.json`) até ela listar o 2º turno. Ele **não tenta adivinhar endereços**, porque 404 em sequência bloqueia o IP.

```bash
curl -s https://<painel>/dados/v1/presidente.json | jq '{estado_publicacao, eleicao}'
```

| `eleicao.estado` / `estado_publicacao` | Significado |
|---|---|
| `nao_publicada` / `aguardando_configuracao` | O TSE ainda não pôs o 2º turno na configuração (situação de 06/10). Normal até perto do dia. |
| `publicada` / `aguardando_resultados` | Configuração publicada (eleição 6258 para presidente, 6260 para governador), arquivos de resultado ainda não existem ou estão em 0%. |
| `publicada` / `em_apuracao` | Apuração em andamento. |
| `totalizada_100` / `concluida` | 100% totalizado / TSE marcou como final. |

Na página: a área **Fontes e saúde** mostra o mesmo. A conferência só aparece depois que a eleição é publicada.

No ensaio, quando a configuração passa a listar o 2º turno e os arquivos ainda dão 404, o coletor faz uma pausa preventiva de 2 min (3 respostas 404 seguidas) e volta sozinho. No dia 25 isso pode atrasar a primeira leitura em até 2 min. É o comportamento desejado: protege o IP.

## Dia 25/10

Votação de 8h às 17h (Brasília). A divulgação começa depois das 17h.

| Quando | O que fazer |
|---|---|
| 24/10, à noite | `conferir-no-ar` na produção. Tudo `ok`, `coletor rodando` com menos de 60 s. |
| 25/10, 16h30 | `conferir-no-ar` de novo. Abrir a página em modo TV (`?tv=1`) no monitor. |
| A partir de 17h | Acompanhar. O painel segue sozinho; não é preciso reiniciar nada. |
| Fim da apuração | "Eleito" só aparece quando o arquivo nacional do TSE trouxer essa situação. |
| 26/10 | Pausar o coletor (abaixo) para parar de consultar o TSE. A página continua mostrando o último dado. |

### Situações e o que fazer

| O que aparece | Causa provável | Ação |
|---|---|---|
| "Atrasada", UF hachurada | Um arquivo falhou nesta rodada; o painel mantém o último valor válido | Nada. Volta sozinho. |
| "Bloqueada" ou "Pausada" com motivo 403/429 | O TSE pediu para esperar | Nada. O coletor respeita o `Retry-After` ou espera 10 min. **Não** reduzir o intervalo nem republicar para "forçar". |
| Conferência "Atualizações em horários diferentes" | Arquivo nacional e de UF gerados em horários distintos | Normal durante a apuração. |
| Conferência "Diferença persistente a investigar" | Mesma diferença por 10 min | Comparar com o portal do TSE. **Não** é sinal de fraude: as duas colunas vêm da mesma base. |
| Página parada, "dados defasados" | Coletor parou | `conferir-no-ar`; ver `npx wrangler tail` (logs). O cron de 1 min rearma o coletor. |
| Erro novo depois de um deploy | Versão nova com problema | `npx wrangler rollback` volta para a versão anterior. |

### Pausar ou mudar o intervalo sem mexer no código

```bash
npx wrangler deploy --env="" --var PAUSADO:sim      # para de consultar o TSE
npx wrangler deploy --env="" --var INTERVALO_S:30   # intervalo maior (mínimo 10)
```

## Ensaio geral

- **Automático, sem rede:** `node --test tests/publicacao/*.test.mjs` passa a noite inteira pelo coletor com relógio simulado e confere as regras do prompt em cada rodada (roda no CI).
- **Completo, com relógio real:** `node ensaio/rodar.mjs` sobe o TSE simulado, o coletor (`coletor/node.js`), a página e um navegador; confere cada rodada, tira telas (computador, celular, TV) em cada marco e grava `ensaio/saida/resultado.json`. Leva ~26 min (`--escala 2` para metade).
- **Publicado:** o ambiente `ensaio` na Cloudflare repete a noite a cada 30 min, para qualquer um acompanhar no celular. `https://<ensaio>/_ensaio` diz em que ponto da noite está.

O que o ensaio confere em cada rodada (`ensaio/conferir.mjs`): votos inteiros; soma das 27 UFs + exterior = coluna A; regiões = soma dos inteiros e totalização pelas seções; regiões + exterior = Brasil, sem contar o DF duas vezes; diferença = A − B; "compatível" só com tudo igual; "eleito" só com a situação oficial; histórico sem soma repetida; último dado válido nunca some. E, por marco: nada de arquivo de resultado antes da configuração, SP atrasado acusado, correção do AC no histórico, 503/429 pausando, RR defasado e de volta, eleito só no fim e conferência final compatível.

## Plano B (se o TSE recusar a Cloudflare)

Decidir com o resultado do teste. Opções, em ordem de preferência:

1. **Coletor fora da Cloudflare, página na Cloudflare.** `coletor/node.js` roda numa máquina que o TSE aceita (o Mac, ou um runner do GitHub Actions por até 6 h) e envia os arquivos para o Worker. Mantém um só coletor para todos. Precisa de um pequeno receptor no Worker (frente 4) e de um token de envio.
2. **Consulta direta pelo navegador (como a v0).** Funciona sem servidor, mas cada visitante consulta o TSE, sem conferência centralizada e com risco de bloqueio com muitos acessos.
