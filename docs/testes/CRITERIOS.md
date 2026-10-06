# Critérios do lado dos dados × testes

Cada critério do prompt (seções 2, 3, 4, 7, 8 e 9) que cabe ao coletor tem pelo menos um teste automático. Rodar: `npm test` (Node), `npm run tipos` (checagem de tipos) e `python3 -m unittest discover -s tests` (fontes). O CI roda os três e confere se `exemplos/` está atualizado.

| Critério | Teste (arquivo › nome) |
|---|---|
| Votos e contagens são inteiros; ausente vira `null`, nunca zero | `normalizar` › contagens viram inteiros e campo ausente vira null, não zero |
| Percentual do candidato sobre vvc, igual ao TSE | `calcular` › percentuais calculados batem com os oficiais do TSE…; base do percentual é vvc… |
| Somar inteiros antes de dividir (região nunca é média de percentuais) | `calcular` › região soma votos antes do percentual… |
| Brasil calculado = 27 UFs + exterior, idêntico ao total nacional | `calcular` › Brasil calculado (27 UFs + exterior) é idêntico ao total nacional, campo a campo |
| Exterior entra uma vez, DF sem dupla contagem | `calcular` › exterior entra uma única vez…; as cinco regiões + exterior somam o Brasil… |
| Recorte ausente não vira zero e aparece na lista de faltantes | `calcular` › recorte ausente fica listado e não vira zero… |
| Divisão por zero não gera NaN nem Infinity | `calcular` › divisão por zero vira null |
| Liderança, empate e sem votos (liderança parcial ≠ vitória) | `calcular` › disputa: liderança, empate e ausência de votos |
| "Eleito" só quando a fonte diz | `normalizar` › 'eleito' só vem da situação textual…; `rodada` › noite simulada… (eleito só no fim) |
| Governador separado de presidente, só nas 7 UFs | `calcular` › governador: os 7 arquivos…; `rodada` › governador com abrangência 'br'… |
| Conferência A × B com 4 classes; A e B nunca somados | `conferencia` › os 5 testes (compatível, cobertura incompleta, horários diferentes, persistente, sem nacional) |
| Diferença temporária não é tratada como erro | `conferencia` › nacional mais novo que uma UF: horários diferentes… |
| Arquivo cumulativo substitui, não soma; sem recontagem em rodadas repetidas | `historico` › mesma versão não duplica…; `confiabilidade` › snapshot: … rodadas repetidas não duplicam nem recontam |
| Correção oficial aceita e registrada | `historico` › … queda vira correção aceita; `rodada` › noite simulada… (correção no AC) |
| Resposta fora de ordem não substitui a mais nova | `confiabilidade` › resposta fora de ordem… |
| Validação de esquema; resposta incompleta rejeitada com motivo | `confiabilidade` › resposta incompleta é rejeitada com motivo… |
| Inconsistência aritmética vira alerta sem descartar o dado oficial | `confiabilidade` › identidade aritmética quebrada vira alerta… |
| Falha no meio da noite mantém o último válido e marca defasado | `confiabilidade` › arquivo inválido no meio da noite…; `fonte` › resposta 200 que não é JSON… |
| Snapshot com origem, horário, identificador e hash conferível | `confiabilidade` › snapshot: SHA-256 igual ao do arquivo oficial byte a byte… |
| Três horários separados; relógio não avança sem mudança | `confiabilidade` › três horários separados… |
| Descoberta só pela configuração oficial; sem adivinhar URL | `descoberta` › os 5 testes |
| Não confundir eleições (ensaio × 2º turno) | `normalizar` › arquivo de outra eleição…; `rodada` › troca do ensaio para o 2º turno não mistura eleições |
| Respeitar o TSE: 304, backoff, Retry-After, pausa em bloqueio e 404 em série, limite por segundo | `fonte` › os 7 testes |
| Backend não consulta URL arbitrária | `confiabilidade` › o backend só consulta endereços do TSE…; configuração com modelo de diretório apontando para outro host… |
| Administração protegida, segredo fora do frontend | `confiabilidade` › token de administração… (as rotas foram conferidas também no `wrangler dev`: 401 sem token, 404 fora da lista) |
| Tabela TSE × IBGE explícita e conferida | `territorios` › tabela TSE × IBGE… |
| Estado do Durable Object volta igual após reinício | `cloudflare` › estado dividido no storage… |
| Cabe no plano gratuito (linhas gravadas/dia) | `cloudflare` › plano gratuito: rodada sem novidade do TSE regrava poucas chaves |
| Situação da coleta para a página (ok, atrasada, bloqueada) | `rodada` › resumo da coleta para a página… |
| Ensaio e simulação identificados; nunca como 2º turno real | `rodada` › dados de teste nunca saem como apuração real: modo e aviso em todos os arquivos e no CSV |
| Exportação CSV/JSON com origem e horário | `rodada` › dados de teste nunca saem como apuração real… (confere `origem`, horários, `url_fonte`, `sha256_arquivo`) |
| Fontes oficiais inventariadas (frente 1) | `tests/test_*.py` (Python) |

Critérios de página (mapa, acessibilidade, layout) ficam na frente 3; publicação e ensaio geral, na frente 4.
