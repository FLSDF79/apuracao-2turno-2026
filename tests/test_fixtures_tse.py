#!/usr/bin/env python3
"""Testes de consistência sobre os arquivos oficiais do TSE guardados em tests/fixtures.

Rodam offline, só com a biblioteca padrão:  python3 -m unittest discover -s tests

O que garantem (1º turno de 04/10/2026, arquivos baixados em 06/10/2026):
- os arquivos batem com o MANIFEST.sha256 (ninguém editou o dado oficial);
- os códigos de eleição, turno e cargo são os da configuração oficial (ele-c.json);
- a soma das 27 UFs + exterior (zz) é igual ao total nacional (br), campo a campo, em inteiros;
- as identidades entre categorias de voto valem (tv = vvc + vb + tvn etc.);
- o percentual oficial do candidato (pvap) usa vvc como denominador;
- os 7 governos com 2º turno são exatamente os marcados "2º turno" pela fonte.
"""
import hashlib
import json
import os
import unittest

RAIZ = os.path.join(os.path.dirname(__file__), "fixtures", "tse-2026-10-06")
OFICIAL = os.path.join(RAIZ, "oficial")
UFS = "ac al ap am ba ce df es go ma mt ms mg pa pb pr pe pi rj rn rs ro rr sc sp se to".split()


def carregar(rel):
    with open(os.path.join(OFICIAL, rel), encoding="utf-8") as f:
        return json.load(f)


def presidente(uf):
    return carregar(f"ele2026/6257/dados/{uf}/{uf}-c0001-e006257-u.json")


def governador(uf):
    return carregar(f"ele2026/6259/dados/{uf}/{uf}-c0003-e006259-u.json")


def candidatos(d):
    return [c for a in d["carg"][0]["agr"] for p in a["par"] for c in p["cand"]]


def inteiros(bloco):
    # Campos que começam com "p" são percentuais (texto com vírgula); o resto é contagem inteira.
    return {k: int(v) for k, v in bloco.items() if not k.startswith("p")}


class Manifesto(unittest.TestCase):
    def test_arquivos_batem_com_manifesto(self):
        with open(os.path.join(RAIZ, "MANIFEST.sha256"), encoding="utf-8") as f:
            linhas = [l.split(None, 1) for l in f if l.strip()]
        self.assertGreater(len(linhas), 60)
        for esperado, nome in linhas:
            with open(os.path.join(RAIZ, nome.strip()), "rb") as arq:
                self.assertEqual(hashlib.sha256(arq.read()).hexdigest(), esperado, nome)


class Configuracao(unittest.TestCase):
    def test_codigos_2026(self):
        cfg = carregar("comum/config/ele-c.json")
        pleito = [p for p in cfg["pl"] if p["c"] == "ele2026"]
        self.assertEqual([p["cd"] for p in pleito], ["3220"])
        eleicoes = {e["cd"]: e for e in pleito[0]["e"]}
        self.assertEqual(eleicoes["6257"]["cdt2"], "6258")
        self.assertEqual(eleicoes["6259"]["cdt2"], "6260")
        self.assertEqual(eleicoes["6261"]["cdt2"], "")
        cargos = lambda e: {c["cd"]: c["ds"] for a in e["abr"] for c in a["cp"]}
        self.assertEqual(cargos(eleicoes["6257"]), {"1": "Presidente"})
        self.assertEqual(cargos(eleicoes["6259"])["3"], "Governador")

    def test_arquivos_declaram_eleicao_turno_cargo(self):
        for uf in UFS + ["zz", "br"]:
            d = presidente(uf)
            self.assertEqual((d["ele"], d["t"], d["carg"][0]["cd"], d["cdabr"]), ("6257", "1", "1", uf))
        for uf in UFS:
            d = governador(uf)
            self.assertEqual((d["ele"], d["t"], d["carg"][0]["cd"], d["cdabr"]), ("6259", "1", "3", uf))


class SomaTerritorialPresidente(unittest.TestCase):
    """Coluna A (27 UFs + exterior) contra coluna B (nacional). Nunca somar A com B."""

    def test_votos_por_candidato(self):
        br = {c["n"]: int(c["vap"]) for c in candidatos(presidente("br"))}
        soma = {}
        for uf in UFS + ["zz"]:
            for c in candidatos(presidente(uf)):
                soma[c["n"]] = soma.get(c["n"], 0) + int(c["vap"])
        self.assertEqual(soma, br)

    def test_secoes_eleitorado_e_votos(self):
        br = presidente("br")
        for bloco in ("s", "e", "v"):
            soma = {}
            for uf in UFS + ["zz"]:
                for k, v in inteiros(presidente(uf)[bloco]).items():
                    soma[k] = soma.get(k, 0) + v
            self.assertEqual(soma, inteiros(br[bloco]), bloco)

    def test_df_e_exterior_sao_recortes_distintos(self):
        df, zz = presidente("df"), presidente("zz")
        self.assertEqual((df["tpabr"], zz["tpabr"]), ("uf", "uf"))
        self.assertNotEqual(df["e"]["te"], zz["e"]["te"])


class CategoriasDeVoto(unittest.TestCase):
    def verificar(self, d):
        v = inteiros(d["v"])
        self.assertEqual(v["tv"], v["vvc"] + v["vb"] + v["tvn"])
        self.assertEqual(v["tvn"], v["vn"] + v["vnt"])
        self.assertEqual(v["vvc"], v["vv"] + v["vansj"])
        self.assertEqual(v["tv"], int(d["e"]["c"]))
        self.assertEqual(sum(int(c["vap"]) for c in candidatos(d)), v["vvc"])
        e = inteiros(d["e"])
        self.assertEqual(e["te"], e["esi"] + e["esni"])
        self.assertEqual(e["c"] + e["a"], e["esi"])

    def test_identidades(self):
        for uf in UFS + ["zz", "br"]:
            self.verificar(presidente(uf))
        for uf in UFS:
            self.verificar(governador(uf))

    def test_comparecimento_oficial_usa_eleitorado_das_secoes_instaladas(self):
        e = presidente("br")["e"]
        self.assertAlmostEqual(int(e["c"]) * 100 / int(e["esi"]), float(e["pcn"].replace(",", ".")), places=6)

    def test_percentual_oficial_usa_vvc(self):
        # RJ tem candidato "Anulado sub judice": é o caso que separa vv de vvc.
        d = governador("rj")
        vvc = int(d["v"]["vvc"])
        self.assertGreater(int(d["v"]["vansj"]), 0)
        for c in candidatos(d):
            calculado = int(c["vap"]) * 100 / vvc
            self.assertAlmostEqual(calculado, float(c["pvapn"].replace(",", ".")), places=6)


class SegundoTurnoGovernador(unittest.TestCase):
    def test_ufs_com_segundo_turno(self):
        com_2t = sorted(uf for uf in UFS if any(c["st"] == "2º turno" for c in candidatos(governador(uf))))
        self.assertEqual(com_2t, ["ac", "am", "df", "es", "rj", "rn", "to"])

    def test_presidente_vai_ao_segundo_turno(self):
        finalistas = sorted(c["n"] for c in candidatos(presidente("br")) if c["st"] == "2º turno")
        self.assertEqual(finalistas, ["13", "22"])
        self.assertFalse(any(c["st"] == "Eleito" for c in candidatos(presidente("br"))))
        # "e" = "s" também nos classificados ao 2º turno: não serve para exibir "eleito".
        self.assertEqual(sorted(c["n"] for c in candidatos(presidente("br")) if c["e"] == "s"), ["13", "22"])


if __name__ == "__main__":
    unittest.main()
