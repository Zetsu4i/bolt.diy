import type { SkillDefinition } from '~/types/skills';

/**
 * Builtin skills are fully self-contained: their files ship with the app and
 * require no network access to install. Instructions live in SKILL.md using
 * markdown frontmatter (name/description) followed by the instruction body
 * that gets injected into the agent system prompt.
 */
export const BUILTIN_SKILLS: SkillDefinition[] = [
  {
    id: 'web-research',
    name: 'Web Researcher',
    description: 'Fetch, extract and summarize content from web pages with a ready-to-use Node.js scraper script.',
    category: 'Research',
    icon: 'i-ph:globe-hemisphere-west',
    recommendedModes: ['web', 'general'],
    source: {
      type: 'builtin',
      files: {
        'SKILL.md': `---
name: Web Researcher
description: Fetch and extract content from web pages, then summarize findings for the user.
---

# Web Researcher

Use this skill whenever the user asks you to research a topic, read a web page, or gather
information from online sources inside the sandbox.

## How to use

1. Fetch a page with the bundled script (no external deps required):

\`\`\`bash
node /opt/skills/web-research/scripts/fetch.js "<url>" [maxChars]
\`\`\`

- Prints the page title plus cleaned text content (scripts/styles stripped).
- \`maxChars\` defaults to 12000 characters of extracted text.

2. For JavaScript-heavy pages, try extracting JSON-LD or meta tags from the raw HTML first.

3. Summarize findings with citations as plain URLs. If a fetch fails or returns a bot-wall,
   tell the user and move on — do not fabricate page contents.

## Rules

- Never invent quotes or statistics. Only report what the fetched text contains.
- Batch multiple URLs in separate script calls, then merge the findings into one answer.
`,
        'scripts/fetch.js': `#!/usr/bin/env node
/** Minimal dependency-free web page fetcher + text extractor. */
const url = process.argv[2];
const maxChars = Number(process.argv[3] || 12000);

if (!url) {
  console.error('Usage: node fetch.js "<url>" [maxChars]');
  process.exit(1);
}

async function main() {
  const res = await fetch(url, {
    headers: { 'user-agent': 'Mozilla/5.0 (compatible; ResearchBot/1.0)' },
    redirect: 'follow',
  });

  if (!res.ok) {
    console.error(\`HTTP \${res.status} \${res.statusText} for \${url}\`);
    process.exit(2);
  }

  const html = await res.text();
  const titleMatch = html.match(/<title[^>]*>([\\s\\S]*?)<\\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : url;

  let text = html
    .replace(/<script[\\s\\S]*?<\\/script>/gi, ' ')
    .replace(/<style[\\s\\S]*?<\\/style>/gi, ' ')
    .replace(/<noscript[\\s\\S]*?<\\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#\\d+;/g, ' ')
    .replace(/\\s+/g, ' ')
    .trim();

  console.log('TITLE:', title);
  console.log('URL:', res.url);
  console.log('---');
  console.log(text.slice(0, maxChars));

  if (text.length > maxChars) {
    console.log(\`\\n[truncated, total \${text.length} chars]\`);
  }
}

main().catch((err) => {
  console.error('Fetch failed:', err.message);
  process.exit(3);
});
`,
      },
    },
  },
  {
    id: 'data-viz',
    name: 'Data Visualizer',
    description: 'Generate charts (PNG) from data with a bundled matplotlib script — great for reports and analysis.',
    category: 'Data',
    icon: 'i-ph:chart-bar',
    recommendedModes: ['general', 'web'],
    installCommands: ['pip install --quiet matplotlib || pip3 install --quiet matplotlib || true'],
    source: {
      type: 'builtin',
      files: {
        'SKILL.md': `---
name: Data Visualizer
description: Turn tabular data into polished PNG charts using the bundled matplotlib script.
---

# Data Visualizer

Use this skill when the user wants charts, plots or quick visual analysis produced as image
files inside the sandbox.

## How to use

1. Write your data as CSV anywhere in the project (e.g. \`./data/sales.csv\`).

2. Render a chart:

\`\`\`bash
python3 /opt/skills/data-viz/scripts/chart.py data.csv --x column_x --y column_y \\
  --kind bar|line|scatter|pie --title "Title" --out chart.png
\`\`\`

3. The script auto-styles the chart (grid, labels, tight layout) and writes a PNG you can
   reference in your answer or embed into the project.

## Rules

- Always verify the CSV columns exist before plotting; print \`head\` first if unsure.
- For multi-series charts, run the script once per series into separate files, or write a
  short custom matplotlib script next to the data reusing the same style defaults.
- Prefer \`--kind bar\` for comparisons, \`line\` for trends over time, \`scatter\` for
  correlations and \`pie\` only for parts-of-a-whole with <= 6 slices.
`,
        'scripts/chart.py': `#!/usr/bin/env python3
"""Render a PNG chart from a CSV file. Stdlib CSV + matplotlib."""
import argparse
import csv
import sys

try:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
except ImportError:
    sys.exit("matplotlib is not installed. Run: pip install matplotlib")


def load_csv(path):
    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        rows = list(reader)
    if not rows:
        sys.exit("CSV has no rows")
    return rows


def to_number(value):
    try:
        return float(str(value).replace(",", "").strip())
    except (ValueError, TypeError):
        return None


def main():
    parser = argparse.ArgumentParser(description="Chart a CSV column")
    parser.add_argument("csv_path")
    parser.add_argument("--x", required=True, help="label column")
    parser.add_argument("--y", required=True, help="numeric column")
    parser.add_argument("--kind", default="bar", choices=["bar", "line", "scatter", "pie"])
    parser.add_argument("--title", default="")
    parser.add_argument("--out", default="chart.png")
    args = parser.parse_args()

    rows = load_csv(args.csv_path)
    labels = [r.get(args.x, "") for r in rows]
    values = [to_number(r.get(args.y)) for r in rows]

    pairs = [(str(l), v) for l, v in zip(labels, values) if v is not None]
    if not pairs:
        sys.exit(f"Column '{args.y}' has no numeric values")

    labels, values = zip(*pairs)
    fig, ax = plt.subplots(figsize=(10, 6), constrained_layout=True)
    fig.patch.set_facecolor("#ffffff")

    if args.kind == "bar":
        ax.bar(labels, values, color="#4f7cff", edgecolor="none")
        ax.set_ylabel(args.y)
    elif args.kind == "line":
        ax.plot(labels, values, color="#4f7cff", linewidth=2.2, marker="o", markersize=4)
        ax.set_ylabel(args.y)
    elif args.kind == "scatter":
        ax.scatter(range(len(values)), values, color="#4f7cff", s=42)
        ax.set_xticks(range(len(labels)))
        ax.set_xticklabels(labels, rotation=45, ha="right")
    elif args.kind == "pie":
        if len(values) > 8:
            top = sorted(zip(labels, values), key=lambda p: p[1], reverse=True)[:8]
            labels, values = zip(*top)
        ax.pie(values, labels=labels, autopct="%1.1f%%", startangle=90,
               wedgeprops={"edgecolor": "white", "linewidth": 1})

    ax.set_title(args.title or f"{args.y} by {args.x}")
    if args.kind in ("bar", "line"):
        plt.setp(ax.get_xticklabels(), rotation=45, ha="right")
    ax.grid(True, axis="y", alpha=0.25)
    ax.spines[["top", "right"]].set_visible(False)

    fig.savefig(args.out, dpi=150)
    print(f"saved {args.out} ({len(values)} points)")


if __name__ == "__main__":
    main()
`,
      },
    },
  },
  {
    id: 'api-tester',
    name: 'API Tester',
    description: 'Exercise REST APIs from the sandbox with a bundled request/assert script and produce clean reports.',
    category: 'Testing',
    icon: 'i-ph:plugs-connected',
    recommendedModes: ['web', 'general'],
    source: {
      type: 'builtin',
      files: {
        'SKILL.md': `---
name: API Tester
description: Run HTTP requests against REST APIs with assertions and readable reports.
---

# API Tester

Use this skill to verify endpoints the project depends on, or to explore third-party APIs
the user wants to integrate.

## How to use

Single request:

\`\`\`bash
node /opt/skills/api-tester/scripts/request.js METHOD URL 'json-body' [header=value ...]
\`\`\`

Example:

\`\`\`bash
node /opt/skills/api-tester/scripts/request.js POST https://api.example.com/users \\
  '{"name":"Ada"}' Authorization=Bearer\\ xyz content-type=application/json
\`\`\`

The script prints status, timing, response headers of interest and a truncated pretty JSON
body. Exit code is 0 for 2xx, 3 for other statuses — so it composes with shell checks.

## Rules

- Never embed real secrets in command lines; prefer environment variables and reference
  them as \`$MY_TOKEN\` in the sandbox shell.
- When a user asks "will this API work?", actually call it and report the observed result
  instead of guessing.
- Summarize endpoints you tested in a small table: method, path, status, latency.
`,
        'scripts/request.js': `#!/usr/bin/env node
/** Dependency-free HTTP request runner with readable output. */
const [, , method = 'GET', url = '', body, ...headerArgs] = process.argv;

if (!url) {
  console.error('Usage: node request.js METHOD URL [jsonBody] [Header=value ...]');
  process.exit(1);
}

const headers = {};

for (const arg of headerArgs) {
  const idx = arg.indexOf('=');

  if (idx > 0) {
    headers[arg.slice(0, idx).toLowerCase()] = arg.slice(idx + 1);
  }
}

if (body && !headers['content-type']) {
  headers['content-type'] = 'application/json';
}

const started = Date.now();

fetch(url, {
  method: method.toUpperCase(),
  headers,
  body: ['GET', 'HEAD'].includes(method.toUpperCase()) ? undefined : body,
})
  .then(async (res) => {
    const ms = Date.now() - started;
    const text = await res.text();
    console.log('STATUS:', res.status, res.statusText);
    console.log('TIME:', ms + 'ms');
    console.log('CONTENT-TYPE:', res.headers.get('content-type') || '-');
    console.log('---');

    if ((res.headers.get('content-type') || '').includes('json')) {
      try {
        console.log(JSON.stringify(JSON.parse(text), null, 2).slice(0, 6000));
      } catch {
        console.log(text.slice(0, 6000));
      }
    } else {
      console.log(text.slice(0, 6000));
    }

    process.exit(res.ok ? 0 : 3);
  })
  .catch((err) => {
    console.error('REQUEST FAILED:', err.message);
    process.exit(4);
  });
`,
      },
    },
  },
  {
    id: 'file-organizer',
    name: 'File Organizer',
    description: 'Bulk sort, rename and clean up files in the sandbox safely with a dry-run-first script.',
    category: 'Productivity',
    icon: 'i-ph:folder-open',
    recommendedModes: ['general'],
    source: {
      type: 'builtin',
      files: {
        'SKILL.md': `---
name: File Organizer
description: Sort, rename and clean up files in bulk with a safe dry-run-first organizer.
---

# File Organizer

Use this skill when the user asks to organize, rename, deduplicate or clean up files inside
the sandbox workspace.

## How to use

1. ALWAYS start with a dry run to preview the plan:

\`\`\`bash
python3 /opt/skills/file-organizer/scripts/organize.py <folder> --by type|date|extension --dry-run
\`\`\`

2. Review the printed plan, then apply it without \`--dry-run\`.

3. Useful extras:
   - \`--ext pdf,docx\` restricts the operation to file extensions.
   - \`--flat\` moves everything into a single folder instead of per-category folders.

## Rules

- Never delete files unless the user explicitly asked for deletion; prefer moving into
  \`_trash/\` so operations stay reversible.
- Show the user the dry-run plan before applying any change that touches more than 20 files.
- Never touch hidden directories (\`.git\`, \`node_modules\`) — the script already skips them.
`,
        'scripts/organize.py': `#!/usr/bin/env python3
"""Safe bulk file organizer with dry-run mode."""
import argparse
import os
import shutil
import sys
import time

CATEGORY_MAP = {
    "images": {".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp", ".ico"},
    "documents": {".pdf", ".docx", ".doc", ".txt", ".md", ".rtf", ".odt"},
    "spreadsheets": {".xlsx", ".xls", ".csv", ".ods"},
    "archives": {".zip", ".tar", ".gz", ".rar", ".7z"},
    "audio": {".mp3", ".wav", ".flac", ".ogg", ".m4a"},
    "video": {".mp4", ".mov", ".avi", ".mkv", ".webm"},
    "code": {".js", ".ts", ".py", ".rb", ".go", ".rs", ".java", ".c", ".cpp", ".sh", ".json", ".yaml", ".yml", ".toml"},
}
SKIP_DIRS = {".git", "node_modules", ".venv", "venv", "__pycache__", ".cache"}


def category_for(ext):
    for category, extensions in CATEGORY_MAP.items():
        if ext in extensions:
            return category
    return "other"


def plan_moves(root, by, ext_filter, flat):
    moves = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS and not d.startswith(".")]
        for name in filenames:
            src = os.path.join(dirpath, name)
            base, ext = os.path.splitext(name)
            ext = ext.lower()
            if ext_filter and ext not in ext_filter:
                continue
            rel = os.path.relpath(src, root)
            if by == "type":
                target_dir = "flat" if flat else category_for(ext)
            elif by == "extension":
                target_dir = "flat" if flat else ext.lstrip(".") or "noext"
            elif by == "date":
                mtime = time.localtime(os.path.getmtime(src))
                target_dir = "flat" if flat else time.strftime("%Y-%m", mtime)
            else:
                sys.exit(f"unknown --by {by}")
            if os.path.dirname(rel) == target_dir:
                continue
            dst = os.path.join(root, target_dir, name)
            n = 1
            while os.path.exists(dst) and os.path.abspath(dst) != os.path.abspath(src):
                dst = os.path.join(root, target_dir, f"{base}_{n}{ext}")
                n += 1
            moves.append((rel, os.path.relpath(dst, root)))
    return moves


def main():
    parser = argparse.ArgumentParser(description="Organize files into folders")
    parser.add_argument("folder")
    parser.add_argument("--by", default="type", choices=["type", "date", "extension"])
    parser.add_argument("--ext", default="", help="comma separated extensions to include, e.g. pdf,docx")
    parser.add_argument("--flat", action="store_true", help="move into one folder instead of categories")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    root = os.path.abspath(args.folder)
    if not os.path.isdir(root):
        sys.exit(f"not a folder: {root}")

    ext_filter = {("." + e.strip().lower().lstrip(".")) for e in args.ext.split(",") if e.strip()} or None
    moves = plan_moves(root, args.by, ext_filter, args.flat)

    if not moves:
        print("nothing to move")
        return

    for src, dst in moves:
        print(f"{src}  ->  {dst}")

    print(f"\\n{len(moves)} file(s) {'WOULD BE' if args.dry_run else 'WERE'} moved")

    if not args.dry_run:
        for src, dst in moves:
            s = os.path.join(root, src)
            d = os.path.join(root, dst)
            os.makedirs(os.path.dirname(d), exist_ok=True)
            shutil.move(s, d)
        print("done")


if __name__ == "__main__":
    main()
`,
      },
    },
  },
  {
    id: 'seo-audit',
    name: 'SEO Auditor',
    description: 'Audit pages for SEO basics — meta tags, headings, links, performance hints — with a bundled script.',
    category: 'Web',
    icon: 'i-ph:magnifying-glass',
    recommendedModes: ['web'],
    source: {
      type: 'builtin',
      files: {
        'SKILL.md': `---
name: SEO Auditor
description: Audit web pages for SEO fundamentals and produce an actionable checklist.
---

# SEO Auditor

Use this skill when the user wants to improve a page's search visibility, either for pages
already deployed or for a page served from the sandbox preview.

## How to use

\`\`\`bash
node /opt/skills/seo-audit/scripts/audit.js "<url-or-localhost-port>"
\`\`\`

- Accepts a full URL or a bare port (e.g. \`3000\` → \`http://localhost:3000\`) so it works
  directly against apps running in the sandbox.
- Reports: title/meta description length, h1-h3 structure, images missing alt, link counts,
  canonical, viewport, og tags, and quick wins.

## Rules

- Present findings as a prioritized checklist (blockers first, nice-to-haves last).
- After fixing issues in the project, re-run the audit and show the before/after score.
`,
        'scripts/audit.js': `#!/usr/bin/env node
/** Dependency-free on-page SEO auditor. */
let target = process.argv[2];

if (!target) {
  console.error('Usage: node audit.js "<url-or-port>"');
  process.exit(1);
}

if (/^\\d+$/.test(target)) {
  target = \`http://localhost:\${target}\`;
}

new URL(target); // throws on invalid

function count(re, html) {
  const m = html.match(re);
  return m ? m.length : 0;
}

fetch(target, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; SEOAudit/1.0)' } })
  .then(async (res) => {
    const html = await res.text();
    const get = (re) => (html.match(re) || [])[1] || '';
    const clean = (s) => s.replace(/<[^>]+>/g, ' ').replace(/\\s+/g, ' ').trim();

    const title = clean(get(/<title[^>]*>([\\s\\S]*?)<\\/title>/i));
    const desc = clean(get(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i));
    const h1s = (html.match(/<h1[^>]*>[\\s\\S]*?<\\/h1>/gi) || []).map(clean);
    const imgs = count(/<img\\s/gi, html);
    const imgNoAlt = count(/<img(?![^>]*\\balt=)[^>]*>/gi, html);
    const internal = count(/<a\\s[^>]*href=(["'])\\/?[^"']*\\1[^>]*>/gi, html);
    const external = count(/<a\\s[^>]*href=(["'])https?:\\/\\//gi, html);
    const canonical = get(/<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']*)["']/i);
    const viewport = /<meta[^>]+name=["']viewport["']/i.test(html);
    const og = count(/<meta[^>]+property=["']og:[^"']+["']/gi, html);

    const checks = [
      [title.length >= 15 && title.length <= 65, \`title length \${title.length} (ideal 15-65)\`],
      [desc.length >= 50 && desc.length <= 165, \`meta description length \${desc.length} (ideal 50-165)\`],
      [h1s.length === 1, \`exactly one h1 (found \${h1s.length})\`],
      [imgs === 0 || imgNoAlt === 0, \`images have alt text (\${imgNoAlt}/\${imgs} missing)\`],
      [!!canonical, 'canonical tag present'],
      [viewport, 'viewport meta present'],
      [og >= 2, \`open graph tags present (\${og} found)\`],
      [internal + external > 0, \`has links (\${internal} internal, \${external} external)\`],
    ];

    console.log('AUDIT FOR:', target);
    console.log('TITLE:', title || '(none)');
    console.log('DESCRIPTION:', desc || '(none)');
    console.log('H1:', h1s.join(' | ') || '(none)');
    console.log('---');

    let passed = 0;

    for (const [ok, label] of checks) {
      console.log(\`\${ok ? 'PASS' : 'FAIL'}  \${label}\`);

      if (ok) {
        passed++;
      }
    }

    console.log('---');
    console.log(\`SCORE: \${passed}/\${checks.length}\`);
  })
  .catch((err) => {
    console.error('AUDIT FAILED:', err.message);
    process.exit(2);
  });
`,
      },
    },
  },
];

