# Inventário das fontes oficiais: apuração do 2º turno de 2026

Situação em 06/10/2026, 13h UTC (10h em Brasília). Tudo o que está marcado **confirmado** foi conferido em arquivo oficial baixado nesse dia e guardado em `tests/fixtures/tse-2026-10-06/`. O que está marcado **inferido** vem do padrão do 1º turno ou da eleição de 2024 e precisa ser reconferido quando o TSE publicar a configuração do 2º turno.

## 1. Resumo para quem vai construir

1. **Existe uma única fonte estruturada: o TSE.** Nenhum dos 27 TREs publica JSON ou CSV próprio de resultados e nenhum funciona como espelho. Os TREs apontam para o app do TSE e, no máximo, publicam relatórios em PDF do SISTOT. O painel deve usar o recorte de cada UF na base do TSE e dizer isso na tela. São 27 recortes da mesma base, não 27 fontes independentes. Detalhes por TRE em [tres-2026-levantamento.md](tres-2026-levantamento.md).
2. **Códigos de 2026 (confirmado no `ele-c.json`):** ciclo `ele2026`, pleito `3220` (04/10/2026).

   | Eleição (1º turno) | Código | `cdt2` (código do 2º turno) | Cargos |
   |---|---|---|---|
   | Ordinária Federal | 6257 | **6258** | 1 Presidente |
   | Ordinária Estadual | 6259 | **6260** | 3 Governador, 5 Senador, 6 Dep. Federal, 7 Dep. Estadual, 8 Dep. Distrital |
   | Ordinária Municipal (DF) | 6261 | nenhum | 25 Conselheiro Distrital |

   O governador do DF está na **6259**, junto com os outros 26. A 6261 não tem governador.
3. **Disputas do 2º turno em 25/10 (confirmado pela situação "2º turno" nos arquivos oficiais):**
   - Presidente (eleição 6258, cargo 1): 22 Flávio Bolsonaro (PL), 47,03% no 1º turno, contra 13 Lula (PT), 45,16%.
   - Governador (eleição 6260, cargo 3) em 7 UFs:

   | UF | Candidatos e % dos válidos no 1º turno (fonte: TSE) |
   |---|---|
   | AC | 11 Mailza Assis 49,76% × 10 Alan Rick 32,27% |
   | AM | 55 Omar Aziz 40,63% × 22 Professora Maria do Carmo 24,49% |
   | DF | 11 Celina Leão 49,93% × 13 Leandro Grass 34,47% |
   | ES | 10 Lorenzo Pazolini 49,65% × 15 Ricardo Ferraço 34,06% |
   | RJ | 22 Douglas Ruas 49,27% × 55 Eduardo Paes 42,76% |
   | RN | 44 Allyson 36,94% × 13 Cadu de Lula 36,16% |
   | TO | 44 Professora Dorinha 45,52% × 45 Vicentinho Júnior 43,94% |

   A imprensa publicou números ligeiramente diferentes para AM e RN (Agência Brasil: 40,38% e 36,83%). Vale o arquivo oficial.
4. **A configuração do 2º turno ainda não está publicada.** O `ele-c.json` servido em 06/10 foi gerado em 02/10/2026 18:30:57 e só traz o pleito do 1º turno. Os arquivos `br-c0001-e006258-u.json`, `mun-e006258-cm.json`, `br-c0001-e006260-u.json` e `mun-e006260-cm.json` deram 404 (esperado). Em 2024 o 2º turno apareceu como **pleito novo** no `ele-c.json` (pleito 453, eleição 620, `t: "2"`), com `abr` restrito às UFs e municípios em disputa. O coletor deve descobrir o 2º turno lendo o `ele-c.json`, sem fixar códigos e sem chutar URLs.
5. **A soma territorial fecha exatamente com o nacional (confirmado).** No 1º turno de presidente, a soma das 27 UFs mais o exterior (`zz`) é igual ao total `br` em todos os campos inteiros: votos de cada um dos 12 candidatos, seções (`s`), eleitorado, comparecimento e abstenção (`e`) e todas as categorias de voto (`v`). DF e exterior são recortes distintos e o `br` não tem um terceiro recorte escondido. Coberto por `tests/test_fixtures_tse.py`.
6. **O percentual oficial usa `vvc` como denominador, não `vv` (confirmado).** Quando há candidato "Anulado sub judice", os votos dele entram em `vvc` (= `vv` + `vansj`) e no `pvap`. Exemplo real: governador do RJ, onde Garotinho teve 274.411 votos anulados sub judice e Douglas Ruas tem 49,27% sobre `vvc` (seriam 50,88% sobre `vv`). O cálculo próprio do painel precisa usar o mesmo denominador para bater com o TSE.

