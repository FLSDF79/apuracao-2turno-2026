// Tipos da configuração global da página (config.js), para a checagem do TypeScript.
interface PainelCandidato { numero: string; nome: string; partido: string; cor: string }
interface PainelConfig {
  fontes: Record<string, string>;
  fontePadrao: string;
  atualizacaoSeg: number;
  defasagemAvisoSeg: number;
  candidatos: PainelCandidato[];
  governadorUFs: string[];
  links: Record<string, string>;
}
interface Window { PAINEL_CONFIG: PainelConfig }
