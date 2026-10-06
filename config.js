// Configuração da interface do painel.
// A página só lê os arquivos gerados pelo coletor: não consulta o TSE
// diretamente nem recalcula totais, percentuais ou a conferência.
window.PAINEL_CONFIG = {
  // Pasta de onde a página lê os arquivos do contrato v1 (docs/contrato/CONTRATO-DADOS.md):
  // presidente.json, historico.json, governador.json, saude.json e export/*.csv.
  // "api" = coletor publicado junto do site. Para testar sem coletor: ?fonte=ensaio (1º turno real)
  // ou ?fonte=simulacao (noite de 2º turno simulada), ambos gerados pelo próprio coletor em exemplos/.
  fontes: {
    api: "dados/v1/",
    ensaio: "exemplos/ensaio-1turno/v1/",
    simulacao: "exemplos/simulado-2turno/v1/"
  },
  fontePadrao: "api",

  // Intervalo com que a página relê o snapshot do coletor (segundos). O coletor é
  // quem conversa com o TSE; aqui é só leitura de arquivo estático com cache.
  atualizacaoSeg: 10,
  // A partir de quantos segundos sem coleta nova a página avisa "dados defasados".
  defasagemAvisoSeg: 90,

  // Candidatos do 2º turno presidencial e cor padrão de cada um.
  // A ordem aqui é a ordem fixa na tela (não muda quando a liderança muda).
  // A pessoa pode trocar as cores no botão "Cores"; a escolha fica salva no navegador.
  candidatos: [
    { numero: "22", nome: "Flávio Bolsonaro", partido: "PL", cor: "azul" },
    { numero: "13", nome: "Lula", partido: "PT", cor: "vermelho" }
  ],

  // UFs com 2º turno para governador (conferido no ele-c.json e nos arquivos do 1º turno).
  governadorUFs: ["ac", "am", "df", "es", "rj", "rn", "to"],

  // Links oficiais exibidos no painel.
  links: {
    portalTSE: "https://resultados.tse.jus.br/oficial/app/index.html",
    docTSE: "https://www.tse.jus.br/eleicoes/informacoes-tecnicas-sobre-a-divulgacao-de-resultados",
    inventario: "https://github.com/FLSDF79/apuracao-2turno-2026/blob/main/docs/fontes/INVENTARIO.md",
    autor: "https://nfls-ai-arena.pages.dev/portal/autor",
    linkedin: "https://www.linkedin.com/in/flsdf79/",
    nfls: "https://nfls-ai-arena.pages.dev/",
    nflsLogo: "https://nfls-ai-arena.pages.dev/MARCA/logo/nfls-ai-arena-football-primary-v3.svg"
  }
};