## 2. Inventário no formato pedido

| Item | TSE (base nacional) | TREs (27) |
|---|---|---|
| Tribunal | Tribunal Superior Eleitoral | TRE-AC … TRE-TO |
| Página oficial de divulgação | https://www.tse.jus.br/eleicoes/eleicoes-2026-content/divulgacao-dos-resultados-das-eleicoes-2026 e app https://resultados.tse.jus.br/oficial/app/index.html | Uma por TRE, quase todas apontando para o app do TSE ([tabela](tres-2026-levantamento.md)) |
| Endpoint estruturado | `https://resultados.tse.jus.br/oficial/...` (seção 3) | Nenhum JSON/CSV. TRE-PB tem Excel por município ("sem valor legal"); TRE-PI tem painel de PDFs por seção num bucket do Google |
| Formato e campos | JSON, campos na seção 4 | PDF (relatórios SISTOT), um Excel |
| Abrangência | Brasil, 27 UFs, exterior, municípios, zonas e seções | UF, às vezes município e seção |
| Horário informado | Em cada arquivo: `dg`/`hg` (geração) e `dt`/`ht` (totalização). Divulgação começa às 17h de Brasília | Nenhum horário próprio. Só o TRE-CE repete "a partir das 17h" |
| Restrições | 100 req/s por IP (bloqueio de 10 min, renovável); vários 404 bloqueiam o IP; 304 conta no limite | Nenhuma relevante. TRE-BA entrega resultados sob pedido |
| Origem efetiva | Publicação própria (base de totalização) | **Base TSE** em todas as UFs; relatórios próprios são derivados do SISTOT |

## 3. Endpoints confirmados

Base `https://resultados.tse.jus.br`, ambiente `oficial`, ciclo `ele2026`. O `ele-c.json` documenta os diretórios (`arq`): `<base>/<ambiente>/<ciclo>/<cd_eleicao>/dados/<uf>` e `.../config`.

| Arquivo | Caminho | Status em 06/10 |
|---|---|---|
| Configuração geral (EA11) | `/oficial/comum/config/ele-c.json` | 200 |
| Municípios da eleição (EA12) | `/oficial/ele2026/{ele}/config/mun-e{ele6}-cm.json` | 200 (6257, 6259); 404 (6258, 6260) |
| Resultado unificado (EA20) | `/oficial/ele2026/{ele}/dados/{abr}/{abr}-c{cargo4}-e{ele6}-u.json` | 200 para `br`, 27 UFs e `zz` (presidente) e 27 UFs (governador) |
| Abrangência, sem votos | `/oficial/ele2026/{ele}/dados/{abr}/{abr}-e{ele6}-ab.json` | 200 (`br`, `df`) |

`{ele6}` é o código com 6 dígitos e zeros à esquerda (`006257`); `{cargo4}` tem 4 dígitos (`0001`, `0003`). Os 29 recortes de presidente são `br`, as 27 siglas de UF e `zz` (exterior). O `br-…-ab.json` lista os 29 na ordem `ac…to, zz, br`. Arquivos que não existem respondem 404 com corpo XML `NoSuchKey` de um armazenamento compatível com S3 (bucket `tse-resultados-1`).

