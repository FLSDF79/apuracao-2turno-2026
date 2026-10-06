#!/usr/bin/env python3
"""AMOSTRA DESCARTÁVEL para pré-visualizar o painel antes do coletor (frente 2).

Lê os arquivos oficiais do 1º turno guardados em tests/fixtures e grava, em
dev/amostra/, snapshots no formato provisório que a interface consome
(docs/interface/contrato-provisorio.md). Quando o coletor publicar o contrato
definitivo, este script e dev/amostra/ devem ser apagados.

Cenários gerados:
  1t-final/          números reais do 1º turno (04/10), todos os candidatos.
  simulacao-parcial/ SIMULAÇÃO: o 1º turno "revelado" em ritmos diferentes por UF,
                     com uma UF indisponível e outra defasada, só para exercitar
                     os estados visuais. Não são dados reais.
"""
import json
import pathlib
from datetime import datetime, timedelta, timezone

RAIZ = pathlib.Path(__file__).resolve().parent.parent
FIX = RAIZ / "tests/fixtures/tse-2026-10-06/oficial/ele2026"
SAIDA = RAIZ / "dev/amostra"
BRT = timezone(timedelta(hours=-3))

UFS = "ac al ap am ba ce df es go ma mt ms mg pa pb pr pe pi rj rn rs ro rr sc sp se to".split()
NOMES = dict(ac="Acre", al="Alagoas", ap="Amapá", am="Amazonas", ba="Bahia", ce="Ceará", df="Distrito Federal",
             es="Espírito Santo", go="Goiás", ma="Maranhão", mt="Mato Grosso", ms="Mato Grosso do Sul",
             mg="Minas Gerais", pa="Pará", pb="Paraíba", pr="Paraná", pe="Pernambuco", pi="Piauí",
             rj="Rio de Janeiro", rn="Rio Grande do Norte", rs="Rio Grande do Sul", ro="Rondônia",
             rr="Roraima", sc="Santa Catarina", sp="São Paulo", se="Sergipe", to="Tocantins",
             zz="Exterior", br="Brasil")
REGIAO = {**{u: "n" for u in "ac ap am pa ro rr to".split()}, **{u: "ne" for u in "al ba ce ma pb pe pi rn se".split()},
          **{u: "co" for u in "df go mt ms".split()}, **{u: "se" for u in "es mg rj sp".split()},
          **{u: "s" for u in "pr rs sc".split()}}
NOME_REG = {"n": "Norte", "ne": "Nordeste", "co": "Centro-Oeste", "se": "Sudeste", "s": "Sul"}
GOV_UFS = "ac am df es rj rn to".split()
URL = "https://resultados.tse.jus.br/oficial/ele2026/{e}/dados/{u}/{u}-c{c:04d}-e{e:06d}-u.json"


def iso_tse(dt, ht):
    d, m, y = dt.split("/")
    return datetime(int(y), int(m), int(d), *map(int, ht.split(":")), tzinfo=BRT).isoformat()


def ler(ele, cargo, uf):
    return json.loads((FIX / str(ele) / "dados" / uf / f"{uf}-c{cargo:04d}-e{ele:06d}-u.json").read_text())


def bruto(d):
    """Extrai contagens inteiras de um -u.json."""
    s, e, v = d["s"], d["e"], d["v"]
    cands = {}
    for a in d["carg"][0]["agr"]:
        for p in a["par"]:
            for c in p["cand"]:
                cands[c["n"]] = dict(votos=int(c["vap"]), nome=c["nmu"], partido=p["sg"], sqcand=c["sqcand"],
                                     situacao=c["st"], eleito=c["st"] == "Eleito", destinacao=c.get("dvt"))
    return dict(
        ts=int(s["ts"]), st=int(s["st"]), te=int(e["te"]), esi=int(e["esi"]), c=int(e["c"]), a=int(e["a"]),
        vv=int(v["vv"]), vvc=int(v["vvc"]), vb=int(v["vb"]), tvn=int(v["tvn"]), vansj=int(v["vansj"]), tv=int(v["tv"]),
        cands=cands, totalizado=iso_tse(d["dt"], d["ht"]), gerado=iso_tse(d["dg"], d["hg"]))


