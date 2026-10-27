"""Atualiza as conquistas da Cohab Team e gera os dados do site.

Fontes:
  - SouCompetidor: rankings da CBJJE, FESP e circuitos abertos (equipe e atleta por atleta)
  - IBJJF / CBJJ: resultados oficiais por categoria
  - FPJJ: resultados por academia (Campeonato e Circuito Paulista)
  - Smoothcomp: perfil da COHAB TEAM (ADCC Brazil e outros)
  - Meu Combate: campeonatos da CBJJE a partir de 2026 (equipe e pódio de cada categoria)

Os dados brutos ficam em data/cohab/ e o script só procura o que é novo.
Saída: data/cohab-conquistas.json e data/cohab-atletas.json.

Uso: python scripts/update_cohab.py          (busca novidades e gera o site)
     python scripts/update_cohab.py --build  (só gera, sem acessar a internet)
"""

import html
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "cohab"
SC = "https://soucompetidor.com.br"
HEADERS = {"User-Agent": "Mozilla/5.0 (news-portfolio)", "X-Requested-With": "XMLHttpRequest"}

# Nomes da Cohab e nomes parecidos que são de outras equipes
COHAB = re.compile(r"cohab|nasci p", re.I)
# "COHAB TAMOIO" e "COHAB TEAM F4" são filiais e entram nas contas
NOT_COHAB = re.compile(r"CITY|CHILE|COHABINAL|NASCIDOS PARA VENCER|MIQUINHO|ECUADOR|SANTIAGO|RECOLETA", re.I)
# Eventos da "COHAB" do Amapá e do Pro RS, que parecem ser outras equipes
EXCLUDED_EVENTS = {"p0639", "p0762", "p0849", "p1020", "p1401", "p2733", "p2833"}
SCAN_AHEAD = 150      # quantos IDs novos de ranking procurar por execução
IB_AHEAD = 80         # quantos IDs novos de campeonato da IBJJF procurar
IB_RECHECK = 40       # campeonatos recentes da IBJJF que são conferidos de novo


# ---------------------------------------------------------------- utilidades
def load(name, default):
    p = RAW / name
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else default


def save(name, data):
    (RAW / name).write_text(json.dumps(data, ensure_ascii=False, indent=0), encoding="utf-8")


def get(url, tries=6):
    for k in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=HEADERS), timeout=60) as r:
                text = r.read().decode("utf-8", "replace")
            if text.strip():
                return text
        except Exception as exc:
            if "404" in str(exc):
                return ""
        time.sleep(2 + 3 * k)
    print(f"[aviso] falhou: {url[:110]}")
    return ""


def sc(path, **query):
    return get(SC + path + ("?" + urllib.parse.urlencode(query) if query else ""))


def text_of(page):
    page = re.sub(r"<script.*?</script>|<style.*?</style>|<[^>]+>", " ", page, flags=re.S)
    return " ".join(html.unescape(page).split())


def pool(fn, items, workers=5):
    with ThreadPoolExecutor(workers) as ex:
        return list(ex.map(fn, items))


# ------------------------------------------------- SouCompetidor: rankings
ROW = re.compile(r'<h4[^>]*>\s*(\d+)º LUGAR\s*</h4>\s*<h5[^>]*>(.*?)</h5>.*?OURO\s*(\d+).*?PRATA\s*(\d+)'
                 r'.*?BRONZE\s*(\d+).*?([\d.,]+)\s*PTS', re.S)


def scan_ranking(rid):
    """Lê todas as páginas de um ranking e devolve as linhas da Cohab."""
    hits, title, page = [], "", 1
    while page <= 60:
        t = sc(f"/pt-br/ranking/ranking-idade/{rid}/1" + (f"?page={page}" if page > 1 else ""))
        if not t:
            break
        if page == 1:
            m = re.search(r"<h[1-3][^>]*>(.*?)</h[1-3]>", t, re.S)
            title = text_of(m.group(1)) if m else ""
        rows = ROW.findall(t)
        if not rows:
            break
        for pos, name, o, p, b, pts in rows:
            name = text_of(name)
            if COHAB.search(name):
                hits.append({"pos": int(pos), "team": name, "ouro": int(o), "prata": int(p), "bronze": int(b), "pts": pts})
        if f"page={page + 1}" not in t:
            break
        page += 1
    return {"id": str(rid), "title": title, "hits": hits}


