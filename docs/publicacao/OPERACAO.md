# Operação: execução, configuração, custos e manutenção

## Execução local

Requisitos: Node 22 (o mesmo do CI) e Python 3.12 para os testes das fontes. Nenhuma dependência para instalar; `wrangler` e Playwright só são usados por ferramentas de publicação e ensaio.

| Para quê | Comando |
|---|---|
| Todos os testes das três frentes, com evidências em `docs/evidencias/` | `node publicacao/evidencias.mjs` |
| Ponta a ponta com os arquivos oficiais do 1º turno, até o navegador | `node publicacao/ponta-a-ponta.mjs` |
| Noite simulada completa (TSE simulado → coletor → página → navegador) | `node ensaio/rodar.mjs` (~26 min) |
| Página com o Worker de verdade, localmente | `node publicacao/montar-site.mjs && npx wrangler dev --env ensaio` |
| Coletor sozinho, gravando arquivos numa pasta | `node backend/execucao/node.js --saida public/dados` |
| Conferir um painel publicado | `node publicacao/conferir-no-ar.mjs <url> --esperar 90` |
| Teste de carga local | `node publicacao/teste-carga.mjs http://localhost:8787 --conexoes 200 --segundos 30` |

## Configuração

| Onde | Item | Padrão | Observação |
|---|---|---|---|
| `wrangler.toml` `[vars]` | `INTERVALO_S` | 15 | Segundos entre rodadas do coletor. Mínimo 10 (forçado no código). |
| | `PAUSADO` | `nao` | `sim` para de consultar o TSE e mantém o último dado. |
| | `MODO` | `oficial` | `simulacao` no ensaio; `ensaio` no `teste-tse` (1º turno real). |
| | `MAX_NOVOS_POR_EXECUCAO` | 12 | Arquivos novos processados por execução; o resto segue 1 s depois. Se a CPU estourar nos logs, baixe para 8. |
| `config.js` (página, frente 3) | `atualizacaoSeg` | 10 | De quanto em quanto a página relê os arquivos do coletor. |
| | `defasagemAvisoSeg` | 90 | Depois disso a página avisa "dados defasados". |
| | `candidatos` | 22 azul, 13 vermelho | Ordem e cor padrão; o visitante pode trocar (fica salvo no navegador dele). |
| | `governadorUFs` | AC, AM, DF, ES, RN, TO | Conferido nos arquivos oficiais do 1º turno. |
| Segredo do Worker | `ADMIN_TOKEN` | — | `npx wrangler secret put ADMIN_TOKEN` (32+ caracteres, ex.: `openssl rand -hex 32`). Liga `/admin/*`; sem ele a administração fica desligada. |
| GitHub Actions, segredos | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | — | Necessários para publicar. |
| GitHub Actions, variável | `URL_PAINEL` | — | Só se a produção tiver domínio próprio; senão a conferência usa o endereço `workers.dev` do deploy. |

Administração em operação (sem novo deploy):

```bash
curl -H "Authorization: Bearer $ADMIN_TOKEN" https://<painel>/admin/estado
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" https://<painel>/admin/pausar    # para de consultar o TSE
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" https://<painel>/admin/retomar
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" https://<painel>/admin/rodada    # força uma rodada agora
```

Pausa de emergência sem token (exige deploy): `npx wrangler deploy --env="" --var PAUSADO:sim`.

## Custos

**Plano escolhido: Cloudflare Workers gratuito, custo R$ 0** (decisão do Fabiano em 06/10: público pequeno). Limites e preços conferidos em 06/10 em developers.cloudflare.com/workers/platform/pricing e /limits.

