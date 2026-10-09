import { Window, type Document, type Element } from "happy-dom";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { decks } from "@deck-cool/brand/decks";
import { DOCS_ORIGIN, PATHS, REPO } from "../components/links.ts";
import { formatBytes, utf8Bytes } from "./bytes.ts";
import { CONTENT_SECURITY_POLICY } from "./csp.ts";
import { PRODUCT } from "./product.ts";
import { headersFor, parseHeaders } from "./serve-site.ts";

// Reads the build that build.global-setup.ts writes.

const SITE = fileURLToPath(new URL("..", import.meta.url));
const BRAND = fileURLToPath(new URL("../../../packages/brand/public/", import.meta.url));
const pagedeck = decks.find((deck) => deck.name === "pagedeck");
if (pagedeck === undefined) throw new Error("the decks module has no pagedeck");

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

function parse(path: string): Document {
  return new window.DOMParser().parseFromString(html(path), "text/html");
}

/** The element's text, with runs of white space as one space. */
function text(element: Element | null | undefined): string | undefined {
  return element?.textContent?.replace(/\s+/g, " ").trim();
}

function hrefs(scope: Element | Document): (string | null)[] {
  return [...scope.querySelectorAll("a")].map((a) => a.getAttribute("href"));
}

const PAGES = [PATHS.home, PATHS.search, PATHS.features, PATHS.interactive, PATHS.serverData];

test("the site is the landing's four pages and the docs' search page", () => {
  expect(manifest.pages.map((page) => page.path).sort()).toEqual([...PAGES].sort());
});

