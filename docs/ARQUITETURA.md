# Arquitetura

Painel independente da apuração do 2º turno de 25/10/2026, com dados oficiais do TSE. Feito por Fabiano Silva.

## Visão geral

```
 TSE (resultados.tse.jus.br)                         Cloudflare (plano gratuito)
 ┌──────────────────────────┐   a cada 15 s   ┌───────────────────────────────────────────────┐
 │ ele-c.json (configuração) │◄───────────────│ Coletor único (Durable Object + alarme)        │
 │ br / 27 UFs / zz (-u.json)│  ETag, backoff, │  conector → normalização → cálculo → contrato │
 │ abrangência (-ab.json)    │  Retry-After    │  estado e histórico no armazenamento do DO    │
 └──────────────────────────┘                 └──────────────────────┬────────────────────────┘
                                                                     │ /dados/v1/*.json, *.csv (cache 5 s)
                                         ┌───────────────────────────▼────────────────────────┐
  visitantes (computador, celular, TV) ──►│ Worker: página estática + /dados/v1 + segurança    │
                                         └────────────────────────────────────────────────────┘
```

Só o coletor fala com o TSE. A página só lê o que ele publica e não recalcula nada. Mil ou cem mil visitantes geram a mesma carga no TSE: cerca de 36 arquivos a cada 15 s, quase todos respondidos com 304.

## Camadas e onde estão

| Camada | Pasta | Responsabilidade | Dono |
|---|---|---|---|
| Conectores oficiais | `backend/conectores/` (`http.js`, `tse.js`) | HTTP com timeout, ETag/If-Modified-Since, backoff com variação, Retry-After, pausa global em 403/429, sentinela de 404, limite de requisições por segundo, **lista fechada de hosts** (só `resultados.tse.jus.br` e o host de simulação do TSE). URLs montadas só a partir da configuração oficial | frente 2 |
| Normalização e validação | `backend/normalizacao/` | JSON do TSE → inteiros e percentuais; validação de esquema; ausente (`null`) ≠ zero; territórios com sigla TSE e código IBGE separados | frente 2 |
| Agregação e conferência | `backend/agregacao/` | Soma de inteiros por região e Brasil (27 UFs + exterior), totalização pelas seções, conferência A × B classificada, histórico com correções | frente 2 |
| Armazenamento | `backend/armazenamento/` | Estado e últimos dados válidos no Durable Object (SQLite) ou em arquivos (Node); snapshots imutáveis por SHA-256 | frente 2 |
| API (contrato v1) | `backend/api/`, `backend/execucao/` | `/dados/v1/*.json`, `export/*.csv`, `snapshots/<sha>.json`; administração autenticada | frente 2 |
| Interface | `index.html`, `style.css`, `config.js`, `js/` | Só apresenta; o único arquivo que conhece o formato é `js/contrato.js` | frente 3 |
| Publicação e segurança | `wrangler.toml`, `publicacao/`, `.github/workflows/publicar.yml` | Deploy, cabeçalhos de segurança, montagem do site, conferência no ar, verificação da página | frente 4 |
| Ensaio | `ensaio/`, `tests/publicacao/` | TSE simulado, noite roteirizada, regras conferidas em cada rodada, latência e carga | frente 4 |

Modelo de dados: [docs/contrato/CONTRATO-DADOS.md](contrato/CONTRATO-DADOS.md) e [docs/arquitetura/DADOS.md](arquitetura/DADOS.md) (dono: frente 2). Critérios de teste do backend: [docs/testes/CRITERIOS.md](testes/CRITERIOS.md). Fontes e limitações: [docs/fontes/INVENTARIO.md](fontes/INVENTARIO.md) (dono: frente 1).

## Escolha de stack

O prompt admite React/Next.js com TypeScript "ou alternativa tecnicamente justificada". Ficamos com **JavaScript puro em módulos, sem build e sem dependências em produção**, com checagem de tipos do TypeScript (JSDoc, `tsc --checkJs --noEmit`) como ferramenta de desenvolvimento, sem etapa de build. Motivos:

- **Zero dependências em produção.** Nada de terceiros roda no navegador nem no Worker. Menos superfície de ataque e nenhum risco de cadeia de suprimentos às vésperas da eleição.
- **Carga rápida.** A página inteira (HTML, CSS, JS e mapa) tem cerca de 650 KB sem compressão, servida como arquivo estático pela borda da Cloudflare.
- **Menos risco a 19 dias da eleição.** O código das três frentes já funciona e está testado; migrar para React/Next agora trocaria um sistema verificado por um reescrito.
- **O mesmo núcleo roda em Node e na Cloudflare.** `nucleo/` é cálculo puro, testado em Node e executado no Worker sem adaptação.

Banco: o armazenamento SQLite do Durable Object guarda estado, últimos dados válidos e histórico. Não há banco separado, porque o volume é pequeno (dezenas de arquivos, poucas centenas de versões por noite) e um único escritor elimina concorrência.

A checagem de tipos roda no CI do backend (`npm run tipos`) e da interface (`npm run tipos:painel`); `typescript` e `@types/node` são só dependências de desenvolvimento.

## Segurança

- **Administração protegida.** `/admin/estado`, `/admin/pausar`, `/admin/retomar` e `/admin/rodada` exigem `Authorization: Bearer` com o segredo `ADMIN_TOKEN` (32+ caracteres, criado com `wrangler secret put ADMIN_TOKEN`, comparação em tempo constante). Sem o segredo, a administração fica desligada. Pausa de emergência sem token: variável `PAUSADO=sim` no deploy.
- **Segredos fora do código.** Token de deploy nos segredos do GitHub Actions; `ADMIN_TOKEN` como segredo do Worker. A página não tem nenhum segredo.
- **Sem URL arbitrária.** O coletor monta URLs só a partir da base fixa (`https://resultados.tse.jus.br`, ou a simulada no ensaio) e dos códigos lidos na configuração oficial. O conector recusa qualquer host fora da lista fechada. Nenhum parâmetro de visitante chega ao coletor; as rotas públicas são só `/dados/v1/<nome>.json`, `export/<nome>.csv` e `snapshots/<sha>.json`, apenas com GET e HEAD.
- **Sem dados pessoais.** Nada de login, cookie, formulário ou rastreamento. Os arquivos do TSE usados são agregados por UF; não há dado de eleitor.
- **Cabeçalhos** (`publicacao/seguranca.mjs`, aplicados à página por `_headers` e ao `/dados` pelo Worker): Content-Security-Policy restrita à própria origem (exceções: fontes do Google e o selo da NFLS.AI Arena), `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` sem câmera, microfone ou localização, HSTS.
- **Determinismo.** Nenhum LLM consulta, soma ou interpreta números. Todo cálculo é código determinístico e testado.

## Ambientes

| | Produção | Ensaio publicado | Ensaio local | Ponta a ponta local |
|---|---|---|---|---|
| Origem dos dados | TSE oficial | TSE simulado dentro do Worker | TSE simulado em Node | Arquivos oficiais do 1º turno |
| Faixa na tela | nenhuma | SIMULAÇÃO | SIMULAÇÃO | ENSAIO · 1º turno |
| Como rodar | `wrangler deploy --env=""` | `wrangler deploy --env ensaio` | `node ensaio/rodar.mjs` | `node publicacao/ponta-a-ponta.mjs` |

Operação, custos e manutenção: [docs/publicacao/OPERACAO.md](publicacao/OPERACAO.md). Roteiro do dia: [docs/publicacao/ROTEIRO-25-10.md](publicacao/ROTEIRO-25-10.md).
