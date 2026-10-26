// Busca de atletas da Cohab na CBJJE e na IBJJF
const $ = (sel) => document.querySelector(sel);
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
const MEDAL = { 1: "🥇", 2: "🥈", 3: "🥉" };
const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const data = { all: [], cbjje: [], ibjjf: [] };
const state = { src: "all", q: "", year: "all", place: "all", circuit: "all", limit: 15, open: new Set() };

function chipGroup(container, onChange) {
  container.addEventListener("click", (ev) => {
    const b = ev.target.closest("button");
    if (!b) return;
    container.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", x === b));
    onChange(b);
  });
}

function fillYears() {
  const box = $("#f-year");
  box.replaceChildren();
  const years = [...new Set(data[state.src].map((m) => m.year))].sort((a, b) => b - a);
  ["all", ...years].forEach((y) => {
    const b = el("button", "", y === "all" ? "Todos os anos" : y);
    b.dataset.v = y;
    b.setAttribute("aria-pressed", y === "all");
    box.append(b);
  });
  state.year = "all";
}

// Agrupa as medalhas por atleta e ordena por ouros, pratas e bronzes
function groupAthletes(items) {
  const map = new Map();
  items.forEach((m) => {
    const key = norm(m.athlete);
    if (!map.has(key)) map.set(key, { name: m.athlete, medals: [], c: { 1: 0, 2: 0, 3: 0 } });
    const a = map.get(key);
    a.medals.push(m);
    a.c[m.place]++;
  });
  return [...map.values()].sort((a, b) =>
    b.c[1] - a.c[1] || b.c[2] - a.c[2] || b.c[3] - a.c[3] || a.name.localeCompare(b.name));
}

function athleteCard(a, rank) {
  const card = el("div", "athlete");
  const head = el("button", "athlete-head");
  head.type = "button";
  head.setAttribute("aria-expanded", state.open.has(a.name));
  const pos = el("span", "athlete-rank", `${rank}º`);
  const main = el("span", "result-main");
  main.append(el("strong", "", a.name), el("span", "", `${a.medals.length} medalha${a.medals.length > 1 ? "s" : ""}`));
  const row = el("span", "medal-row");
  row.append(el("span", "m g", a.c[1]), el("span", "m s", a.c[2]), el("span", "m b", a.c[3]));
  head.append(pos, main, row, el("span", "chev", "⌄"));

  const body = el("div", "athlete-body");
  body.hidden = !state.open.has(a.name);
  a.medals.sort((x, y) => y.year - x.year || x.place - y.place).forEach((m) => {
    const line = el("a", "athlete-medal");
    line.href = m.url; line.target = "_blank"; line.rel = "noopener";
    const info = el("span", "result-main");
    info.append(
      el("strong", "", `${m.year} · ${m.event}`),
      el("span", "", m.cat + (m.alone ? " · sozinho na categoria" : "")),
    );
    line.append(el("span", "result-pos medal", MEDAL[m.place]), info);
    body.append(line);
  });

  head.addEventListener("click", () => {
    const open = body.hidden;
    body.hidden = !open;
    head.setAttribute("aria-expanded", open);
    open ? state.open.add(a.name) : state.open.delete(a.name);
  });
  card.append(head, body);
  return card;
}

function draw() {
  const q = norm(state.q.trim());
  const items = data[state.src].filter((m) =>
    (state.year === "all" || m.year === +state.year) &&
    (state.place === "all" || m.place === +state.place) &&
    (state.circuit === "all" || m.circuit === state.circuit) &&
    (!q || norm(`${m.athlete} ${m.event} ${m.cat}`).includes(q)));
  const athletes = groupAthletes(items);
  const c = { 1: 0, 2: 0, 3: 0 };
  items.forEach((m) => c[m.place]++);
  $("#summary").textContent = items.length
    ? `${athletes.length} atleta${athletes.length > 1 ? "s" : ""} · ${items.length} medalhas · 🥇 ${c[1]} · 🥈 ${c[2]} · 🥉 ${c[3]}`
    : "Nenhum atleta encontrado com esses filtros.";

  const list = $("#list");
  list.replaceChildren();
  // Busca com um único atleta: já abre a ficha dele
  if (athletes.length === 1) state.open.add(athletes[0].name);
  athletes.slice(0, state.limit).forEach((a, i) => list.append(athleteCard(a, i + 1)));
  const more = $("#more");
  more.hidden = athletes.length <= state.limit;
  more.textContent = `Mostrar mais atletas (${athletes.length - state.limit})`;
}

function setSource(src) {
  state.src = src;
  state.limit = 15;
  state.open.clear();
  document.querySelectorAll("#source button").forEach((b) => b.setAttribute("aria-selected", b.dataset.src === src));
  const total = data[src].length;
  const people = new Set(data[src].map((m) => m.athlete)).size;
  const where = { all: "em todas as federações", cbjje: "na CBJJE, na FESP e em circuitos abertos (2019–2026)", ibjjf: "na IBJJF / CBJJ" }[src];
  $("#hint").textContent = `${people} atletas e ${total} medalhas ${where}. Toque em um atleta para ver as medalhas.`;
  fillYears();
  $("#f-place").querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.v === "all"));
  $("#f-circuit").querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.v === "all"));
  $("#f-circuit").hidden = src !== "cbjje";
  state.place = "all";
  state.circuit = "all";
  draw();
}

$("#source").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (b) setSource(b.dataset.src);
});
chipGroup($("#f-year"), (b) => { state.year = b.dataset.v; state.limit = 15; draw(); });
chipGroup($("#f-place"), (b) => { state.place = b.dataset.v; state.limit = 15; draw(); });
chipGroup($("#f-circuit"), (b) => { state.circuit = b.dataset.v; state.limit = 15; draw(); });
$("#q").addEventListener("input", (e) => { state.q = e.target.value; state.limit = 15; state.open.clear(); draw(); });
$("#more").addEventListener("click", () => { state.limit += 30; draw(); });

Promise.all([
  fetch("data/cohab-atletas.json", { cache: "no-store" }).then((r) => r.json()),
  fetch("data/cohab-conquistas.json", { cache: "no-store" }).then((r) => r.json()),
]).then(([a, c]) => {
  data.cbjje = a.cbjje;
  data.ibjjf = c.ibjjf;
  data.all = [...data.cbjje, ...data.ibjjf];
  // Link vindo do ranking de atletas: atletas.html?q=Nome
  const q = new URLSearchParams(location.search).get("q");
  if (q) {
    $("#q").value = q;
    state.q = q;
  }
  setSource("all");
}).catch(() => {
  $("#summary").textContent = "Não foi possível carregar os atletas.";
});
