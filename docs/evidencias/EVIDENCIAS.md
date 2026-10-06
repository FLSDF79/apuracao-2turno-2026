# Evidências e critérios de aceite

Cada exigência das seções 7 e 9 do prompt, com a prova correspondente ou a lacuna, e quem é dono dela. A execução mais recente das baterias está em [execucao.md](execucao.md) (gerado por `node publicacao/evidencias.mjs`), com logs completos em [logs/](logs/) e capturas em [telas/](telas/).

Legenda: ✅ comprovado · ⚠️ parcial · ❌ lacuna

## Seção 9: testes e critérios de aceite

| Exigência | Situação | Prova | Dono |
|---|---|---|---|
| Leitura real das fontes, com exemplos verificáveis | ✅ | 68 arquivos oficiais baixados do TSE em 06/10, conferidos por `sha256` (`tests/fixtures/tse-2026-10-06/MANIFEST.sha256`); bateria **fontes** | 1 |
| Soma nacional, regiões, exterior, sem dupla contagem | ✅ | Bateria **coletor** ("Brasil calculado… idêntico ao total nacional, campo a campo", "cinco regiões + exterior… sem dupla contagem do DF"); `ensaio/conferir.mjs` refaz as somas em cada rodada da noite simulada | 2, 4 |
| Percentuais | ✅ | Percentuais calculados batem com os publicados pelo TSE em todos os recortes (bateria **coletor**); tela = arquivo do TSE (ponta a ponta) | 2, 4 |
| Empate, dados ausentes | ✅ | "disputa: liderança, empate e ausência de votos"; "campo ausente vira null, não zero" (coletor e interface) | 2, 3 |
| Divisão por zero | ✅ | "divisão por zero vira null" (bateria **coletor**); 0% da noite simulada (minuto 4) sem erro | 2, 4 |
| Atualizações repetidas | ✅ | "mesma versão não duplica; versão nova substitui (não soma)"; 304 reaproveita o corpo | 2 |
| Atualizações fora de ordem | ✅ | "resposta fora de ordem…" (bateria **coletor**, confiabilidade) | 2 |
| Correções oficiais | ✅ | "queda vira correção aceita"; correção do AC na noite simulada (minuto 11) registrada no histórico | 2, 4 |
| Fonte indisponível | ✅ | 503 com Retry-After, 500 em RR, 429 na noite simulada; último valor mantido como "defasado" | 2, 4 |
| Resposta inválida | ✅ | "resposta 200 que não é JSON não substitui o último dado válido"; "arquivo de outra eleição, cargo ou recorte é rejeitado" | 2 |
| Defasagem | ✅ | SP atrasado em relação ao nacional (minuto 9) gera conferência não compatível; aviso de defasagem na página | 2, 3, 4 |
| Valores exibidos = arquivos de origem | ✅ | `publicacao/ponta-a-ponta.mjs`: votos, % e % totalizado na tela iguais a `vap`, `pvap` e `pst` do arquivo nacional do TSE | 4 |
| Mapas, filtros e navegação em computador e celular | ✅ | Ponta a ponta: cursor e clique em SP, Esc fecha, DF visível, filtro Norte = 7 UFs, tabela ordenável, exportação, toque no celular, sem rolagem lateral em 390 px, modo TV | 3, 4 |
| Build, testes e console do navegador | ✅ | Sem build por decisão de arquitetura; `wrangler deploy --dry-run` monta o Worker; console sem erros nem violação de CSP | 4 |
| Latência de atualização | ✅ | Noite simulada com relógio real: tempo do arquivo novo no TSE até o arquivo do coletor e até a tela ([execucao.md](execucao.md)) | 4 |
| Comportamento sob carga | ⚠️ | Teste de carga local contra o Worker em `wrangler dev`. Mede o nosso código numa máquina, não a rede da Cloudflare; repetir contra o ensaio publicado | 4 |
| Teste e 1º turno nunca como apuração real do 2º turno | ✅ | Faixa "ENSAIO · 1º turno" e "SIMULAÇÃO" verificadas na tela; `modo` conferido em cada rodada | 3, 4 |

