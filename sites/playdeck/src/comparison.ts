import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, posix } from "node:path";

/*
 * The library comparison guide, a port of pedrosousa13/playdeck's
 * apps/site/src/comparison-page.mjs and comparison-icons.mjs at cf72813.
 *
 * The source is playdeck's docs/comparison/*.md, which its
 * `pnpm compare:libraries` and `pnpm compare:features` generate. The three
 * files in ../comparison/ are those files, byte for byte, so both sites render
 * one text: refresh them by copying them again, never by editing them here.
 *
 * Composed as upstream composes it: one h1, then each document whole with its
 * headings one level down, anchored for a same-page link. Two steps are this
 * site's own. The markdown loader has no footnotes, so `footnotes` writes the
 * features table's `[^n]` references and their notes as HTML. A wide table
 * scrolls in a labelled region of its own (`scrollTables`), so the page never
 * scrolls sideways.
 */

export const TITLE = "React video library comparison";

/** playdeck's repo, where a relative link in the documents resolves. */
const BLOB = "https://github.com/pedrosousa13/playdeck/blob/main/";

/** Where the documents sit in playdeck's repo. */
const DIR = "docs/comparison";

/**
 * The documents, in the order the page renders them, each with the id its
 * section is anchored at. Not upstream's `features`, which method.md's own
 * Features heading takes too.
 */
const DOCUMENTS = [
  { file: "results.md", anchor: "comparison-results" },
  { file: "features.md", anchor: "comparison-features" },
  { file: "method.md", anchor: "comparison-method" },
] as const;

const FENCE = /^\s*(```|~~~)/;

/** Each line of `markdown` outside a fence through `change`, and the fenced ones as they are. */
function outsideFences(markdown: string, change: (line: string) => string): string {
  let fenced = false;
  return markdown
    .split("\n")
    .map((line) => {
      if (FENCE.test(line)) {
        fenced = !fenced;
        return line;
      }
      return fenced ? line : change(line);
    })
    .join("\n");
}

/** Every ATX heading one level down, `#` to `##`, outside fences. A `######` stays. */
export function demoteHeadings(markdown: string): string {
  return outsideFences(markdown, (line) => {
    const heading = /^(#{1,6})(\s.*)?$/.exec(line);
    if (heading === null) return line;
    const [, hashes = "", rest = ""] = heading;
    return hashes.length >= 6 ? line : `#${hashes}${rest}`;
  });
}

/**
 * One link target as this page needs it. A link to one of the three documents
 * becomes a fragment on this page; any other relative link resolves in
 * playdeck's repo on GitHub; an absolute link or a fragment stays.
 */
export function rewriteTarget(target: string): string {
  if (target.startsWith("#") || target.startsWith("/") || /^[a-z][a-z0-9+.-]*:/i.test(target)) return target;
  const [path = "", fragment = ""] = target.split("#");
  const resolved = posix.normalize(posix.join(DIR, path));
  const sibling = DOCUMENTS.find(({ file }) => resolved === posix.join(DIR, file));
  if (sibling !== undefined) return fragment === "" ? `#${sibling.anchor}` : `#${fragment}`;
  return `${BLOB}${resolved}${fragment === "" ? "" : `#${fragment}`}`;
}

/** Every inline `[text](target)` outside a fence, through `rewriteTarget`. */
export function rewriteLinks(markdown: string): string {
  return outsideFences(markdown, (line) =>
    line.replace(/(?<!!)\]\(([^()\s]+)\)/g, (_, target: string) => `](${rewriteTarget(target)})`),
  );
}

/**
 * GFM footnotes, written out: each `[^label]` reference becomes a numbered
 * superscript link, and the notes an ordered list at the end of the document,
 * each with a link back. Numbered in the order of first reference, as GitHub
 * numbers them. A reference with no note, or a note no reference names, fails.
 */
export function footnotes(markdown: string): string {
  const notes = new Map<string, string>();
  const lines = markdown.split("\n");
  const body: string[] = [];
  for (let at = 0; at < lines.length; at += 1) {
    const definition = /^\[\^([^\]\s]+)\]:\s+(.*)$/.exec(lines[at] ?? "");
    if (definition === null) {
      body.push(lines[at] ?? "");
      continue;
    }
    const [, label = "", first = ""] = definition;
    const text = [first];
    while (at + 1 < lines.length && /^\s+\S/.test(lines[at + 1] ?? "")) text.push((lines[(at += 1)] ?? "").trim());
    if (notes.has(label)) throw new Error(`comparison: the footnote [^${label}] is defined twice`);
    notes.set(label, text.join(" "));
  }

  const order: string[] = [];
  const referenced = outsideFences(body.join("\n"), (line) =>
    line.replace(/\[\^([^\]\s]+)\]/g, (_, label: string) => {
      if (!notes.has(label)) throw new Error(`comparison: the footnote [^${label}] has no note`);
      const first = !order.includes(label);
      if (first) order.push(label);
      const number = order.indexOf(label) + 1;
      return `<sup><a href="#fn-${number}"${first ? ` id="fnref-${number}"` : ""}>${number}</a></sup>`;
    }),
  );
  if (notes.size === 0) return referenced;
  const unused = [...notes.keys()].filter((label) => !order.includes(label));
  if (unused.length > 0) throw new Error(`comparison: no reference names the footnotes ${unused.join(", ")}`);

  const list = order.map(
    (label, index) =>
      `${index + 1}. <span id="fn-${index + 1}"></span>${notes.get(label) ?? ""} <a href="#fnref-${index + 1}" aria-label="Back to reference ${index + 1}">↩</a>`,
  );
  return [referenced.trimEnd(), "", '<section class="cmp-footnotes" aria-label="Footnotes">', "", ...list, "", "</section>"].join(
    "\n",
  );
}