def soma(lista):
    r = dict(ts=0, st=0, te=0, esi=0, c=0, a=0, vv=0, vvc=0, vb=0, tvn=0, vansj=0, tv=0, cands={})
    for x in lista:
        for k in r:
            if k != "cands":
                r[k] += x[k]
        for n, c in x["cands"].items():
            r["cands"].setdefault(n, {**c, "votos": 0})["votos"] += c["votos"]
    return r


def pct(a, b):
    return round(a / b * 100, 4) if b else None


def territorio(id_, tipo, x, situacao, regiao=None, fonte=True):
    cand = {n: dict(votos=c["votos"], pct=pct(c["votos"], x["vvc"]), situacao=c["situacao"] if fonte else None)
            for n, c in sorted(x["cands"].items(), key=lambda kv: -kv[1]["votos"])}
    ordem = list(cand)
    lider, margem = None, None
    if x["vvc"] and len(ordem) >= 2:
        a, b = cand[ordem[0]], cand[ordem[1]]
        lider = "empate" if a["votos"] == b["votos"] else ordem[0]
        margem = dict(votos=a["votos"] - b["votos"], pp=round(a["pct"] - b["pct"], 4))
    eleito = next((n for n, c in x["cands"].items() if fonte and c.get("eleito") and id_ == "br"), None)
    return dict(
        id=id_, tipo=tipo, nome=NOME_REG.get(id_[4:], NOMES.get(id_)) if tipo == "regiao" else NOMES.get(id_, id_),
        regiao=regiao, situacao=situacao,
        totalizado_tse=x.get("totalizado") if fonte else None, atualizado_em=x.get("totalizado"),
        secoes=dict(previstas=x["ts"], totalizadas=x["st"], pct=pct(x["st"], x["ts"])),
        eleitorado=dict(total=x["te"], apto_secoes_totalizadas=x["esi"]),
        comparecimento=dict(votos=x["c"], pct=pct(x["c"], x["esi"])),
        abstencao=dict(votos=x["a"], pct=pct(x["a"], x["esi"])),
        votos=dict(validos=x["vv"], base_pct=x["vvc"], brancos=x["vb"], nulos=x["tvn"],
                   anulados_sub_judice=x["vansj"], total=x["tv"]),
        candidatos=cand, lider=lider, margem=margem, eleito=eleito)


