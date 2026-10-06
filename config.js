// Configuração da interface do painel.
// A página só lê os arquivos gerados pelo coletor (frente 2): não consulta o TSE
// diretamente nem recalcula totais, percentuais ou a conferência.
window.PAINEL_CONFIG = {
  // Onde a página busca os dados prontos. "api" = coletor publicado junto do site.
  // Para pré-visualizar sem coletor: ?fonte=amostra (1º turno real) ou ?fonte=simulacao.
  fontes: {
    api: { estado: "api/estado.json", historico: "api/historico.json", governador: "api/governador.json" },
    amostra: { estado: "dev/amostra/1t-final/estado.json", historico: "dev/amostra/1t-final/historico.json", governador: "dev/amostra/1t-final/governador.json" },
    simulacao: { estado: "dev/amostra/simulacao-parcial/estado.json", historico: "dev/amostra/simulacao-parcial/historico.json", governador: "dev/amostra/simulacao-parcial/governador.json" }
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