/**
 * Curated GitHub-sourced skills. These are resolved at install time via the
 * GitHub contents API — no credentials required for public repos.
 */
export const GITHUB_CATALOG_SKILLS: SkillDefinition[] = [
  {
    id: 'skill-creator',
    name: 'Skill Creator',
    description: 'Meta-skill from anthropics/skills: teaches the agent how to design and package new skills.',
    category: 'Agent',
    icon: 'i-ph:sparkle',
    recommendedModes: ['general'],
    source: { type: 'github', repo: 'anthropics/skills', path: 'skills/skill-creator', ref: 'main' },
    sourceUrl: 'https://github.com/anthropics/skills/tree/main/skills/skill-creator',
  },
  {
    id: 'mcp-builder',
    name: 'MCP Builder',
    description: 'Guidance + scripts from anthropics/skills for building high-quality MCP servers.',
    category: 'Agent',
    icon: 'i-ph:wrench',
    recommendedModes: ['general'],
    source: { type: 'github', repo: 'anthropics/skills', path: 'skills/mcp-builder', ref: 'main' },
    sourceUrl: 'https://github.com/anthropics/skills/tree/main/skills/mcp-builder',
  },
  {
    id: 'artifacts-builder',
    name: 'Artifacts Builder',
    description: 'From anthropics/skills: build complex HTML artifacts with React, Tailwind and shadcn patterns.',
    category: 'Web',
    icon: 'i-ph:cube',
    recommendedModes: ['web'],
    source: { type: 'github', repo: 'anthropics/skills', path: 'skills/artifacts-builder', ref: 'main' },
    sourceUrl: 'https://github.com/anthropics/skills/tree/main/skills/artifacts-builder',
  },
];