| Recurso | Limite gratuito | Consumo medido no ensaio | Margem |
|---|---|---|---|
| Página (HTML, JS, mapa) | Ilimitado: arquivos estáticos não contam | — | — |
| Requisições ao Worker (`/dados/v1/*`) | 100 mil por dia (zera 0h UTC, 21h de Brasília) | **871 por visitante por hora** (14,5/min, medido no ensaio de 06/10: `presidente` a cada 10 s, `historico` quando o placar muda ou a cada ~60 s, `governador` e `saude` a cada ~30 s) | **~115 visitantes-hora por dia**. Ex.: 19 pessoas acompanhando 6 h = 114 |
| Requisições ao Durable Object | 100 mil por dia | Alarme a cada 15 s = 5.760/dia, mais no máximo 4 leituras a cada 5 s (cache do Worker) enquanto houver visitantes | Folgado |
| Linhas gravadas no Durable Object (cada chave de `put` e cada `setAlarm`) | 100 mil por dia, **da conta inteira** (zera 21h de Brasília) | Rodada sem novidade: ~9 linhas. Noite simulada: picos de 220 a 320 por minuto (frente 4, 23/10) | Com o ritmo ocioso (60 s sem mudança há 5 min): ~13 mil até as 17h de domingo e no máximo ~65 mil das 17h às 21h, ~78 mil no dia UTC. **Só cabe com um coletor ligado**: apague `teste-tse` e `ensaio` antes de sábado 24/10 às 21h |
| Duração do Durable Object | 13.000 GB-s por dia, da conta inteira | A 15 s fixos o objeto quase não hiberna: ~10.800 GB-s/dia (estimativa) | Com o ritmo ocioso, ~3.500 GB-s no domingo. Dois coletores a 15 s passariam do limite |
| CPU por invocação | 10 ms (Worker); 30 s por execução de Durable Object | Depois do ajuste da frente 2 (d38f7c6), em Node: rodada sem novidade ~2,5 ms; com os 38 arquivos mudando, ~5 ms na execução que monta os arquivos e ~2 ms nas parciais (no máximo 12 arquivos novos por execução) | Cabe; confirmar no 1º deploy |

**Ritmo ocioso.** Sem nenhuma mudança real há 5 minutos e com a coleta saudável, o coletor passa a consultar a cada `INTERVALO_OCIOSO_S` (60 s) e volta a 15 s na primeira mudança (`coleta_geral.ritmo` = `ocioso`/`normal`). No domingo isso só atrasa em até 60 s a primeira atualização depois das 17h. **Se a cota de linhas acabar**, o `setAlarm` falha, o coletor para até 21h de Brasília e a página mostra "dados defasados"; o cron rearma o alarme depois da virada.

**Se a cota de requisições acabar**, as leituras de `/dados` falham até a virada do dia (21h de Brasília) e a página mostra "sem conexão com o coletor" com o último dado que já tinha. A página continua abrindo. Para um público pequeno isso não deve acontecer; o número de visitantes-hora é a margem a vigiar (painel da Cloudflare, *Workers & Pages > Metrics*).

**CPU.** No plano gratuito, a Cloudflare limita 10 ms de CPU por requisição e por cron do Worker; a página de limites dos Durable Objects fala em 30 s por execução, sem valor diferente para o gratuito. Mesmo assim, a rodada foi enxugada para caber nos 10 ms (medianas acima; `npm run cpu` mede de novo). Confirmação no primeiro deploy: `npx wrangler tail --env ensaio` (aparece `exceededCpu` se estourar) e a CPU por execução nos logs do Worker (*Workers & Pages > Logs*). Se passar, baixe `MAX_NOVOS_POR_EXECUCAO` para 8; se ainda assim não couber, as saídas são o coletor fora da Cloudflare (ver [contingência](CONTINGENCIA.md#plano-b-tse-recusa-a-cloudflare)) ou o plano pago, que é decisão do Fabiano.

Teste de carga local (`publicacao/teste-carga.mjs` contra `wrangler dev`, uma máquina de 4 núcleos): 200 conexões simultâneas por 30 s, **322 req/s, 9.770 respostas, nenhum erro**, p50 578 ms, p95 1,0 s. Com 1.000 conexões, nenhum erro, mas latência alta (p50 5,3 s) por saturar a máquina de teste. Na Cloudflare cada pedido é atendido no ponto de presença mais próximo, então o gargalo real para o plano gratuito é a cota diária, não a vazão.

## Manutenção

- **Atualizações de código:** PR na `main`. O fluxo `Publicar na Cloudflare` roda todos os testes no PR e publica a produção ao mesclar. Para testar antes, rode o fluxo manualmente com `ensaio`.
- **Voltar uma versão:** `npx wrangler rollback` (ou *Workers & Pages > apuracao-2turno-2026 > Deployments*).
- **Logs ao vivo:** `npx wrangler tail` (produção) ou `npx wrangler tail --env ensaio`.
- **Depois da eleição:** pausar o coletor (`/admin/pausar` ou `--var PAUSADO:sim`). A página continua no ar com o último resultado. Se assinou o plano pago só para a eleição, cancele em *Workers & Pages > Plans*.
- **Mudança no formato do TSE:** o coletor marca o recorte como indisponível e mantém o último dado válido; a correção é em `backend/conectores` ou `backend/normalizacao` (frente 2). O inventário (frente 1) registra a mudança.
- **Dados pessoais:** nenhum é coletado. Não há banco de usuários, cookies ou login para manter.