def athletes_of(pair):
    """Medalhas atleta por atleta de uma equipe em um ranking."""
    rid, team, title = pair
    d = sc("/pt-br/ranking/detalhe/pontos/equipe", equipe=team, time="", idadeRanking=rid)
    out = []
    for ed, rid2 in set(re.findall(r"abrirURLPontoAtletas\('[^']*','[^']*','(\d+)','(\d+)'", d)):
        s = text_of(sc("/pt-br/ranking/detalhe/pontos/equipe/atletas", equipe=team, time="", edicao=ed, idadeRanking=rid2))
        ev = re.match(r"(P\d+-.+?) \d+º LUGAR", s)
        parts = re.split(r"(\d)º LUGAR ", s)[1:]
        for i in range(0, len(parts) - 1, 2):
            m = re.match(r"(.+?) C ((?:MASCULINO|FEMININO)/.+?) O OBS:\s?(.*?)\s*pontos", parts[i + 1])
            if m:
                out.append({"edicao": ed, "event": ev.group(1) if ev else "?", "place": int(parts[i]),
                            "athlete": m.group(1).strip(), "cat": m.group(2).strip(), "alone": "Sozinho" in m.group(3),
                            "team": team, "ranking": title, "rid": rid})
    return out


def update_soucompetidor(state):
    rankings = {r["id"]: r for r in load("rankings.json", [])}
    # 1) IDs novos
    start = state["sc_max_ranking"] + 1
    new = pool(scan_ranking, range(start, start + SCAN_AHEAD))
    found = [r for r in new if r["title"]]
    if found:
        state["sc_max_ranking"] = max(int(r["id"]) for r in found)
    # 2) rankings da temporada atual que já tinham a Cohab (eles crescem a cada evento)
    year = str(date.today().year)
    current = [rid for rid, r in rankings.items() if year in r["title"] or int(rid) > state["sc_max_ranking"] - 400]
    for r in pool(scan_ranking, current) + found:
        if r["hits"]:
            rankings[r["id"]] = r
    print(f"SouCompetidor: {len(found)} rankings novos, {sum(1 for r in found if r['hits'])} com a Cohab")
    save("rankings.json", sorted(rankings.values(), key=lambda r: int(r["id"])))

    # 3) atleta por atleta, refeito a partir de todos os rankings conhecidos
    pairs = {(r["id"], h["team"], r["title"]) for r in rankings.values() for h in r["hits"]
             if not NOT_COHAB.search(h["team"]) and not r["title"].startswith("FAJJ")}
    medals = {}
    for lst in pool(athletes_of, sorted(pairs)):
        for m in lst:
            medals.setdefault((m["edicao"], m["athlete"], m["cat"], m["place"]), m)
    old = load("athletes.json", [])
    if len(medals) < 0.9 * len(old):  # proteção contra falha de rede: nunca perder dados
        print(f"[aviso] só {len(medals)} medalhas lidas (antes {len(old)}); mantendo os dados antigos")
        for m in old:
            medals.setdefault((m["edicao"], m["athlete"], m["cat"], m["place"]), m)
    save("athletes.json", list(medals.values()))
    print(f"SouCompetidor: {len(medals)} medalhas por atleta")

    # 4) nome, cidade e ano dos eventos novos
    events = load("events.json", {})
    codes = {m["event"].split("-")[0].lower() for m in medals.values()}
    codes |= {re.match(r"^(P\d+)", r["title"]).group(1).lower() for r in rankings.values() if re.match(r"^P\d+-", r["title"])}
    missing = [c for c in codes if "year" not in events.get(c, {})]
    if missing:
        listing = set()
        for page in range(1, 6):
            listing |= set(re.findall(r"eventos/resultados/(p\d+-[a-z0-9-]+)", sc(f"/pt-br/eventos/todos-os-eventos/resultados/?page={page}")))
        for s in listing:
            events.setdefault(s.split("-")[0], {})["slug"] = s
        for code in missing:
            e = events.setdefault(code, {})
            if e.get("slug"):
                body = text_of(sc(f"/pt-br/eventos/todos-os-eventos/{e['slug']}/")).split("CURRÍCULO CAMPEÃO", 1)[-1]
                city = re.search(r"BRASIL ([A-ZÀ-Ú][A-Za-zÀ-ú' ]{2,40}) ?- ?([A-Z]{2})\b", body)
                if city:
                    e["city"] = f"{city.group(1).strip()}-{city.group(2)}"
                years = Counter(re.findall(r"\d{2}/\d{2}/(20\d\d)", body))
                if years:
                    e["year"] = int(years.most_common(1)[0][0])
        save("events.json", events)


