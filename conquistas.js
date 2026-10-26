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
    const p = Math.min(1, (t - start) / 1200);
    node.textContent = Math.round(value * (1 - Math.pow(1 - p, 3)));
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
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

fetch("data/cohab-conquistas.json", { cache: "no-store" })
  .then((r) => r.json())
  .then((d) => {
    const cbjje = d.seasons.reduce((n, s) => n + s.gold + s.silver + s.bronze, 0);
    const totals = {
      titles: d.team.filter((t) => t.pos === 1).length,
      podiums: d.team.filter((t) => t.pos <= 3).length,
      cbjje,
      ibjjf: d.ibjjf.length,
    };
    document.querySelectorAll("[data-count]").forEach((n) => countUp(n, totals[n.dataset.count]));
    renderSeasons(d.seasons);
    renderTeam(d.team);
    renderRankings(d.rankings);
    renderIbjjf(d.ibjjf);
  })
  .catch(() => {
    $("#season-detail").textContent = "Não foi possível carregar as conquistas.";
  });
