// Formatação para exibição. Não faz contas sobre votos: só apresenta números prontos.
export const FUSO = "America/Sao_Paulo";

const nf = new Intl.NumberFormat("pt-BR");
const dataHora = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
const hora = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, hour: "2-digit", minute: "2-digit", second: "2-digit" });

export const ausente = (x) => x === null || x === undefined || (typeof x === "number" && !Number.isFinite(x));

// Votos e contagens: inteiros com separador de milhar. Ausente vira "—" (nunca "0").
export function int(x) {
  return ausente(x) ? "—" : nf.format(Math.round(x));
}

// Percentual já calculado pelo coletor (0–100). casas = 2 por padrão.
export function pct(x, casas = 2) {
  if (ausente(x)) return "—";
  return x.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas }) + "%";
}

// Pontos percentuais, com sinal opcional.
export function pp(x, { sinal = false, casas = 2 } = {}) {
  if (ausente(x)) return "—";
  const s = Math.abs(x).toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
  return (sinal ? (x > 0 ? "+" : x < 0 ? "−" : "±") : "") + s + " p.p.";
}

export function intSinal(x) {
  if (ausente(x)) return "—";
  return (x > 0 ? "+" : x < 0 ? "−" : "") + nf.format(Math.abs(Math.round(x)));
}

function data(iso) {
  if (!iso) return null;
  const t = new Date(iso);
  return Number.isNaN(t.getTime()) ? null : t;
}

// "25/10 19:03:12" em horário de Brasília.
export function dh(iso) {
  const t = data(iso);
  return t ? dataHora.format(t).replace(",", "") : "—";
}

export function h(iso) {
  const t = data(iso);
  return t ? hora.format(t) : "—";
}

// "há 12 s", "há 3 min", "há 2 h". agora em ms.
export function ha(iso, agora = Date.now()) {
  const t = data(iso);
  if (!t) return "—";
  const s = Math.max(0, Math.round((agora - t.getTime()) / 1000));
  if (s < 60) return `há ${s} s`;
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  return `há ${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min`;
}

export function idadeSeg(iso, agora = Date.now()) {
  const t = data(iso);
  return t ? (agora - t.getTime()) / 1000 : null;
}

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Nome de urna vem em caixa alta do TSE; deixa legível sem perder a grafia oficial no title.
const MINUSCULAS = new Set(["da", "de", "do", "das", "dos", "e"]);
export function nomeLegivel(s) {
  if (!s) return "";
  return String(s).toLowerCase().split(/\s+/).map((p, i) => (i > 0 && MINUSCULAS.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1))).join(" ");
}
