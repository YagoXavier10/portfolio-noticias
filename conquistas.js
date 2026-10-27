// Página de conquistas da Cohab Team: lê data/cohab-conquistas.json e monta tudo
const $ = (sel) => document.querySelector(sel);
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
const MEDAL = { 1: "🥇", 2: "🥈", 3: "🥉" };
const KEYS = { gold: "Ouro", silver: "Prata", bronze: "Bronze" };

// Liga um grupo de botões tipo "chip": só um ativo por vez
function chipGroup(container, onChange) {
  container.addEventListener("click", (ev) => {
    const b = ev.target.closest("button");
    if (!b) return;
    container.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", x === b));
    onChange(b);
  });
}

function countUp(node, value) {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) { node.textContent = value; return; }
  const start = performance.now();
  const step = (t) => {
    const p = Math.min(1, Math.max(0, (t - start) / 1200));
    node.textContent = Math.round(value * (1 - Math.pow(1 - p, 3)));
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  // Garante o número final mesmo se a aba estiver em segundo plano (sem animação)
  setTimeout(() => { node.textContent = value; }, 1500);
}

function medals(g, s, b) {
  const w = el("span", "medal-row");
  [["g", g], ["s", s], ["b", b]].forEach(([c, v]) => w.append(el("span", "m " + c, v)));
  return w;
}

// ---------- Temporadas CBJJE ----------
function renderSeasons(seasons) {
  const chart = $("#season-chart");
  const detail = $("#season-detail");
  let mode = "all";
  let selected = seasons[seasons.length - 1].year;

  const showDetail = (s) => {
    detail.replaceChildren();
    const total = s.gold + s.silver + s.bronze;
    detail.append(
      el("strong", "", `Temporada ${s.year}${s.year === 2026 ? " (até agosto)" : ""}`),
      el("span", "", `${total} medalhas · ${s.rank}º no ranking nacional`),
      medals(s.gold, s.silver, s.bronze),
    );
    const a = el("a", "", "Ver ranking ↗");
    a.href = s.url; a.target = "_blank"; a.rel = "noopener";
    detail.append(a);
  };

  const draw = () => {
    chart.replaceChildren();
    const val = (s) => (mode === "all" ? s.gold + s.silver + s.bronze : s[mode]);
    const max = Math.max(...seasons.map(val));
    seasons.forEach((s) => {
      const col = el("button", "season-col");
      col.type = "button";
      col.setAttribute("aria-pressed", s.year === selected);
      col.setAttribute("aria-label", `${s.year}: ${val(s)} medalhas`);
      const bar = el("span", "season-bar");
      bar.style.height = `${Math.max(4, (val(s) / max) * 100)}%`;
      const parts = mode === "all" ? ["gold", "silver", "bronze"] : [mode];
      parts.forEach((k) => {
        const seg = el("i", "seg " + k);
        seg.style.flexGrow = s[k];
        bar.append(seg);
      });
      col.append(el("b", "", val(s)), bar, el("span", "season-year", s.year), el("span", "season-rank", `${s.rank}º`));
      const pick = () => {
        selected = s.year;
        chart.querySelectorAll(".season-col").forEach((c) => c.setAttribute("aria-pressed", c === col));
        showDetail(s);
      };
      col.addEventListener("click", pick);
      col.addEventListener("mouseenter", pick);
      col.addEventListener("focus", pick);
      chart.append(col);
    });
    showDetail(seasons.find((s) => s.year === selected));
  };

  chipGroup($("#season-filter"), (b) => { mode = b.dataset.m; draw(); });
  draw();
}

// ---------- Classificação por equipe ----------
function renderTeam(team) {
  const list = $("#team-list");
  const draw = (maxPos) => {
    list.replaceChildren();
    team.filter((t) => t.pos <= maxPos)
      .sort((a, b) => a.pos - b.pos || b.year - a.year)
      .forEach((t) => {
        const a = el("a", "result");
        a.href = t.url; a.target = "_blank"; a.rel = "noopener";
        const main = el("span", "result-main");
        main.append(el("strong", "", t.event), el("span", "", `${t.year} · ${t.name}`));
        a.append(el("span", "result-pos p" + Math.min(t.pos, 4), `${t.pos}º`), main, medals(t.gold, t.silver, t.bronze));
        list.append(a);
      });
  };
  chipGroup($("#team-filter"), (b) => draw(+b.dataset.p));
  draw(1);
}

