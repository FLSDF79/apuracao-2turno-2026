#!/usr/bin/env python3
"""Confere se a soma das 27 UFs + Exterior bate com o total nacional oficial do TSE.
Uso: python3 tools/validar.py [codigo_eleicao]   (padrão 6257 = 1º turno 2026)
Sem dependências além da biblioteca padrão do Python."""
import json, sys, urllib.request
ELE = sys.argv[1] if len(sys.argv) > 1 else "6257"
BASE = "https://resultados.tse.jus.br/oficial/ele2026"
UFS = "ac al ap am ba ce df es go ma mt ms mg pa pb pr pe pi rj rn rs ro rr sc sp se to zz".split()
def get(uf):
    url = f"{BASE}/{ELE}/dados/{uf}/{uf}-c0001-e{int(ELE):06d}-u.json"
    with urllib.request.urlopen(url, timeout=30) as r:
        return json.load(r)
def cands(d):
    return {c["n"]: (c.get("nmu"), int(c["vap"])) for a in d["carg"][0]["agr"] for p in a["par"] for c in p["cand"]}
br = get("br"); ok = True
soma = {}; tot = {"tv": 0, "vv": 0, "vb": 0, "tvn": 0}
for uf in UFS:
    d = get(uf)
    for n, (nm, v) in cands(d).items(): soma[n] = soma.get(n, 0) + v
    for k in tot: tot[k] += int(d["v"][k])
print(f"Eleição {ELE} · totalização {br['dt']} {br['ht']} · seções {br['s']['pst']}%")
pv = {c["n"]: c["pvap"] for a in br["carg"][0]["agr"] for p in a["par"] for c in p["cand"]}
for n, (nm, v) in sorted(cands(br).items(), key=lambda x: -x[1][1]):
    s = soma.get(n, 0); dif = abs(s - v) / v if v else 0; ok &= dif <= 0.0001
    linha = f"  {n:>3} {nm:<25} nacional {v:>12,}  soma UFs {s:>12,}  {'OK' if dif <= 0.0001 else 'DIVERGE'}".replace(",", ".")
    print(f"{linha}  ({pv[n]}% válidos)")
for k, s in tot.items():
    v = int(br["v"][k]); dif = abs(s - v) / v if v else 0; ok &= dif <= 0.0001
    print(f"  {k:<4} nacional {v:>12,}  soma UFs {s:>12,}  {'OK' if dif <= 0.0001 else 'DIVERGE'}".replace(",", "."))
print("RESULTADO:", "soma das UFs confere com o nacional" if ok else "DIVERGÊNCIA > 0,01%")
sys.exit(0 if ok else 1)
