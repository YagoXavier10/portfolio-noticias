// Lê data/news.json (gerado pelo script Python) e monta os cartões
const newsEl = document.getElementById("news");
const filtersEl = document.getElementById("filters");
const updatedEl = document.getElementById("updated");

// Links fixos exibidos no topo de alguns temas
const TOPIC_LINKS = {
  "Campeonatos de Jiu-Jitsu SP": [
    ["Federação Paulista (FPJJ)", "https://fpjj.com.br"],
    ["Calendário CBJJ", "https://cbjj.com.br/events/calendar"],
    ["Calendário IBJJF", "https://ibjjf.com/events/calendar"],
  ],
};

const fmtDate = (iso, opts) =>
  new Date(iso).toLocaleString("pt-BR", opts);

function card(article) {
  const a = document.createElement("a");
  a.className = "card";
  a.href = article.url;
  a.target = "_blank";
  a.rel = "noopener";

  const h = document.createElement("h4");
  h.textContent = article.title;

  const meta = document.createElement("span");
  meta.className = "meta";
  const when = article.published
    ? fmtDate(article.published, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
    : "";
  meta.textContent = [article.source, when].filter(Boolean).join(" · ");

  a.append(h, meta);
  return a;
}

function render(topics, active) {
  newsEl.replaceChildren();
  for (const [name, articles] of Object.entries(topics)) {
    if (active !== "Todos" && active !== name) continue;
    const section = document.createElement("section");
    section.className = "topic";
    const h = document.createElement("h3");
    h.textContent = name;
    const grid = document.createElement("div");
    grid.className = "grid";
    if (articles.length) grid.append(...articles.map(card));
    else grid.textContent = "Nenhuma notícia hoje.";
    section.append(h);
    if (TOPIC_LINKS[name]) {
      const links = document.createElement("div");
      links.className = "topic-links";
      for (const [label, url] of TOPIC_LINKS[name]) {
        const a = document.createElement("a");
        a.href = url;
        a.target = "_blank";
        a.rel = "noopener";
        a.textContent = label + " ↗";
        links.append(a);
      }
      section.append(links);
    }
    section.append(grid);
    newsEl.append(section);
  }
}

function renderFilters(topics) {
  const names = ["Todos", ...Object.keys(topics)];
  for (const name of names) {
    const b = document.createElement("button");
    b.textContent = name;
    b.setAttribute("aria-pressed", name === "Todos");
    b.addEventListener("click", () => {
      filtersEl.querySelectorAll("button").forEach((x) =>
        x.setAttribute("aria-pressed", x === b));
      render(topics, name);
    });
    filtersEl.append(b);
  }
}

fetch("data/news.json", { cache: "no-store" })
  .then((r) => r.json())
  .then((data) => {
    updatedEl.textContent = "Atualizado em " +
      fmtDate(data.updated_at, { dateStyle: "long", timeStyle: "short" });
    renderFilters(data.topics);
    render(data.topics, "Todos");
  })
  .catch(() => {
    updatedEl.textContent = "Não foi possível carregar as notícias.";
  });