/** The guide's markdown, composed from the three documents in `dir`. */
export function comparisonDocument(dir: string): string {
  const sections = DOCUMENTS.map(({ file, anchor }) => {
    const source = readFileSync(join(dir, file), "utf8");
    return `<a id="${anchor}"></a>\n\n${demoteHeadings(rewriteLinks(footnotes(source)))}`;
  });
  return [`# ${TITLE}`, ...sections].join("\n\n");
}

/**
 * Writes the composed guide to `stage`, as `guides/comparison.md`, for the
 * markdown loader to read: the loader reads files, so a composed document
 * needs one. Returns `stage`.
 */
export function stageComparison(dir: string, stage: string): string {
  rmSync(stage, { recursive: true, force: true });
  mkdirSync(join(stage, "guides"), { recursive: true });
  writeFileSync(join(stage, "guides", "comparison.md"), comparisonDocument(dir));
  return stage;
}

type Status = "yes" | "partial" | "plugin" | "no" | "n/a";

/**
 * One icon per status, beside the word and never instead of it, on one 16×16
 * box in `currentColor`. `partial` and `plugin` share a colour, so their shapes
 * are unrelated.
 */
const ICONS: Readonly<Record<Status, string>> = {
  yes: '<svg class="cmp-status__icon" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 8.5l3 3 7-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  partial:
    '<svg class="cmp-status__icon" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 2a6 6 0 000 12z" fill="currentColor"/></svg>',
  plugin:
    '<svg class="cmp-status__icon" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M5 1v4M11 1v4M4 5h8v2a4 4 0 01-4 4 4 4 0 01-4-4V5z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 11v4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  no: '<svg class="cmp-status__icon" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  "n/a":
    '<svg class="cmp-status__icon" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 8h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
};

const TABLE = /<table>[\s\S]*?<\/table>/g;
const STATUS_CELL = /<td>\s*(yes|partial|plugin|no|n\/a)\s*(<sup>[\s\S]*?<\/sup>)?\s*<\/td>/g;

/** The features table, the one whose header names `Axis`, with an icon beside each status word. Other tables pass through. */
export function iconizeFeaturesTable(html: string): string {
  return html.replace(TABLE, (table) =>
    !table.includes(">Axis<")
      ? table
      : table
          .replace("<table>", '<table class="cmp-features">')
          .replace(
            STATUS_CELL,
            (_, status: Status, footnote = "") =>
              `<td><span class="cmp-status" data-status="${status}">${ICONS[status]}<span class="cmp-status__word">${status}</span></span>${footnote}</td>`,
          ),
  );
}

/**
 * Each table inside a region that scrolls sideways, named for the heading
 * above it. The region takes focus, so a keyboard can scroll a table with no
 * link in it.
 */
export function scrollTables(html: string): string {
  let heading = "Table";
  return html.replace(/<h([2-4])[^>]*>([\s\S]*?)<\/h\1>|<table[\s\S]*?<\/table>/g, (match, _level, text?: string) => {
    if (text !== undefined) {
      heading = text.replace(/<[^>]*>/g, "").trim();
      return match;
    }
    // The heading's text is HTML already, so it needs no escaping but its quotes.
    return `<div class="cmp-table" role="region" tabindex="0" aria-label="${heading.replace(/"/g, "&quot;")}">${match}</div>`;
  });
}
