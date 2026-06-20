# Setup Guide — Self-Updating README

This makes two sections of your profile README rebuild themselves every day
from your real GitHub data:

- **Tech Stack** — derived from the primary language of every public repo you own
- **Featured Projects** — your top repos by stars (then recency), auto-pulled with live description/language/link

Everything else (stats card, streak, trophies, activity graph, snake) was
already dynamic in your original README via third-party badge services —
those need no changes.

## 1. File placement

Your profile repo must be named **exactly** `karthikpinneboyina99` (same as
your username) — that's what makes GitHub render its README on your profile
page. Copy these files into that repo, preserving the folder structure:

```
karthikpinneboyina99/
├── README.md
├── scripts/
│   └── generate-readme.js
└── .github/
    └── workflows/
        └── update-readme.yml
```

If you already have a README.md there, replace it with the one provided
here — it has the `<!-- TECH-STACK:START -->` / `<!-- PROJECTS:START -->`
marker comments the script needs. If you want to keep more of your existing
custom content, just paste those marker blocks into your current README in
place of your tech-stack/projects sections.

## 2. Enable write permissions for the workflow

GitHub Actions needs permission to push the updated README back to your repo:

1. Go to your repo → **Settings → Actions → General**
2. Scroll to **Workflow permissions**
3. Select **Read and write permissions**
4. Save

(The workflow also declares `permissions: contents: write` itself, but this
repo-level setting must be enabled too, or the push step will fail with a
403.)

## 3. Commit and push

```bash
git add README.md scripts/ .github/
git commit -m "Add self-updating README automation"
git push
```

## 4. Trigger it once to verify

You don't have to wait for the daily cron:

1. Go to the **Actions** tab on your repo
2. Click **Update README** in the left sidebar
3. Click **Run workflow** → **Run workflow**
4. Watch it go green, then check your README — the Tech Stack and Featured
   Projects sections should now reflect your real repos.

## 5. How "daily" works

The workflow runs on a cron schedule (`0 3 * * *`, ~8:30 AM IST) so any repo
you push that day gets picked up the next morning. If you want it to also
catch up immediately after you push to *this* repo specifically, the `push`
trigger already does that — it just won't fire for pushes to your *other*
project repos, since GitHub Actions in one repo doesn't watch activity in
unrelated repos without extra plumbing (a personal access token + repository
webhooks). Daily cron + the manual "Run workflow" button covers that gap
without needing to set up a PAT.

## 6. Customizing

- **Cron time** — edit the `cron:` line in `update-readme.yml`. Use
  [crontab.guru](https://crontab.guru) if you want a different schedule.
- **How many featured projects** — change `MAX_FEATURED` at the top of
  `generate-readme.js` (default 4).
- **Selection logic** — currently sorts by stars then most-recently-pushed.
  Swap the comparator in `buildProjectsSection()` if you'd rather always show
  the most recently active repos regardless of stars.
- **New languages** — add an entry to the `ICON_MAP` object in
  `generate-readme.js` so newly-used languages get an icon
  (the codes come from [skillicons.dev](https://skillicons.dev)).

## Troubleshooting

- **"Markers not found" error** — your README.md is missing the
  `<!-- TECH-STACK:START/END -->` or `<!-- PROJECTS:START/END -->` comments.
  Make sure they're present and unedited.
- **Push step fails with 403** — workflow permissions weren't set to
  read/write (see step 2).
- **Section says "No language data yet"** — none of your non-fork repos have
  a detected primary language yet (e.g. brand-new empty repos), or none of
  your languages are in `ICON_MAP` yet.
