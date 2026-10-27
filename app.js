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

// ---------- salvar para ler depois (fica guardado no aparelho do visitante) ----------
const SAVED_KEY = "noticias-salvas";
const loadSaved = () => { try { return JSON.parse(localStorage.getItem(SAVED_KEY)) || []; } catch { return []; } };
const storeSaved = (list) => { try { localStorage.setItem(SAVED_KEY, JSON.stringify(list)); } catch { /* sem armazenamento */ } };
const isSaved = (url) => loadSaved().some((a) => a.url === url);
function toggleSaved(article, topic) {
  const list = loadSaved();
  const i = list.findIndex((a) => a.url === article.url);
  if (i >= 0) list.splice(i, 1); else list.unshift({ ...article, topic });
  storeSaved(list);
  return i < 0;
}

// cartão com o botão de salvar (só na página de notícias)
function savableCard(article, topic, onChange) {
  const wrap = document.createElement("div");
  wrap.className = "news-card";
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "save-btn";
  const paint = () => {
    const on = isSaved(article.url);
    btn.textContent = on ? "★" : "☆";
    btn.setAttribute("aria-pressed", on);
    btn.setAttribute("aria-label", on ? "Remover dos salvos" : "Salvar para ler depois");
  };
  btn.addEventListener("click", () => {
    const added = toggleSaved(article, topic);
    paint();
    window.siteToast?.(added ? "Salva para ler depois ⭐" : "Removida dos salvos");
    onChange?.();
  });
  paint();
  wrap.append(card(article), btn);
  return wrap;
}

let query = "";
const matches = (a) => !query || norm(`${a.title} ${a.source}`).includes(query);
const norm = (t) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

function render(topics, active) {
  newsEl.replaceChildren();
  const rerender = () => render(topics, active);
  if (active === "Salvas") {
    const saved = loadSaved().filter(matches);
    const section = document.createElement("section");
    section.className = "topic";
    const h = document.createElement("h3");
    h.textContent = "⭐ Salvas para ler depois";
    const grid = document.createElement("div");
    grid.className = "grid";
    if (saved.length) grid.append(...saved.map((a) => savableCard(a, a.topic, rerender)));
    else grid.textContent = "Nenhuma notícia salva ainda. Toque na ☆ de uma notícia para guardar aqui.";
    section.append(h, grid);
    newsEl.append(section);
    return;
  }
  let shown = 0;
  for (const [name, all] of Object.entries(topics)) {
    if (active !== "Todos" && active !== name) continue;
    const articles = all.filter(matches);
    if (query && !articles.length) continue;
    shown += articles.length;
    const section = document.createElement("section");
    section.className = "topic";
    const h = document.createElement("h3");
    h.textContent = name;
    const grid = document.createElement("div");
    grid.className = "grid";
    if (articles.length) grid.append(...articles.map((a) => savableCard(a, name, active === "Salvas" ? rerender : null)));
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
  if (query && !shown) newsEl.textContent = `Nenhuma manchete de hoje fala de “${query}”.`;
}

function renderFilters(topics) {
  const names = ["Todos", "Salvas", ...Object.keys(topics)];
  for (const name of names) {
    const b = document.createElement("button");
    b.textContent = name === "Salvas" ? "⭐ Salvas" : name;
    b.dataset.topic = name;
    b.setAttribute("aria-pressed", name === "Todos");
    b.addEventListener("click", () => {
      filtersEl.querySelectorAll("button").forEach((x) =>
        x.setAttribute("aria-pressed", x === b));
      render(topics, name);
    });
    filtersEl.append(b);
  }
  const search = document.getElementById("news-search");
  if (search) {
    search.addEventListener("input", () => {
      query = norm(search.value.trim());
      const active = filtersEl.querySelector('[aria-pressed="true"]')?.dataset.topic || "Todos";
      render(topics, active);
    });
  }
}

// Prévia na página inicial: as manchetes mais recentes de todos os temas
function renderTeaser(box, topics) {
  const all = Object.entries(topics)
    .flatMap(([topic, list]) => list.map((a) => ({ ...a, topic })))
    .filter((a) => a.published)
    .sort((a, b) => new Date(b.published) - new Date(a.published));
  const seen = new Set();
  const pick = all.filter((a) => !seen.has(a.topic) && seen.add(a.topic)).slice(0, 4);
  box.replaceChildren(...pick.map((a) => {
    const c = card(a);
    const tag = document.createElement("span");
    tag.className = "news-tag";
    tag.textContent = a.topic;
    c.prepend(tag);
    return c;
  }));
}

fetch("data/news.json", { cache: "no-store" })
  .then((r) => r.json())
  .then((data) => {
    const when = fmtDate(data.updated_at, { dateStyle: "long", timeStyle: "short" });
    if (updatedEl) updatedEl.textContent = "Atualizado em " + when;
    if (newsEl) {
      renderFilters(data.topics);
      render(data.topics, "Todos");
    }
    const teaser = document.getElementById("news-teaser");
    if (teaser) renderTeaser(teaser, data.topics);
  })
  .catch(() => {
    if (updatedEl) updatedEl.textContent = "Não foi possível carregar as notícias.";
  });
