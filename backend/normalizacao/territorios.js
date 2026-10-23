// Territórios do painel. A chave é a sigla usada pelo TSE nos caminhos dos arquivos (minúscula).
// O código IBGE da UF fica separado: TSE e IBGE são sistemas diferentes e não se presumem iguais.
// Fonte do código IBGE de UF: tabela de UFs do IBGE (2 dígitos), conferida contra data/br-uf.geojson pela sigla.

export const REGIOES = {
  N: { nome: "Norte", ufs: ["ac", "am", "ap", "pa", "ro", "rr", "to"] },
  NE: { nome: "Nordeste", ufs: ["al", "ba", "ce", "ma", "pb", "pe", "pi", "rn", "se"] },
  CO: { nome: "Centro-Oeste", ufs: ["df", "go", "ms", "mt"] },
  SE: { nome: "Sudeste", ufs: ["es", "mg", "rj", "sp"] },
  S: { nome: "Sul", ufs: ["pr", "rs", "sc"] },
};

export const UFS = {
  ac: { nome: "Acre", ibge: "12" },
  al: { nome: "Alagoas", ibge: "27" },
  am: { nome: "Amazonas", ibge: "13" },
  ap: { nome: "Amapá", ibge: "16" },
  ba: { nome: "Bahia", ibge: "29" },
  ce: { nome: "Ceará", ibge: "23" },
  df: { nome: "Distrito Federal", ibge: "53" },
  es: { nome: "Espírito Santo", ibge: "32" },
  go: { nome: "Goiás", ibge: "52" },
  ma: { nome: "Maranhão", ibge: "21" },
  mg: { nome: "Minas Gerais", ibge: "31" },
  ms: { nome: "Mato Grosso do Sul", ibge: "50" },
  mt: { nome: "Mato Grosso", ibge: "51" },
  pa: { nome: "Pará", ibge: "15" },
  pb: { nome: "Paraíba", ibge: "25" },
  pe: { nome: "Pernambuco", ibge: "26" },
  pi: { nome: "Piauí", ibge: "22" },
  pr: { nome: "Paraná", ibge: "41" },
  rj: { nome: "Rio de Janeiro", ibge: "33" },
  rn: { nome: "Rio Grande do Norte", ibge: "24" },
  ro: { nome: "Rondônia", ibge: "11" },
  rr: { nome: "Roraima", ibge: "14" },
  rs: { nome: "Rio Grande do Sul", ibge: "43" },
  sc: { nome: "Santa Catarina", ibge: "42" },
  se: { nome: "Sergipe", ibge: "28" },
  sp: { nome: "São Paulo", ibge: "35" },
  to: { nome: "Tocantins", ibge: "17" },
};

for (const [sigla, r] of Object.entries(REGIOES)) for (const uf of r.ufs) UFS[uf].regiao = sigla;

export const SIGLAS_UF = Object.keys(UFS).sort();
export const EXTERIOR = "zz";
export const BRASIL = "br";

// Recortes que, somados, formam o Brasil na eleição presidencial: 27 UFs (DF incluído uma vez) + exterior.
export const COMPONENTES_BRASIL = [...SIGLAS_UF, EXTERIOR];

export function descreverTerritorio(cd) {
  if (cd === BRASIL) return { codigo: cd, tipo: "brasil", nome: "Brasil" };
  if (cd === EXTERIOR) return { codigo: cd, tipo: "exterior", nome: "Exterior" };
  const uf = UFS[cd];
  if (!uf) return null;
  return { codigo: cd, tipo: "uf", nome: uf.nome, regiao: uf.regiao, ibge_uf: uf.ibge };
}
