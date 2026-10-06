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

| Camada | Arquivos | Responsabilidade | Dono |
|---|---|---|---|
| Conector oficial | `coletor/fonte.js`, `nucleo/descoberta.js` | HTTP com timeout, ETag/If-Modified-Since, backoff com variação, Retry-After, pausa global em 403/429 e em 404 em série, limite de requisições por segundo. URLs montadas **só** a partir da configuração oficial e de uma base fixa | frente 2 |
| Normalização | `nucleo/normalizar.js`, `nucleo/territorios.js` | Converte o JSON do TSE em inteiros e percentuais, valida campos, separa ausente (`null`) de zero; territórios com sigla TSE e código IBGE separados | frente 2 |
| Agregação e conferência | `nucleo/calcular.js`, `nucleo/conferencia.js` | Soma de inteiros por região e Brasil (27 UFs + exterior), totalização pelas seções, conferência A × B classificada | frente 2 |
| Armazenamento e histórico | `coletor/cloudflare/armazenamento.js`, `nucleo/historico.js` | Estado do coletor e últimos dados válidos no Durable Object (SQLite); série do nacional por versão publicada e correções | frente 2 |
| API (contrato v1) | `nucleo/contrato.js`, `nucleo/exportar.js`, `coletor/cloudflare/worker.js` | `/dados/v1/presidente.json`, `governador.json`, `historico.json`, `saude.json`, `export/*.csv` | frente 2 |
| Interface | `index.html`, `style.css`, `config.js`, `js/` | Só apresenta; o único arquivo que conhece o formato é `js/contrato.js` | frente 3 |
| Publicação e segurança | `wrangler.toml`, `publicacao/`, `.github/workflows/publicar.yml` | Deploy, cabeçalhos de segurança, montagem do site, conferência no ar | frente 4 |
| Ensaio | `ensaio/`, `tests/publicacao/` | TSE simulado, noite roteirizada, regras conferidas em cada rodada, latência e carga | frente 4 |

Modelo de dados: [docs/contrato/CONTRATO-DADOS.md](contrato/CONTRATO-DADOS.md) (dono: frente 2). Fontes e limitações: [docs/fontes/INVENTARIO.md](fontes/INVENTARIO.md) (dono: frente 1).

## Escolha de stack

O prompt admite React/Next.js com TypeScript "ou alternativa tecnicamente justificada". Ficamos com **JavaScript puro em módulos, sem build e sem dependências em produção**, com checagem de tipos do TypeScript (JSDoc, `tsc --checkJs --noEmit`) como ferramenta de desenvolvimento, sem etapa de build. Motivos:

- **Zero dependências em produção.** Nada de terceiros roda no navegador nem no Worker. Menos superfície de ataque e nenhum risco de cadeia de suprimentos às vésperas da eleição.
- **Carga rápida.** A página inteira (HTML, CSS, JS e mapa) tem cerca de 650 KB sem compressão, servida como arquivo estático pela borda da Cloudflare.
- **Menos risco a 19 dias da eleição.** O código das três frentes já funciona e está testado; migrar para React/Next agora trocaria um sistema verificado por um reescrito.
- **O mesmo núcleo roda em Node e na Cloudflare.** `nucleo/` é cálculo puro, testado em Node e executado no Worker sem adaptação.

Banco: o armazenamento SQLite do Durable Object guarda estado, últimos dados válidos e histórico. Não há banco separado, porque o volume é pequeno (dezenas de arquivos, poucas centenas de versões por noite) e um único escritor elimina concorrência.

Estado da checagem de tipos em 06/10: decidida, ainda não ligada no CI. Um primeiro `tsc --checkJs` acusa principalmente falta dos tipos do Node e anotações JSDoc incompletas; cada frente liga a checagem no seu código.

## Segurança

- **Sem administração exposta.** Não existe rota de administração. Intervalo, pausa e modo mudam só por variável no deploy (`wrangler.toml` ou `--var`), que exige o token da conta Cloudflare.
- **Segredos fora do código.** O único segredo é o token de deploy, guardado nos segredos do GitHub Actions. A página não tem nenhum segredo.
- **Sem URL arbitrária.** O coletor monta URLs só a partir da base fixa (`https://resultados.tse.jus.br`, ou a simulada no ensaio) e dos códigos lidos na configuração oficial. Nenhum parâmetro de visitante chega ao coletor; o Worker só repassa caminhos `/dados/v1/*`, apenas com GET e HEAD.
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
