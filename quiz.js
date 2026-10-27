// Quiz da Cohab: 5 perguntas sorteadas, resposta comentada e uma faixa no final
(() => {
  const box = document.getElementById("quiz");
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };
  const shuffle = (list) => list.map((v) => [Math.random(), v]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);

  // Perguntas fixas: [pergunta, resposta certa, erradas, explicação]
  const FIXED = [
    ["Em que ano a Cohab começou a dar aulas de jiu-jitsu?", "1998", ["1995", "2002", "2007"], "A primeira aula foi em setembro de 1998, no centro esportivo da Cohab José Bonifácio."],
    ["Quem foi o primeiro aluno da Cohab?", "Dan, hoje Mestre Dan", ["Sérgio Moraes", "Diogo Almeida", "Fábio Gurgel"], "O professor Tony começou com um único aluno: o Everdan, o Dan."],
    ["Quem entregou a faixa preta ao Mestre Dan, em 2005?", "Fernando Tererê", ["Fábio Gurgel", "Hélio Gracie", "Rolls Gracie"], "Foi o Tererê; o Eduardo Telles anunciou e o André Galvão amarrou a faixa."],
    ["Qual atleta é chamado de “O Orgulho da Cohab”?", "Sérgio Moraes", ["Guilherme Augusto", "Dimitrius Souza", "Paulinho Baraúna"], "Nascido na Cohab 2, Sérgio Moraes foi campeão mundial e lutou no UFC."],
    ["Com qual equipe a Cohab foi parceira de 2007 a 2018?", "Alliance", ["Gracie Barra", "Checkmat", "Atos"], "Nesse período a equipe se chamou Cohab Alliance Jiu-Jitsu."],
    ["Como se chama o projeto social da Cohab?", "Nasci pra Vencer", ["Tatame Solidário", "Jiu-Jitsu para Todos", "Nova Geração"], "O projeto leva jiu-jitsu gratuito a crianças e jovens desde 1998."],
    ["Em que bairro de São Paulo fica a Cohab Team?", "Itaquera", ["São Mateus", "Tatuapé", "Brás"], "A equipe nasceu na Cohab José Bonifácio, em Itaquera."],
    ["Quantas unidades a Cohab tem no Brasil?", "16", ["4", "9", "30"], "São 16 unidades no Brasil, além das filiais em outros países."],
    ["Em qual destes países a Cohab NÃO tem filial?", "Portugal", ["Argentina", "Chile", "Peru"], "As filiais fora do Brasil ficam na Argentina, no Chile, no Equador e no Peru."],
  ];

  async function buildQuestions() {
    const qs = FIXED.map(([q, right, wrong, why]) => ({ q, right, options: shuffle([right, ...wrong]), why }));
    try {
      const d = await fetch("data/cohab-conquistas.json").then((r) => r.json());
      const titles = d.team.filter((t) => t.pos === 1).length;
      const wrong = shuffle([titles - 3, titles - 1, titles + 2, titles + 4].filter((n) => n > 0)).slice(0, 3);
      qs.push({
        q: "Em quantos campeonatos a Cohab já foi campeã geral por equipe?",
        right: String(titles), options: shuffle([titles, ...wrong].map(String)),
        why: `Foram ${titles} títulos de campeã geral, e a lista cresce toda semana.`,
      });
      const pan = d.team.filter((t) => /pan-americano/i.test(t.event)).sort((a, b) => b.year - a.year)[0];
      if (pan) {
        const right = `${pan.pos}º lugar`;
        const others = ["1º lugar", "2º lugar", "3º lugar", "5º lugar"].filter((o) => o !== right).slice(0, 3);
        qs.push({
          q: `Em que lugar a Cohab ficou no ${pan.event} ${pan.year}?`,
          right, options: shuffle([right, ...others]),
          why: `Ficou em ${pan.pos}º lugar geral, com ${pan.gold} ouros.`,
        });
      }
    } catch { /* sem os dados, segue só com as perguntas fixas */ }
    return shuffle(qs).slice(0, 5);
  }

  const BELTS = [
    { name: "Faixa branca", color: "#f2f2f2", text: "Todo campeão começou assim. Que tal ler a história da Cohab e tentar de novo?" },
    { name: "Faixa branca", color: "#f2f2f2", text: "Bom começo! Dá uma olhada na história da equipe e volte para subir de faixa." },
    { name: "Faixa azul", color: "#1f4fbf", text: "Mandou bem! Você já conhece o básico da Cohab." },
    { name: "Faixa roxa", color: "#6a2fb3", text: "Muito bom! Dá para ver que você acompanha a equipe." },
    { name: "Faixa marrom", color: "#6b3e1e", text: "Quase lá! Você sabe muito sobre a Cohab." },
    { name: "Faixa preta", color: "#111111", text: "Oss! 🥋 Você é da casa. Sabe tudo da Cohab." },
  ];

  async function start() {
    const questions = await buildQuestions();
    let i = 0, score = 0;

    const show = () => {
      box.replaceChildren();
      const { q, right, options, why } = questions[i];
      const head = el("div", "quiz-head");
      head.append(el("span", "muted", `Pergunta ${i + 1} de ${questions.length}`), el("span", "quiz-score", `${score} ✓`));
      const bar = el("div", "quiz-bar");
      const fill = el("i");
      fill.style.width = `${(i / questions.length) * 100}%`;
      bar.append(fill);
      const list = el("div", "quiz-options");
      const note = el("p", "quiz-why");
      const next = el("button", "button quiz-next", i + 1 < questions.length ? "Próxima →" : "Ver minha faixa →");
      next.hidden = true;
      options.forEach((opt) => {
        const b = el("button", "quiz-option", opt);
        b.type = "button";
        b.addEventListener("click", () => {
          const ok = opt === right;
          if (ok) score++;
          list.querySelectorAll("button").forEach((x) => {
            x.disabled = true;
            if (x.textContent === right) x.classList.add("right");
          });
          if (!ok) b.classList.add("wrong");
          note.textContent = `${ok ? "✅ Isso aí!" : "❌ Não foi dessa vez."} ${why}`;
          next.hidden = false;
          next.focus();
        });
        list.append(b);
      });
      next.addEventListener("click", () => { i++; i < questions.length ? show() : finish(); });
      box.append(head, bar, el("h2", "quiz-q", q), list, note, next);
    };

    const finish = () => {
      const belt = BELTS[score];
      box.replaceChildren();
      const card = el("div", "quiz-result");
      const beltEl = el("div", "quiz-belt");
      beltEl.style.background = belt.color;
      beltEl.append(el("span"));
      card.append(
        el("p", "muted", `Você acertou ${score} de ${questions.length}`),
        el("h2", "", belt.name),
        beltEl,
        el("p", "", belt.text),
      );
      const actions = el("div", "quiz-actions");
      const again = el("button", "button", "Jogar de novo");
      again.type = "button";
      again.addEventListener("click", start);
      const share = el("button", "share-btn", "Compartilhar resultado ↗");
      share.type = "button";
      share.addEventListener("click", () => window.siteShare?.({
        title: "Quiz da Cohab",
        text: `Tirei ${belt.name.toLowerCase()} no Quiz da Cohab Team (${score}/${questions.length})! Quanto você sabe?`,
        url: location.href,
      }));
      const more = el("a", "share-btn", "Ler a história da Cohab");
      more.href = "cohab.html";
      actions.append(again, share, more);
      card.append(actions);
      box.append(card);
    };

    show();
  }

  box.querySelector(".quiz-go").addEventListener("click", start);
})();
