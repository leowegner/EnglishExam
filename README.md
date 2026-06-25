# Grammar Mastery — Bachillerato English Prep

A study site built to prepare for the first Bachillerato English exam at the
Centro Educativo Británico S21 — the one that's notorious for being brutal.

Unlike a normal quiz app, this trainer is built around the thing the exam
actually tests: **explaining *why*** a tense, inversion or structure is used —
not just picking the right form. Every exercise ends with a **model answer** and
a **marking checklist** so you can grade your own reasoning.

## What's inside

**Four topics**, each with deep "explain-everything" reference notes:

1. **Verb Tenses** — the full system, tense vs. aspect, and the contrasts exams hinge on.
2. **Conditionals & Wish** — the four types, mixed conditionals, the subjunctive `were`, formal inversion, and the `wish/if only` backshift.
3. **Passive & Reported Speech** — forming the passive across tenses, the impersonal passive, and reported-speech shifts.
4. **Modals & the Tricky Rest** — modals of deduction/regret, gerund vs. infinitive (with meaning changes), articles, and dependent prepositions.

**80 exercises** (20 per topic), all self-checked against a model answer + checklist, in three formats:

- **Analyse** a sentence — explain every verb/structure.
- **Choose & justify** — pick the form, then say why it's right and the others are wrong.
- **Explain** a whole rule from scratch, with your own examples.

**Plus:**

- **Spaced repetition** — after each exercise you self-rate (Missed / Partial / Nailed). Items come back on a schedule: missed ones soon, mastered ones rarely. Progress is saved on your device (no account, no internet needed).
- **Dashboard** with progress per topic.
- **Practice mock** (on screen) — a mixed set weighted toward your weak spots.
- **Printable 50-minute mock exam → PDF** — a clean exam paper with answer lines, plus a separate marking key with model answers and checklists. See `sample-exam.pdf` for an example.

## How to use it

### Right now (offline)
Just open `index.html` in any browser (double-click it). Everything works with no
setup and no internet. Your progress is saved in the browser.

### Printing a mock exam to PDF
1. Click **Print Exam** in the top bar.
2. Choose your topics, length (8 questions ≈ 50 min), and whether to include the answer key.
3. Click **Build & open print dialog**.
4. In the dialog, set **Destination → Save as PDF**, paper size **A4**. (Turn *Background graphics* off for a clean paper-white look.)
5. Sit the paper away from the screen with a 50-minute timer, then mark yourself against the key.

> Tip: build *without* the answer key for a clean copy to write on, and a second copy *with* the key for marking — or just print the key pages separately.

### Putting it online (use it on your phone)
The whole thing is static files, so it deploys anywhere with zero changes. Easiest is **GitHub Pages**:

1. Create a new GitHub repository and upload `index.html`, `styles.css`, `data.js`, `app.js`.
2. In the repo: **Settings → Pages → Build and deployment → Source: Deploy from a branch**, pick `main` / root, **Save**.
3. After a minute it's live at `https://<your-username>.github.io/<repo-name>/`. Open that on your phone and bookmark it.

(Any static host works too — Netlify, Vercel, Cloudflare Pages: just drag the folder in.)

## Adding your own questions

All content lives in **`data.js`**, which is heavily commented. Each topic has a
`lesson` array (the notes) and an `exercises` array. To add a question, copy an
existing exercise of the right `kind` (`analyse`, `justify`, or `explain`), give
it a **unique `id`**, and fill in the `model` answer and `checklist`. That's it —
it shows up everywhere automatically (topic practice, review, mock, printed exam).

The single highest-value thing you can do before the exam is **add the actual
question styles your teacher uses** as you discover them.

## Files

| File | What it is |
|------|-----------|
| `index.html` | The page shell. |
| `styles.css` | All styling, including the print/exam-paper layout. |
| `data.js` | **All the content** — lessons + exercises. Edit this to add material. |
| `app.js` | The engine — routing, exercises, spaced repetition, exam generator. |
| `sample-exam.pdf` | An example of the generated mock exam + answer key. |

Good luck — go make that exam regret its reputation.