def montar(brutos, br_oficial, agora, modo, codigo, situacoes, defasadas=()):
    terr = {}
    for u in UFS + ["zz"]:
        sit = situacoes.get(u, "concluida")
        if sit == "indisponivel":
            terr[u] = dict(id=u, tipo="uf", nome=NOMES[u], regiao=REGIAO.get(u), situacao="indisponivel")
            continue
        terr[u] = territorio(u, "exterior" if u == "zz" else "uf", brutos[u], sit, REGIAO.get(u))
    for r in NOME_REG:
        membros = [brutos[u] for u in UFS if REGIAO[u] == r and terr[u]["situacao"] != "indisponivel"]
        agg = soma(membros)
        agg["totalizado"] = None
        terr["reg-" + r] = territorio("reg-" + r, "regiao", agg, "em_andamento" if any(
            terr[u]["situacao"] != "concluida" for u in UFS if REGIAO[u] == r) else "concluida", fonte=False)
    terr["br"] = territorio("br", "brasil", br_oficial, situacoes.get("br", "concluida"))

    presentes = [u for u in UFS + ["zz"] if terr[u]["situacao"] != "indisponivel"]
    st = soma([brutos[u] for u in presentes])
    linhas = [dict(item=n, rotulo=c["nome"], soma_territorial=st["cands"].get(n, {}).get("votos"),
                   tse_nacional=c["votos"]) for n, c in sorted(br_oficial["cands"].items(), key=lambda kv: -kv[1]["votos"])[:2]]
    for k, rot in [("vv", "Votos válidos"), ("vb", "Brancos"), ("tvn", "Nulos"), ("vansj", "Anulados sub judice"),
                   ("tv", "Total de votos"), ("st", "Seções totalizadas"), ("c", "Comparecimento"), ("a", "Abstenção")]:
        linhas.append(dict(item=k, rotulo=rot, soma_territorial=st[k], tse_nacional=br_oficial[k]))
    for l in linhas:
        l["diferenca"] = None if l["soma_territorial"] is None else l["soma_territorial"] - l["tse_nacional"]
    ausentes = [u for u in UFS + ["zz"] if u not in presentes]
    if ausentes:
        sit_conf = "cobertura_incompleta"
    elif defasadas:
        sit_conf = "horarios_diferentes"
    elif all(l["diferenca"] == 0 for l in linhas):
        sit_conf = "compativel"
    else:
        sit_conf = "diferenca_persistente"

    cands = [dict(numero=n, nome_urna=c["nome"], partido=c["partido"], sqcand=c["sqcand"], situacao=c["situacao"])
             for n, c in sorted(br_oficial["cands"].items(), key=lambda kv: -kv[1]["votos"])]
    fontes = []
    for u in ["br"] + UFS + ["zz"]:
        ind = situacoes.get(u) == "indisponivel"
        x = brutos.get(u, br_oficial)
        fontes.append(dict(
            id=u, url=URL.format(e=int(codigo), u=u, c=1), http=None if ind else 200,
            gerado_tse=None if ind else x["gerado"], totalizado_tse=None if ind else x["totalizado"],
            coletado_em=None if ind else agora,
            defasagem_s=None if ind else (900 if u in defasadas else 25),
            origem="base TSE" if u in ("br", "zz") else f"base TSE (recorte {u.upper()}; TRE-{u.upper()} sem fonte própria)",
            erro="HTTP 503 em 3 tentativas" if ind else None))
    return dict(
        contrato="0.1-provisorio",
        amostra=True,
        eleicao=dict(ciclo="ele2026", codigo=codigo, turno=1, cargo="presidente", modo=modo,
                     data="2026-10-04"),
        coleta=dict(em=agora, proxima_em=None, intervalo_s=20,
                    saude="atrasada" if defasadas else "ok", mensagem=None),
        candidatos=cands, territorios=terr,
        conferencia=dict(situacao=sit_conf, mesma_base=True, linhas=linhas, ufs_ausentes=ausentes,
                         ufs_defasadas=list(defasadas), horario_tse=br_oficial["totalizado"],
                         horario_soma_mais_antiga=min(brutos[u]["totalizado"] for u in presentes)),
        fontes=fontes)


def escala(x, f):
    y = {k: (round(v * f) if isinstance(v, int) and k not in ("ts", "te") else v) for k, v in x.items()}
    y["cands"] = {n: {**c, "votos": round(c["votos"] * f), "situacao": "", "eleito": False} for n, c in x["cands"].items()}
    # mantém identidades básicas usadas na tela
    y["vvc"] = sum(c["votos"] for c in y["cands"].values())
    y["vv"] = y["vvc"] - y["vansj"]
    y["tv"] = y["vvc"] + y["vb"] + y["tvn"]
    y["c"] = y["tv"]
    y["a"] = y["esi"] - y["c"]
    return y


def governador(agora):
    ufs = {}
    for u in GOV_UFS:
        x = bruto(ler(6259, 3, u))
        t = territorio(u, "uf", x, "concluida", REGIAO[u])
        t["candidatos_info"] = {n: dict(nome_urna=c["nome"], partido=c["partido"], situacao=c["situacao"])
                                for n, c in x["cands"].items()}
        ufs[u] = t
    return dict(contrato="0.1-provisorio", amostra=True,
                eleicao=dict(ciclo="ele2026", codigo="6259", turno=1, cargo="governador", modo="teste-1t"),
                coleta=dict(em=agora, saude="ok"), ufs=ufs)


def gravar(pasta, nome, obj):
    p = SAIDA / pasta
    p.mkdir(parents=True, exist_ok=True)
    (p / nome).write_text(json.dumps(obj, ensure_ascii=False, indent=1) + "\n")


