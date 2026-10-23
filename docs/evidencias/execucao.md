# Execução das baterias de teste

Gerado por `node publicacao/evidencias.mjs` em 2026-10-06T15:49:43.023Z (commit 73e86de).

| Frente | Bateria | Resultado | Tempo | Saída |
|---|---|---|---|---|
| 1 · fontes | Consistência dos arquivos oficiais guardados | ✅ 11 testes, todos ok | 0.1 s | [log](logs/fontes.txt) |
| 2 · coletor e cálculo | Coletor, normalização, agregação, conferência, histórico | ✅ 53 ok, 0 falha(s) | 1.4 s | [log](logs/coletor.txt) |
| 3 · painel | Leitura do contrato pela página, estados, cores, horários, exportação | ✅ 20 ok, 0 falha(s) | 0.2 s | [log](logs/interface.txt) |
| 3 · painel | Página no navegador (Chromium): estados, mapa, acessibilidade | ✅ 46 ok, 0 falha(s) | 10.8 s | [log](logs/navegador.txt) |
| 4 · publicação | Noite simulada inteira pelo coletor, TSE simulado, site e deploy | ✅ 10 ok, 0 falha(s) | 27.6 s | [log](logs/publicacao.txt) |
| 2 · coletor e cálculo | Exemplos do contrato regenerados sem diferença | ✅ ok | 0.3 s | [log](logs/exemplos.txt) |

## Ponta a ponta com dados oficiais reais (1º turno)

2026-10-06T15:48:19.950Z · `node publicacao/ponta-a-ponta.mjs`

| | Verificação | Detalhe |
|---|---|---|
| ✅ | arquivos oficiais íntegros (sha256) | 68 arquivos |
| ✅ | coletor rodou sobre os arquivos oficiais | 2026-10-06T15:48:08.363Z concluida ok req=38 http={"200":38} conferência=compativel |
| ✅ | placar com dois candidatos | 22 × 13 |
| ✅ | votos de 22 na tela = contrato | 56.104.503 votos · contrato 56104503 |
| ✅ | % de 22 na tela = contrato | 47,03% · contrato 47,03% |
| ✅ | votos de 22 na tela = arquivo do TSE (vap) | 56.104.503 votos · TSE 56104503 |
| ✅ | % de 22 na tela = arquivo do TSE (pvap) | 47,03% · TSE 47,03% |
| ✅ | votos de 13 na tela = contrato | 53.879.538 votos · contrato 53879538 |
| ✅ | % de 13 na tela = contrato | 45,16% · contrato 45,16% |
| ✅ | votos de 13 na tela = arquivo do TSE (vap) | 53.879.538 votos · TSE 53879538 |
| ✅ | % de 13 na tela = arquivo do TSE (pvap) | 45,16% · TSE 45,16% |
| ✅ | % totalizado na tela = contrato | 100,00% |
| ✅ | % totalizado na tela = arquivo do TSE (pst) | 100,00% · TSE 100,00% |
| ✅ | faixa de teste "ensaio" visível | ENSAIO COM O 1º TURNO ENSAIO com os arquivos reais do 1º turno de 04/10/2026. Não é a apuração do 2º turno. |
| ✅ | crédito do autor |  |
| ✅ | selo NFLS.AI Arena |  |
| ✅ | mapa desenhado com SP |  |
| ✅ | passar o cursor em SP mostra votos e totalização | São Paulo Concluída Flávio Bolsonaro 51,93% 12.922.023 Lula 38,20% 9.505.413 Diferença 3.416.610 vot |
| ✅ | clicar em SP abre o detalhamento estadual | Fechar São Paulo UF · região Sudeste · Concluída Flávio Bolsonaro 22 51,93% 12.922.023 votos · à fre |
| ✅ | Esc fecha o detalhamento |  |
| ✅ | DF visível no mapa |  |
| ✅ | filtro Norte mostra as 7 UFs do Norte | ac,ap,am,pa,ro,rr,to |
| ✅ | tabela ordenável |  |
| ✅ | exportação CSV e JSON oferecida | Exportar Os arquivos levam a origem e o horário dos dados. Não são publicação of |
| ✅ | celular sem rolagem lateral | 390px em 390px |
| ✅ | tocar em SP no celular abre detalhe |  |
| ✅ | modo TV ativo |  |
| ✅ | console sem erros da página (inclui violação de CSP) |  |

## Noite simulada completa, relógio real (`node ensaio/rodar.mjs`)

Início 2026-10-06T15:08:11.295Z · escala 1× · 101 conferências · **0 falha(s)**

| min | Marco | Estado | % tot. | Conferência | Coleta | Eleito | Página |
|---|---|---|---|---|---|---|---|
| 1.29 | TSE ainda sem o 2º turno na configuração (como em 06/10) | aguardando_configuracao | — | — | ok | não | dados de teste |
| 3.36 | Configuração publica o 2º turno, arquivos de resultado ainda 404 | aguardando_resultados | — | cobertura_incompleta | pausada | não | dados de teste |
| 5.44 | Arquivos no ar com 0% totalizado | aguardando_resultados | 0 | compativel | ok | não | dados de teste |
| 7.27 | Primeiros boletins, Norte e exterior mais lentos | em_apuracao | 22.36 | compativel | ok | não | dados de teste |
| 10.34 | SP atrasado: nacional mais novo que o arquivo da UF | em_apuracao | 50.68 | horarios_diferentes | ok | não | dados de teste |
| 12.42 | Correção oficial no AC (votos diminuem) | em_apuracao | 66.01 | compativel | ok | não | dados de teste |
| 14.25 | TSE responde 503 com Retry-After por 40 s | em_apuracao | 78.59 | compativel | ok | não | dados de teste |
| 16.33 | Arquivo de RR com erro 500 por 2 min | em_apuracao | 88.34 | cobertura_incompleta | atrasada | não | dados de teste |
| 19.41 | TSE responde 429 com Retry-After 60 uma vez | em_apuracao | 96.33 | compativel | ok | não | dados de teste |
| 23.48 | 100% totalizado, situação Eleito publicada | concluida | 100 | compativel | ok | sim | dados de teste |

**Latência de atualização** (do arquivo novo no TSE simulado até aparecer): coletor {"n":30,"mediana":4.407,"p90":4.515,"max":4.532} s; tela {"n":30,"mediana":12.231,"p90":13.385,"max":13.435} s.

**Carga no TSE simulado:** 2539 requisições, pico 146/min, status {"200":1143,"304":1385,"404":3,"429":1,"500":5,"503":2}.

**Carga por visitante no Worker:** {"pedidos_por_minuto":14.5,"pedidos_por_hora":871,"por_arquivo":{"/dados/v1/presidente.json":292,"/dados/v1/historico.json":184,"/dados/v1/governador.json":104,"/dados/v1/saude.json":104}}.

## Teste de carga

```json
{
 "url": "http://localhost:8787",
 "conexoes": 200,
 "segundos": 30.3,
 "requisicoes": 9770,
 "por_segundo": 322,
 "latencia_ms": {
  "p50": 578,
  "p95": 1034.9,
  "p99": 1398.6,
  "max": 1936.9
 },
 "status": {
  "200": 9770
 },
 "mb": 6.4
}

```
