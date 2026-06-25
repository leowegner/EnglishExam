/* ============================================================================
   app.js — the engine.

   Responsibilities:
     • hash routing (#/home, #/topic/<id>, #/review, #/mock, #/exam)
     • render the deep lesson reference for a topic
     • run the three explanation-based exercise kinds (analyse / justify / explain)
       with: type your answer → reveal model + checklist → self-rate
     • spaced repetition: self-rating schedules each exercise's next due date
     • progress tracking in localStorage
     • mock-exam session (mixed, weighted to weak items)
     • generate a printable 50-minute mock exam → browser Print → Save as PDF

   No dependencies, no build step. Open index.html or host the folder anywhere.
   ============================================================================ */

(function () {
  "use strict";

  /* ---------- tiny helpers ---------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const el = (tag, props = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === "class") n.className = v;
      else if (k === "html") n.innerHTML = v;
      else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
      else if (v !== null && v !== undefined && v !== false) n.setAttribute(k, v);
    }
    for (const kid of kids.flat()) {
      if (kid == null || kid === false) continue;
      n.appendChild(typeof kid === "string" ? document.createTextNode(kid) : kid);
    }
    return n;
  };
  const app = $("#app");

  /* ---------- flatten all exercises with their topic, for global lookups ---------- */
  const ALL = [];
  TOPICS.forEach((t) => t.exercises.forEach((ex) => ALL.push({ ...ex, topicId: t.id, topicTitle: t.title })));
  const byId = Object.fromEntries(ALL.map((e) => [e.id, e]));

  /* ---------- persistent progress ---------- */
  const STORE_KEY = "grammar-mastery-v1";
  const DAY = 86400000;
  // Spaced-repetition intervals (days) by "box". Self-rating moves you between boxes.
  const INTERVALS = [0, 1, 3, 7, 16, 35];

  function loadState() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; }
    catch { return {}; }
  }
  function saveState(s) { localStorage.setItem(STORE_KEY, JSON.stringify(s)); }
  let state = loadState();
  // state = { items: { [exId]: { box, due, last, attempts, lastRating } } }
  if (!state.items) state.items = {};

  function rec(id) {
    if (!state.items[id]) state.items[id] = { box: 0, due: 0, last: 0, attempts: 0, lastRating: null };
    return state.items[id];
  }
  // We need a stable "today" without Date.now in scripts? This runs in a real browser, so Date is fine here.
  const now = () => new Date().getTime();

  function applyRating(id, rating) {
    const r = rec(id);
    r.attempts += 1;
    r.last = now();
    r.lastRating = rating;
    if (rating === "nailed") r.box = Math.min(r.box + 1, INTERVALS.length - 1);
    else if (rating === "partial") r.box = Math.max(1, r.box); // stays, but counts as seen
    else r.box = 0; // missed → back to start
    const days = INTERVALS[r.box];
    r.due = now() + days * DAY;
    saveState(state);
  }

  const isDue = (id) => {
    const r = state.items[id];
    return !r || r.due <= now();
  };
  const isSeen = (id) => !!state.items[id] && state.items[id].attempts > 0;

  /* ---------- progress math ---------- */
  function topicProgress(t) {
    const ids = t.exercises.map((e) => e.id);
    const seen = ids.filter(isSeen).length;
    const mastered = ids.filter((id) => state.items[id] && state.items[id].box >= 3).length;
    return { total: ids.length, seen, mastered, pct: Math.round((mastered / ids.length) * 100) };
  }
  function overall() {
    const total = ALL.length;
    const seen = ALL.filter((e) => isSeen(e.id)).length;
    const mastered = ALL.filter((e) => state.items[e.id] && state.items[e.id].box >= 3).length;
    const due = ALL.filter((e) => isSeen(e.id) && isDue(e.id)).length;
    return { total, seen, mastered, due };
  }

  /* ===========================================================================
     ROUTER
     =========================================================================== */
  function router() {
    const hash = location.hash.replace(/^#\/?/, "") || "home";
    const [route, arg] = hash.split("/");
    document.querySelectorAll(".topnav button").forEach((b) =>
      b.classList.toggle("active", b.dataset.route === route)
    );
    app.scrollTo?.(0, 0);
    window.scrollTo(0, 0);
    switch (route) {
      case "home": return renderHome();
      case "topic": return renderTopic(arg);
      case "session": return renderSession(arg); // arg = topic id, or "mock"
      case "review": return renderReview();
      case "mock": return renderMockIntro();
      case "exam": return renderExamConfig();
      default: return renderHome();
    }
  }
  document.querySelectorAll("[data-route]").forEach((b) =>
    b.addEventListener("click", () => { location.hash = "#/" + b.dataset.route; })
  );
  window.addEventListener("hashchange", router);

  /* ===========================================================================
     HOME / DASHBOARD
     =========================================================================== */
  function renderHome() {
    const o = overall();
    app.innerHTML = "";
    app.appendChild(
      el("section", { class: "hero" },
        el("h1", {}, "Explain the grammar, don't just guess it."),
        el("p", { class: "lead" },
          "This trainer drills what the exam actually tests: explaining ", el("i", {}, "why"),
          " each tense, inversion and structure is used. Study the reference notes, then practise analysing sentences, justifying choices, and explaining whole rules — checking yourself against a model answer every time."
        )
      )
    );

    app.appendChild(
      el("div", { class: "stat-row" },
        stat(o.mastered, "Mastered", "green"),
        stat(o.seen + "/" + o.total, "Attempted", "accent"),
        stat(o.due, "Due for review", "amber"),
        stat(TOPICS.length, "Topics")
      )
    );

    if (o.due > 0) {
      app.appendChild(
        el("div", { class: "btn-row", style: "margin-top:0" },
          el("button", { class: "btn", onclick: () => (location.hash = "#/review") },
            "🔁 Review " + o.due + " due item" + (o.due === 1 ? "" : "s"))
        )
      );
    }

    app.appendChild(el("h2", { class: "section-title" }, "Topics"));
    const grid = el("div", { class: "topic-grid" });
    TOPICS.forEach((t) => {
      const p = topicProgress(t);
      const card = el("button", { class: "topic-card", onclick: () => (location.hash = "#/topic/" + t.id) },
        el("h3", {}, t.title),
        el("p", { class: "blurb" }, t.blurb),
        el("div", { class: "topic-meta" },
          (() => { const bar = el("div", { class: "bar" }, el("span")); setTimeout(() => { bar.firstChild.style.width = p.pct + "%"; }, 30); return bar; })(),
          el("span", { class: "pct" }, p.pct + "%")
        ),
        el("div", { class: "muted", style: "font-size:.78rem" },
          p.mastered + " mastered · " + p.seen + "/" + p.total + " attempted")
      );
      grid.appendChild(card);
    });
    app.appendChild(grid);

    app.appendChild(el("h2", { class: "section-title" }, "When you're ready"));
    app.appendChild(
      el("div", { class: "btn-row", style: "margin-top:.2rem" },
        el("button", { class: "btn secondary", onclick: () => (location.hash = "#/mock") }, "🎯 Practice mock (on screen)"),
        el("button", { class: "btn ghost", onclick: () => (location.hash = "#/exam") }, "⎙ Print a 50-minute exam (PDF)")
      )
    );
  }

  function stat(num, label, cls) {
    return el("div", { class: "stat " + (cls || "") },
      el("div", { class: "num" }, String(num)),
      el("div", { class: "label" }, label));
  }

  /* ===========================================================================
     TOPIC — lesson reference + "practise this topic" button
     =========================================================================== */
  function renderTopic(id) {
    const t = TOPICS.find((x) => x.id === id);
    if (!t) return renderHome();
    app.innerHTML = "";
    app.appendChild(el("button", { class: "back-link", onclick: () => (location.hash = "#/home") }, "← Dashboard"));
    app.appendChild(el("section", { class: "hero" },
      el("h1", {}, t.title),
      el("p", { class: "lead" }, t.blurb)
    ));

    const lesson = el("div", { class: "lesson" });
    t.lesson.forEach((b) => lesson.appendChild(renderBlock(b)));
    app.appendChild(lesson);

    app.appendChild(
      el("div", { class: "btn-row" },
        el("button", { class: "btn", onclick: () => (location.hash = "#/session/" + t.id) },
          "Practise explaining (" + t.exercises.length + " exercises) →")
      )
    );
  }

  function renderBlock(b) {
    if (b.h) return el("h3", { class: "l-h" }, b.h);
    if (b.p) return el("p", { html: b.p });
    if (b.rule) return el("div", { class: "l-rule", html: "🔑 " + b.rule });
    if (b.ex) return el("div", { class: "l-ex" }, el("div", { html: b.ex[0] }), el("div", { class: "why", html: b.ex[1] }));
    if (b.trap) return el("div", { class: "l-trap" }, el("div", { html: b.trap[0] }), el("div", { class: "why", html: b.trap[1] }));
    if (b.contrast) return el("div", { class: "l-contrast" },
      el("div", { html: b.contrast[0] }), el("div", { html: b.contrast[1] }));
    return el("div");
  }

  /* ===========================================================================
     SESSION — run a list of exercises (topic practice, mock, or review)
     =========================================================================== */
  let session = null; // { list:[ex...], idx, label, backHash }

  // Guard so the hashchange handler doesn't re-render the session we just built.
  let suppressNextSessionRoute = false;

  function startSession(list, label, backHash) {
    session = { list, idx: 0, label, backHash: backHash || "#/home" };
    suppressNextSessionRoute = location.hash !== "#/session/run"; // a change will fire hashchange
    location.hash = "#/session/run";
    renderExercise();
  }

  function renderSession(arg) {
    if (suppressNextSessionRoute) { suppressNextSessionRoute = false; return; }
    // Allow direct topic practice via #/session/<topicId>
    if (arg && arg !== "run") {
      const t = TOPICS.find((x) => x.id === arg);
      if (t) { session = { list: t.exercises.slice(), idx: 0, label: t.title, backHash: "#/topic/" + t.id }; }
    }
    if (!session || !session.list.length) { app.innerHTML = ""; app.appendChild(emptyState("Nothing to practise here.", "Back to dashboard", "#/home")); return; }
    renderExercise();
  }

  function renderExercise() {
    const ex = session.list[session.idx];
    app.innerHTML = "";
    app.appendChild(el("button", { class: "back-link", onclick: () => (location.hash = session.backHash) }, "← " + session.label));

    // progress bar
    const frac = session.idx / session.list.length;
    const track = el("div", { class: "track" }, el("span"));
    setTimeout(() => { track.firstChild.style.width = frac * 100 + "%"; }, 10);
    app.appendChild(el("div", { class: "ex-wrap" },
      el("div", { class: "ex-progress" },
        el("span", {}, "Q " + (session.idx + 1) + " / " + session.list.length),
        track,
        el("span", { class: "pill" }, ex.topicTitle || session.label))
    ));

    const card = el("div", { class: "ex-card" });
    const kindLabel = { analyse: "Analyse the sentence", justify: "Choose & justify", explain: "Explain the rule" }[ex.kind];
    card.appendChild(el("span", { class: "ex-kind " + ex.kind }, kindLabel));

    // prompt
    if (ex.kind === "justify") {
      card.appendChild(el("p", { class: "ex-prompt" }, ex.q));
    } else {
      card.appendChild(el("p", { class: "ex-prompt sentence" }, ex.prompt));
    }
    if (ex.task) card.appendChild(el("p", { class: "ex-task" }, ex.task));

    // choices (justify only)
    let selectedChoice = null;
    let choiceBtns = [];
    if (ex.kind === "justify") {
      const wrap = el("div", { class: "choices" });
      ex.choices.forEach((c, i) => {
        const b = el("button", { class: "choice", onclick: () => {
          if (revealed) return;
          selectedChoice = i;
          choiceBtns.forEach((x) => x.classList.remove("selected"));
          b.classList.add("selected");
        } }, c);
        choiceBtns.push(b);
        wrap.appendChild(b);
      });
      card.appendChild(wrap);
    }

    // free-text answer
    const ta = el("textarea", { class: "answer", placeholder:
      ex.kind === "justify"
        ? "Write WHY your choice is right and why each other option is wrong…"
        : ex.kind === "analyse"
          ? "Explain each verb/structure: its tense, aspect, and why it's used…"
          : "Write your structured explanation, with your own examples…" });
    card.appendChild(ta);

    // method hints — teaches HOW to build the answer, without giving it away
    card.appendChild(buildHints(ex));

    // reveal area + button
    const revealArea = el("div");
    card.appendChild(revealArea);

    let revealed = false;
    const revealBtn = el("button", { class: "btn", style: "margin-top:1.1rem", onclick: () => {
      if (revealed) return;
      revealed = true;
      revealBtn.style.display = "none";
      // for justify, mark choices
      if (ex.kind === "justify") {
        choiceBtns.forEach((b, i) => {
          b.disabled = true;
          if (i === ex.answer) { b.classList.add("correct"); b.appendChild(el("span", { class: "tick" }, "✓")); }
          else if (i === selectedChoice) { b.classList.add("wrong"); b.appendChild(el("span", { class: "tick" }, "✗")); }
        });
      }
      revealArea.appendChild(buildReveal(ex, () => ta.value, () => selectedChoice));
    } });
    card.appendChild(revealBtn);

    app.querySelector(".ex-wrap").appendChild(card);
  }

  /* ===========================================================================
     METHOD HINTS — the reusable skeleton for each exercise kind.

     These teach you HOW to construct an answer (the moves an examiner rewards),
     without revealing the answer itself. They're generic per kind, so they apply
     to all 80 exercises. Collapsed by default; you reveal them only if stuck.
     =========================================================================== */
  const HINTS = {
    analyse: {
      title: "How to build an analysis (4 moves)",
      intro: "Every ‘analyse the sentence’ answer is these four moves in order. Do all four and you cover the rubric.",
      moves: [
        ["1 · NAME", "State the <b>tense AND aspect</b> of each verb, with the form. Not just ‘past perfect’ — say ‘past perfect (<i>had</i> + past participle)’. This precise metalanguage is what separates a B2 answer from a C2 one."],
        ["2 · WHY (the job)", "For each form, say <b>what job it does that another form couldn’t</b>. Learn the job of each tense: past perfect = <i>anteriority</i> (orders one past event before another); present perfect = <i>link to now</i>; continuous = <i>activity in progress</i>; second conditional = <i>unreality</i>. Once you know the job, ‘why’ writes itself."],
        ["3 · EVIDENCE", "Quote the <b>actual words in the sentence</b> that prove your claim — time markers like <i>by the time, already, since, for, still</i>, or conjunctions like <i>if, when</i>. This shows you’re reading <i>this</i> sentence, not reciting a rule."],
        ["4 · CONTRAST", "<b>Rewrite the sentence the ‘wrong’ way</b> and say what meaning breaks: ‘If it were X instead — <i>…rewritten sentence…</i> — the reading would change to Y.’ This is the move students most often skip. Always include the rewritten example."],
      ],
    },
    justify: {
      title: "How to justify a choice (3 moves)",
      intro: "Picking the right option is worth little; the marks are in justifying it AND rejecting the others.",
      moves: [
        ["1 · PICK & NAME", "State your choice and <b>name the structure</b> it creates (e.g. ‘<i>has stolen</i> — present perfect’). Don’t just pick a letter."],
        ["2 · JUSTIFY", "Say <b>why that form is required here</b> — its job, plus the evidence in the sentence that triggers it (a time word, an ‘if’, a result clause)."],
        ["3 · REJECT EACH", "Go through <b>every other option and say why it’s wrong</b>, with a grammatical reason — not ‘it sounds off’ but ‘the past simple needs a finished-time adverbial, which isn’t here.’ This is where most of the marks live."],
      ],
    },
    explain: {
      title: "How to explain a rule (4 moves)",
      intro: "An ‘explain the rule’ answer is a mini-essay. Hit these and add your own examples.",
      moves: [
        ["1 · FORM", "Give the <b>structure</b> first: ‘The second conditional is <i>if</i> + past simple, <i>would</i> + base.’"],
        ["2 · MEANING / USES", "State <b>what it’s for</b> and its main uses. If a form has several uses (e.g. the present perfect), list them separately."],
        ["3 · CONTRAST", "Draw the <b>key distinction</b> from the form it’s confused with (present perfect vs. past simple; <i>would</i> vs. <i>used to</i>), and the rule that decides between them."],
        ["4 · YOUR EXAMPLES", "Give <b>your own example sentences</b> — ideally a minimal pair showing the contrast. Examiners reward examples you generated over ones you copied."],
      ],
    },
  };

  function buildHints(ex) {
    const h = HINTS[ex.kind];
    if (!h) return el("div");
    const wrap = el("div", { class: "hints-wrap" });
    const panel = el("div", { class: "hints-panel", hidden: "true" });
    panel.appendChild(el("p", { class: "hints-intro" }, h.intro));
    h.moves.forEach((m) => {
      panel.appendChild(el("div", { class: "hint-move" },
        el("span", { class: "hint-tag" }, m[0]),
        el("span", { class: "hint-body", html: m[1] })));
    });
    panel.appendChild(el("p", { class: "hints-foot" },
      "Now write your own answer above using these moves, then grade it. The goal is to produce this reasoning yourself — not to copy a model."));

    let shown = false;
    const btn = el("button", { class: "hints-toggle", onclick: () => {
      shown = !shown;
      panel.hidden = !shown;
      btn.textContent = shown ? "Hide hints" : "💡 Show me how to build this answer (hints, no spoilers)";
    } }, "💡 Show me how to build this answer (hints, no spoilers)");

    wrap.appendChild(btn);
    wrap.appendChild(panel);
    return wrap;
  }

  // getAnswer() / getChoice() are read lazily at grade time so late edits count.
  function buildReveal(ex, getAnswer, getChoice) {
    const wrap = el("div", { class: "reveal" });

    // --- AI grading (only the button if a key is set; full panel built on click) ---
    wrap.appendChild(buildGradeBlock(ex, getAnswer, getChoice));

    wrap.appendChild(el("h4", {}, "Model answer"));
    wrap.appendChild(el("div", { class: "model", html: ex.model }));

    wrap.appendChild(el("h4", { style: "margin-top:1.2rem" }, "Did your explanation hit these points?"));
    const ul = el("ul", { class: "checklist" });
    const scoreLine = el("div", { class: "check-score" });
    const update = () => {
      const total = ex.checklist.length;
      const got = ul.querySelectorAll("input:checked").length;
      scoreLine.textContent = "You covered " + got + " of " + total + " key points.";
    };
    ex.checklist.forEach((pt, i) => {
      const cid = ex.id + "-ck-" + i;
      const cb = el("input", { type: "checkbox", id: cid, onchange: update });
      ul.appendChild(el("li", {}, cb, el("label", { for: cid }, pt)));
    });
    wrap.appendChild(ul);
    wrap.appendChild(scoreLine);
    update();

    // self-rating
    const rating = el("div", { class: "rating" },
      el("div", { class: "q" }, "How did you do? This schedules when it comes back."),
      el("div", { class: "rate-btns" },
        rateBtn("missed", "Missed it", ex.id),
        rateBtn("partial", "Partial", ex.id),
        rateBtn("nailed", "Nailed it", ex.id))
    );
    wrap.appendChild(rating);
    return wrap;
  }

  function rateBtn(rating, label, exId) {
    return el("button", { class: "rate-btn " + rating, onclick: () => {
      applyRating(exId, rating);
      next();
    } }, label);
  }

  function next() {
    if (!session) return (location.hash = "#/home");
    session.idx += 1;
    if (session.idx >= session.list.length) return finishSession();
    renderExercise();
  }

  function finishSession() {
    const done = session.list.length;
    const back = session.backHash;
    app.innerHTML = "";
    app.appendChild(el("div", { class: "empty" },
      el("div", { class: "big" }, "✅"),
      el("h2", {}, "Session complete"),
      el("p", { class: "muted" }, "You worked through " + done + " explanation" + (done === 1 ? "" : "s") + ". Self-rated items are now scheduled for spaced review."),
      el("div", { class: "btn-row", style: "justify-content:center" },
        el("button", { class: "btn", onclick: () => (location.hash = "#/home") }, "Dashboard"),
        el("button", { class: "btn secondary", onclick: () => (location.hash = "#/review") }, "Spaced review"))
    ));
    session = null;
  }

  /* ===========================================================================
     SPACED REVIEW — everything due, weak items first
     =========================================================================== */
  function renderReview() {
    const due = ALL.filter((e) => isDue(e.id));
    // weakest first: lower box first, then never-seen
    due.sort((a, b) => {
      const ra = state.items[a.id], rb = state.items[b.id];
      const ba = ra ? ra.box : -1, bb = rb ? rb.box : -1;
      return ba - bb;
    });
    app.innerHTML = "";
    app.appendChild(el("section", { class: "hero" },
      el("h1", {}, "Spaced review"),
      el("p", { class: "lead" }, "Items you've rated come back on a schedule — missed ones soon, mastered ones rarely. Right now there " + (due.length === 1 ? "is 1 item" : "are " + due.length + " items") + " due across all topics.")
    ));
    if (!due.length) {
      app.appendChild(emptyState("Nothing due right now — you're caught up. 🎉", "Practise a topic instead", "#/home"));
      return;
    }
    app.appendChild(el("div", { class: "btn-row", style: "margin-top:0" },
      el("button", { class: "btn", onclick: () => startSession(due.slice(), "Spaced review", "#/review") },
        "Start review (" + due.length + ") →")
    ));
  }

  /* ===========================================================================
     ON-SCREEN MOCK — mixed set, weighted toward weak/unseen items
     =========================================================================== */
  function buildWeightedSet(count) {
    // weight: unseen = 3, missed/low box = 3, partial = 2, mastered = 1
    const pool = ALL.map((e) => {
      const r = state.items[e.id];
      let w = 3;
      if (r) { if (r.box >= 3) w = 1; else if (r.lastRating === "partial") w = 2; else w = 3; }
      return { e, w };
    });
    const picked = [];
    const bag = [];
    pool.forEach(({ e, w }) => { for (let i = 0; i < w; i++) bag.push(e); });
    // sample without replacement, deterministic-enough shuffle using indices
    shuffle(bag);
    const seen = new Set();
    for (const e of bag) { if (!seen.has(e.id)) { seen.add(e.id); picked.push(e); } if (picked.length >= count) break; }
    // ensure at least one per topic if room
    return picked;
  }

  function renderMockIntro() {
    app.innerHTML = "";
    app.appendChild(el("section", { class: "hero" },
      el("h1", {}, "Practice mock (on screen)"),
      el("p", { class: "lead" }, "A mixed set pulled from all four topics and weighted toward your weak spots. Same format as the exam — analyse, justify, explain — with model answers to self-check. For a timed paper you can sit away from the screen, use the printable exam.")
    ));
    const counts = [6, 10, 14];
    const row = el("div", { class: "btn-row", style: "margin-top:.4rem" });
    counts.forEach((c, i) => {
      row.appendChild(el("button", { class: "btn" + (i ? " secondary" : ""), onclick: () => {
        const set = buildWeightedSet(c);
        startSession(set, "Practice mock", "#/mock");
      } }, c + " questions"));
    });
    app.appendChild(row);
    app.appendChild(el("div", { class: "btn-row" },
      el("button", { class: "btn ghost", onclick: () => (location.hash = "#/exam") }, "⎙ Or print a full 50-minute exam (PDF) →")));
  }

  /* ===========================================================================
     PRINTABLE EXAM — config, then generate paper into #printRoot and print
     =========================================================================== */
  function renderExamConfig() {
    app.innerHTML = "";
    app.appendChild(el("section", { class: "hero" },
      el("h1", {}, "Print a 50-minute mock exam"),
      el("p", { class: "lead" }, "Generates a clean exam paper — a balanced mix across all topics with space to write — plus a separate answer key with the model explanations and marking checklists. Print it, or choose “Save as PDF” in the print dialog.")
    ));

    const cfg = el("div", { class: "exam-config" });

    // topic selection
    const topicWrap = el("div", { class: "checks" });
    const topicChecks = {};
    TOPICS.forEach((t) => {
      const cb = el("input", { type: "checkbox", checked: true });
      topicChecks[t.id] = cb;
      topicWrap.appendChild(el("label", {}, cb, t.title));
    });
    cfg.appendChild(el("div", { class: "field" },
      el("label", {}, "Topics to include"), topicWrap));

    // number of questions
    const numSel = el("select", {},
      el("option", { value: "6" }, "6 questions (short, ~30 min)"),
      el("option", { value: "8", selected: true }, "8 questions (~50 min)"),
      el("option", { value: "10" }, "10 questions (~60 min)"));
    cfg.appendChild(el("div", { class: "field" }, el("label", {}, "Length"), numSel));

    // include key?
    const keyCb = el("input", { type: "checkbox", checked: true });
    cfg.appendChild(el("div", { class: "field" },
      el("label", {}, el("span", {}, "Answer key")),
      el("label", { style: "display:flex;align-items:center;gap:.5rem;font-size:.92rem;color:var(--text)" },
        keyCb, "Append model answers + marking checklist (recommended)")));

    cfg.appendChild(el("div", { class: "btn-row" },
      el("button", { class: "btn", onclick: () => {
        const ids = Object.keys(topicChecks).filter((id) => topicChecks[id].checked);
        if (!ids.length) { alert("Pick at least one topic."); return; }
        const n = parseInt(numSel.value, 10);
        generateExam(ids, n, keyCb.checked);
      } }, "⎙ Build & open print dialog"),
      el("button", { class: "btn secondary", onclick: () => {
        const ids = Object.keys(topicChecks).filter((id) => topicChecks[id].checked);
        if (!ids.length) { alert("Pick at least one topic."); return; }
        buildExamPaper(ids, parseInt(numSel.value, 10), keyCb.checked);
        $("#printRoot").scrollIntoView({ behavior: "smooth" });
        // also reveal on screen by toggling a preview class
        previewExam();
      } }, "Preview on screen")));

    app.appendChild(cfg);

    app.appendChild(el("p", { class: "muted", style: "font-size:.82rem;margin-top:1.2rem" },
      "Tip: in the print dialog set “Destination” to “Save as PDF”, enable “Background graphics” off for a paper-white look, and use A4."));
  }

  function pickExamQuestions(topicIds, n) {
    // balanced: round-robin across selected topics, varied kinds
    const pools = topicIds.map((id) => TOPICS.find((t) => t.id === id).exercises.slice());
    pools.forEach(shuffle);
    const out = [];
    let i = 0;
    while (out.length < n && pools.some((p) => p.length)) {
      const p = pools[i % pools.length];
      if (p.length) out.push(p.shift());
      i++;
    }
    return out;
  }

  let lastPaper = null; // {questions, withKey}

  function buildExamPaper(topicIds, n, withKey) {
    const qs = pickExamQuestions(topicIds, n);
    lastPaper = { questions: qs, withKey };
    const root = $("#printRoot");
    root.innerHTML = "";

    // ---- header ----
    root.appendChild(el("div", { class: "paper-head" },
      el("h1", {}, "English Grammar — Mock Examination"),
      el("div", { class: "sub" }, "Bachillerato · Centro Educativo Británico S21 · Paper 1: Grammar in Use")));

    root.appendChild(el("div", { class: "paper-meta" },
      el("div", {}, "Name: ", el("span", { class: "line" })),
      el("div", {}, "Date: ", el("span", { class: "line", style: "min-width:120px" }))));

    root.appendChild(el("div", { class: "instructions" },
      el("div", {}, el("b", {}, "Time allowed: 50 minutes."), " Answer all questions in the spaces provided."),
      el("div", {}, "You are assessed on the ", el("b", {}, "accuracy of your explanations"),
        ", not merely correct answers. For every item, explain the grammar: name the tense/aspect or structure and say precisely ", el("i", {}, "why"), " it is used. Full marks require complete reasoning and, where asked, your own examples.")));

    // ---- questions ----
    const sectionNames = { analyse: "Section A — Sentence Analysis", justify: "Section B — Choose and Justify", explain: "Section C — Explain the Rule" };
    // group by kind for a real-exam feel, but keep balance
    const order = ["analyse", "justify", "explain"];
    const grouped = order.map((k) => ({ k, items: qs.filter((q) => q.kind === k) })).filter((g) => g.items.length);
    let qnum = 0;
    grouped.forEach((g) => {
      root.appendChild(el("div", { class: "p-section-title" }, sectionNames[g.k]));
      g.items.forEach((q) => {
        qnum++;
        const block = el("div", { class: "p-q" });
        if (q.kind === "justify") {
          block.appendChild(el("div", {}, el("span", { class: "qnum" }, "Q" + qnum + ". "),
            el("span", {}, q.q)));
          const ol = el("ol", { class: "p-choices", type: "A" });
          q.choices.forEach((c) => ol.appendChild(el("li", {}, c)));
          block.appendChild(ol);
          block.appendChild(el("div", { class: "task" }, q.task));
        } else {
          block.appendChild(el("div", {}, el("span", { class: "qnum" }, "Q" + qnum + ". "),
            el("span", { class: "qkind" }, q.kind === "analyse" ? "Analyse the following sentence." : "")));
          if (q.kind === "analyse") block.appendChild(el("div", { class: "sentence" }, q.prompt));
          else block.appendChild(el("div", { style: "margin:3px 0" }, q.prompt));
          block.appendChild(el("div", { class: "task" }, q.task));
        }
        // answer lines
        const lines = el("div", { class: "answer-lines" });
        const nLines = q.kind === "explain" ? 8 : q.kind === "analyse" ? 6 : 5;
        for (let i = 0; i < nLines; i++) lines.appendChild(el("div", { class: "ln" }));
        block.appendChild(lines);
        root.appendChild(block);
      });
    });

    // ---- answer key ----
    if (withKey) {
      root.appendChild(el("div", { class: "pagebreak" }));
      root.appendChild(el("div", { class: "key-title" }, "Marking Key — Model Answers & Checklists"));
      let kn = 0;
      grouped.forEach((g) => {
        g.items.forEach((q) => {
          kn++;
          const item = el("div", { class: "key-item" });
          item.appendChild(el("div", {}, el("span", { class: "qnum" }, "Q" + kn + ". "),
            q.kind === "justify" ? "Correct answer: " + String.fromCharCode(65 + q.answer) + "." : (q.kind === "analyse" ? "Analysis." : "Explanation.")));
          item.appendChild(el("div", { class: "model", html: q.model }));
          const ck = el("div", { class: "key-check" }, el("b", {}, "Award marks for: "), q.checklist.join("; ") + ".");
          item.appendChild(ck);
          root.appendChild(item);
        });
      });
    }
    return root;
  }

  function generateExam(topicIds, n, withKey) {
    buildExamPaper(topicIds, n, withKey);
    // give the DOM a tick, then print
    setTimeout(() => window.print(), 60);
  }

  // simple on-screen preview by temporarily styling the print root
  function previewExam() {
    const root = $("#printRoot");
    root.style.cssText = "display:block;background:#fff;color:#111;max-width:800px;margin:1.5rem auto;padding:2rem;border-radius:12px";
    // basic readable styles for preview only
    root.querySelectorAll(".sentence").forEach(s => s.style.cssText="font-family:Georgia,serif;border-left:2px solid #333;padding-left:10px;margin:4px 0");
    root.querySelectorAll(".p-section-title").forEach(s=>s.style.cssText="font-weight:700;border-bottom:1px solid #333;margin:14px 0 6px;padding-bottom:2px");
    root.querySelectorAll(".answer-lines .ln").forEach(l=>l.style.cssText="border-bottom:1px solid #bbb;height:18px");
    root.querySelectorAll(".instructions").forEach(s=>s.style.cssText="border:1px solid #333;padding:8px;margin:10px 0;font-size:.85rem");
    root.querySelectorAll(".paper-head").forEach(s=>s.style.cssText="text-align:center;border-bottom:2px solid #333;padding-bottom:8px;margin-bottom:8px");
    root.querySelectorAll(".key-item .model").forEach(m=>m.style.cssText="background:none;border:none;padding:0;color:#111");
    root.querySelectorAll(".p-q,.key-item").forEach(b=>b.style.margin="0 0 12px");
  }

  /* ===========================================================================
     shared bits
     =========================================================================== */
  function emptyState(msg, btnLabel, hash) {
    return el("div", { class: "empty" },
      el("div", { class: "big" }, "🗂️"),
      el("p", {}, msg),
      el("button", { class: "btn", onclick: () => (location.hash = hash) }, btnLabel));
  }

  function shuffle(a) {
    // Fisher–Yates. Math.random is available in the browser runtime.
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /* ===========================================================================
     AI GRADING (bring-your-own-key, all client-side)

     The user pastes their own Anthropic API key into Settings; it is stored in
     localStorage and sent ONLY to api.anthropic.com directly from the browser.
     Nothing is proxied through any server — this is a local / single-user tool.

     The grader acts as a STRICT exam examiner. The exercise's own model answer
     and checklist are sent as the marking rubric, the rubric+instructions sit in
     a cached system prefix (cheap on repeat), and the response's `usage` block is
     turned into a live per-grade and per-session cost readout.
     =========================================================================== */

  const AI_KEY_STORE = "grammar-mastery-ai-v1";
  // Per-1M-token USD pricing (input, output). Cache read ≈ 0.1× input; cache write ≈ 1.25× input.
  const MODELS = {
    "claude-sonnet-4-6": { label: "Sonnet 4.6 — recommended", in: 3.0, out: 15.0 },
    "claude-haiku-4-5":  { label: "Haiku 4.5 — cheapest",      in: 1.0, out: 5.0 },
    "claude-opus-4-8":   { label: "Opus 4.8 — most capable",   in: 5.0, out: 25.0 },
  };
  const DEFAULT_MODEL = "claude-sonnet-4-6";

  function loadAI() {
    try { return JSON.parse(localStorage.getItem(AI_KEY_STORE)) || {}; }
    catch { return {}; }
  }
  function saveAI(s) { localStorage.setItem(AI_KEY_STORE, JSON.stringify(s)); }
  let ai = loadAI();
  if (!ai.model) ai.model = DEFAULT_MODEL;
  if (typeof ai.spent !== "number") ai.spent = 0; // cumulative USD this device
  const hasKey = () => !!(ai.key && ai.key.trim());

  function costFor(model, usage) {
    const p = MODELS[model] || MODELS[DEFAULT_MODEL];
    const u = usage || {};
    const inTok   = u.input_tokens || 0;
    const cacheRd = u.cache_read_input_tokens || 0;
    const cacheWr = u.cache_creation_input_tokens || 0;
    const outTok  = u.output_tokens || 0;
    const dollars =
      (inTok   * p.in  / 1e6) +
      (cacheRd * p.in * 0.1 / 1e6) +
      (cacheWr * p.in * 1.25 / 1e6) +
      (outTok  * p.out / 1e6);
    return { dollars, inTok, cacheRd, cacheWr, outTok };
  }
  // Cost is shown in CENTS, always ROUNDED UP, so the figure is never lower than
  // what you'll actually be billed. `dollars` is a precise float internally; only
  // the display rounds. Examples: 0.0032 → "0.4 cents", 0.013 → "1.3 cents",
  // 0.048 → "5 cents" (whole), 0 → "0 cents".
  const ceilTo = (n, dp) => { const f = Math.pow(10, dp); return Math.ceil(n * f - 1e-9) / f; };
  function centsLabel(dollars, opts) {
    const whole = (opts && opts.whole); // session totals shown as whole cents
    const cents = (dollars || 0) * 100;
    if (cents <= 0) return "0 cents";
    let shown;
    if (whole && cents >= 1) shown = Math.ceil(cents - 1e-9);          // 5 cents
    else shown = ceilTo(cents, 1);                                      // 0.4 cents / 1.3 cents
    // tidy: drop a trailing ".0"
    const txt = Number.isInteger(shown) ? String(shown) : shown.toFixed(1);
    return txt + (shown === 1 ? " cent" : " cents");
  }
  const perGradeLabel = (d) => centsLabel(d);                // one-decimal cents
  const totalLabel    = (d) => centsLabel(d, { whole: true }); // whole cents

  /* ---------- Settings modal ---------- */
  function openSettings() {
    const back = $("#settingsModal");
    back.innerHTML = "";
    ai = loadAI(); if (!ai.model) ai.model = DEFAULT_MODEL;

    const keyInput = el("input", { type: "password", class: "field-input", placeholder: "sk-ant-…", value: ai.key || "" });
    const modelSel = el("select", { class: "field-input" },
      ...Object.entries(MODELS).map(([id, m]) =>
        el("option", { value: id, selected: id === ai.model ? "true" : null }, m.label)));

    const status = el("div", { class: "muted", style: "font-size:.82rem;min-height:1.2em" },
      hasKey() ? "A key is saved on this device." : "No key saved yet.");

    const panel = el("div", { class: "modal" },
      el("div", { class: "modal-head" },
        el("h3", {}, "⚙ AI Grading"),
        el("button", { class: "modal-x", onclick: closeSettings, "aria-label": "Close" }, "✕")),
      el("p", { class: "muted", style: "font-size:.9rem;margin-top:0" },
        "Paste your own Anthropic API key to have your written explanations graded by a strict examiner. The key is stored only in this browser (localStorage) and sent directly to Anthropic — there is no server. You can study without a key; AI grading is optional."),
      el("div", { class: "field" }, el("label", {}, "Anthropic API key"), keyInput),
      el("div", { class: "field" }, el("label", {}, "Model"), modelSel),
      el("p", { class: "muted", style: "font-size:.78rem" },
        "Grading one answer costs roughly a third of a cent on Sonnet, less on Haiku. Get a key at console.anthropic.com → API Keys."),
      status,
      el("div", { class: "btn-row", style: "margin-top:1rem" },
        el("button", { class: "btn", onclick: () => {
          ai.key = keyInput.value.trim();
          ai.model = modelSel.value;
          saveAI(ai);
          status.textContent = hasKey() ? "Saved ✓" : "Key cleared.";
        } }, "Save"),
        el("button", { class: "btn ghost", onclick: () => {
          delete ai.key; saveAI(ai); keyInput.value = "";
          status.textContent = "Key cleared from this device.";
        } }, "Clear key")),
      el("div", { class: "muted", style: "font-size:.8rem;margin-top:1rem;border-top:1px solid var(--border);padding-top:.8rem" },
        "You have spent " + totalLabel(ai.spent || 0) + " on this device so far. ",
        el("button", { class: "link-danger", onclick: () => { ai.spent = 0; saveAI(ai); openSettings(); } }, "reset counter"))
    );
    back.appendChild(panel);
    back.hidden = false;
    back.onclick = (e) => { if (e.target === back) closeSettings(); };
  }
  function closeSettings() { const b = $("#settingsModal"); b.hidden = true; b.innerHTML = ""; }
  $("#settingsBtn").addEventListener("click", openSettings);

  /* ---------- the grade block on each reveal ---------- */
  function buildGradeBlock(ex, getAnswer, getChoice) {
    const wrap = el("div", { class: "grade-block" });
    const out = el("div"); // results render here

    const btn = el("button", { class: "btn secondary", onclick: () => runGrade() },
      hasKey() ? "🤖 Grade my answer with AI" : "🤖 Grade my answer with AI (needs a key)");

    btn.addEventListener("click", () => {});
    function runGrade() {
      if (!hasKey()) { openSettings(); return; }
      const answer = (getAnswer() || "").trim();
      if (answer.length < 3) {
        out.innerHTML = "";
        out.appendChild(el("div", { class: "grade-msg warn" }, "Write your explanation in the box above first, then grade it."));
        return;
      }
      btn.disabled = true;
      out.innerHTML = "";
      out.appendChild(el("div", { class: "grade-msg" }, "Grading with " + (MODELS[ai.model]?.label.split(" — ")[0] || ai.model) + "…"));
      gradeAnswer(ex, answer, getChoice ? getChoice() : null)
        .then((res) => { renderGradeResult(out, ex, res); })
        .catch((err) => {
          out.innerHTML = "";
          out.appendChild(el("div", { class: "grade-msg err" }, "Grading failed: " + err.message));
        })
        .finally(() => { btn.disabled = false; });
    }

    wrap.appendChild(btn);
    wrap.appendChild(out);
    return wrap;
  }

  function renderGradeResult(out, ex, res) {
    out.innerHTML = "";
    const g = res.grade;
    const pct = Math.max(0, Math.min(100, g.score | 0));
    const band = pct >= 80 ? "good" : pct >= 50 ? "mid" : "low";

    const head = el("div", { class: "grade-head " + band },
      el("span", { class: "grade-score" }, pct + "/100"),
      el("span", { class: "grade-verdict" }, g.verdict || ""));
    out.appendChild(head);

    // per-checklist-point verdicts
    if (Array.isArray(g.points) && g.points.length) {
      const ul = el("ul", { class: "grade-points" });
      g.points.forEach((p) => {
        ul.appendChild(el("li", { class: p.met ? "met" : "missed" },
          el("span", { class: "gp-mark" }, p.met ? "✓" : "✗"),
          el("span", {}, p.point + (p.note ? " — " + p.note : ""))));
      });
      out.appendChild(ul);
    }
    if (g.feedback) out.appendChild(el("p", { class: "grade-feedback" }, g.feedback));

    // cost line
    const c = res.cost;
    const cacheNote = c.cacheRd ? " · " + c.cacheRd + " cached" : "";
    out.appendChild(el("div", { class: "grade-cost" },
      "This grade cost about " + perGradeLabel(c.dollars) + " (" + c.inTok + " in / " + c.outTok + " out" + cacheNote + ") · you have spent " + totalLabel(ai.spent) + " in total"));
  }

  /* ---------- the API call ---------- */
  // System prefix is identical across all grades → cached (cheap on repeat).
  const GRADER_SYSTEM =
    "You are a notoriously strict Bachillerato English-grammar examiner at a demanding school. " +
    "You grade a student's written EXPLANATION of grammar against an official marking rubric. " +
    "Be rigorous and exacting, like the hardest examiner a student could face: reward only precise, " +
    "correct reasoning and accurate grammatical metalanguage (tense, aspect, mood, etc.). Penalise vagueness, " +
    "hand-waving, missing justification, and incorrect claims. Do not give credit for merely restating the prompt. " +
    "A perfect score is hard to earn. Judge the EXPLANATION's quality, not just whether a final answer is right. " +
    "You will receive a JSON schema to fill. Return ONLY valid JSON matching it — no prose, no markdown fences.";

  function gradePrompt(ex, answer, choice) {
    const rubric = ex.checklist.map((p, i) => (i + 1) + ". " + p).join("\n");
    const modelPlain = ex.model.replace(/<[^>]+>/g, "");
    let head = "";
    if (ex.kind === "justify") {
      head = "TASK TYPE: Choose-and-justify.\nQUESTION: " + ex.q +
        "\nOPTIONS: " + ex.choices.map((c, i) => i + "=" + c).join(" | ") +
        "\nCORRECT OPTION INDEX: " + ex.answer +
        (choice != null ? "\nSTUDENT PICKED INDEX: " + choice : "\nSTUDENT PICKED: (none recorded)");
    } else {
      head = "TASK TYPE: " + (ex.kind === "analyse" ? "Analyse the sentence." : "Explain the rule.") +
        "\nPROMPT: " + ex.prompt;
    }
    return head +
      "\n\nWHAT THE STUDENT WAS ASKED TO DO: " + ex.task +
      "\n\nOFFICIAL MARKING CHECKLIST (each point is worth credit; this is the rubric):\n" + rubric +
      "\n\nEXPERT MODEL ANSWER (the gold standard — grade against this):\n" + modelPlain +
      "\n\nSTUDENT'S ANSWER (grade this):\n\"\"\"\n" + answer + "\n\"\"\"" +
      "\n\nReturn JSON with this exact shape:\n" +
      '{ "score": <integer 0-100>, "verdict": "<3-6 word summary e.g. \'Solid but imprecise\'>", ' +
      '"points": [ { "point": "<the checklist point, shortened>", "met": <true|false>, "note": "<≤10 words why>" } ], ' +
      '"feedback": "<2-3 sentences of specific, strict, actionable feedback to the student>" }' +
      "\nInclude one entry in \"points\" for EACH checklist item, in order.";
  }

  async function gradeAnswer(ex, answer, choice) {
    const model = ai.model || DEFAULT_MODEL;
    const body = {
      model,
      max_tokens: 1024,
      system: [
        { type: "text", text: GRADER_SYSTEM, cache_control: { type: "ephemeral" } },
      ],
      messages: [
        { role: "user", content: gradePrompt(ex, answer, choice) },
      ],
    };
    let resp;
    try {
      resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": ai.key.trim(),
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify(body),
      });
    } catch (e) {
      throw new Error("network/CORS error — check your connection (and that the key is valid).");
    }
    if (!resp.ok) {
      let detail = resp.status + "";
      try { const j = await resp.json(); detail = (j.error && j.error.message) || detail; } catch {}
      if (resp.status === 401) detail = "invalid API key (check it in ⚙ Settings).";
      if (resp.status === 429) detail = "rate limited — wait a moment and retry.";
      throw new Error(detail);
    }
    const data = await resp.json();
    const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
    const grade = parseGradeJSON(text);
    const cost = costFor(model, data.usage);
    ai.spent = (ai.spent || 0) + cost.dollars;
    saveAI(ai);
    return { grade, cost };
  }

  function parseGradeJSON(text) {
    // The model is told to return raw JSON, but strip fences/prose defensively.
    let s = (text || "").trim();
    const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) s = fence[1].trim();
    const start = s.indexOf("{"), end = s.lastIndexOf("}");
    if (start !== -1 && end !== -1) s = s.slice(start, end + 1);
    let obj;
    try { obj = JSON.parse(s); }
    catch { throw new Error("could not read the grader's response. Try again."); }
    if (typeof obj.score !== "number") obj.score = 0;
    if (!Array.isArray(obj.points)) obj.points = [];
    return obj;
  }

  /* ---------- reset ---------- */
  $("#resetBtn").addEventListener("click", () => {
    if (confirm("Reset all progress and spaced-repetition history on this device?")) {
      localStorage.removeItem(STORE_KEY);
      state = { items: {} };
      location.hash = "#/home";
      router();
    }
  });

  /* ---------- start ---------- */
  // startSession needs a real route; we route to #/session/run and render there.
  window.__startSession = startSession; // (debug hook)
  if (!location.hash) location.hash = "#/home";
  router();
})();