def main():
    brutos = {u: bruto(ler(6257, 1, u)) for u in UFS + ["zz"]}
    br = bruto(ler(6257, 1, "br"))
    agora = "2026-10-06T13:00:00+00:00"

    # Cenário 1: final real do 1º turno
    gravar("1t-final", "estado.json", montar(brutos, br, agora, "teste-1t", "6257", {}))
    gravar("1t-final", "governador.json", governador(agora))

    # Histórico SIMULADO (o 1º turno não tem série parcial guardada)
    hist = []
    t0 = datetime(2026, 10, 25, 17, 0, tzinfo=BRT)
    for i in range(0, 41):
        fr = {u: max(0.0, min(1.0, (i - (k * 13) % 4) * (0.04 + ((k * 37) % 11) / 100))) for k, u in enumerate(UFS + ["zz"])}
        parc = soma([escala(brutos[u], fr[u]) for u in UFS + ["zz"]])
        sec = soma([{**escala(brutos[u], fr[u]), "st": round(brutos[u]["st"] * fr[u])} for u in UFS + ["zz"]])
        a, b = parc["cands"]["22"]["votos"], parc["cands"]["13"]["votos"]
        hist.append(dict(totalizado_tse=(t0 + timedelta(minutes=4 * i + (15 if i > 25 else 0))).isoformat(),
                         secoes_pct=pct(sec["st"], br["ts"]) or 0.0,
                         votos={"22": a, "13": b},
                         pct={"22": pct(a, parc["vvc"]), "13": pct(b, parc["vvc"])},
                         margem_votos=a - b, correcao=False))
    hist[31]["votos"]["13"] -= 1200  # simula uma correção oficial (queda), que a tela deve mostrar sem esconder
    hist[31]["margem_votos"] += 1200
    hist[31]["correcao"] = True
    gravar("simulacao-parcial", "historico.json", dict(contrato="0.1-provisorio", amostra=True, modo="simulacao", pontos=hist))
    gravar("1t-final", "historico.json", dict(contrato="0.1-provisorio", amostra=True, modo="simulacao", pontos=hist))

    # Cenário 2: SIMULAÇÃO parcial com estados especiais
    fr = {u: max(0.0, min(1.0, (22 - (k * 13) % 4) * (0.02 + ((k * 37) % 11) / 200))) for k, u in enumerate(UFS + ["zz"])}
    fr["sp"], fr["rr"] = 0.42, 0.0
    parciais = {}
    for u in UFS + ["zz"]:
        y = escala(brutos[u], fr[u])
        y["st"] = round(brutos[u]["st"] * fr[u])
        y["esi"] = round(brutos[u]["esi"] * fr[u])
        y["a"] = max(0, y["esi"] - y["c"])
        parciais[u] = y
    sit = {u: ("concluida" if fr[u] >= 1 else "nao_iniciada" if fr[u] == 0 else "em_andamento") for u in UFS + ["zz"]}
    sit["ap"] = "indisponivel"
    sit["br"] = "em_andamento"
    pres = [parciais[u] for u in UFS + ["zz"] if sit[u] != "indisponivel"]
    brp = soma(list(parciais.values()))
    brp["totalizado"] = brp["gerado"] = "2026-10-25T18:47:12-03:00"
    for u in parciais:
        parciais[u]["totalizado"] = parciais[u]["gerado"] = "2026-10-25T18:47:00-03:00"
    parciais["ma"]["totalizado"] = parciais["ma"]["gerado"] = "2026-10-25T18:31:40-03:00"
    est = montar(parciais, brp, "2026-10-25T21:47:30+00:00", "simulacao", "6258", sit, defasadas=("ma",))
    est["territorios"]["ma"]["situacao"] = "defasada"
    est["eleicao"].update(turno=2, data="2026-10-25")
    for c in est["candidatos"]:
        c["situacao"] = "2º turno" if c["numero"] in ("22", "13") else "Não eleito"
    gravar("simulacao-parcial", "estado.json", est)
    gravar("simulacao-parcial", "governador.json", governador("2026-10-25T21:47:30+00:00"))
    print("amostras gravadas em", SAIDA.relative_to(RAIZ))


if __name__ == "__main__":
    main()
