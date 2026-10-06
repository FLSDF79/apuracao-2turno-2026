# Levantamento dos 27 TREs (06/10/2026)

Levantamento feito em 06/10/2026 lendo os sites oficiais. Os links foram extraídos de páginas renderizadas. "Vazio" quer dizer que a ferramenta de leitura devolveu a página sem conteúdo, o que é **limitação do ambiente** e não da fonte.

Conclusão: nenhum TRE publica JSON ou CSV próprio de resultados e nenhum funciona como espelho dos arquivos do TSE. Desde 2020 a totalização é centralizada no TSE. Os TREs publicam no máximo relatórios em PDF do SISTOT e apontam para o app do TSE. **A única fonte estruturada para as 27 UFs é o recorte de cada UF na base do TSE.**

| UF | Tribunal | Página de divulgação | Endpoint estruturado próprio | Formato/campos | Abrangência | Horário informado | Restrições | Origem efetiva | Verificação |
|---|---|---|---|---|---|---|---|---|---|
| AC | TRE-AC | Não localizada. Portal: https://www.tre-ac.jus.br/eleicoes/2026 | Não verificado | – | – | – | – | base TSE (presumido) | Home OK; páginas de 2026 vazias (ambiente) |
| AL | TRE-AL | https://www.tre-al.jus.br/eleicoes/eleicoes-2026/eleicoes-2026 | Não | PDFs (static.tre-al.jus.br): totalização federal e estadual, votação, resultado por seção | UF, seção | – | – | relatórios próprios (SISTOT) + base TSE | OK |
| AP | TRE-AP | https://www.tre-ap.jus.br/eleicoes/eleicoes-2026/resultados-eleicoes-geirais-2026-amapa | Não confirmado (painel https://dados.tre-ap.jus.br/#eleicoes-2026 não renderizou) | PDF de totalização | UF | – | – | base TSE + PDFs próprios | OK; painel vazio (ambiente) |
| AM | TRE-AM | https://www.tre-am.jus.br/eleicoes/eleicoes-2026 | Não | PDFs de totalização federal e estadual (05/10) | UF | – | – | relatórios próprios + base TSE | OK |
| BA | TRE-BA | https://www.tre-ba.jus.br/eleicoes/resultados-de-eleicoes/resultados-de-eleicoes (só 2022) | Não | Planilhas de 2022 | – | – | Resultados sob pedido por formulário | base TSE (presumido) | OK; nada de 2026 |
| CE | TRE-CE | https://www.tre-ce.jus.br/eleicao/eleicoes-2026/divulgacao-de-resultados → app TSE | Não em 2026 (app próprio existiu até 2022) | – | – | "a partir das 17h, horário de Brasília" | – | base TSE | OK; `apps.tre-ce.jus.br/tre/eleicoes/resultados/2026/` = 404 (fonte) |
| DF | TRE-DF | Não localizada (notícias citam totalização concluída às 20h01 de 04/10) | Não verificado | – | – | – | – | base TSE (presumido) | `apps.tre-df.jus.br` robots 502 (ambiente) |
| ES | TRE-ES | Home "Resultados do 1º turno" → página do TSE | Não | – | – | – | – | base TSE | Home OK; página 2026 vazia (ambiente) |
| GO | TRE-GO | Sem página própria; notícia aponta para o app TSE | Não | – | – | 17h | – | base TSE | OK |
| MA | TRE-MA | https://www.tre-ma.jus.br/eleicoes/eleicoes-2026/relatorios-de-resultados | Não | 2 PDFs de totalização | UF | – | – | relatórios próprios + base TSE | OK |
| MT | TRE-MT | https://www.tre-mt.jus.br/eleicoes/2026/2026 → informações técnicas do TSE | Não verificado | – | – | – | – | base TSE | `/estatisticas` timeout (ambiente) |
| MS | TRE-MS | Não localizada | Não verificado | – | – | – | – | base TSE (presumido) | Página 2026 vazia (ambiente) |
| MG | TRE-MG | https://www.tre-mg.jus.br/eleicoes/eleicoes-2026/eleicoes-2026 → página do TSE | Não (painel apps01 é de logística) | – | – | – | – | base TSE | OK |
| PA | TRE-PA | https://www.tre-pa.jus.br/eleicoes/eleicoes-2026-1/eleicoes-2026 → app TSE e dados abertos | Não | – | – | – | – | base TSE | OK |
| PB | TRE-PB | https://www.tre-pb.jus.br/eleicoes/eleicoes-2026 | Sim: https://apps.tre-pb.jus.br/aplicativos/resultadosVotacao/resultados_2026_t1.html | Excel por município (comparecimento, brancos, nulos); arquivos por seção. Sem JSON/CSV | Município, zona, bairro, seção | – | "Dados meramente informativos, sem valor legal" | publicação própria derivada + base TSE | OK |
| PR | TRE-PR | https://www.tre-pr.jus.br/eleicoes/eleicoes-2026/resultados-eleicoes-2026 | Não | 2 PDFs de totalização | UF | – | – | base TSE + PDFs | OK |
| PE | TRE-PE | https://www.tre-pe.jus.br/eleicoes/eleicoes-2026/eleicoes-2026 → TSE e dados abertos | Não | – | – | – | – | base TSE | OK |
| PI | TRE-PI | https://www.tre-pi.jus.br/eleicoes/eleicoes-2026/resultado-das-eleicoes-2026 (iframe) | Painel embutido: https://storage.googleapis.com/atende-eleicoes-resultados-secao/2026/turno1/index.html | PDF por candidato e seção; `locais-de-votacao.xlsx`. Diz ser gerado do SISTOT | Seção | – | Autoria não declarada | publicação própria derivada | OK |
| RJ | TRE-RJ | https://www.tre-rj.jus.br/eleicoes/eleicoes-plebiscitos-e-referendos/eleicoes-2026/resultado-da-votacao → app TSE, SIG, dados abertos | Não | – | – | – | Resultado por seção "aguardando disponibilização pelo TSE" | base TSE | OK |
| RN | TRE-RN | https://www.tre-rn.jus.br/eleicoes/eleicoes-2026/resultado-e-totalizacao | Não (arquivos estáticos) | Totalização, eleitos, por município e seção (formato não confirmado) | UF, município, seção | – | – | relatórios próprios | OK |
| RS | TRE-RS | https://www.tre-rs.jus.br/eleicoes/eleicoes-gerais-2026/transmissao-e-totalizacao-de-resultados | Não | – | – | – | – | base TSE (presumido) | OK; sem link de resultado |
| RO | TRE-RO | https://www.tre-ro.jus.br/eleicoes/eleicoes-2026/resultados-1o-turno → app TSE | Não | 2 PDFs de totalização | UF | – | – | base TSE + PDFs | OK |
| RR | TRE-RR | https://www.tre-rr.jus.br/eleicoes/eleicoes-2026/eleicoes-2026 | Não | PDF/ZIP de PDFs: eleitos, totalização, seção, município, comparecimento | UF, município, seção | – | – | relatórios próprios | OK |
| SC | TRE-SC | https://www.tre-sc.jus.br/eleicoes/eleicoes-2026/eleicoes-2026-resultado-1o-turno/apresentacao → app TSE | Não | Resumo, totalização, nulos técnicos | UF | – | – | base TSE + relatórios | OK |
| SP | TRE-SP | https://www.tre-sp.jus.br/eleicoes/eleicoes-2026/resultados | Não | 14 documentos de totalização, votação, eleitos (formato não identificado) | UF | – | Um link tem slug `.../teste-resultado` | relatórios próprios + base TSE | OK |
| SE | TRE-SE | "Resultado das Eleições" → https://www.tse.jus.br/eleicoes/estatisticas/estatisticas-eleitorais | Não | – | – | – | – | base TSE | OK |
| TO | TRE-TO | Não localizada | Não | – | – | – | – | base TSE (presumido) | Página vazia (ambiente) |

Pendentes de confirmação num navegador comum: AC, MS, TO e parte de DF e ES.

## Dados abertos do TSE (06/10/2026)

- Grupo [resultados](https://dadosabertos.tse.jus.br/group/resultados): só dois conjuntos de 2026 (correspondências esperadas e efetivadas do 1º turno; logs do Gedai). `votacao_candidato_munzona_2026` e boletins de urna não aparecem no portal.
- Indício de terceiros (não verificado no TSE): PR da Base dos Dados ([basedosdados/pipelines#2160](https://github.com/basedosdados/pipelines/pull/2160)) cita arquivos `votacao_candidato_munzona_2026` e `votacao_secao_2026_{UF}` no CDN do TSE.