// ---------- Panorama por ano (todas as fontes) ----------
const SOURCES = [
  { key: "cbjje", label: "CBJJE / FESP", color: "#b3121b", panel: "cbjje" },
  { key: "open", label: "Circuitos abertos", color: "#e0634f", panel: "equipe" },
  { key: "ibjjf", label: "IBJJF / CBJJ", color: "#2f6fde", panel: "ibjjf" },
  { key: "fpjj", label: "FPJJ", color: "#1a9a5c", panel: "fpjj" },
  { key: "adcc", label: "ADCC / Smoothcomp", color: "#d48a14", panel: "adcc" },
];

// Junta tudo em linhas {source, year, place, n}
function allMedals(d, a) {
  const rows = [];
  a.cbjje.forEach((m) => rows.push({ source: m.circuit === "CBJJE / FESP" ? "cbjje" : "open", year: m.year, place: m.place, n: 1 }));
  d.ibjjf.forEach((m) => rows.push({ source: "ibjjf", year: m.year, place: m.place, n: 1 }));
  d.fpjj.forEach((f) => {
    if (f.gold) rows.push({ source: "fpjj", year: f.year, place: 1, n: f.gold });
    if (f.silver) rows.push({ source: "fpjj", year: f.year, place: 2, n: f.silver });
  });
  d.smoothcomp.forEach((s) => [[1, s.gold], [2, s.silver], [3, s.bronze]].forEach(([p, n]) => {
    if (n) rows.push({ source: "adcc", year: s.year, place: p, n });
  }));
  return rows;
}

function renderOverview(rows) {
  const on = new Set(SOURCES.map((s) => s.key));
  let medal = "all";
  const years = [...new Set(rows.map((r) => r.year))].filter((y) => y >= 2017).sort();
  let selected = years[years.length - 1];

  const srcBox = $("#ov-sources");
  SOURCES.forEach((s) => {
    const b = el("button", "src-chip");
    b.setAttribute("aria-pressed", "true");
    b.style.setProperty("--c", s.color);
    b.append(el("i", "dot"), document.createTextNode(s.label));
    b.addEventListener("click", () => {
      on.has(s.key) ? on.delete(s.key) : on.add(s.key);
      if (!on.size) on.add(s.key);
      b.setAttribute("aria-pressed", on.has(s.key));
      draw();
    });
    srcBox.append(b);
  });
  chipGroup($("#ov-medal"), (b) => { medal = b.dataset.m; draw(); });

  const sum = (y, src) => rows
    .filter((r) => r.year === y && r.source === src && (medal === "all" || r.place === +medal))
    .reduce((n, r) => n + r.n, 0);

  const detail = (y) => {
    const box = $("#ov-detail");
    box.replaceChildren(el("strong", "", `${y}`));
    let total = 0;
    SOURCES.filter((s) => on.has(s.key)).forEach((s) => {
      const c = { 1: 0, 2: 0, 3: 0 };
      rows.filter((r) => r.year === y && r.source === s.key).forEach((r) => (c[r.place] += r.n));
      const n = c[1] + c[2] + c[3];
      if (!n) return;
      total += n;
      const item = el("span", "ov-item");
      item.style.setProperty("--c", s.color);
      item.append(el("i", "dot"), el("span", "", s.label), medals(c[1], c[2], c[3]));
      box.append(item);
    });
    box.children[0].textContent = `${y} · ${total} medalhas`;
  };

  const draw = () => {
    const chart = $("#ov-chart");
    chart.replaceChildren();
    const totals = years.map((y) => SOURCES.filter((s) => on.has(s.key)).reduce((n, s) => n + sum(y, s.key), 0));
    const max = Math.max(1, ...totals);
    years.forEach((y, i) => {
      const col = el("button", "season-col");
      col.type = "button";
      col.setAttribute("aria-pressed", y === selected);
      col.setAttribute("aria-label", `${y}: ${totals[i]} medalhas`);
      const bar = el("span", "season-bar");
      bar.style.height = `${Math.max(2, (totals[i] / max) * 100)}%`;
      SOURCES.filter((s) => on.has(s.key)).forEach((s) => {
        const v = sum(y, s.key);
        if (!v) return;
        const seg = el("i", "seg");
        seg.style.flexGrow = v;
        seg.style.background = s.color;
        bar.append(seg);
      });
      col.append(el("b", "", totals[i]), bar, el("span", "season-year", y));
      const pick = () => {
        selected = y;
        chart.querySelectorAll(".season-col").forEach((c) => c.setAttribute("aria-pressed", c === col));
        detail(y);
      };
      col.addEventListener("click", pick);
      col.addEventListener("mouseenter", pick);
      col.addEventListener("focus", pick);
      chart.append(col);
    });
    detail(selected);
  };
  draw();
}