## Seção 7: atualização e confiabilidade

| Exigência | Situação | Prova | Dono |
|---|---|---|---|
| Coletor único no servidor | ✅ | Durable Object único; carga no TSE independe do número de visitantes | 2, 4 |
| Intervalo 10 a 30 s, configurável | ✅ | `INTERVALO_S` = 15, mínimo 10 forçado | 2 |
| Cache, requisição condicional, controle global | ✅ | ETag/If-Modified-Since, 304; limite de 10 req/s; cache de 5 s no Worker | 2 |
| Timeouts, backoff, Retry-After, pausa diante de bloqueio | ✅ | Testes do conector e noite simulada (503, 429, 404 em série) | 2, 4 |
| Atualização sem recarregar a página | ✅ | A página relê os arquivos a cada 10 s; latência medida na tela | 3, 4 |
| Último dado válido com indicação de defasagem | ✅ | RR com erro 500 por 2 min fica "defasado" com o último valor; `ensaio/conferir.mjs` falha se um recorte perder o resultado | 2, 3, 4 |
| Validação de esquema e respostas incompletas | ✅ | `backend/normalizacao/validar.js`; arquivo de outra eleição, cargo ou recorte rejeitado; 200 que não é JSON não substitui o último válido | 2 |
| Histórico de snapshots com origem, horário, identificador e hash | ✅ | `snapshots/<sha256>.json` imutável; `coleta.sha256`; `serie_brasil[].sha256`; correções com `de_sha256`/`para_sha256` | 2 |
| Separar última consulta ok, horário da fonte e última mudança efetiva | ✅ | `tempos.ultima_consulta_ok`, `publicacao_fonte`, `ultima_mudanca` no contrato; três horários separados na tela | 2, 3 |
| Não atualizar relógio para parecer dado novo | ✅ | `gerado_em` só muda quando o dado muda; a tela separa "consulta ok" de "dados de" | 2, 3 |
| Nenhum LLM nos números | ✅ | Todo cálculo é código determinístico em `nucleo/` | 2 |

## Latência e carga: como ler os números

- **Latência medida** na noite simulada (relógio real, [execucao.md](execucao.md)): do arquivo novo no TSE simulado até o arquivo do coletor, mediana ~4 s; até a tela, mediana ~12 s, máximo 14 s, sem nenhuma versão perdida. O coletor desse ensaio começou alinhado com os blocos de 30 s do roteiro, o que favorece o número do coletor.
- **Pior caso esperado em 25/10**, sem esse alinhamento: até 15 s do coletor (intervalo) + até 10 s da página (releitura) + tempo de rede, ou seja **até ~25 s**, média em torno de 12 s. É o "tempo real" da seção 7: baixa latência sobre a publicação oficial.
- **Carga por visitante** no Worker: 871 pedidos por hora (era 1.008 antes do ajuste da frente 3 no `historico.json`). No plano gratuito, a cota de 100 mil por dia dá ~115 visitantes-hora (detalhes em [OPERACAO.md](../publicacao/OPERACAO.md#custos)).
- **Carga no TSE**: independe de visitantes; na noite simulada, pico de 146 requisições por minuto (2,4/s), quase metade respondidas com 304.

## Observações enviadas aos donos

- **Frente 2 (resolvido em 06/10, commit 55d8f58):** recorte defasado com conferência "compatível" passou a dar "cobertura incompleta"; a pausa de 2 min na publicação da configuração virou sentinela de 404. O verificador do ensaio agora trata a combinação antiga como falha.
- **Frente 3 (resolvido em 06/10, commit b535e47):** o sobretítulo passou a vir da eleição lida (no ensaio: "1º turno · 04/10"); com 100% totalizado e sem declaração do TSE, o placar diz "Mais votado · 100% totalizado, sem declaração de eleito"; `historico.json` passou a ser relido só quando o placar muda ou a cada ~60 s, reduzindo os pedidos por visitante.
