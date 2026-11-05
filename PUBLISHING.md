# Publishing this portfolio on GitHub (about 10 minutes)

> ⚠️ Publish **only this `04-portfolio` folder**. Never upload the parent folder `before i go`: it holds your personal files (including a wallet recovery-phrase document) and your CV drafts.

## 1. Placeholders
Already filled: GitHub `stflorescu`, repo `qa-portfolio`, LinkedIn `stflorescu`, email `florescu.stefan@ymail.com`. Nothing left to replace.

## 2. Create the repo
1. On github.com → **New repository** → name it e.g. `qa-portfolio` → Public → **don't** add a README (this folder has one).
2. In a terminal opened **inside `04-portfolio`**:

```bash
git init
git add .
git commit -m "QA portfolio: Comet Coins, verified end to end"
git branch -M main
git remote add origin https://github.com/stflorescu/qa-portfolio.git
git push -u origin main
```

Before `git commit`, run `git status` and check that only portfolio files are listed (no `node_modules`, no `test-results`; `.gitignore` handles those).

## 3. Turn on GitHub Pages
Repo → **Settings → Pages** → Source: **Deploy from a branch** → Branch: `main` / root → Save.
After a minute the site is live at `https://stflorescu.github.io/qa-portfolio/`.
`index.html` is the landing page; the game and report work from there.

## 4. Make it look finished
- Repo → **About** (gear icon): description "QA portfolio: game rules → independent verifier → statistics → Playwright → QA report", website = the Pages link, topics: `playwright`, `qa`, `test-automation`, `game-testing`, `statistics`.
- Pin the repo on your GitHub profile.
- Add the Pages link to LinkedIn → **Featured**, and to your CV.

## 5. Optional: run the tests on every push (GitHub Actions)
Create `.github/workflows/tests.yml`:

```yaml
name: tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm install
      - run: npx playwright install --with-deps chromium
      - run: npm run verify && npm run stats && npm test
```

A green "tests passing" badge on the repo is a nice signal for a QA role.
