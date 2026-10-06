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
| | `MODO` | `oficial` | `simulacao` só no ambiente de ensaio. |
| `config.js` (página, frente 3) | `atualizacaoSeg` | 10 | De quanto em quanto a página relê os arquivos do coletor. |
| | `defasagemAvisoSeg` | 90 | Depois disso a página avisa "dados defasados". |
| | `candidatos` | 22 azul, 13 vermelho | Ordem e cor padrão; o visitante pode trocar (fica salvo no navegador dele). |
| | `governadorUFs` | AC, AM, DF, ES, RJ, RN, TO | Conferido nos arquivos oficiais do 1º turno. |
| Segredo do Worker | `ADMIN_TOKEN` | — | `npx wrangler secret put ADMIN_TOKEN` (32+ caracteres, ex.: `openssl rand -hex 32`). Liga `/admin/*`; sem ele a administração fica desligada. |
| GitHub Actions, segredos | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | — | Necessários para publicar. |
| GitHub Actions, variáveis | `URL_PAINEL`, `URL_ENSAIO` | — | Para a conferência automática depois do deploy. |

Administração em operação (sem novo deploy):

```bash
curl -H "Authorization: Bearer $ADMIN_TOKEN" https://<painel>/admin/estado
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" https://<painel>/admin/pausar    # para de consultar o TSE
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" https://<painel>/admin/retomar
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" https://<painel>/admin/rodada    # força uma rodada agora
```

Pausa de emergência sem token (exige deploy): `npx wrangler deploy --env="" --var PAUSADO:sim`.

## Custos

CUSTOS_PREENCHIDOS_PELO_ENSAIO

## Manutenção

- **Atualizações de código:** PR na `main`. O fluxo `Publicar na Cloudflare` roda todos os testes no PR e publica a produção ao mesclar. Para testar antes, rode o fluxo manualmente com `ensaio`.
- **Voltar uma versão:** `npx wrangler rollback` (ou *Workers & Pages > apuracao-2turno-2026 > Deployments*).
- **Logs ao vivo:** `npx wrangler tail` (produção) ou `npx wrangler tail --env ensaio`.
- **Depois da eleição:** pausar o coletor (`/admin/pausar` ou `--var PAUSADO:sim`). A página continua no ar com o último resultado. Se assinou o plano pago só para a eleição, cancele em *Workers & Pages > Plans*.
- **Mudança no formato do TSE:** o coletor marca o recorte como indisponível e mantém o último dado válido; a correção é em `backend/conectores` ou `backend/normalizacao` (frente 2). O inventário (frente 1) registra a mudança.
- **Dados pessoais:** nenhum é coletado. Não há banco de usuários, cookies ou login para manter.