// ---------- Cartões por federação ----------
function renderFedCards(rows, openPanel) {
  const box = $("#fed-cards");
  SOURCES.forEach((s) => {
    const c = { 1: 0, 2: 0, 3: 0 };
    rows.filter((r) => r.source === s.key).forEach((r) => (c[r.place] += r.n));
    const total = c[1] + c[2] + c[3];
    const b = el("button", "fed-card");
    b.type = "button";
    b.style.setProperty("--c", s.color);
    b.append(el("span", "fed-name", s.label), el("strong", "", total), el("span", "fed-sub", "medalhas"), medals(c[1], c[2], s.key === "fpjj" ? "–" : c[3]));
    b.addEventListener("click", () => openPanel(s.panel, true));
    box.append(b);
  });
}

// ---------- Atletas com mais ouros ----------
function renderLeaders(a, d) {
  const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  const map = new Map();
  // Nomes abreviados (crianças) ficam fora: várias crianças podem ter a mesma abreviação
  [...a.cbjje, ...d.ibjjf].filter((m) => !m.kids && !/^\p{L}\. /u.test(m.athlete)).forEach((m) => {
    const k = norm(m.athlete);
    if (!map.has(k)) map.set(k, { name: m.athlete, c: { 1: 0, 2: 0, 3: 0 } });
    map.get(k).c[m.place]++;
  });
  const top = [...map.values()].sort((x, y) => y.c[1] - x.c[1] || y.c[2] - x.c[2] || y.c[3] - x.c[3]).slice(0, 10);
  const max = top[0].c[1];
  const list = $("#leaders");
  top.forEach((p, i) => {
    const li = el("li");
    const link = el("a", "leader");
    link.href = `atletas.html?q=${encodeURIComponent(p.name)}`;
    const barWrap = el("span", "leader-bar");
    const bar = el("i");
    bar.style.width = `${(p.c[1] / max) * 100}%`;
    barWrap.append(bar);
    const main = el("span", "result-main");
    main.append(el("strong", "", p.name), barWrap);
    link.append(el("span", "athlete-rank", `${i + 1}º`), main, medals(p.c[1], p.c[2], p.c[3]));
    li.append(link);
    list.append(li);
  });
}

// ---------- Painéis com abas ----------
function setupPanels() {
  const tabs = $("#panel-tabs");
  const open = (name, scroll) => {
    tabs.querySelectorAll("button").forEach((b) => b.setAttribute("aria-selected", b.dataset.panel === name));
    document.querySelectorAll(".panel").forEach((p) => { p.hidden = p.dataset.panel !== name; });
    if (scroll) tabs.scrollIntoView({ behavior: "smooth", block: "start" });
    history.replaceState(null, "", `#${name}`);
  };
  tabs.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (b) open(b.dataset.panel, false);
  });
  const first = location.hash.slice(1);
  open([...tabs.querySelectorAll("button")].some((b) => b.dataset.panel === first) ? first : "equipe", false);
  return open;
}

// ---------- FPJJ ----------
function renderFpjj(rows) {
  const list = $("#fpjj-list");
  const draw = (maxPos) => {
    list.replaceChildren();
    rows.filter((r) => r.pos <= maxPos)
      .sort((a, b) => a.pos - b.pos || b.year - a.year)
      .forEach((r) => {
        const a = el("a", "result");
        a.href = r.url; a.target = "_blank"; a.rel = "noopener";
        const main = el("span", "result-main");
        main.append(el("strong", "", r.event), el("span", "", `${r.year} · ${r.division}`));
        const right = r.gold === null
          ? el("span", "tier", `${r.points} pts`)
          : medals(r.gold, r.silver, "–");
        a.append(el("span", "result-pos p" + Math.min(r.pos, 4), `${r.pos}º`), main, right);
        list.append(a);
      });
  };
  chipGroup($("#fpjj-filter"), (b) => draw(+b.dataset.p));
  draw(3);
}

// ---------- Smoothcomp ----------
function renderSmooth(rows) {
  const list = $("#smooth-list");
  rows.forEach((r) => {
    const a = el("a", "result");
    a.href = r.url; a.target = "_blank"; a.rel = "noopener";
    const main = el("span", "result-main");
    main.append(el("strong", "", r.event), el("span", "", `${r.year} · ${r.city}`));
    a.append(el("span", "result-pos", r.year), main, medals(r.gold, r.silver, r.bronze));
    list.append(a);
  });
}

// ---------- Rankings ----------
function renderRankings(rankings) {
  const box = $("#rank-list");
  rankings.forEach((r) => {
    const a = el("a", "card rank-card");
    a.href = r.url; a.target = "_blank"; a.rel = "noopener";
    a.append(el("span", "rank-pos p" + Math.min(r.pos, 4), `${r.pos}º`), el("h4", "", r.label), medals(r.gold, r.silver, r.bronze));
    box.append(a);
  });
}