Para o 2º turno, por inferência do padrão: presidente em `/oficial/ele2026/6258/dados/{br|uf|zz}/…-c0001-e006258-u.json` e governador em `/oficial/ele2026/6260/dados/{uf}/{uf}-c0003-e006260-u.json`, só nas 7 UFs. Confirmar no `ele-c.json` antes de consultar.

O TSE também cita os tipos EA10 (eleitos), EA14 e EA15 (acompanhamento Brasil e UF), EA16 e EA18 (seções e arquivo auxiliar). Não foram baixados para não arriscar 404 sem o nome exato.

## 4. Campos do arquivo de resultado (`-u.json`)

O PDF de especificação do EA20 respondeu 410 e o de instruções respondeu 403, então os significados abaixo vêm do nome do campo e de identidades aritméticas conferidas nos testes. As contagens chegam como **texto**: converter para inteiro. Percentuais chegam em texto com vírgula (`"47,03"`), com versão de mais casas em `…n` (`"47,027772356"`).

- **Raiz:** `ele` (eleição), `t` (turno), `f` (`"o"` oficial), `tpabr`/`cdabr` (tipo e código do recorte: `br` ou `uf`; o exterior é `uf`/`zz`), `dg`/`hg` (data e hora de geração do arquivo), `dt`/`ht` (data e hora da totalização), `idg` (id único da geração, **não é sequencial**), `and` (andamento; `"f"` no arquivo final), `tf`, `dv`, `sup`, `esae`, `mnae` (lista). Os quatro últimos não têm significado confirmado.
- **`carg[]`:** `cd` (cargo), `nmn`, `fed[]` (federações: `n`, `sg`, `npar[]`), `agr[]` (agremiação: `tp` `"i"` partido isolado ou `"c"` coligação, `com` composição) → `par[]` (`n`, `sg`, `nm`, `tvtn`, `tvan`) → `cand[]`.
- **`cand[]`:** `n` (número), `sqcand` (id versionado do candidato), `nm`, `nmu` (nome de urna), `vap` (votos), `pvap` (% de `vvc`), `st` (situação: `"Eleito"`, `"Não eleito"`, `"2º turno"`), `e` (`"s"`/`"n"`; **não quer dizer eleito**: vale `"s"` também para os dois classificados ao 2º turno, então a situação a mostrar vem sempre de `st`), `dvt` (destinação: `"Válido"`, `"Anulado sub judice"`), `seq`, `vs[]` (vice).
- **`s` (seções):** `ts` total, `st` totalizadas (`pst` é o % de totalização), `snt` não totalizadas, `si`/`sni` instaladas e não instaladas, `sa`/`sna`.
- **`e` (eleitorado):** `te` total, `est`/`esnt` em seções totalizadas e não totalizadas, `esi`/`esni`, `esa`/`esna`, `c` comparecimento, `a` abstenção. Conferido: `te = esi + esni` e `c + a = esi`. O percentual oficial de comparecimento (`pc`) usa `esi`, o eleitorado das seções instaladas, e não `te`: no Brasil, 78,9164% contra 78,9161% sobre `te`.
- **`v` (votos):** `tv` total (= `c`), `vvc` válidos computados, `vv` válidos, `vnom` nominais, `van` anulados, `vansj` anulados sub judice, `vb` brancos, `tvn` total de nulos, `vn` nulos, `vnt` nulos técnicos, `vsan`, `vscv`.
- **Identidades conferidas:** `tv = vvc + vb + tvn`, `tvn = vn + vnt`, `vvc = vv + vansj`, `tv = e.c`, soma dos `vap` = `vvc`, `te = esi + esni`, `c + a = esi`.
- **Ponto em aberto para a frente 2:** nos arquivos finais `esi` coincide com o eleitorado das seções instaladas e totalizadas, então eles não mostram qual eleitorado entra no denominador de `pc`/`pa` durante a apuração parcial. Conferir em arquivo parcial (ambiente simulado `https://resultados-sim.tse.jus.br/simulado`, eleições de teste 21270/21272/21274, ou já na noite do 2º turno).
- **Códigos TSE × IBGE:** o `mun-…-cm.json` traz, por município, `cd` (código TSE com 5 dígitos) e `cdi` (código IBGE com 7 dígitos), além das zonas (`z`). São diferentes; usar a tabela, nunca presumir igualdade. O exterior (`zz`) tem 186 localidades.

