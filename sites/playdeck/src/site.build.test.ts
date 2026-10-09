import { Window, type Document, type Element } from "happy-dom";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { decks } from "@deck-cool/brand/decks";
import { DOCS, ORIGIN, PATHS, REPO } from "../components/links.ts";
import { CONTENT_SECURITY_POLICY } from "./csp.ts";
import { headersFor, parseHeaders } from "./serve-site.ts";

// Reads the build that build.global-setup.ts writes.

const SITE = fileURLToPath(new URL("..", import.meta.url));
const BRAND = fileURLToPath(new URL("../../../packages/brand/public/", import.meta.url));
const playdeck = decks.find((deck) => deck.name === "playdeck");
if (playdeck === undefined) throw new Error("the decks module has no playdeck");

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

/** Narrows away `null` and `undefined`, failing the test when the value is missing. */
function present<T>(value: T | null | undefined, what: string): T {
  if (value == null) throw new Error(`${what} is missing`);
  return value;
}

interface ManifestPage {
  path: string;
  output: string;
  components: string[];
}

/** manifest.json's pages and files, checked as they are read. */
function readManifest(): { pages: ManifestPage[]; files: string[]; notFound: unknown[] } {
  const value: unknown = JSON.parse(readFileSync(`${SITE}site/manifest.json`, "utf8"));
  if (
    !isRecord(value) ||
    !Array.isArray(value.pages) ||
    !Array.isArray(value.files) ||
    !isRecord(value.routing) ||
    !Array.isArray(value.routing.trees)
  ) {
    throw new Error("manifest.json has no pages, files or routing.trees");
  }
  return {
    pages: value.pages.map((page: unknown) => {
      if (!isRecord(page) || typeof page.path !== "string" || typeof page.output !== "string") {
        throw new Error("a manifest page has no path or output");
      }
      const components = Array.isArray(page.components) ? page.components : [];
      return {
        path: page.path,
        output: page.output,
        components: components.map((component: unknown) =>
          present(isRecord(component) && typeof component.name === "string" ? component.name : undefined, "a component's name"),
        ),
      };
    }),
    files: value.files.map((file: unknown) =>
      present(isRecord(file) && typeof file.path === "string" ? file.path : undefined, "a manifest file's path"),
    ),
    notFound: value.routing.trees.map((tree: unknown) => (isRecord(tree) ? tree.notFound : undefined)),
  };
}

interface BudgetRow {
  path: string;
  limitText?: string;
  actual: number;
}

function readBudget(): BudgetRow[] {
  const value: unknown = JSON.parse(readFileSync(`${SITE}.pagedeck/budget-report.json`, "utf8"));
  if (!isRecord(value) || !Array.isArray(value.pages)) throw new Error("the budget report has no pages");
  return value.pages.map((row: unknown) => {
    if (!isRecord(row) || typeof row.path !== "string" || typeof row.actual !== "number") {
      throw new Error("a budget row has no path or actual");
    }
    return { path: row.path, actual: row.actual, ...(typeof row.limitText === "string" ? { limitText: row.limitText } : {}) };
  });
}

const manifest = readManifest();
const budget = readBudget();
const window = new Window();

function html(path: string): string {
  const page = present(
    manifest.pages.find((row) => row.path === path),
    `the page ${path}`,
  );
  return readFileSync(`${SITE}site${page.output}index.html`, "utf8");
}

const parsed = new Map<string, Document>();

/** Each page parsed once: the comparison guide is large, and happy-dom keeps every document it parses. */
function parse(path: string): Document {
  const doc = parsed.get(path) ?? new window.DOMParser().parseFromString(html(path), "text/html");
  parsed.set(path, doc);
  return doc;
}

/** The element's text, with runs of white space as one space. */
function text(element: Element | null | undefined): string | undefined {
  return element?.textContent?.replace(/\s+/g, " ").trim();
}

function hrefs(scope: Element | Document): (string | null)[] {
  return [...scope.querySelectorAll("a")].map((a) => a.getAttribute("href"));
}

const PAGES = [PATHS.home, PATHS.examples, PATHS.comparison, PATHS.search];

test("the site is the home page, the examples, the comparison guide and the docs' search page", () => {
  expect(manifest.pages.map((page) => page.path).sort()).toEqual([...PAGES].sort());
});

