// Configuração do painel — edite aqui se o TSE mudar algo.
// Todos os códigos abaixo foram conferidos no arquivo oficial
// https://resultados.tse.jus.br/oficial/comum/config/ele-c.json (06/10/2026).
window.PAINEL_CONFIG = {
  // Raiz dos dados abertos da Divulgação de Resultados do TSE
  base: "https://resultados.tse.jus.br/oficial",
  configGeral: "https://resultados.tse.jus.br/oficial/comum/config/ele-c.json",
  ciclo: "ele2026",

  // Eleição Ordinária Federal 2026 — 1º turno (pleito 3220), cargo Presidente = 1
  eleicao1T: "6257",
  // Código do 2º turno. O ele-c.json já informa "cdt2": "6258" para a 6257.
  // Se o TSE publicar outro código, a descoberta automática (abaixo) usa o do arquivo.
  eleicao2T: "6258",
  descobrirAuto: true,

  cargo: "1", // Presidente

  // Candidatos (número de urna) e cores: AZUL = Flávio, VERMELHO = Lula
  candidatos: [
    { n: "22", nome: "Flávio Bolsonaro", cor: "#2f6bff", lado: "azul" },
    { n: "13", nome: "Lula",             cor: "#e5383b", lado: "vermelho" }
  ],

  // Intervalo de atualização (segundos). Entre 30 e 60 conforme combinado.
  intervaloSeg: 45,
  // Depois que a totalização chega a 100%, atualiza com menos frequência
  intervaloFinalSeg: 300,
  // Minutos sem nova totalização para considerar "pausa" / "TSE parado"
  pausaMin: 10,
  // Divergência máxima tolerada entre soma das UFs e total nacional
  toleranciaDivergencia: 0.0001 // 0,01%
};
