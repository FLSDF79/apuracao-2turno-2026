# Contrato provisório entre o coletor e a página

**Dono do contrato: frente 2 (coletor e motor de cálculo).** Este arquivo registra o que a página consome hoje,
para a frente 2 aceitar, ajustar ou substituir. O único arquivo da página que conhece este formato é `js/contrato.js`.

## Arquivos

| Arquivo | Conteúdo |
|---|---|
| `api/estado.json` | Presidente: Brasil, 5 regiões, 27 UFs, exterior, conferência e fontes |
| `api/historico.json` | Uma linha por totalização do TSE observada (não por coleta) |
| `api/governador.json` | Governador nas 7 UFs com 2º turno, mesmo formato de território |

## `estado.json`

```json
{
  "contrato": "0.1",
  "eleicao": { "ciclo": "ele2026", "codigo": "6258", "turno": 2, "cargo": "presidente", "modo": "oficial | teste-1t | simulacao" },
  "coleta": { "em": "ISO-8601", "proxima_em": "ISO-8601", "intervalo_s": 20, "saude": "ok | atrasada | pausada | bloqueada | indisponivel", "mensagem": null },
  "candidatos": [{ "numero": "22", "nome_urna": "FLAVIO BOLSONARO", "partido": "PL", "sqcand": "…", "situacao": "2º turno" }],
  "territorios": { "br": "T", "reg-n": "T", "reg-ne": "T", "reg-co": "T", "reg-se": "T", "reg-s": "T", "ac": "T", "…": "T", "zz": "T" },
  "conferencia": {
    "situacao": "compativel | horarios_diferentes | cobertura_incompleta | diferenca_persistente",
    "mesma_base": true,
    "linhas": [{ "item": "22 | 13 | vv | vb | tvn | vansj | tv | st | c | a", "rotulo": "…", "soma_territorial": 0, "tse_nacional": 0, "diferenca": 0 }],
    "ufs_ausentes": [], "ufs_defasadas": [], "horario_tse": "ISO", "horario_soma_mais_antiga": "ISO"
  },
  "fontes": [{ "id": "br | ac … zz", "url": "…", "http": 200, "gerado_tse": "ISO", "totalizado_tse": "ISO", "coletado_em": "ISO", "defasagem_s": 25, "origem": "base TSE (recorte AC; TRE-AC sem fonte própria)", "erro": null }]
}
```

### Território `T`

```json
{
  "id": "sp", "tipo": "brasil | regiao | uf | exterior", "nome": "São Paulo", "regiao": "se",
  "situacao": "nao_iniciada | em_andamento | concluida | indisponivel | defasada",
  "totalizado_tse": "ISO (null em região)", "atualizado_em": "ISO",
  "secoes": { "previstas": 0, "totalizadas": 0, "pct": 0.0 },
  "eleitorado": { "total": 0, "apto_secoes_totalizadas": 0 },
  "comparecimento": { "votos": 0, "pct": 0.0 },
  "abstencao": { "votos": 0, "pct": 0.0 },
  "votos": { "validos": 0, "base_pct": 0, "brancos": 0, "nulos": 0, "anulados_sub_judice": 0, "total": 0 },
  "candidatos": { "22": { "votos": 0, "pct": 0.0, "situacao": "…" } },
  "lider": "22 | 13 | empate | null",
  "margem": { "votos": 0, "pp": 0.0 },
  "eleito": "22 | 13 | null"
}
```

## Regras que a página assume

- Votos e contagens são inteiros. `null` = informação ausente; `0` = zero confirmado. A página mostra "—" para ausente.
- Percentuais vêm prontos do coletor (0–100). Candidatos sobre `base_pct` (`vvc` = válidos + anulados sub judice);
  comparecimento e abstenção sobre o eleitorado das seções (`esi`).
- Regiões e Brasil somam votos absolutos e contagens de seções antes de calcular percentuais.
- `eleito` só é preenchido quando o TSE publica situação "Eleito" (`st`). Nunca a partir do campo `e`, que vem "s" também para quem foi ao 2º turno.
- `lider`/`margem` comparam os dois mais votados do território.

## `historico.json`

```json
{ "pontos": [{ "totalizado_tse": "ISO", "em": "ISO da coleta", "secoes_pct": 0.0, "votos": { "22": 0, "13": 0 }, "pct": { "22": 0.0, "13": 0.0 }, "margem_votos": 0, "correcao": false }] }
```

Um ponto por totalização nova do TSE. Correções oficiais (queda de votos) entram como vieram, com `correcao: true`.

## `governador.json`

```json
{ "eleicao": { "codigo": "6260", "turno": 2, "cargo": "governador", "modo": "oficial" }, "coleta": { "em": "ISO" },
  "ufs": { "df": "T + candidatos_info: { \"11\": { \"nome_urna\": \"…\", \"partido\": \"…\", \"situacao\": \"…\" } }" } }
```