describe("the package", () => {
  const pkg: unknown = JSON.parse(readFileSync(`${SITE}package.json`, "utf8"));
  const all = isRecord(pkg) ? { ...(pkg.dependencies as object), ...(pkg.devDependencies as object) } : {};

  test("pins every dependency exactly, but the workspace's own", () => {
    for (const [name, version] of Object.entries(all)) {
      if (String(version).startsWith("workspace:")) continue;
      expect(version, name).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });

  test("takes @playdeck/react and every provider from npm at 1.3.0, and Pagedeck at 0.2.3", () => {
    const playdeckPackages = Object.entries(all).filter(([name]) => name.startsWith("@playdeck/"));
    expect(Object.fromEntries(playdeckPackages)).toEqual({
      "@playdeck/core": "1.3.0",
      "@playdeck/provider-hls": "1.3.0",
      "@playdeck/provider-native": "1.3.0",
      "@playdeck/provider-vimeo": "1.3.0",
      "@playdeck/provider-wistia": "1.3.0",
      "@playdeck/provider-youtube": "1.3.0",
      "@playdeck/react": "1.3.0",
    });
    for (const [name, version] of Object.entries(all)) if (name.startsWith("@pagedeck/")) expect(version, name).toBe("0.2.3");
  });

  test("depends on none of the old site's styling, and not on @playdeck/docs", () => {
    const names = Object.keys(all).join(" ");
    expect(names).not.toMatch(/tailwind|radix|cmdk|class-variance-authority|clsx|lucide|@fontsource|@playdeck\/docs/);
  });
});

describe("budgets, measured and pinned", () => {
  // Spelled again rather than imported, so a limit raised in the config fails here.
  // Each is the page's measured size rounded up to a whole kilobyte.
  const PINNED: Record<string, string> = {
    [PATHS.home]: "60kb",
    [PATHS.examples]: "88kb",
    [PATHS.comparison]: "0b",
    [PATHS.search]: "60kb",
  };

  test("every page has its pinned limit, and stays within it", () => {
    for (const path of PAGES) {
      const row = present(
        budget.find((each) => each.path === path),
        `the budget row for ${path}`,
      );
      expect(row.limitText, path).toBe(PINNED[path]);
      const limit = Number.parseInt(row.limitText ?? "", 10) * (row.limitText?.endsWith("kb") ? 1024 : 1);
      expect(row.actual, path).toBeLessThanOrEqual(limit);
      // Tight: within two kilobytes of what the page ships. Not one: a chunk's
      // name is a hash, so any change to the site moves a page by some bytes.
      if (limit > 0) expect(limit - row.actual, path).toBeLessThan(2048);
    }
  });

  test("the comparison guide ships 0 B of JavaScript, and no script at all", () => {
    expect(budget.find((row) => row.path === PATHS.comparison)?.actual).toBe(0);
    expect(parse(PATHS.comparison).querySelectorAll("script, link[rel=modulepreload]")).toHaveLength(0);
  });

  test("each page with islands carries only its own", () => {
    const islands = Object.fromEntries(manifest.pages.map((page) => [page.path, [...page.components].sort()]));
    expect(islands).toEqual({
      [PATHS.home]: ["copy_install"],
      [PATHS.examples]: ["course_platform", "streaming_service"],
      [PATHS.comparison]: [],
      [PATHS.search]: ["search"],
    });
  });
});

describe("every page", () => {
  test.each(PAGES)("%s links the playdeck icons and one hashed stylesheet from <head>, and declares a viewport", (path) => {
    const doc = parse(path);
    const head = [...doc.head.querySelectorAll("link:not([rel=modulepreload])")].map((link) => [
      link.getAttribute("rel"),
      link.getAttribute("href"),
    ]);
    expect(head).toEqual(
      expect.arrayContaining([
        ["icon", playdeck.icons.still],
        ["apple-touch-icon", playdeck.icons.appleTouch],
      ]),
    );
    expect(head.filter(([rel]) => rel === "stylesheet")).toEqual([["stylesheet", expect.stringMatching(/^\/assets\/[^/]+\.css$/)]]);
    expect(doc.head.querySelectorAll('meta[name="viewport"]')).toHaveLength(1);
    expect(doc.head.querySelector('meta[name="viewport"]')?.getAttribute("content")).toBe("width=device-width, initial-scale=1");
    expect(doc.head.querySelectorAll('meta[name="description"]')).toHaveLength(1);
    expect(doc.head.querySelector('meta[name="description"]')?.getAttribute("content")?.length).toBeGreaterThanOrEqual(50);
    expect(doc.head.querySelectorAll("title")).toHaveLength(1);
    expect(doc.documentElement.getAttribute("lang")).toBe("en");
  });

  // CONTEXT.md: playdeck.video stays canonical, so play.deck.cool names it.
  test.each(PAGES)("%s names the same path on playdeck.video as canonical", (path) => {
    const canonical = [...parse(path).head.querySelectorAll('link[rel="canonical"]')].map((link) => link.getAttribute("href"));
    expect(canonical).toEqual([`${ORIGIN}${path}`]);
  });

  test.each(PAGES)("%s opens with the Family bar, set to playdeck, and closes with the footer", (path) => {
    const doc = parse(path);
    const bar = present(doc.querySelector("body header.family-bar"), "the Family bar");
    expect(bar.getAttribute("data-deck")).toBe("playdeck");
    expect(doc.querySelector("header.family-bar ~ main")).not.toBeNull();
    expect(doc.querySelector("main + footer")).not.toBeNull();
    expect(text(bar.querySelector(".family-bar__name"))).toBe("playdeck");
    expect([...bar.querySelectorAll(".family-bar__links a")].map((a) => [text(a), a.getAttribute("href")])).toEqual([
      ["Docs", DOCS.start],
      ["Examples", PATHS.examples],
      ["Comparison", PATHS.comparison],
      ["Search", PATHS.search],
      ["GitHub", REPO],
    ]);
  });

  // CONTEXT.md: a package site links its own deck's repo, never the maintainer's profile.
  test.each(PAGES)("%s links github.com only at playdeck's repo", (path) => {
    const github = hrefs(parse(path)).filter((href) => /^https?:\/\/([^/]+\.)?github\.com/i.test(href ?? ""));
    expect(github.length).toBeGreaterThan(0);
    for (const href of github) expect(href === REPO || href?.startsWith(`${REPO}/`), href ?? "").toBe(true);
  });

  test.each(PAGES)("%s carries no <style> and no inline handler, and a script only from the site", (path) => {
    const doc = parse(path);
    expect(doc.querySelectorAll("style")).toHaveLength(0);
    for (const element of doc.querySelectorAll("*")) {
      for (const { name } of element.attributes) expect(name, element.tagName).not.toMatch(/^on/);
    }
    for (const script of doc.querySelectorAll("script[src]")) expect(script.getAttribute("src")).toMatch(/^\//);
  });

  test.each(PAGES)("%s gives every id once", (path) => {
    const ids = [...parse(path).querySelectorAll("[id]")].map((element) => element.id);
    expect(ids.filter((id, at) => ids.indexOf(id) !== at)).toEqual([]);
  });

  test("every inline script is one the CSP names by its hash", () => {
    const allowed = CONTENT_SECURITY_POLICY.value.match(/'sha256-[^']+'/g) ?? [];
    const inline = new Set<string>();
    for (const path of PAGES) {
      // Read from the file: happy-dom's parser keeps no script text.
      for (const [, attributes = "", body = ""] of html(path).matchAll(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
        if (!/\ssrc=/.test(attributes)) inline.add(`'sha256-${createHash("sha256").update(body).digest("base64")}'`);
      }
    }
    // Pinned both ways: a hash no page needs any more comes out of the CSP.
    expect([...inline].sort()).toEqual([...allowed].sort());
  });
});

describe("the stylesheet", () => {
  function stylesheet(): string {
    const href = present(parse(PATHS.home).head.querySelector('link[rel="stylesheet"]')?.getAttribute("href"), "the stylesheet link");
    return readFileSync(`${SITE}site${href}`, "utf8");
  }

  test("holds brand.css, then family-bar.css, then the site's own sheet", () => {
    const css = stylesheet();
    const brand = css.indexOf("--ground-page");
    const bar = css.indexOf(".family-bar");
    const site = css.indexOf(".pd-wrap");
    expect(brand).toBeGreaterThanOrEqual(0);
    expect(brand).toBeLessThan(bar);
    expect(css.lastIndexOf(".family-bar")).toBeLessThan(site);
  });

  test("sets type in the brand's system stack, with no web font, and eases on the brand's one curve", () => {
    const css = stylesheet();
    expect(css).not.toMatch(/@font-face|IBM Plex|--tw-/);
    expect(css).not.toMatch(/(?<![-\w])(ease|ease-in|ease-out|ease-in-out|linear)\s*[;,)!]/);
    for (const [curve] of css.matchAll(/cubic-bezier\([^)]*\)/g)) expect(curve.replace(/\s/g, "")).toBe("cubic-bezier(.32,.72,0,1)");
  });

  test("moves only when motion is allowed", () => {
    // Each transition or animation a rule sets, but `none`, sits in a
    // prefers-reduced-motion: no-preference block.
    const moving: string[] = [];
    const preludes: string[] = [];
    let start = 0;
    const css = stylesheet();
    for (let at = 0; at < css.length; at += 1) {
      if (css[at] !== "{" && css[at] !== "}") continue;
      const segment = css.slice(start, at);
      start = at + 1;
      if (css[at] === "{") {
        preludes.push(segment.slice(segment.lastIndexOf(";") + 1).trim());
        continue;
      }
      const allowed = preludes.some((prelude) => prelude.includes("prefers-reduced-motion:no-preference"));
      for (const [declaration] of segment.matchAll(/(?:transition|animation)\s*:[^;]*/g)) {
        if (!allowed && !/:\s*none/.test(declaration)) moving.push(`${preludes.join(" ")} ${declaration}`);
      }
      preludes.pop();
    }
    expect(moving).toEqual([]);
  });

  test("eases a view transition on the brand's one curve, and only when motion is allowed", () => {
    const css = stylesheet();
    const query = css.indexOf("prefers-reduced-motion:no-preference");
    const group = /::view-transition-group\(\*\)\{animation-timing-function:var\(--ease\)\}/.exec(css);
    expect(query).toBeGreaterThanOrEqual(0);
    expect(group?.index ?? -1).toBeGreaterThan(query);
    expect(css.match(/::view-transition-group/g)).toHaveLength(1);
  });

  test("is the only stylesheet the site serves", () => {
    expect(manifest.files.filter((path) => path.endsWith(".css"))).toEqual([expect.stringMatching(/^\/assets\//)]);
  });

  test("the icons are the brand kit's, byte for byte", () => {
    for (const path of [playdeck.icons.still, playdeck.icons.appleTouch]) {
      const served = readFileSync(`${SITE}site${path}`);
      expect(served.equals(readFileSync(`${BRAND}${path.slice(1)}`)), path).toBe(true);
    }
  });
});

describe("the served headers", () => {
  const rules = parseHeaders(readFileSync(`${SITE}site/_headers`, "utf8"));
  /** Every path the site serves: each page, and each file but the ones the host reads as configuration. */
  const served = [...PAGES, ...manifest.files.filter((path) => !/^\/_(headers|redirects)$/.test(path))];
  const EVERY_RESPONSE = {
    [CONTENT_SECURITY_POLICY.name]: CONTENT_SECURITY_POLICY.value,
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  };

  test("_headers sends the CSP, the security headers and HSTS on every page and file", () => {
    for (const path of served) {
      expect(Object.fromEntries(headersFor(rules, path)), path).toMatchObject(EVERY_RESPONSE);
    }
  });

  test("_headers sends a Permissions-Policy that turns off every powerful feature but the site's own fullscreen", () => {
    for (const path of served) {
      const features = headersFor(rules, path).get("Permissions-Policy")?.split(", ") ?? [];
      for (const feature of features) expect(feature, path).toMatch(/^[a-z-]+=\(\)$|^fullscreen=\(self\)$/);
      expect(features, path).toEqual(
        expect.arrayContaining(["camera=()", "microphone=()", "geolocation=()", "payment=()", "fullscreen=(self)"]),
      );
    }
  });

  test("_headers caches content-hashed files as immutable, and nothing else", () => {
    // Only the build's own files, under /assets/, are named by their hash.
    const hashed = /^\/assets\/.+-[A-Za-z0-9_-]{8}\.[a-z0-9]+$/;
    expect(served.filter((path) => hashed.test(path))).not.toHaveLength(0);
    for (const path of served) {
      expect(headersFor(rules, path).get("Cache-Control"), path).toBe(
        hashed.test(path) ? "public, max-age=31536000, immutable" : undefined,
      );
    }
  });

  test(".assetsignore keeps the deploy manifest, the deploy directory and the fallback 404 out of the upload", () => {
    const ignored = readFileSync(`${SITE}site/.assetsignore`, "utf8")
      .split("\n")
      .filter((line) => line !== "" && !line.startsWith("#"));
    expect(ignored).toEqual(["/manifest.json", "/.pagedeck", "/404.html"]);
    expect(manifest.notFound.map((page) => page ?? undefined)).toEqual([undefined]);
    const redirects = readFileSync(`${SITE}site/_redirects`, "utf8");
    expect(redirects).toContain("/manifest.json /404.html 200\n");
    expect(redirects).toContain("/.pagedeck/* /404.html 200\n");
  });
});

describe("the home page, playdeck.video's copy", () => {
  const main = () => present(parse(PATHS.home).querySelector("main"), "<main>");

  test("is titled and headed as playdeck.video's", () => {
    expect(parse(PATHS.home).title).toBe("Playdeck: a video player you compose");
    expect([...main().querySelectorAll("h1")].map(text)).toEqual(["Playdeck"]);
    expect(text(main().querySelector(".pd-thesis__display"))).toBe("A video player you compose, not one you configure.");
    expect(text(main().querySelector(".pd-thesis__lede"))).toBe(
      "React primitives and hooks over native video, HLS, YouTube, Vimeo and Wistia. You write the markup, you write the CSS, and the same six lines drive all five.",
    );
  });

  test("carries the install command, its copy button hidden until the island hydrates, and Start", () => {
    const install = present(main().querySelector('[data-fw-component="copy_install"]'), "the copy island");
    expect(text(install.querySelector("code"))).toBe("pnpm add @playdeck/react");
    expect(install.querySelector("button")?.hasAttribute("hidden")).toBe(true);
    expect([...main().querySelectorAll(".pd-thesis a")].map((a) => [text(a), a.getAttribute("href")])).toEqual([
      ["Start →", DOCS.start],
    ]);
  });

  test("holds the four feature cards, each with its snippet highlighted", () => {
    const cards = [...main().querySelectorAll(".pd-card")];
    expect(cards.map((card) => [text(card.querySelector("h2")), card.getAttribute("href")])).toEqual([
      ["Compose it", DOCS.reference],
      ["Style it", DOCS.contract],
      ["Ask what the provider can do", DOCS.capabilities],
      ["Recover from refused autoplay", DOCS.reference],
    ]);
    for (const card of cards) expect(card.querySelector("pre.shiki")).not.toBeNull();
  });

  test("closes on the measured line, Start, and the ways onward", () => {
    expect(text(main().querySelector(".pd-close__measured"))).toBe(
      "23 kB gzipped, the whole of what @playdeck/react ships. Adding YouTube costs 7 kB. 0 requests to a provider before play.",
    );
    expect([...main().querySelectorAll(".pd-close__links a")].map((a) => [text(a), a.getAttribute("href")])).toEqual([
      ["Reference →", DOCS.reference],
      ["Providers →", DOCS.providers],
      ["Examples →", PATHS.examples],
    ]);
  });

  test("has no bench and no link to /design", () => {
    expect(main().querySelector("video, iframe, .bench")).toBeNull();
    for (const path of PAGES) expect(hrefs(parse(path)).filter((href) => /\/design\/?$/.test(href ?? "")), path).toEqual([]);
  });
});

describe("the examples page", () => {
  const main = () => present(parse(PATHS.examples).querySelector("main"), "<main>");

  test("is headed Examples, with a section per archetype and the media's licence", () => {
    expect(parse(PATHS.examples).title).toBe("Examples — Playdeck");
    expect(text(main().querySelector("h1"))).toBe("Examples");
    expect([...main().querySelectorAll(".pd-archetype > h2")].map((h2) => [h2.id, text(h2)])).toEqual([
      ["streaming-service", "A streaming service"],
      ["course-platform", "A course platform"],
      ["media", "Media and licence"],
    ]);
  });

  test("renders each player dormant, on the server, inside its own section", () => {
    const streaming = present(main().querySelector('#streaming-service ~ .pd-stage [data-fw-component="streaming_service"]'), "the streaming player");
    const course = present(main().querySelector('#course-platform ~ .pd-stage [data-fw-component="course_platform"]'), "the course player");
    expect(streaming.querySelector('button[aria-label="Play from the beginning"]')).not.toBeNull();
    expect(streaming.querySelector('button[aria-label="Resume from 0:18"]')).not.toBeNull();
    expect(course.querySelector('button[aria-label="Start the lesson"]')).not.toBeNull();
    // Dormant: no source is set before a press.
    expect(main().querySelectorAll("video[src], source[src], iframe")).toHaveLength(0);
  });

  test("prints each archetype's files exactly as they are on disk", () => {
    const wells = [...main().querySelectorAll(".pd-source")].map((source) => [text(source.querySelector("summary")), source]);
    expect(wells.map(([path]) => path)).toEqual([
      "sites/playdeck/components/archetype-streaming-service.tsx",
      "sites/playdeck/styles/archetype-streaming-service.css",
      "sites/playdeck/components/archetype-course-platform.tsx",
      "sites/playdeck/styles/archetype-course-platform.css",
    ]);
    for (const [path, source] of wells) {
      const lines = [...(source as Element).querySelectorAll(".line")].map((line) => line.textContent);
      const file = readFileSync(`${SITE}${String(path).replace("sites/playdeck/", "")}`, "utf8").trimEnd();
      expect(lines.join("\n"), String(path)).toBe(file);
    }
  });
});

describe("the comparison guide", () => {
  const doc = () => parse(PATHS.comparison);
  const prose = () => present(doc().querySelector("main .pd-docs .pd-doc .pd-prose"), "the guide's prose");
  const SOURCES = fileURLToPath(new URL("../comparison/", import.meta.url));

  test("is headed as playdeck's guide, under the docs layout", () => {
    expect(doc().title).toBe("React video library comparison");
    expect([...doc().querySelectorAll("main h1")].map(text)).toEqual(["React video library comparison"]);
  });

  test("renders the three documents in order, each anchored and headed one level down", () => {
    const anchors = [...prose().querySelectorAll("a[id]:not([href])")].map((a) => a.id);
    expect(anchors).toEqual(["comparison-results", "comparison-features", "comparison-method"]);
    expect([...prose().querySelectorAll("h2")].map(text)).toEqual([
      "React video library comparison: measured figures",
      "React video library comparison: features",
      "Comparing Playdeck against other React video libraries: method",
    ]);
  });

  test("the results table is results.md's, row for row", () => {
    // The header and each body row; the delimiter row draws none.
    const rows = readFileSync(`${SOURCES}results.md`, "utf8").split("\n").filter((line) => line.startsWith("| ")).length - 1;
    const table = present(prose().querySelector('[aria-label="React video library comparison: measured figures"] table'), "the results table");
    expect(table.querySelectorAll("tr")).toHaveLength(rows);
  });

  test("the features table draws an icon beside every status word, and links each to its note", () => {
    const table = present(prose().querySelector("table.cmp-features"), "the features table");
    const statuses = [...table.querySelectorAll("td .cmp-status")];
    const axes = readFileSync(`${SOURCES}features.md`, "utf8").split("\n").filter((line) => line.startsWith("| ")).length - 2;
    expect(statuses.length).toBe(axes * 6);
    for (const status of statuses) {
      expect(status.querySelector("svg.cmp-status__icon")?.getAttribute("aria-hidden")).toBe("true");
      expect(text(status.querySelector(".cmp-status__word"))).toBe(status.getAttribute("data-status"));
    }
    const notes = [...prose().querySelectorAll(".cmp-footnotes li")];
    expect(notes).toHaveLength(192);
    for (const link of table.querySelectorAll("sup a")) {
      const note = present(doc().getElementById(String(link.getAttribute("href")).slice(1)), link.getAttribute("href") ?? "");
      expect(note.closest(".cmp-footnotes")).not.toBeNull();
    }
  });

  test("puts every table in a labelled region that scrolls", () => {
    const tables = [...prose().querySelectorAll("table")];
    expect(tables.length).toBeGreaterThanOrEqual(2);
    for (const table of tables) {
      const region = present(table.parentElement, "the table's region");
      expect(region.className).toBe("cmp-table");
      expect(region.getAttribute("role")).toBe("region");
      expect(region.getAttribute("tabindex")).toBe("0");
      expect(region.getAttribute("aria-label")?.length).toBeGreaterThan(0);
    }
  });

  test("its sources are playdeck's docs/comparison, generated, and not edited here", () => {
    for (const file of ["results.md", "features.md", "method.md"]) {
      expect(readFileSync(`${SOURCES}${file}`, "utf8").startsWith("<!--\n  Generated by `pnpm compare:") || file === "method.md", file).toBe(
        true,
      );
    }
  });
});

describe("the docs' search page", () => {
  test("is headed Search, under the docs layout, with the search island", () => {
    const doc = parse(PATHS.search);
    expect(doc.title).toBe("Search");
    // The docs' grid, with no nav until #52 brings the docs.
    expect(doc.querySelector('main .pd-docs nav[aria-label="Documentation"]')).toBeNull();
    expect(text(doc.querySelector("main .pd-docs .pd-doc > h1"))).toBe("Search");
    expect(doc.querySelector('main [data-fw-component="search"] input')).not.toBeNull();
  });

  test("the index is built", () => {
    expect(manifest.files).toEqual(expect.arrayContaining(["/search/en/index.json", "/search/en/documents.json"]));
  });
});
