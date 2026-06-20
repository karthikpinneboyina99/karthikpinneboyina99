#!/usr/bin/env node
/**
 * Regenerates the dynamic sections of README.md using live data pulled from
 * the GitHub REST API:
 *
 *   <!-- TYPING-BANNER:START/END -->  — typewriter banner, text built from real stats
 *   <!-- SNAPSHOT:START/END -->       — badge strip: projects / stars / followers / top language
 *   <!-- TECH-STACK:START/END -->     — skill icons ranked by language frequency
 *   <!-- PROJECTS:START/END -->       — top repos by stars, then recency
 *
 * Everything outside these markers (header banner, stats widgets, social
 * links, etc.) is left untouched.
 *
 * Run by .github/workflows/update-readme.yml on a daily cron + on demand.
 */

const fs = require('fs');
const path = require('path');

const USERNAME = process.env.GH_USERNAME;
const TOKEN = process.env.GITHUB_TOKEN;
// Resolved relative to the working directory GitHub Actions runs the step
// in (the repo root) rather than this file's own location — so it still
// works no matter which folder generate-readme.js itself ends up in.
const README_PATH = path.join(process.cwd(), 'README.md');
const MAX_FEATURED = 4;

if (!USERNAME) {
  console.error('Missing GH_USERNAME env var.');
  process.exit(1);
}

// Accent palette used consistently across every dynamically-built badge.
const ACCENT = {
  primary: '6366f1', // indigo
  secondary: '22d3ee', // cyan
  success: '3fb950', // green
  gold: 'f2cc60', // stars
  bg: '0d1117',
  cardBg: '21262d',
};

// Map GitHub's primary-language name -> skillicons.dev icon code.
// Add a row here whenever you pick up a new language/tool.
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

function encodeTypingLine(str) {
  return encodeURIComponent(str).replace(/%20/g, '+');
}

function timeAgo(dateStr) {
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} mo ago`;
  return `${Math.floor(months / 12)} yr ago`;
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
  while (true) {
    const batch = await ghFetch(
      `https://api.github.com/users/${username}/repos?per_page=100&page=${page}&type=owner`
    );
    repos.push(...batch);
    if (batch.length < 100) break;
    page += 1;
  }
  // Drop forks, archived repos, and the profile repo itself.
  return repos.filter(
    (r) => !r.fork && !r.archived && r.name.toLowerCase() !== username.toLowerCase()
  );
}

async function fetchUserProfile(username) {
  return ghFetch(`https://api.github.com/users/${username}`);
}

function rankLanguages(repos) {
  const counts = {};
  for (const r of repos) {
    if (!r.language) continue;
    counts[r.language] = (counts[r.language] || 0) + 1;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1]);
}

function buildTypingBannerSection(profile, repos, totalStars, topLanguage) {
  const latest = [...repos].sort(
    (a, b) => new Date(b.pushed_at) - new Date(a.pushed_at)
  )[0];

  const lines = [
    `${profile.name || profile.login} — Full-Stack Developer`,
    `${repos.length} projects • ${totalStars}★ stars • ${profile.followers} followers`,
    topLanguage ? `Most active in ${topLanguage}` : 'Always shipping something new',
    latest ? `Currently building: ${latest.name}` : 'Open to full-time roles & freelance work',
  ];

  const encoded = lines.map(encodeTypingLine).join(';');
  const url =
    `https://readme-typing-svg.demolab.com?font=JetBrains+Mono&size=18&duration=3200` +
    `&pause=900&color=${ACCENT.primary.toUpperCase()}&center=true&vCenter=true&width=720&lines=${encoded}`;

  return `<div align="center">\n\n[![Typing SVG](${url})](https://git.io/typing-svg)\n\n</div>`;
}

function buildSnapshotSection(profile, repos, totalStars, topLanguage) {
  const badges = [
    `https://img.shields.io/badge/Projects-${repos.length}-${ACCENT.primary}?style=flat-square&labelColor=${ACCENT.bg}`,
    `https://img.shields.io/badge/Total_Stars-${totalStars}-${ACCENT.gold}?style=flat-square&labelColor=${ACCENT.bg}`,
    `https://img.shields.io/badge/Followers-${profile.followers}-${ACCENT.success}?style=flat-square&labelColor=${ACCENT.bg}`,
  ];
  if (topLanguage) {
    badges.push(
      `https://img.shields.io/badge/Top_Language-${encodeURIComponent(
        topLanguage
      )}-${ACCENT.secondary}?style=flat-square&labelColor=${ACCENT.bg}`
    );
  }
  const imgs = badges.map((b) => `  <img src="${b}" />`).join('\n');
  return `<div align="center">\n\n${imgs}\n\n</div>`;
}

function buildTechStackSection(ranked) {
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
        )}-${ACCENT.primary}?style=flat-square&labelColor=${ACCENT.cardBg}" />`
      : '';
    const stars = r.stargazers_count
      ? ` <img src="https://img.shields.io/badge/★_${r.stargazers_count}-${ACCENT.gold}?style=flat-square&labelColor=${ACCENT.cardBg}" />`
      : '';
    return `<td width="50%">
      <h3>${escapeHtml(r.name)}</h3>
      <p>${desc}</p>
      <p>${lang}${stars}</p>
      <p><sub>Updated ${timeAgo(r.pushed_at)}</sub></p>
      <a href="${r.html_url}">
        <img src="https://img.shields.io/badge/View%20Repo-${ACCENT.bg}?style=for-the-badge&logo=github&logoColor=white&labelColor=${ACCENT.cardBg}" />
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
  const [repos, profile] = await Promise.all([
    fetchAllRepos(USERNAME),
    fetchUserProfile(USERNAME),
  ]);

  const ranked = rankLanguages(repos);
  const topLanguage = ranked.length ? ranked[0][0] : null;
  const totalStars = repos.reduce((sum, r) => sum + (r.stargazers_count || 0), 0);

  let readme = fs.readFileSync(README_PATH, 'utf8');

  readme = replaceBetweenMarkers(
    readme,
    '<!-- TYPING-BANNER:START -->',
    '<!-- TYPING-BANNER:END -->',
    buildTypingBannerSection(profile, repos, totalStars, topLanguage)
  );
  readme = replaceBetweenMarkers(
    readme,
    '<!-- SNAPSHOT:START -->',
    '<!-- SNAPSHOT:END -->',
    buildSnapshotSection(profile, repos, totalStars, topLanguage)
  );
  readme = replaceBetweenMarkers(
    readme,
    '<!-- TECH-STACK:START -->',
    '<!-- TECH-STACK:END -->',
    buildTechStackSection(ranked)
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