describe("budgets, measured and pinned", () => {
  // Spelled again rather than imported, so a limit raised in the config fails here.
  // Each is the page's measured size rounded up to a whole kilobyte, and none is
  // above the landing's own (pagedeck's packages/landing): 60kb, 62kb and 60kb.
  const PINNED: Record<string, string> = {
    [PATHS.home]: "0b",
    [PATHS.interactive]: "60kb",
    [PATHS.features]: "60kb",
    [PATHS.serverData]: "59kb",
    [PATHS.search]: "59kb",
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

  test("the home page ships 0 B of JavaScript, and no script at all", () => {
    expect(budget.find((row) => row.path === PATHS.home)?.actual).toBe(0);
    expect(parse(PATHS.home).querySelectorAll("script, link[rel=modulepreload]")).toHaveLength(0);
  });

  test("each page with islands carries only its own", () => {
    const islands = Object.fromEntries(manifest.pages.map((page) => [page.path, [...page.components].sort()]));
    expect(islands).toEqual({
      [PATHS.home]: [],
      [PATHS.interactive]: ["counter"],
      [PATHS.features]: ["consent_banner", "island_idle", "island_load", "island_visible", "search"],
      [PATHS.serverData]: ["variant_picker"],
      [PATHS.search]: ["search"],
    });
  });
});

describe("every page", () => {
  test.each(PAGES)("%s links the pagedeck icons and one hashed stylesheet from <head>, and declares a viewport", (path) => {
    const doc = parse(path);
    const head = [...doc.head.querySelectorAll("link:not([rel=modulepreload])")].map((link) => [
      link.getAttribute("rel"),
      link.getAttribute("href"),
    ]);
    expect(head).toEqual(
      expect.arrayContaining([
        ["icon", pagedeck.icons.still],
        ["apple-touch-icon", pagedeck.icons.appleTouch],
      ]),
    );
    expect(head.filter(([rel]) => rel === "stylesheet")).toEqual([["stylesheet", expect.stringMatching(/^\/assets\/[^/]+\.css$/)]]);
    expect(doc.head.querySelectorAll('meta[name="viewport"]')).toHaveLength(1);
    expect(doc.head.querySelector('meta[name="viewport"]')?.getAttribute("content")).toBe("width=device-width, initial-scale=1");
    expect(doc.head.querySelector('meta[name="description"]')?.getAttribute("content")?.length).toBeGreaterThanOrEqual(50);
    expect(doc.documentElement.getAttribute("lang")).toBe("en");
  });

  test.each(PAGES)("%s opens with the Family bar, set to pagedeck, and closes with the footer", (path) => {
    const doc = parse(path);
    const bar = present(doc.querySelector("body header.family-bar"), "the Family bar");
    expect(bar.getAttribute("data-deck")).toBe("pagedeck");
    expect(doc.querySelector("header.family-bar ~ main")).not.toBeNull();
    expect(doc.querySelector("main + footer")).not.toBeNull();
    expect(text(bar.querySelector(".family-bar__name"))).toBe("pagedeck");
    expect(
      [...bar.querySelectorAll(".family-bar__links a")].map((a) => [text(a), a.getAttribute("href")]),
    ).toEqual([
      ["Docs", `${DOCS_ORIGIN}/`],
      ["Features", PATHS.features],
      ["Island demo", PATHS.interactive],
      ["Server data", PATHS.serverData],
      ["Search", PATHS.search],
      ["GitHub", REPO],
    ]);
  });

  // CONTEXT.md: a package site links its own deck's repo, never the maintainer's profile.
  test.each(PAGES)("%s links github.com only at pagedeck's repo", (path) => {
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
    const site = css.indexOf(".fw-wrap");
    expect(brand).toBeGreaterThanOrEqual(0);
    expect(brand).toBeLessThan(bar);
    expect(css.lastIndexOf(".family-bar")).toBeLessThan(site);
  });

  test("sets type in the brand's system stack, with no web font, and eases on the brand's one curve", () => {
    const css = stylesheet();
    expect(css).not.toMatch(/@font-face|Fira Sans|Bahnschrift/);
    expect(css).not.toMatch(/--fw-/);
    for (const [curve] of css.matchAll(/cubic-bezier\([^)]*\)/g)) expect(curve.replace(/\s/g, "")).toBe("cubic-bezier(.32,.72,0,1)");
  });

  test("is the only stylesheet the site serves", () => {
    const sheets = manifest.files.filter((path) => path.endsWith(".css"));
    expect(sheets).toHaveLength(1);
    expect(sheets[0]).toMatch(/^\/assets\//);
  });

  test("the icons are the brand kit's, byte for byte", () => {
    for (const path of [pagedeck.icons.still, pagedeck.icons.appleTouch]) {
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

  test("_headers sends a Permissions-Policy that turns off every powerful feature", () => {
    for (const path of served) {
      const features = headersFor(rules, path).get("Permissions-Policy")?.split(", ") ?? [];
      for (const feature of features) expect(feature, path).toMatch(/^[a-z-]+=\(\)$/);
      expect(features, path).toEqual(expect.arrayContaining(["camera=()", "microphone=()", "geolocation=()", "payment=()"]));
    }
  });

  test("_headers caches content-hashed files as immutable, and nothing else", () => {
    const hashed = /[.-][A-Za-z0-9_-]{8}\.[a-z0-9]+$/;
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

describe("the home page, the landing page's copy", () => {
  const main = () => present(parse(PATHS.home).querySelector("main"), "<main>");

  test("is titled and headed as the landing was", () => {
    expect(parse(PATHS.home).title).toBe("Pagedeck: Zero JavaScript until a page needs it");
    expect(text(main().querySelector("h1"))).toBe("Zero JavaScript until a page needs it");
    expect(text(main().querySelector(".fw-hero__lede"))).toBe(
      "A React framework for CMS-driven sites. Each page ships only what it uses.",
    );
    expect([...main().querySelectorAll(".fw-actions a")].map((a) => [text(a), a.getAttribute("href")])).toEqual([
      ["Build your first site", `${DOCS_ORIGIN}/tutorials/your-first-site`],
      ["See what one island costs", PATHS.interactive],
    ]);
  });

  test("holds the ruler, then a section per block of its markdown", () => {
    expect(main().querySelector("figure.fw-ruler")).not.toBeNull();
    expect([...main().querySelectorAll("section")].map((section) => section.className)).toEqual([
      "fw-section fw-section--compare",
      "fw-section fw-section--data",
      "fw-section fw-section--closing",
      "fw-section fw-section--sources",
    ]);
  });

  test("the ruler's Pagedeck row is the 0 B this build measured for the page", () => {
    const rows = [...main().querySelectorAll(".fw-ruler__row")].map((row) => [
      text(row.querySelector(".fw-ruler__name")),
      text(row.querySelector(".fw-ruler__value")),
    ]);
    expect(rows).toEqual([
      ["Next.js App Router", "133.1 kB"],
      ["Astro", "0 B"],
      ["Pagedeck", formatBytes(budget.find((row) => row.path === PATHS.home)?.actual ?? Number.NaN)],
    ]);
  });

  test("the data section's figures are /server-data's own", () => {
    const data = text(main().querySelector(".fw-section--data"));
    const props = present(
      parse(PATHS.serverData).querySelector('[data-fw-component="variant_picker"]')?.getAttribute("data-fw-props"),
      "the variant picker's props",
    );
    expect(data).toContain(`${formatBytes(utf8Bytes(JSON.stringify(PRODUCT)))} read`);
    expect(data).toContain(`${formatBytes(utf8Bytes(props))} sent`);
  });

  test("the sources say where Pagedeck's 0 B is set: this site's config", () => {
    expect(text(main().querySelector(".fw-section--sources"))).toContain("build.budget in sites/pagedeck/pagedeck.config.ts");
  });
});

describe("the features page", () => {
  test("keeps the landing's sections but the web font's", () => {
    const ids = [...parse(PATHS.features).querySelectorAll("main section.fw-feature")].map((section) => section.id);
    expect(ids).toEqual(["islands", "search", "consent", "images", "social-cards", "i18n"]);
  });

  test("draws its social card, and names it as og:image", () => {
    const card = present(parse(PATHS.features).querySelector('meta[property="og:image"]')?.getAttribute("content"), "og:image");
    expect(manifest.files).toContain(new URL(card, "https://page.deck.cool").pathname);
  });
});

describe("the docs' search page", () => {
  test("is headed Search, under the docs layout, with the search island", () => {
    const doc = parse(PATHS.search);
    expect(doc.title).toBe("Search");
    // The docs' grid, with no nav until #53 brings the docs.
    expect(doc.querySelector('main .fw-docs nav[aria-label="Documentation"]')).toBeNull();
    expect(text(doc.querySelector("main .fw-docs .fw-doc > h1"))).toBe("Search");
    expect(doc.querySelector('main [data-fw-component="search"] input')).not.toBeNull();
  });

  test("the index is built", () => {
    expect(manifest.files).toEqual(expect.arrayContaining(["/search/en/index.json", "/search/en/documents.json"]));
  });
});
