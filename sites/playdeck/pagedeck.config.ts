import { cloudflarePages } from "@pagedeck/adapter-cloudflare-pages";
import { defineCollection, getEntry } from "@pagedeck/content";
import type { ContentStoreReader, Entry } from "@pagedeck/content";
import { defineConfig, defineLocales, definePages, fromCollection } from "@pagedeck/core";
import type { Page, PageContent, PageHead, PageSource, Route } from "@pagedeck/core";
import { defineMarkdownLoader } from "@pagedeck/markdown-loader";
import type { MarkdownEntry } from "@pagedeck/markdown-loader";
import { defineSearch } from "@pagedeck/search";
import { cpSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { codeToHtml } from "shiki";
import type { DocsLayoutProps } from "@deck-cool/docs";
import { HASHED_FILE_HEADERS } from "@deck-cool/site-kit/headers";
import type { Card } from "./components/home-page.tsx";
import type { SourceFile } from "./components/examples-page.tsx";
import { DOCS, ORIGIN, PATHS, REPO } from "./components/links.ts";
import {
  components,
  COURSE_PLATFORM,
  DOCS_PAGE,
  EXAMPLES_PAGE,
  FAMILY_BAR,
  FOOTER,
  HOME_PAGE,
  PROSE,
  SEARCH,
  SEARCH_PAGE,
  STREAMING_SERVICE,
} from "./src/catalog.ts";
import { playdeckChunkNames } from "./src/chunk-names.ts";
import { iconizeFeaturesTable, scrollTables, stageComparison } from "./src/comparison.ts";
import { HASHED_PREFIXES, RESPONSE_HEADERS } from "./src/headers.ts";

const LOCALE = "en";

// Dark only, as the brand is. The `-default` theme's every token clears 4.5:1,
// where `github-dark`'s do not all.
const CODE_THEME = "github-dark-default";

/** The home page: playdeck.video's copy on 2026-10-09. */
const HOME = {
  title: "Playdeck: a video player you compose",
  display: "A video player you compose, not one you configure.",
  lede: "React primitives and hooks over native video, HLS, YouTube, Vimeo and Wistia. You write the markup, you write the CSS, and the same six lines drive all five.",
  install: "pnpm add @playdeck/react",
  // playdeck's scripts/bundle-budgets.mjs measures both at 1.3.0, and
  // playdeck.video printed them on 2026-10-09. Its literal backticks around
  // the package name are dropped on purpose: they rendered as text, not code.
  // Re-read the figures at each bump.
  measured:
    "23 kB gzipped, the whole of what @playdeck/react ships. Adding YouTube costs 7 kB. 0 requests to a provider before play.",
} as const;

/**
 * The four feature cards. playdeck.video's source wraps each description
 * over two lines, and printed each line as a paragraph of its own; here each
 * is one sentence run, in one paragraph. "Style it" pointed at playdeck.video's /design,
 * which this site drops (CONTEXT.md: no site shows off shared tokens), so it
 * points at the part-name contract it describes.
 */
const CARDS = [
  {
    headline: "Compose it",
    description: "Every control is a component. Reorder them, drop one, put your own between them.",
    snippet: `<Player.Controls>\n  <Player.PlayButton />\n  <Logo />\n  <Player.Time type="current" />\n</Player.Controls>`,
    lang: "tsx",
    href: DOCS.reference,
  },
  {
    headline: "Style it",
    description: "No CSS ships in the bundle. Two authored themes, or write your own against stable part names.",
    snippet: `[data-playdeck-part='play-button'] {\n  border-radius: 999px;\n}`,
    lang: "css",
    href: DOCS.contract,
  },
  {
    headline: "Ask what the provider can do",
    description: "Every provider declares what it can do. A control it cannot honour renders nothing, and you can read the same answer.",
    snippet: "usePlayerState((s) => s.capabilities.pictureInPicture)",
    lang: "tsx",
    href: DOCS.capabilities,
  },
  {
    headline: "Recover from refused autoplay",
    description: "Ask for sound. If the browser refuses, the player retries muted once and tells you, so you can draw the unmute.",
    snippet: `<Player.Root autoplay="audible-then-muted">`,
    lang: "tsx",
    href: DOCS.reference,
  },
] as const;

const EXAMPLES = {
  title: "Examples — Playdeck",
  description:
    "Two players composed from playdeck's primitives for two different jobs, a streaming service and a course platform, each beside the files it is made of.",
  // Served from public/, as playdeck.video serves it.
  captions: "/archetype-captions.vtt",
} as const;

/** Each archetype's files, as the examples page prints them. */
const ARCHETYPES = {
  streaming: ["components/archetype-streaming-service.tsx", "styles/archetype-streaming-service.css"],
  course: ["components/archetype-course-platform.tsx", "styles/archetype-course-platform.css"],
} as const;

const COMPARISON = {
  description:
    "How Playdeck compares with other React video libraries: bundle sizes measured with two bundlers, a sourced feature table, and the method behind both.",
} as const;

// The docs' search page, under /docs. #52 adds the docs it searches.
const SEARCH_COPY = {
  title: "Search",
  description:
    "Search playdeck's site by keyword, with pages that match in their title ranked above pages that match only in their body.",
  intro: "Search every page of this site. Results are ranked by where the words appear — a title match comes before a body match.",
  label: "Search the site",
  emptyLabel: "No page matches those words.",
} as const;

/** The Family bar's links, after the switcher and the name. */
const BAR_LINKS = [
  { label: "Docs", href: DOCS.start },
  { label: "Examples", href: PATHS.examples },
  { label: "Comparison", href: PATHS.comparison },
  { label: "Search", href: PATHS.search },
  { label: "GitHub", href: REPO },
];

// Measured, not chosen: each is the page's size rounded up to a whole
// kilobyte. Re-measure rather than raise one.
const BUDGET = {
  "/**": "0b",
  [PATHS.examples]: "88kb",
  [PATHS.search]: "60kb",
} as const;

/**
 * One directory to publish from: the brand kit's icons and .assetsignore, then
 * the site's own files. Passthrough reads one root, and skips a symlink.
 */
function stagePublic(): string {
  const stage = "./.pagedeck-public";
  rmSync(stage, { recursive: true, force: true });
  cpSync("./node_modules/@deck-cool/brand/public", stage, { recursive: true });
  cpSync("./public", stage, { recursive: true });
  return stage;
}

const comparison = defineCollection<MarkdownEntry>({
  name: "comparison",
  loader: defineMarkdownLoader({
    root: stageComparison("./comparison", "./.pagedeck-comparison"),
    locale: LOCALE,
    languages: ["sh"],
    theme: CODE_THEME,
  }),
  schema: false,
});

/** A page with no entry behind it, at `route`. `instances` annotates its parameter, which would otherwise infer as `unknown`. */
function singlePage(route: Route): PageSource<Record<string, never>> {
  return {
    instances: (_store: ContentStoreReader) => [{ locale: LOCALE, params: {}, dependencies: [] }],
    route: () => route,
  };
}

/** `code`, highlighted as the markdown loader highlights a fence. */
function highlight(code: string, lang: string): Promise<string> {
  return codeToHtml(code, { lang, theme: CODE_THEME });
}

async function homeContent(): Promise<PageContent> {
  const cards: Card[] = await Promise.all(
    CARDS.map(async ({ snippet, lang, ...card }) => ({ ...card, html: await highlight(snippet, lang) })),
  );
  return {
    tree: [
      {
        component: HOME_PAGE,
        props: {
          display: HOME.display,
          lede: HOME.lede,
          install: HOME.install,
          start: DOCS.start,
          cards,
          measured: HOME.measured,
          links: [
            ["Reference", DOCS.reference],
            ["Providers", DOCS.providers],
            ["Examples", PATHS.examples],
          ],
        },
      },
    ],
  };
}

/** Each file, read from disk and highlighted, so the page prints what runs. */
function sources(paths: readonly string[]): Promise<SourceFile[]> {
  return Promise.all(
    paths.map(async (path) => ({
      path: `sites/playdeck/${path}`,
      // The final newline is the file's, not the example's.
      html: await highlight(readFileSync(path, "utf8").trimEnd(), path.endsWith(".css") ? "css" : "tsx"),
    })),
  );
}

async function examplesContent(): Promise<PageContent> {
  return {
    tree: [
      {
        component: EXAMPLES_PAGE,
        props: { streaming: await sources(ARCHETYPES.streaming), course: await sources(ARCHETYPES.course) },
        children: [
          { component: STREAMING_SERVICE, props: { captionsSrc: EXAMPLES.captions, resumeAt: 18 } },
          { component: COURSE_PLATFORM, props: { captionsSrc: EXAMPLES.captions, resumeAt: 14 } },
        ],
      },
    ],
  };
}

function comparisonContent(page: Page, store: ContentStoreReader): PageContent {
  const entry: Entry<MarkdownEntry> | undefined = page.entry === undefined ? undefined : getEntry(store, comparison, page.entry);
  if (entry === undefined) {
    throw new Error(`Page ${page.path}: has no stored entry — run pagedeck sync before pagedeck build`);
  }
  const title = entry.data.title ?? "";
  // The guide's own h1 is the layout's, so the body starts after it.
  const body = entry.data.html.replace(/^\s*<h1[^>]*>[\s\S]*?<\/h1>/, "");
  // No nav until #52 brings the docs' nav.json.
  const props: DocsLayoutProps = { title, description: COMPARISON.description, href: page.path, nav: [] };
  return {
    tree: [{ component: DOCS_PAGE, props, children: [{ component: PROSE, props: { html: scrollTables(iconizeFeaturesTable(body)) } }] }],
  };
}

function contentOf(page: Page, store: ContentStoreReader): PageContent | Promise<PageContent> {
  if (page.path === PATHS.home) return homeContent();
  if (page.path === PATHS.examples) return examplesContent();
  if (page.path === PATHS.search) {
    return {
      tree: [
        {
          component: SEARCH_PAGE,
          // No docs yet, so no nav: #52 passes the docs' nav.json here.
          props: { title: SEARCH_COPY.title, intro: SEARCH_COPY.intro, nav: [] },
          children: [
            { component: SEARCH, props: { locale: LOCALE, label: SEARCH_COPY.label, emptyLabel: SEARCH_COPY.emptyLabel } },
          ],
        },
      ],
    };
  }
  return comparisonContent(page, store);
}

function headOf(page: Page): PageHead | undefined {
  if (page.path === PATHS.home) return { title: HOME.title, description: HOME.lede };
  if (page.path === PATHS.examples) return { title: EXAMPLES.title, description: EXAMPLES.description };
  if (page.path === PATHS.search) return { title: SEARCH_COPY.title, description: SEARCH_COPY.description };
  // The comparison guide's title and description are the docs layout's.
  return undefined;
}

export default defineConfig({
  collections: [comparison],
  build: {
    adapter: cloudflarePages(),
    // Every page names its own path here as canonical: playdeck.video stays
    // canonical when the site is also served at play.deck.cool (CONTEXT.md).
    origin: ORIGIN,
    pages: definePages({
      locales: defineLocales({ en: { label: "English", direction: "ltr" } }),
      sources: [
        fromCollection(comparison, { route: (entry) => entry.path.split("/") }),
        ...[PATHS.home, PATHS.examples, PATHS.search].map((path) =>
          singlePage(path === "/" ? "/" : path.slice(1, -1).split("/")),
        ),
      ],
    }),
    components,
    content: contentOf,
    head: headOf,
    // The Family bar before <main> and the footer after it, so they are the
    // page's banner and contentinfo landmarks.
    chrome: () => ({
      before: [{ component: FAMILY_BAR, props: { links: BAR_LINKS } }],
      after: [{ component: FOOTER }],
    }),
    // One hashed sheet under /assets/, linked from every page's <head>, in this
    // order. By real path: the bundler names a module by it, and Pagedeck 0.2.3
    // puts a sheet in the one shared sheet only when the two names match
    // (pedrosousa13/pagedeck#135). Named through pnpm's link, brand.css and
    // family-bar.css went to a second sheet that only pages with an island link.
    css: [
      "./node_modules/@deck-cool/brand/styles/brand.css",
      "./node_modules/@deck-cool/brand/styles/family-bar.css",
      "./styles/playdeck.css",
      "./styles/archetype-streaming-service.css",
      "./styles/archetype-course-platform.css",
    ].map((sheet) => realpathSync(sheet)),
    passthrough: { root: stagePublic() },
    routing: {
      headers: [
        { prefix: "/", set: [...RESPONSE_HEADERS] },
        ...HASHED_PREFIXES.map((prefix) => ({ prefix, set: [...RESPONSE_HEADERS, ...HASHED_FILE_HEADERS] })),
      ],
    },
    vite: { plugins: [playdeckChunkNames()] },
    budget: BUDGET,
    search: defineSearch(),
  },
});
