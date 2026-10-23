// Roteiro da noite de apuração simulada usada no ensaio geral (frente 4).
// Puro: não lê arquivo nem rede. Recebe os minutos desde o início do ensaio e devolve
// o cenário que coletor/simulador.js#montarSite entende, mais a falha HTTP a injetar (se houver).
//
// A noite inteira cabe em DURACAO_MIN minutos de relógio real, com os horários do "TSE simulado"
// iguais ao horário real de Brasília. Assim o coletor, a página e a defasagem rodam com o relógio
// verdadeiro, como no dia 25/10, sem relógio acelerado.
//
// Os votos vêm do 1º turno (só os dois finalistas, escalados pela fração apurada): servem para
// testar o sistema e nunca devem ser exibidos como resultado.
import { REGIOES } from "../backend/normalizacao/territorios.js";

export const DURACAO_MIN = 26;

// Marcos da noite (minutos desde o início). Cada um é conferido pelo ensaio (ensaio/rodar.mjs).
export const MARCOS = [
  { t: 0, id: "antes", titulo: "TSE ainda sem o 2º turno na configuração (como em 06/10)" },
  { t: 2, id: "publicada", titulo: "Configuração publica o 2º turno, arquivos de resultado ainda 404" },
  { t: 4, id: "zero", titulo: "Arquivos no ar com 0% totalizado" },
  { t: 6, id: "inicio", titulo: "Primeiros boletins, Norte e exterior mais lentos" },
  { t: 9, id: "sp-atrasado", titulo: "SP atrasado: nacional mais novo que o arquivo da UF" },
  { t: 11, id: "correcao", titulo: "Correção oficial no AC (votos diminuem)" },
  { t: 13, id: "instavel", titulo: "TSE responde 503 com Retry-After por 40 s" },
  { t: 15, id: "rr-fora", titulo: "Arquivo de RR com erro 500 por 2 min" },
  { t: 18, id: "limite", titulo: "TSE responde 429 com Retry-After 60 uma vez" },
  { t: 22, id: "final", titulo: "100% totalizado, situação Eleito publicada" },
  { t: DURACAO_MIN, id: "fim", titulo: "Fim do ensaio" },
];

// Velocidade relativa de apuração por região (Norte e exterior chegam por último, como costuma ser).
const VELOCIDADE = { N: 0.8, NE: 1.05, CO: 1, SE: 1, S: 1.1, zz: 0.6 };
const REGIAO_DE = Object.fromEntries(Object.entries(REGIOES).flatMap(([r, d]) => d.ufs.map((uf) => [uf, r])));

const INICIO_APURACAO = 5; // minuto em que a fração começa a subir
const FIM_APURACAO = 22; // minuto em que tudo chega a 100%

function fracaoEm(t, abr) {
  if (t < INICIO_APURACAO) return 0;
  if (t >= FIM_APURACAO) return 1;
  const v = VELOCIDADE[abr === "zz" ? "zz" : REGIAO_DE[abr]] ?? 1;
  const x = (t - INICIO_APURACAO) / (FIM_APURACAO - INICIO_APURACAO);
  // curva rápida no começo (urnas eletrônicas), mais lenta no fim; arredonda para não mudar a cada ms
  return Math.min(0.999, Math.round(Math.min(1, (1 - (1 - x) ** 2) * v) * 1000) / 1000);
}

/** "25/10/2026 18:10:00" no horário de Brasília, como o TSE publica. */
export function horaTSE(data) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })
      .formatToParts(data)
      .map((x) => [x.type, x.value]),
  );
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}:${p.second}`;
}

/**
 * Estado do "site do TSE" no minuto t do ensaio.
 * @param t minutos desde o início (pode ser fracionário)
 * @param inicioMs instante real do início (ms), para os horários publicados
 * @param componentes siglas que compõem o Brasil (27 UFs + zz)
 * @returns { cenario, falha: null | { status, retryAfter?, so?: RegExp }, marco }
 */
export function noite(t, inicioMs, componentes) {
  const marco = [...MARCOS].reverse().find((m) => t >= m.t) ?? MARCOS[0];
  // horário publicado: arredondado ao minuto do "boletim" (o TSE gera arquivos em lotes, não a cada segundo)
  const minuto = Math.floor(t);
  const hora = horaTSE(new Date(inicioMs + minuto * 60000));
  const horaAntes = (min) => horaTSE(new Date(inicioMs + Math.max(0, minuto - min) * 60000));

  if (t < 2) return { cenario: { publicado: false }, falha: null, marco };
  if (t < 4) return { cenario: { publicado: true, fracao: { padrao: 0 }, hora }, falha: { status: 404, so: /-u\.json$/ }, marco };

  const tm = Math.floor(t * 2) / 2; // fração muda a cada 30 s de relógio real
  const fracao = { padrao: 0 };
  for (const abr of componentes) fracao[abr] = fracaoEm(tm, abr);
  const cenario = { publicado: true, fracao, hora, horaPorRecorte: {}, brFracaoExtra: {} };

  // SP atrasado entre 9 e 11: o arquivo da UF fica 2 min para trás; o nacional já tem o número novo.
  if (t >= 9 && t < 11) {
    fracao.sp = fracaoEm(tm - 2, "sp");
    cenario.horaPorRecorte.sp = horaAntes(2);
    cenario.brFracaoExtra.sp = fracaoEm(tm, "sp");
  }
  // Correção no AC a partir de 11: a fração publicada recua (votos diminuem) e volta a subir depois.
  if (t >= 11 && t < FIM_APURACAO) fracao.ac = Math.max(0, fracaoEm(tm, "ac") - 0.08);

  let falha = null;
  if (t >= 13 && t < 13 + 40 / 60) falha = { status: 503, retryAfter: 30 };
  if (t >= 15 && t < 17) falha = { status: 500, so: /\/rr\/rr-c0001-/ };
  if (t >= 18 && t < 18 + 20 / 60) falha = { status: 429, retryAfter: 60 };

  if (t >= FIM_APURACAO) Object.assign(cenario, { final: true, eleito: true });
  return { cenario, falha, marco };
}