## 5. Acesso, frequência e cache (pesa nas frentes 2 e 4)

Conferido em 06/10 com requisições reais:

- CDN Akamai na frente de armazenamento compatível com S3. Respostas com `etag`, `last-modified`, `cache-control: max-age` variável (22 a 52 s observados), `expires` e `cdn-cache-status`.
- **Requisição condicional funciona:** `If-None-Match` com o ETag devolveu **304**. Pela documentação, 304 conta no limite de requisições.
- Cabeçalhos de limite do CDN: `x-ratelimit-limit: 2000, 2000;w=1`, `x-ratelimit-remaining`, `x-ratelimit-reset`. A documentação oficial fala em 100 req/s por IP, com bloqueio de 10 minutos; vale o limite menor.
- **CORS:** `access-control-allow-origin` só aparece quando a requisição leva `Origin`, e ecoa a origem (`vary: Origin`). O navegador consegue ler direto, como a v0 faz hoje.
- `robots.txt` de `resultados.tse.jus.br` respondeu 503 nas duas tentativas.
- `www.tse.jus.br` bloqueou com 403 do WAF da Akamai o download, via curl, do PDF de instruções. A página técnica abre normalmente num navegador e em leitores de página.

Recomendações derivadas:
- Um coletor único consultando 29 arquivos de presidente mais 7 de governador e o `ele-c.json` a cada 15 s faz cerca de 2,5 req/s, muito abaixo do limite. 10 s também cabe, mas o `max-age` de 22 a 52 s indica que o TSE não regenera mais rápido que isso; 15 s com ETag é o ponto de equilíbrio.
- Nunca montar URLs por tentativa: 404 em sequência bloqueia o IP. Só consultar o que o `ele-c.json` e o `mun-…-cm.json` listarem.
- **Nuvem:** não foi possível testar o acesso a partir de IPs de nuvem (o ambiente deste projeto bloqueia `*.jus.br`). O 403 do WAF em `www.tse.jus.br` mostra que a Akamai filtra clientes automatizados em parte do domínio. A frente 4 deve testar cedo o coletor numa Cloudflare Worker contra `resultados.tse.jus.br` e manter como alternativa a consulta direta pelo navegador, que já se sabe funcionar.

## 6. Limitações

**Da fonte**
- Configuração e arquivos do 2º turno ainda não publicados (404 esperado).
- Especificação EA20 indisponível (410) e manual de verificação JWS não baixado (403). A assinatura JWS não foi verificada.
- O `ele-c.json` servido em 06/10 tem data de geração de 02/10; o coletor deve tratar a configuração como mutável.
- Os TREs não publicam fonte estruturada própria; em AC, MS, TO e parte de DF e ES nem a página de resultado foi localizada.

**Do ambiente deste projeto (não da fonte)**
- O container de nuvem do projeto nega conexão a `*.jus.br`. Os arquivos foram baixados pelo Mac do usuário, de forma sequencial, com 0,5 s entre requisições (70 requisições, log em `tests/fixtures/tse-2026-10-06/log.txt`).
- A ferramenta de leitura de páginas recusa `resultados.tse.jus.br` por causa do `robots.txt` e devolveu algumas páginas de TRE vazias.

## 7. Arquivos de teste

`tests/fixtures/tse-2026-10-06/` reproduz o caminho oficial (`oficial/...`), com o cabeçalho HTTP de cada resposta em `.headers`, o log das requisições, o script usado (`baixar.sh`) e `MANIFEST.sha256`. As respostas 404 ficaram com sufixo `.404.xml` para não serem lidas como JSON. Para rodar os testes: `python3 -m unittest discover -s tests`.