# ------------------------------------------------------------- IBJJF / CBJJ
HDR = re.compile(r"((?:Masculino|Feminino|Male|Female) / [^/]+? / [^/]+? / (?:[^/0-9(]+?)(?: \([^)]*\))?) (?=1 )")


def scan_ibjjf(event_id):
    t = get(f"https://cbjj.com.br/events/{event_id}/results", tries=3)
    if not t or "cohab" not in t.lower():
        return None
    s = text_of(t)
    body = s.split("resultados de atletas por categoria", 1)[-1]
    medals = []
    heads = list(HDR.finditer(body))
    for k, h in enumerate(heads):
        chunk = body[h.end(): heads[k + 1].start() if k + 1 < len(heads) else len(body)]
        for m in re.finditer(r"(?:^|\s)([123]) (.+?)(?=\s[123] [A-ZÀ-Ú]|$)", chunk):
            if "cohab" in m.group(2).lower():
                medals.append({"place": m.group(1), "cat": h.group(1), "who": m.group(2).strip()})
    return {"id": event_id, "title": s.split(" | ")[0][:140], "team": [], "medals": medals}


def update_ibjjf(state):
    events = {e["id"]: e for e in load("ibjjf.json", [])}
    last = state["ib_max_event"]
    ids = list(range(last - IB_RECHECK, last + IB_AHEAD + 1))
    found = [r for r in pool(scan_ibjjf, ids, workers=6) if r]
    for r in found:
        events[r["id"]] = r
    if found:
        state["ib_max_event"] = max(state["ib_max_event"], max(r["id"] for r in found))
    # avança também quando há campeonatos novos sem a Cohab
    for i in range(last + IB_AHEAD, last, -1):
        if get(f"https://cbjj.com.br/events/{i}/results", tries=2):
            state["ib_max_event"] = max(state["ib_max_event"], i)
            break
    save("ibjjf.json", sorted(events.values(), key=lambda e: e["id"]))
    print(f"IBJJF: {len(found)} campeonatos com a Cohab entre {ids[0]} e {ids[-1]}")


