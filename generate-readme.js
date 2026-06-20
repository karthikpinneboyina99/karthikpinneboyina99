#!/usr/bin/env node
/**
 * Regenerates the "Tech Stack" and "Featured Projects" sections of README.md
 * using live data pulled from the GitHub REST API.
 *
 * It only touches the content between these marker comments, so the rest of
 * your README (header, stats widgets, social links, etc.) is left alone:
 *
 *   <!-- TECH-STACK:START -->  ...  <!-- TECH-STACK:END -->
 *   <!-- PROJECTS:START -->    ...  <!-- PROJECTS:END -->
 *
 * Run by the GitHub Action in .github/workflows/update-readme.yml on a
 * daily cron schedule (and on-demand via workflow_dispatch).
 */

const fs = require('fs');
const path = require('path');

const USERNAME = process.env.GH_USERNAME;
const TOKEN = process.env.GITHUB_TOKEN;
const README_PATH = path.join(__dirname, '..', 'README.md');
const MAX_FEATURED = 4;

if (!USERNAME) {
  console.error('Missing GH_USERNAME env var.');
  process.exit(1);
}

// Map GitHub's primary-language name -> skillicons.dev icon code.
// Add a row here whenever you pick up a new language/tool and want it
// reflected in the Tech Stack badge row.
const ICON_MAP = {
  JavaScript: 'js',
  TypeScript: 'ts',
  Java: 'java',
  Python: 'python',
  HTML: 'html',
  CSS: 'css',
  'C++': 'cpp',
  C: 'c',
  'C#': 'cs',
  Go: 'go',
  Rust: 'rust',
  Ruby: 'ruby',
  PHP: 'php',
  Swift: 'swift',
  Kotlin: 'kotlin',
  Dart: 'dart',
  Shell: 'bash',
  Dockerfile: 'docker',
  Vue: 'vue',
  Scala: 'scala',
  R: 'r',
  Lua: 'lua',
  Elixir: 'elixir',
};

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function ghFetch(url) {
  const res = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
    },
  });
  if (!res.ok) {
    throw new Error(`GitHub API ${res.status} for ${url}: ${await res.text()}`);
  }
  return res.json();
}

async function fetchAllRepos(username) {
  let page = 1;
  const repos = [];
  // Paginate until a short page tells us we've reached the end.
  while (true) {
    const batch = await ghFetch(
      `https://api.github.com/users/${username}/repos?per_page=100&page=${page}&type=owner`
    );
    repos.push(...batch);
    if (batch.length < 100) break;
    page += 1;
  }
  // Drop forks, archived repos, and the profile repo itself (it shares the
  // username as its name on GitHub).
  return repos.filter(
    (r) => !r.fork && !r.archived && r.name.toLowerCase() !== username.toLowerCase()
  );
}

function buildTechStackSection(repos) {
  const counts = {};
  for (const r of repos) {
    if (!r.language) continue;
    counts[r.language] = (counts[r.language] || 0) + 1;
  }
  const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const icons = ranked
    .map(([lang]) => ICON_MAP[lang])
    .filter(Boolean)
    .slice(0, 14);

  if (icons.length === 0) {
    return '_No language data yet — push some code and check back tomorrow!_';
  }

  return `<div align="center">\n\n![Tech Stack](https://skillicons.dev/icons?i=${icons.join(
    ','
  )}&theme=dark)\n\n</div>`;
}

function buildProjectsSection(repos) {
  const featured = [...repos]
    .sort((a, b) => {
      if (b.stargazers_count !== a.stargazers_count) {
        return b.stargazers_count - a.stargazers_count;
      }
      return new Date(b.pushed_at) - new Date(a.pushed_at);
    })
    .slice(0, MAX_FEATURED);

  if (featured.length === 0) {
    return '_No public repos yet — upload your first project and this section fills itself in!_';
  }

  const cards = featured.map((r) => {
    const desc = escapeHtml(r.description || 'No description yet.');
    const lang = r.language
      ? `<img src="https://img.shields.io/badge/${encodeURIComponent(
          r.language
        )}-21262d?style=flat-square&labelColor=21262d" />`
      : '';
    const stars = r.stargazers_count
      ? ` <img src="https://img.shields.io/badge/⭐-${r.stargazers_count}-21262d?style=flat-square&labelColor=21262d" />`
      : '';
    return `<td width="50%">
      <h3>📦 ${escapeHtml(r.name)}</h3>
      <p>${desc}</p>
      <p>${lang}${stars}</p>
      <a href="${r.html_url}">
        <img src="https://img.shields.io/badge/View%20Repo-0d1117?style=for-the-badge&logo=github&logoColor=white&labelColor=21262d" />
      </a>
    </td>`;
  });

  const rows = [];
  for (let i = 0; i < cards.length; i += 2) {
    rows.push(`  <tr>\n    ${cards[i]}\n    ${cards[i + 1] || '<td width="50%"></td>'}\n  </tr>`);
  }

  return `<table>\n${rows.join('\n')}\n</table>`;
}

function replaceBetweenMarkers(content, startMarker, endMarker, newSection) {
  const pattern = new RegExp(`(${startMarker})[\\s\\S]*?(${endMarker})`);
  if (!pattern.test(content)) {
    throw new Error(`Markers ${startMarker} / ${endMarker} not found in README.md`);
  }
  return content.replace(pattern, `$1\n\n${newSection}\n\n$2`);
}

async function main() {
  const repos = await fetchAllRepos(USERNAME);
  let readme = fs.readFileSync(README_PATH, 'utf8');

  readme = replaceBetweenMarkers(
    readme,
    '<!-- TECH-STACK:START -->',
    '<!-- TECH-STACK:END -->',
    buildTechStackSection(repos)
  );
  readme = replaceBetweenMarkers(
    readme,
    '<!-- PROJECTS:START -->',
    '<!-- PROJECTS:END -->',
    buildProjectsSection(repos)
  );

  const today = new Date().toISOString().slice(0, 10);
  if (readme.includes('<!-- LAST-UPDATED -->')) {
    readme = readme.replace(
      /<!-- LAST-UPDATED -->.*/,
      `<!-- LAST-UPDATED -->*Last auto-updated: ${today} • ${repos.length} active repos scanned*`
    );
  }

  fs.writeFileSync(README_PATH, readme);
  console.log(`README.md regenerated from ${repos.length} repos.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
