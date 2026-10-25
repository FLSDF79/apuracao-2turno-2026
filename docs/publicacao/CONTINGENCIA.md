# Procedimento para indisponibilidade das fontes

Regra geral: **o painel nunca inventa, nunca projeta e nunca apaga o último dado válido.** Quando a fonte falha, ele mostra o último valor oficial lido, com o horário dele e o aviso de defasagem, e volta sozinho quando a fonte volta.

Onde olhar: área **Fontes e saúde** da página, `https://<painel>/dados/v1/saude.json` e `node publicacao/conferir-no-ar.mjs <painel>`.

| Situação | Como aparece | O que o sistema faz sozinho | O que a pessoa faz | O que **não** fazer |
|---|---|---|---|---|
| TSE lento ou fora do ar (timeout, 5xx) | "Atrasada"; UFs afetadas com hachura de "fonte defasada"; horário da última coleta envelhece | Backoff exponencial com variação por arquivo; respeita `Retry-After` do 503; mantém o último dado | Acompanhar. Confirmar no portal do TSE se o problema é geral | Reduzir o intervalo, republicar para "forçar" |
| TSE bloqueando (403 ou 429) | "Bloqueada" com o motivo e o horário de retorno | Pausa global: o tempo do `Retry-After` ou 10 min (prazo da documentação do TSE) | Nada. Se repetir, aumentar o intervalo: `--var INTERVALO_S:30` | Trocar de IP ou de rede para contornar o bloqueio |
| Configuração do 2º turno ainda não publicada | "Aguardando configuração"; nenhuma conferência | Lê só o `ele-c.json`, a cada 60 s. Não tenta adivinhar endereços | Nada. Ver [roteiro](ROTEIRO-25-10.md#como-saber-que-o-tse-publicou-a-configuração-do-2º-turno) | Digitar códigos ou URLs "prováveis" (404 em série bloqueia o IP) |
| Configuração publicada, arquivos ainda 404 | "Aguardando divulgação" | Depois de 3 respostas 404 seguidas, pausa de 2 min e tenta de novo | Nada; no ensaio isso atrasou a primeira leitura em até 2 min | — |
| Um arquivo de UF com erro | UF "defasada" no mapa e na tabela; conferência "cobertura incompleta" ou com o aviso no motivo | Mantém o último valor da UF; continua lendo as outras | Nada. Se durar, comparar a UF no portal do TSE | Somar ou estimar a UF "no olho" |
| Resposta inválida (JSON quebrado, campo faltando) | Recorte "indisponível" ou "defasado" com a mensagem de erro em Fontes e saúde | Recusa o arquivo e mantém o último válido | Registrar o caso para a frente 2 (conector e normalização) | Editar o arquivo à mão |
| Correção oficial (votos diminuem) | Ponto marcado como correção no histórico | Aceita o valor novo como veio e registra a queda | Nada | Forçar crescimento dos votos |
| Conferência "diferença persistente" | Selo amarelo na Conferência | Classifica depois de 10 min com a mesma diferença | Comparar com o portal do TSE. É conferência de consistência da mesma base, **não** indício de fraude | Divulgar como irregularidade |
| Coletor parado | Aviso "dados defasados" na página; `conferir-no-ar` falha em "coletor rodando" | Cron de 1 em 1 min rearma o alarme | `npx wrangler tail`; se um deploy recente quebrou, `npx wrangler rollback` | — |
| Cloudflare fora | Página não abre | — | Aguardar; o painel não guarda dado que não esteja no TSE. Divulgar o portal do TSE | — |
| TSE recusa consultas vindas da Cloudflare | `HTTP do TSE` com 403 desde o primeiro deploy | Pausa como bloqueio | Plano B (abaixo) | Contornar o bloqueio |

## Plano B: TSE recusa a Cloudflare

Decidido com o resultado do teste de acesso (frente 2). O que existe de fato hoje (conferido em 23/10):

1. **`/plano-b/` no próprio endereço do painel (pronto).** A versão anterior do painel (commit `4fe9299`), sem a projeção, vai junto em todo deploy, em `https://<painel>/plano-b/`. Cada navegador consulta o TSE direto (`resultados.tse.jus.br` ecoa o `Origin` no CORS), com descoberta automática da 6258 pelo `ele-c.json`; o `_headers` libera `connect-src` para o TSE só nessa pasta. Sem coletor, conferência ou governador, e com risco de bloqueio se muitos visitantes abrirem, mas o público é pequeno. Testada em 25/10 com o CSP real (wrangler dev) e o TSE simulado do 2º turno. *Correção de 25/10:* o GitHub Pages do repositório nunca foi ativado (`has_pages: false`; o `pages.yml` falhou em 06/10), então não há v0 no ar fora daqui.
2. **Divulgar o portal do TSE** (resultados.tse.jus.br) se nem o v0 responder.
3. *Não implementado:* coletor fora da Cloudflare (`backend/execucao/node.js` no Mac ou num runner) enviando arquivos ao Worker. Exigiria um receptor autenticado que o Worker não tem (`/admin/*` só aceita estado, pausar, retomar e rodada). A página nova também não consulta o TSE direto: ela só lê `/dados/v1/` e a CSP (`connect-src 'self'`) bloquearia.

Por isso o teste `teste-tse` precisa rodar antes de sábado: se der 403/429, o link a divulgar no domingo é o do v0.