# --------------------------------------------------------------------- FPJJ
def update_fpjj():
    pages = {p["url"]: p for p in load("fpjj.json", [])}
    listing = get("https://www.fpjjcompetidor.com.br/resultados/")
    links = set(re.findall(r'href="(https://www\.fpjjcompetidor\.com\.br/[^"#?]+/)"', listing))
    links = {u for u in links if re.search(r"academia", u)} - set(pages)
    for u in links:
        t = get(u)
        title = text_of(re.search(r"<title>(.*?)</title>", t, re.S).group(1)) if "<title>" in t else u
        found = []
        for m in re.finditer(r"<table.*?</table>", t, re.S):
            before = text_of(t[max(0, m.start() - 600): m.start()])[-120:]
            for row in re.findall(r"<tr.*?</tr>", m.group(0), re.S):
                cells = [text_of(c) for c in re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", row, re.S)]
                if any(COHAB.search(c) or "NASCI PRA" in c.upper() for c in cells):
                    found.append({"section": before, "cells": cells})
        pages[u] = {"url": u, "title": title, "found": found}
    save("fpjj.json", list(pages.values()))
    print(f"FPJJ: {len(links)} páginas novas")


# --------------------------------------------------------------- Smoothcomp
def update_smoothcomp(state):
    club = state["smoothcomp_club"]
    events = []
    for page in range(1, 20):
        try:
            data = json.loads(get(f"https://smoothcomp.com/en/academy/{club}/past-events?page={page}") or "{}")
        except json.JSONDecodeError:
            break
        events += data.get("data", [])
        if not data.get("links", {}).get("next"):
            break
    if events:
        save("smoothcomp.json", events)
    print(f"Smoothcomp: {len(events)} eventos")


# --------------------------------------------------------------- Meu Combate
# A partir de 2026 a CBJJE publica vários campeonatos no Meu Combate (meucombate.com.br)
MC = "https://api.meucombate.com.br"


def mc(path):
    try:
        return json.loads(get(MC + path) or "null")
    except json.JSONDecodeError:
        return None


def is_cohab(name):
    return bool(name) and bool(re.search(r"cohab|nasci p", name, re.I)) and not NOT_COHAB.search(name)


def update_meucombate():
    events = []
    for status in ("finalized", "active"):
        page = 1
        while page:
            d = mc(f"/api:0VrKOQzz/events/events?page={page}&filter_status_events={status}") or {}
            events += d.get("items", [])
            page = d.get("nextPage")
    if not events:
        print("[aviso] Meu Combate: lista de eventos vazia; mantendo os dados antigos")
        return
    old = load("meucombate.json", {})
    out = {}
    base = "/api:uxixvP46/event/%7Bid%7D/ranking_result"
    for e in events:
        eid = e["events_id"]
        divisions = mc(f"{base}/division_list?events_id={eid}") or []
        if not divisions:
            continue
        teams = []
        for d in divisions:
            page = 1
            while page and page < 30:
                r = mc(f"{base}?per_page=50&page={page}&events_id={eid}&entity_type=academies&divisions_id={d['id']}") or {}
                for it in r.get("items", []):
                    if is_cohab(it.get("name")):
                        t = it.get("tiebreaker_data") or {}
                        teams.append({"division": d["name"], "pos": it["position"], "team": it["name"],
                                      "gold": t.get("gold", 0), "silver": t.get("silver", 0), "bronze": t.get("bronze", 0)})
                page = r.get("nextPage")
        medals, page = [], 1
        while page:
            r = mc(f"{base}?per_page=50&page={page}&events_id={eid}&entity_type=category") or {}
            for c in r.get("items", []):
                for a in c.get("brackets_ranking_points_athletes") or []:
                    if is_cohab(a.get("teams_name")) or is_cohab(a.get("academies_name")):
                        medals.append({
                            "place": a["position"], "athlete": a["name"], "team": a.get("teams_name") or a.get("academies_name"),
                            "gender": c.get("gender"), "gi_nogi": c.get("gi_nogi"), "absolute": c.get("absolute"),
                            "weight": c.get("weight_name"),
                            "age": ", ".join(x["ages_name"] for x in c.get("categories_ages") or []),
                            "belt": ", ".join(x["belts_name"] for x in c.get("categories_belts") or [])})
            page = r.get("nextPage")
        if not teams and not medals and str(eid) in old:  # falha momentânea: mantém o que já tinha
            out[str(eid)] = old[str(eid)]
            continue
        out[str(eid)] = {"id": eid, "name": e["events_name"], "org": e.get("organizations_slug") or "",
                         "first_day": e["events_first_day"], "city": e.get("cities_name") or "",
                         "state": e.get("states_acronym") or "", "teams": teams, "medals": medals}
    for k, v in old.items():
        out.setdefault(k, v)
    save("meucombate.json", out)
    print(f"Meu Combate: {sum(len(v['medals']) for v in out.values())} medalhas em "
          f"{sum(1 for v in out.values() if v['medals'])} eventos")


# ------------------------------------------------------------ dados do site
SMALL = {"de", "da", "do", "das", "dos", "e", "a", "o", "para"}
KEEP = {"CBJJE", "BJJ", "GI", "FESP", "II", "III", "IV", "V", "VII", "XII", "XI", "X", "XX", "SP", "FELFA-SP", "ECJJ",
        "KVRA", "CBSJJ", "ADCC"}
ACC = {"TACA": "Taça", "SAO": "São", "REGIAO": "Região", "VERAO": "Verão", "MEDIO": "Médio", "PESADISSIMO": "Pesadíssimo",
       "SUPER-PESADO": "Super-Pesado", "MEIO-PESADO": "Meio-Pesado", "EXTRA-PESADISSIMO": "Extra-Pesadíssimo",
       "INF-JUV": "Infanto-Juvenil", "CINZA+AMARELA": "Cinza/Amarela", "NOGI": "NoGi", "ESPORTIVO": "Esportivo"}
MINOR = re.compile(r"MIRIM|INFANTIL|INF-JUV|INFANTO", re.I)
BRAZIL_CITIES = re.compile(r"\b(Brasil|Brazil|S[ãa]o Paulo|Rio de Janeiro|Niter[óo]i|Balne[áa]rio Cambori[úu]|Goi[âa]nia|Curitiba|"
                           r"Bras[íi]lia|Belo Horizonte|Florian[óo]polis|Salvador|Recife|Fortaleza|Campinas|S[ãa]o Jos[ée] dos Campos|"
                           r"Santos|Santo Andr[ée]|Guarulhos|Osasco)\b|/(SP|RJ|MG|PR|SC|RS|GO|DF|BA|PE|CE|ES)\b", re.I)


def title_case(text):
    out = []
    for i, w in enumerate(text.replace("FELFA SP", "FELFA-SP").split()):
        u = w.upper()
        if u in ACC:
            out.append(ACC[u])
        elif u in KEEP:
            out.append(u)
        elif w.lower() in SMALL and i:
            out.append(w.lower())
        else:
            out.append(w[:1].upper() + w[1:].lower())
    s = " ".join(out)
    for a, b in [("Jiu Jitsu", "Jiu-Jitsu"), ("Jiu-jitsu", "Jiu-Jitsu"), ("Sul Americano", "Sul-Americano"),
                 ("Pan Americano", "Pan-Americano"), ("Pan-americano", "Pan-Americano"), ("Taça São Paulo-", "Taça São Paulo"),
                 (" – ", " · ")]:
        s = s.replace(a, b)
    return s


def short_name(name):
    p = [x for x in name.split() if x.lower() not in SMALL]
    return f"{p[0][:1].upper()}. {p[-1].title()}" if len(p) > 1 else name.title()


def full_name(name):
    s = name.title()
    for w in [" De ", " Da ", " Do ", " Dos ", " Das ", " E "]:
        s = s.replace(w, w.lower())
    return s


def season_of(title, rid, rankings_2025):
    m = re.search(r"(20\d\d)", title)
    if m:
        return int(m.group(1))
    return 2025 if rid in rankings_2025 else None


def build():
    rankings = load("rankings.json", [])
    athletes = load("athletes.json", [])
    events = load("events.json", {})
    rankings_2025 = {str(i) for i in list(range(1409, 1420)) + list(range(1487, 1509))}

    def year_of(code, fallback=""):
        y = events.get(code, {}).get("year")
        if y:
            return int(y)
        m = re.search(r"(20\d\d)", fallback)
        if m:
            return int(m.group(1))
        n = int(code[1:])
        return 2019 if n < 1060 else 2020 if n < 1140 else 2025 if n < 2680 else date.today().year

    def excluded(code):
        return code in EXCLUDED_EVENTS or events.get(code, {}).get("city", "").endswith("-AP")

    # medalhas por atleta (SouCompetidor)
    cbjje_eds = {r["edicao"] for r in athletes if re.search(r"CBJJE|BJJSPORT|ESTADUAL PAULISTA", r["ranking"])}
    sc_medals = []
    for r in athletes:
        code = r["event"].split("-")[0].lower()
        if excluded(code) or NOT_COHAB.search(r["team"]):
            continue
        kids = bool(MINOR.search(r["cat"]))
        sc_medals.append({
            "year": year_of(code, r["ranking"]), "place": r["place"], "event": title_case(re.sub(r"^P\d+-", "", r["event"])),
            "circuit": "CBJJE / FESP" if r["edicao"] in cbjje_eds else "Circuitos abertos",
            "cat": " / ".join(title_case(p) for p in r["cat"].split("/")),
            "athlete": short_name(r["athlete"]) if kids else full_name(r["athlete"]), "kids": kids, "alone": r["alone"],
            "url": f"{SC}/pt-br/ranking/ranking-idade/{r['rid']}/1"})
    # medalhas por atleta (Meu Combate: CBJJE a partir de 2026)
    meucombate = load("meucombate.json", {})
    for ev in meucombate.values():
        year = int(date.fromtimestamp(ev["first_day"] / 1000).year)
        url = f"https://www.meucombate.com.br/{ev['org'].split('_')[0] or 'cbjje'}/evento/{ev['id']}/resultados/"
        for m in ev["medals"]:
            kids = bool(re.search(r"mirim|infantil|infanto|pr[ée]-mirim", m["age"], re.I))
            parts = ["Masculino" if m["gender"] == "masc" else "Feminino", m["age"],
                     "NoGi" if m["gi_nogi"] == "nogi" else "Gi", m["belt"], "Absoluto" if m["absolute"] else m["weight"]]
            sc_medals.append({
                "year": year, "place": m["place"], "event": title_case(ev["name"]),
                "circuit": "CBJJE / FESP" if "cbjje" in ev["org"] else "Circuitos abertos",
                "cat": " / ".join(p for p in parts if p), "athlete": short_name(m["athlete"].upper()) if kids else full_name(m["athlete"]),
                "kids": kids, "alone": False, "url": url})
    sc_medals.sort(key=lambda x: (-x["year"], x["place"], x["athlete"]))

    # classificação por equipe em cada campeonato
    names = {r["event"].split("-")[0].lower(): r["event"] for r in athletes}
    team = []
    for r in rankings:
        m = re.match(r"^(P\d+)-RANKING", r["title"])
        if not m or excluded(m.group(1).lower()):
            continue
        code = m.group(1).lower()
        slug = events.get(code, {}).get("slug")
        for h in r["hits"]:
            if NOT_COHAB.search(h["team"]):
                continue
            team.append({"year": year_of(code), "pos": h["pos"],
                         "event": title_case(re.sub(r"^P\d+-", "", names.get(code, r["title"].split("-RANKING")[0]))),
                         "name": h["team"], "gold": h["ouro"], "silver": h["prata"], "bronze": h["bronze"],
                         "url": f"{SC}/pt-br/eventos/resultados/{slug}/" if slug else f"{SC}/pt-br/ranking/ranking-idade/{r['id']}/1"})
    # Meu Combate: posição na classificação Geral e as divisões em que a Cohab foi campeã
    for ev in meucombate.values():
        geral = [t for t in ev["teams"] if t["division"].lower().startswith("geral") and "gi" not in t["division"].lower()[5:]]
        geral = geral or [t for t in ev["teams"] if t["division"].lower().startswith("geral")]
        if not geral:
            continue
        g = min(geral, key=lambda t: t["pos"])
        wins = [t["division"] for t in ev["teams"] if t["pos"] == 1 and t is not g]
        team.append({"year": int(date.fromtimestamp(ev["first_day"] / 1000).year), "pos": g["pos"],
                     "event": title_case(ev["name"]), "name": g["team"], "gold": g["gold"], "silver": g["silver"],
                     "bronze": g["bronze"],
                     "note": ("Campeã também em: " + ", ".join(wins)) if wins else "",
                     "url": f"https://www.meucombate.com.br/{ev['org'].split('_')[0] or 'cbjje'}/evento/{ev['id']}/resultados/"})
    team.sort(key=lambda t: (t["pos"], -t["year"]))

    # temporadas da CBJJE (Ranking Nacional geral, com e sem kimono)
    seasons = {}
    for r in rankings:
        t = r["title"]
        m = re.match(r"^CBJJE (20\d\d) - GERAL(?: \( GI \+ NOGI \))?$", t)
        if m:
            y = int(m.group(1))
        elif re.match(r"^RANKING NACIONAL - CBJJE( 20\d\d)? - GERAL \( GI \+ NOGI \)", t):
            y = season_of(t, r["id"], rankings_2025)
        else:
            continue
        if not y:
            continue
        for h in r["hits"]:
            if NOT_COHAB.search(h["team"]):
                continue
            s = seasons.setdefault(y, {"year": y, "gold": 0, "silver": 0, "bronze": 0, "rank": 999,
                                       "url": f"{SC}/pt-br/ranking/ranking-idade/{r['id']}/1"})
            s["gold"] += h["ouro"]; s["silver"] += h["prata"]; s["bronze"] += h["bronze"]
            s["rank"] = min(s["rank"], h["pos"])
    # campeonatos da CBJJE publicados no Meu Combate entram na temporada do ano
    for ev in meucombate.values():
        if "cbjje" not in ev["org"] or not ev["medals"]:
            continue
        y = int(date.fromtimestamp(ev["first_day"] / 1000).year)
        s = seasons.setdefault(y, {"year": y, "gold": 0, "silver": 0, "bronze": 0, "rank": 999, "url": ""})
        c = Counter(m["place"] for m in ev["medals"])
        s["gold"] += c[1]; s["silver"] += c[2]; s["bronze"] += c[3]
        s["meucombate"] = True

    # melhores posições em rankings oficiais (duas últimas temporadas)
    best = []
    last_two = sorted(seasons)[-2:]
    for r in rankings:
        t = r["title"]
        if not re.search(r"RANKING (NACIONAL|ESTADUAL PAULISTA|INTERNACIONAL)", t):
            continue
        y = season_of(t, r["id"], rankings_2025)
        if y not in last_two:
            continue
        hs = [h for h in r["hits"] if not NOT_COHAB.search(h["team"])]
        if not hs:
            continue
        h = min(hs, key=lambda h: h["pos"])
        kind = "Internacional BJJSport" if "INTERNACIONAL" in t else "Nacional CBJJE" if "NACIONAL" in t else "Estadual Paulista"
        div = re.sub(r"\s*\(\s*GI \+ NOGI\s*\)", "", t.split(" - ")[-1]).strip()
        div = title_case(div).replace("GI", "Gi").replace("Geral", "Geral (Gi + NoGi)" if "NOGI )" in t else "Geral")
        best.append({"label": f"{kind} {y} · {div}", "pos": h["pos"], "gold": h["ouro"], "silver": h["prata"],
                     "bronze": h["bronze"], "url": f"{SC}/pt-br/ranking/ranking-idade/{r['id']}/1"})
    best.sort(key=lambda b: (b["pos"], b["label"]))
    best = best[:12]

    # FPJJ
    fpjj = []
    for page in load("fpjj.json", []):
        title = page["title"].split(" – Federação")[0]
        ym = re.search(r"(20\d\d)", title)
        for f in page["found"]:
            c = f["cells"]
            if len(c) < 3 or not re.search(r"COHAB JJ TEAM|NASCI PRA VENCER", c[1]):
                continue
            division = re.sub(r".*CATEGORIA", "", f["section"]).strip(" –-").title().replace(" E ", " e ").replace(" A ", " a ")
            name = (title.replace(" – Resultados por academia final", " (final)").replace(" – Resultados por academia", "")
                    .replace("Resultado por academia – ", ""))
            fpjj.append({"year": int(ym.group(1)) if ym else 0, "event": name, "division": division, "pos": int(c[0]),
                         "gold": int(c[2]) if len(c) == 5 else None, "silver": int(c[3]) if len(c) == 5 else None,
                         "points": int(c[-1]), "url": page["url"]})
    fpjj.sort(key=lambda x: (x["pos"], -x["year"]))

    # IBJJF / CBJJ
    tiers = [("Mundial", r"World IBJJF|Mundial"), ("Europeu", r"European"), ("Pan", r"\bPan\b"),
             ("Brasileiro", r"Brasileiro"), ("Sul-Americano", r"Sul[- ]Americano|South America"), ("Open internacional", r".")]
    ibjjf, seen = [], set()
    for e in load("ibjjf.json", []):
        y = re.search(r"20\d\d", e["title"])
        for m in e["medals"]:
            who = " ".join(m["who"].split())
            mm = re.search(r"^(.*?)\s*Cohab Team Brazilian Jiu-Jitsu$", who) or \
                (re.search(r"^(Lucas Tomas Canto)\s*Cohab$", who))
            if not mm or "chile" in who.lower():
                continue
            cat = re.sub(r"\s*\([^)]*\)", "", m["cat"]).strip()
            k = (e["id"], cat, mm.group(1).strip(), m["place"])
            if k in seen:
                continue
            seen.add(k)
            ibjjf.append({"year": int(y.group(0)) if y else 0, "place": int(m["place"]), "event": e["title"],
                          "tier": next(n for n, p in tiers if re.search(p, e["title"])), "cat": cat,
                          "athlete": mm.group(1).strip(), "url": f"https://cbjj.com.br/events/{e['id']}/results"})
    ibjjf.sort(key=lambda x: (-x["year"], x["place"], x["event"]))

    # Smoothcomp: só eventos realizados no Brasil
    smooth = []
    for e in load("smoothcomp.json", []):
        md = e.get("medals") or {}
        if not BRAZIL_CITIES.search(e.get("city", "")) or not sum(md.values()):
            continue
        smooth.append({"year": int(e["start_date"][:4]), "event": e["title"], "city": e["city"], "gold": md.get("gold", 0),
                       "silver": md.get("silver", 0), "bronze": md.get("bronze", 0),
                       "url": f"https://smoothcomp.com/en/event/{e['id']}"})
    smooth.sort(key=lambda s: -s["year"])

    today = date.today().isoformat()
    out = {"updated": today, "team": team, "fpjj": fpjj, "seasons": sorted(seasons.values(), key=lambda s: s["year"]),
           "rankings": best, "ibjjf": ibjjf, "smoothcomp": smooth}
    (ROOT / "data" / "cohab-conquistas.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    (ROOT / "data" / "cohab-atletas.json").write_text(
        json.dumps({"updated": today, "cbjje": sc_medals}, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"Site: {len(sc_medals)} medalhas SouCompetidor, {len(ibjjf)} IBJJF, {len(team)} classificações por equipe, "
          f"{len(fpjj)} FPJJ, {len(smooth)} Smoothcomp")


def main():
    RAW.mkdir(parents=True, exist_ok=True)
    if "--build" not in sys.argv:
        state = load("state.json", {"sc_max_ranking": 2600, "ib_max_event": 3400, "smoothcomp_club": 4378})
        for step in (update_soucompetidor, update_ibjjf):
            try:
                step(state)
            except Exception as exc:  # uma fonte fora do ar não derruba as outras
                print(f"[aviso] {step.__name__}: {exc}")
        for step in (update_fpjj, lambda: update_smoothcomp(state), update_meucombate):
            try:
                step()
            except Exception as exc:
                print(f"[aviso] {exc}")
        save("state.json", state)
    build()


if __name__ == "__main__":
    main()
