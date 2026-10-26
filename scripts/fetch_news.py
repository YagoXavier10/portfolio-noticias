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
    "Ciência de Dados": '"ciência de dados" OR "machine learning" OR "inteligência artificial"',
    "Corinthians": "Corinthians",
    "Motores": "motores OR automobilismo OR \"Fórmula 1\"",
    "Tecnologia": "tecnologia",
    "Jiu-Jitsu": '"jiu-jitsu" OR "jiu jitsu" OR CBJJ OR IBJJF',
}

MAX_PER_TOPIC = 6
OUTPUT = Path(__file__).resolve().parent.parent / "data" / "news.json"
HEADERS = {"User-Agent": "news-portfolio/1.0 (+https://pages.github.com)"}


def from_google_news(query):
    url = (
        "https://news.google.com/rss/search?q="
        + quote_plus(query + " when:2d")
        + "&hl=pt-BR&gl=BR&ceid=BR:pt-419"
    )
    resp = requests.get(url, headers=HEADERS, timeout=20)
    resp.raise_for_status()
    root = ET.fromstring(resp.content)

    articles = []
    for item in root.findall("./channel/item")[:MAX_PER_TOPIC]:
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


def from_newsapi(query, key):
    resp = requests.get(
        "https://newsapi.org/v2/everything",
        params={
            "q": query,
            "language": "pt",
            "sortBy": "publishedAt",
            "pageSize": MAX_PER_TOPIC,
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
            articles = from_newsapi(query, key) if key else from_google_news(query)
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