// ---------- Explorador IBJJF ----------
function renderIbjjf(items) {
  const state = { year: "all", place: "all", tier: "all", q: "", limit: 12 };
  const years = [...new Set(items.map((i) => i.year))].sort((a, b) => b - a);
  const tiers = ["Mundial", "Europeu", "Pan", "Brasileiro", "Sul-Americano", "Open internacional"]
    .filter((t) => items.some((i) => i.tier === t));

  const fill = (box, values, label) => {
    const all = el("button", "", "Todos"); all.dataset.v = "all"; all.setAttribute("aria-pressed", "true");
    box.append(all);
    values.forEach((v) => {
      const b = el("button", "", label ? label(v) : v);
      b.dataset.v = v; b.setAttribute("aria-pressed", "false");
      box.append(b);
    });
  };
  fill($("#ib-year"), years);
  fill($("#ib-tier"), tiers);

  const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const draw = () => {
    const q = norm(state.q);
    const rows = items.filter((i) =>
      (state.year === "all" || i.year === +state.year) &&
      (state.place === "all" || i.place === +state.place) &&
      (state.tier === "all" || i.tier === state.tier) &&
      (!q || norm(`${i.athlete} ${i.event} ${i.cat}`).includes(q)));
    const c = { 1: 0, 2: 0, 3: 0 };
    rows.forEach((r) => c[r.place]++);
    $("#ib-summary").textContent = `${rows.length} medalhas · 🥇 ${c[1]} · 🥈 ${c[2]} · 🥉 ${c[3]}`;
    const list = $("#ib-list");
    list.replaceChildren();
    rows.slice(0, state.limit).forEach((i) => {
      const a = el("a", "result");
      a.href = i.url; a.target = "_blank"; a.rel = "noopener";
      const main = el("span", "result-main");
      main.append(el("strong", "", i.athlete), el("span", "", `${i.event} · ${i.cat}`));
      a.append(el("span", "result-pos medal", MEDAL[i.place]), main, el("span", "tier", i.tier));
      list.append(a);
    });
    const more = $("#ib-more");
    more.hidden = rows.length <= state.limit;
    more.textContent = `Mostrar mais (${rows.length - state.limit})`;
  };

  const reset = (key) => (b) => { state[key] = b.dataset.v; state.limit = 12; draw(); };
  chipGroup($("#ib-year"), reset("year"));
  chipGroup($("#ib-place"), reset("place"));
  chipGroup($("#ib-tier"), reset("tier"));
  $("#ib-search").addEventListener("input", (e) => { state.q = e.target.value; state.limit = 12; draw(); });
  $("#ib-more").addEventListener("click", () => { state.limit += 24; draw(); });
  draw();
}

Promise.all([
  fetch("data/cohab-conquistas.json", { cache: "no-store" }).then((r) => r.json()),
  fetch("data/cohab-atletas.json", { cache: "no-store" }).then((r) => r.json()),
])
  .then(([d, a]) => {
    // Soma as medalhas de todas as fontes (SouCompetidor, IBJJF, FPJJ e Smoothcomp)
    const sm = d.smoothcomp.reduce((n, s) => n + s.gold + s.silver + s.bronze, 0);
    const smGold = d.smoothcomp.reduce((n, s) => n + s.gold, 0);
    const fpG = d.fpjj.reduce((n, f) => n + (f.gold || 0), 0);
    const fpS = d.fpjj.reduce((n, f) => n + (f.silver || 0), 0);
    const totals = {
      titles: d.team.filter((t) => t.pos === 1).length,
      podiums: d.team.filter((t) => t.pos <= 3).length + d.fpjj.filter((f) => f.pos <= 3).length,
      medals: a.cbjje.length + d.ibjjf.length + fpG + fpS + sm,
      golds: a.cbjje.filter((m) => m.place === 1).length + d.ibjjf.filter((m) => m.place === 1).length + fpG + smGold,
    };
    document.querySelectorAll("[data-count]").forEach((n) => countUp(n, totals[n.dataset.count]));
    const [y, mo, dd] = d.updated.split("-");
    $("#updated-at").textContent = `Dados atualizados automaticamente toda segunda-feira · última atualização em ${dd}/${mo}/${y}`;
    const rows = allMedals(d, a);
    const openPanel = setupPanels();
    renderOverview(rows);
    renderFedCards(rows, openPanel);
    renderLeaders(a, d);
    renderSeasons(d.seasons);
    renderTeam(d.team);
    renderFpjj(d.fpjj);
    renderSmooth(d.smoothcomp);
    renderRankings(d.rankings);
    renderIbjjf(d.ibjjf);
  })
  .catch(() => {
    $("#season-detail").textContent = "Não foi possível carregar as conquistas.";
  });
