"""Busca manchetes recentes por tema e salva em data/news.json.

Fonte padrão: Google News RSS (não precisa de chave).
Se a variável de ambiente NEWSAPI_KEY existir, usa a NewsAPI.
"""

import json
import os
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from urllib.parse import quote_plus

import requests

# Edite aqui os temas e as buscas de cada um
TOPICS = {
    "Inteligência Artificial": '"inteligência artificial" OR OpenAI OR Anthropic OR "IA generativa" OR ChatGPT',
    "Ciência de Dados": '"ciência de dados" OR "machine learning" OR "análise de dados"',
    "Corinthians": "Corinthians",
    "Motores": "motores OR automobilismo OR \"Fórmula 1\"",
    "Tecnologia": "tecnologia",
    "Política": '"política brasileira" OR Congresso OR Planalto OR STF',
    "Economia Brasileira": '"economia brasileira" OR Selic OR inflação OR IPCA OR PIB OR Copom',
    "Fintechs": 'fintech OR fintechs OR Nubank OR Pix OR "open finance" OR "banco digital"',
    "Jiu-Jitsu": '"jiu-jitsu" OR "jiu jitsu" OR CBJJ OR IBJJF',
    # when:21d amplia a janela, porque saem menos notícias de campeonatos locais
    "Campeonatos de Jiu-Jitsu SP": '("jiu-jitsu" OR "jiu jitsu") (campeonato OR copa OR open OR torneio OR "paulista" OR FPJJ) ("São Paulo" OR paulista) when:21d',
}

# Temas que mostram mais notícias que o padrão
LIMITS = {"Campeonatos de Jiu-Jitsu SP": 10}

MAX_PER_TOPIC = 6
OUTPUT = Path(__file__).resolve().parent.parent / "data" / "news.json"
HEADERS = {"User-Agent": "news-portfolio/1.0 (+https://pages.github.com)"}


def from_google_news(query, limit):
    if "when:" not in query:
        query += " when:2d"
    url = (
        "https://news.google.com/rss/search?q="
        + quote_plus(query)
        + "&hl=pt-BR&gl=BR&ceid=BR:pt-419"
    )
    resp = requests.get(url, headers=HEADERS, timeout=20)
    resp.raise_for_status()
    root = ET.fromstring(resp.content)

    articles = []
    for item in root.findall("./channel/item")[:limit]:
        title = item.findtext("title", "").strip()
        source = item.findtext("source", "").strip()
        # O Google News coloca " - Fonte" no fim do título
        if source and title.endswith(" - " + source):
            title = title[: -len(" - " + source)]
        pub = item.findtext("pubDate")
        articles.append(
            {
                "title": title,
                "url": item.findtext("link", "").strip(),
                "source": source,
                "published": parsedate_to_datetime(pub).isoformat() if pub else None,
            }
        )
    return articles


def from_newsapi(query, key, limit):
    resp = requests.get(
        "https://newsapi.org/v2/everything",
        params={
            "q": query.split(" when:")[0],
            "language": "pt",
            "sortBy": "publishedAt",
            "pageSize": limit,
        },
        headers={**HEADERS, "X-Api-Key": key},
        timeout=20,
    )
    resp.raise_for_status()
    return [
        {
            "title": a["title"],
            "url": a["url"],
            "source": (a.get("source") or {}).get("name", ""),
            "published": a.get("publishedAt"),
        }
        for a in resp.json().get("articles", [])
        if a.get("title") and a["title"] != "[Removed]"
    ]


def main():
    key = os.environ.get("NEWSAPI_KEY")
    previous = {}
    if OUTPUT.exists():
        previous = json.loads(OUTPUT.read_text(encoding="utf-8")).get("topics", {})

    topics = {}
    for name, query in TOPICS.items():
        try:
            limit = LIMITS.get(name, MAX_PER_TOPIC)
            articles = from_newsapi(query, key, limit) if key else from_google_news(query, limit)
        except Exception as exc:  # mantém as notícias antigas se um tema falhar
            print(f"[aviso] {name}: {exc}")
            articles = previous.get(name, [])
        topics[name] = articles
        print(f"{name}: {len(articles)} notícias")

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(
        json.dumps(
            {
                "updated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                "source": "NewsAPI" if key else "Google News",
                "topics": topics,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
