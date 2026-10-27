// Interações comuns a todas as páginas: tema, entrada suave, barra de leitura,
// compartilhar e um segredo para quem digitar "oss".
(() => {
  const store = {
    get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* sem armazenamento */ } },
  };
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---------- tema claro/escuro (lembrado para a próxima visita) ----------
  const root = document.documentElement;
  const saved = store.get("tema");
  if (saved) root.dataset.theme = saved;
  const isDark = () => root.dataset.theme
    ? root.dataset.theme === "dark"
    : window.matchMedia("(prefers-color-scheme: dark)").matches;
  const nav = document.querySelector(".site-nav .container");
  if (nav) {
    const btn = document.createElement("button");
    btn.className = "theme-toggle";
    btn.type = "button";
    const paint = () => {
      btn.textContent = isDark() ? "☀️" : "🌙";
      btn.setAttribute("aria-label", isDark() ? "Usar tema claro" : "Usar tema escuro");
    };
    btn.addEventListener("click", () => {
      root.dataset.theme = isDark() ? "light" : "dark";
      store.set("tema", root.dataset.theme);
      paint();
    });
    paint();
    nav.append(btn);
  }

  // ---------- aviso rápido na tela ----------
  let toastTimer;
  window.siteToast = (text) => {
    let t = document.querySelector(".toast");
    if (!t) {
      t = document.createElement("div");
      t.className = "toast";
      t.setAttribute("role", "status");
      document.body.append(t);
    }
    t.textContent = text;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
  };

  // ---------- compartilhar (celular abre o menu do sistema; no computador copia o link) ----------
  window.siteShare = async ({ title, text, url }) => {
    const data = { title, text, url: url || location.href };
    if (navigator.share) {
      try { await navigator.share(data); } catch { /* cancelado */ }
      return;
    }
    try {
      await navigator.clipboard.writeText(`${text ? text + " " : ""}${data.url}`);
      window.siteToast("Link copiado! 📋");
    } catch {
      window.siteToast("Não foi possível copiar o link");
    }
  };

  // ---------- entrada suave ao rolar (só na primeira vez) ----------
  const SELECTORS = ".block, .card, .result, .fed-card, .rank-card, .feature, .chapter, .timeline li, .leader, .athlete";
  const io = !reduceMotion && "IntersectionObserver" in window
    ? new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add("is-in"); io.unobserve(e.target); }
      });
    }, { rootMargin: "0px 0px -8% 0px" })
    : null;
  const watch = (el) => {
    if (!io || el.dataset.reveal) return;
    el.dataset.reveal = "1";
    // o que já está na tela ao abrir a página aparece sem animação
    if (el.getBoundingClientRect().top < innerHeight) return;
    el.classList.add("reveal");
    io.observe(el);
  };
  const scan = (node) => {
    if (node.nodeType !== 1) return;
    if (node.matches?.(SELECTORS)) watch(node);
    node.querySelectorAll?.(SELECTORS).forEach(watch);
  };
  scan(document.body);
  // cartões criados depois (notícias, conquistas) também entram suavemente
  new MutationObserver((list) => list.forEach((m) => m.addedNodes.forEach(scan)))
    .observe(document.body, { childList: true, subtree: true });

  // ---------- barra de progresso de leitura (páginas longas) ----------
  if (document.body.dataset.progress !== undefined) {
    const bar = document.createElement("div");
    bar.className = "read-progress";
    bar.setAttribute("aria-hidden", "true");
    document.body.append(bar);
    const update = () => {
      const max = document.documentElement.scrollHeight - innerHeight;
      bar.style.transform = `scaleX(${max > 0 ? Math.min(1, scrollY / max) : 0})`;
    };
    addEventListener("scroll", update, { passive: true });
    addEventListener("resize", update);
    update();
  }

  // ---------- segredo: digite "oss" ----------
  let typed = "";
  addEventListener("keydown", (e) => {
    if (e.target.closest?.("input, textarea")) return;
    typed = (typed + (e.key || "").toLowerCase()).slice(-3);
    if (typed === "oss") {
      window.siteToast("Oss! 🥋 Bem-vindo ao tatame.");
      typed = "";
    }
  });
})();
