// Cabeçalhos de segurança do painel publicado. Uma fonte só para os dois caminhos:
// - arquivos estáticos (página): gravados em dist/site/_headers pelo montador do site;
// - /dados/v1/* (Worker): aplicados por publicacao/worker.js.
// A página não tem script inline, não envia formulário e só busca dados na própria origem.
export const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com", // a página usa style="" para cores e barras
  "font-src https://fonts.gstatic.com",
  "img-src 'self' data: https://nfls-ai-arena.pages.dev", // selo da NFLS.AI Arena
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'none'",
  "object-src 'none'",
].join("; ");

export const CABECALHOS = {
  "content-security-policy": CSP,
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  "cross-origin-opener-policy": "same-origin",
  "strict-transport-security": "max-age=31536000",
  "x-frame-options": "DENY",
};

/** Conteúdo do arquivo _headers (Workers Static Assets) */
export function arquivoHeaders() {
  return `/*\n${Object.entries(CABECALHOS).map(([k, v]) => `  ${k}: ${v}`).join("\n")}\n`;
}
