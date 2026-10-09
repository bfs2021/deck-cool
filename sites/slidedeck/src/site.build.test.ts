import { QUERY_CAP } from "@pagedeck/search";
import { Window, type Document, type Element } from "happy-dom";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { REPOSITORY } from "../components/links.ts";
import { slidedeck } from "../components/slidedeck.ts";
import { CONTENT_SECURITY_POLICY, DECK_STYLE_HASHES } from "./csp.ts";
import { libraries, size, version } from "./facts.ts";
import { SITE_ORIGIN } from "./seo.ts";
import { BUILD_OUTPUT } from "./build.global-setup.ts";
import { headersFor, parseHeaders } from "./serve-site.ts";

// Reads the build build.global-setup.ts makes.

const SITE = fileURLToPath(new URL("..", import.meta.url));
const OUT = `${SITE}site`;
const BRAND = fileURLToPath(new URL("../../../packages/brand/public/", import.meta.url));


/** The site's pages, by path and file. */
const PAGES = [
  ["/", "index.html"],
  ["/examples/", "examples/index.html"],
] as const;

const window = new Window();

function parse(file: string): Document {
  return new window.DOMParser().parseFromString(readFileSync(`${OUT}/${file}`, "utf8"), "text/html");
}

const home = () => parse("index.html");
const examples = () => parse("examples/index.html");

/** Narrows away `null` and `undefined`, failing the test when the value is missing. */
function present<T>(value: T | null | undefined, what: string): T {
  if (value == null) throw new Error(`${what} is missing`);
  return value;
}

/** The element's text, with runs of white space as one space. */
function text(element: Element | null | undefined): string | undefined {
  return element?.textContent?.replace(/\s+/g, " ").trim();
}

function links(scope: Element | Document): [string | undefined, string | null][] {
  return [...scope.querySelectorAll("a")].map((a) => [text(a), a.getAttribute("href")]);
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

/** manifest.json's file paths and each tree's declared 404 page, checked as they are read. */
function readManifest(): { paths: string[]; notFound: unknown[] } {
  const value: unknown = JSON.parse(readFileSync(`${OUT}/manifest.json`, "utf8"));
  if (!isRecord(value) || !Array.isArray(value.files) || !isRecord(value.routing) || !Array.isArray(value.routing.trees)) {
    throw new Error("manifest.json has no files or no routing.trees");
  }
  return {
    paths: value.files.map((file: unknown) =>
      present(isRecord(file) && typeof file.path === "string" ? file.path : undefined, "a manifest file's path"),
    ),
    notFound: value.routing.trees.map((tree: unknown) => (isRecord(tree) ? tree.notFound : undefined)),
  };
}

const manifest = readManifest();

interface BudgetPage {
  path: string;
  limit: number;
  actual: number;
}

const budget = (JSON.parse(readFileSync(`${SITE}.pagedeck/budget-report.json`, "utf8")) as { pages: BudgetPage[] })
  .pages;

describe("the JavaScript budget", () => {
  test("covers every page", () => {
    expect(budget.map((page) => page.path).sort()).toEqual(PAGES.map(([path]) => path).sort());
  });

  // A page's budget is what it ships, rounded up to the next KB: a page that
  // ships more breaks the build, and one that ships much less needs its budget lowered.
  test.each(PAGES)("%s ships the islands it renders, within a KB of its budget", (path) => {
    const page = present(
      budget.find((each) => each.path === path),
      `${path}'s budget`,
    );
    expect(page.actual).toBeGreaterThan(0);
    expect(page.limit - page.actual).toBeGreaterThanOrEqual(0);
    expect(page.limit - page.actual).toBeLessThan(1024);
  });
});

describe.each(PAGES)("%s's <head>", (path, file) => {
  const doc = () => parse(file);

  test("links the slidedeck icons and one hashed stylesheet, and sets the viewport", () => {
    const head = [...doc().head.querySelectorAll("link")].map((link) => [link.getAttribute("rel"), link.getAttribute("href")]);
    expect(head).toEqual(
      expect.arrayContaining([
        ["icon", slidedeck.icons.still],
        ["apple-touch-icon", slidedeck.icons.appleTouch],
        ["stylesheet", expect.stringMatching(/^\/assets\/[^/]+\.css$/)],
      ]),
    );
    expect(head.filter(([rel]) => rel === "stylesheet")).toHaveLength(1);
    expect(doc().head.querySelector('meta[name="viewport"]')?.getAttribute("content")).toBe(
      "width=device-width, initial-scale=1",
    );
  });

  test("names its canonical and og:url on slide.deck.cool, and describes the page", () => {
    const head = doc().head;
    expect(head.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe(`${SITE_ORIGIN}${path}`);
    expect(head.querySelector('meta[property="og:url"]')?.getAttribute("content")).toBe(`${SITE_ORIGIN}${path}`);
    expect(head.querySelector('meta[property="og:site_name"]')?.getAttribute("content")).toBe("slidedeck");
    const description = head.querySelector('meta[name="description"]')?.getAttribute("content");
    expect(description).toMatch(/^.{60,}$/);
    expect(head.querySelector('meta[property="og:description"]')?.getAttribute("content")).toBe(description);
  });

  test("shares a 1200 by 630 social card the build drew", () => {
    const head = doc().head;
    const image = present(head.querySelector('meta[property="og:image"]')?.getAttribute("content"), "og:image");
    expect(image.startsWith(`${SITE_ORIGIN}/`)).toBe(true);
    const png = readFileSync(`${OUT}${new URL(image).pathname}`);
    // The PNG's IHDR chunk: width, then height.
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1200, 630]);
    expect(head.querySelector('meta[property="og:image:width"]')?.getAttribute("content")).toBe("1200");
    expect(head.querySelector('meta[property="og:image:height"]')?.getAttribute("content")).toBe("630");
  });

  test("opens with the Family bar, slidedeck's, with search in it", () => {
    const html = readFileSync(`${OUT}/${file}`, "utf8");
    const at = (needle: string) => {
      const index = html.indexOf(needle);
      expect(index, needle).toBeGreaterThanOrEqual(0);
      return index;
    };
    // Outside <main>, so the header is the page's banner landmark.
    expect(at('<header class="family-bar" data-deck="slidedeck"')).toBeLessThan(at("<main>"));
    const bar = present(doc().querySelector("header.family-bar nav"), "the bar's row");
    expect(links(present(bar.querySelector(".family-bar__links"), "the bar's links"))).toEqual([
      ["Docs", "/docs/"],
      ["Examples", "/examples/"],
      ["GitHub", REPOSITORY],
    ]);
    expect(links(bar).filter(([label]) => label === "Install")).toEqual([["Install", "/docs/install/"]]);
    expect(bar.querySelector('input[type="search"]')).not.toBeNull();
    expect(text(bar.querySelector("label"))).toBe("Search the docs");
  });

  test("carries no inline script or handler, and no <style> but the decks', each hashed in the CSP", () => {
    const page = doc();
    for (const element of page.querySelectorAll("*")) {
      for (const { name } of element.attributes) expect(name, element.tagName).not.toMatch(/^on/);
    }
    // script-src 'self': every script that runs is a file, and the rest are data.
    for (const script of page.querySelectorAll("script")) {
      if (script.hasAttribute("src")) expect(script.getAttribute("src"), script.outerHTML).toMatch(/^\/[^/]/);
      else expect(script.getAttribute("type"), script.outerHTML.slice(0, 120)).toBe("application/ld+json");
    }
    const html = readFileSync(`${OUT}/${file}`, "utf8");
    for (const [style, href = "", css = ""] of html.matchAll(/<style([^>]*)>([\s\S]*?)<\/style>/g)) {
      const name = /^ data-precedence="slidedeck" data-href="([^"]+)"$/.exec(href)?.[1];
      expect(name, style.slice(0, 120)).toBeDefined();
      const hash = `'sha256-${createHash("sha256").update(css).digest("base64")}'`;
      expect(DECK_STYLE_HASHES[name as keyof typeof DECK_STYLE_HASHES], name).toBe(hash);
    }
  });

  test("the footer follows <main>", () => {
    const footer = present(doc().querySelector("main + footer"), "the footer");
    expect([...footer.querySelectorAll("span")].map(text)).toEqual([
      "MIT licensed.",
      "Built with pagedeck. Served by Cloudflare.",
    ]);
  });
});

/** The text of the one stylesheet the home page links. */
function stylesheet(): string {
  const href = present(home().head.querySelector('link[rel="stylesheet"]')?.getAttribute("href"), "the stylesheet link");
  return readFileSync(`${OUT}${href}`, "utf8");
}

test("the stylesheet holds brand.css, then family-bar.css, then slidedeck.css", () => {
  const css = stylesheet();
  // Each sheet's first or last rule.
  const brand = css.indexOf("--ground-page");
  const bar = css.indexOf("@keyframes family-bar-roll");
  const own = css.indexOf("--font-mono");
  expect(brand).toBeGreaterThanOrEqual(0);
  expect(brand).toBeLessThan(bar);
  expect(bar).toBeLessThan(own);
});

test("slidedeck.css times every transition with the brand's one easing curve", () => {
  const css = readFileSync(`${SITE}styles/slidedeck.css`, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const transitions = [...css.matchAll(/\btransition(?:-timing-function)?:([^;}]+)/g)].map(([, value]) => value?.trim());
  expect(transitions).not.toHaveLength(0);
  for (const value of transitions) {
    for (const part of value?.split(",") ?? []) expect(part, value).toMatch(/var\(--ease\)/);
  }
  expect(css).not.toMatch(/cubic-bezier/);
  // The one animation follows the scroll, not the clock, so it has no curve of its own.
  const animations = [...css.matchAll(/\banimation:([^;}]+)/g)].map(([, value]) => value?.trim());
  expect(animations).toEqual(["feature-focus linear both"]);
});

test("the site serves no stylesheet but the hashed one", () => {
  const sheets = manifest.paths.filter((path) => path.endsWith(".css"));
  expect(sheets).toHaveLength(1);
  expect(sheets[0]).toMatch(/^\/assets\//);
});

test("the social card's font is the build's alone: the site serves no font", () => {
  const font = readFileSync(`${SITE}fonts/Inter-SemiBold.woff`);
  expect(manifest.paths.filter((path) => /\.(woff2?|ttf|otf)$/.test(path))).toEqual([]);
  for (const file of readdirSync(OUT, { recursive: true, encoding: "utf8" })) {
    const path = `${OUT}/${file}`;
    if (statSync(path).isFile()) expect(readFileSync(path).equals(font), file).toBe(false);
  }
  expect(readFileSync(`${SITE}fonts/OFL.txt`, "utf8")).toContain("SIL Open Font License, Version 1.1");
});

test("the icons are the brand's, byte for byte", () => {
  for (const path of [slidedeck.icons.still, slidedeck.icons.appleTouch]) {
    expect(readFileSync(`${OUT}${path}`).equals(readFileSync(`${BRAND}${path.slice(1)}`)), path).toBe(true);
  }
});

describe("the home page, its copy as slidedeck.pages.dev had it", () => {
  test("is titled as before", () => {
    expect(home().title).toBe("slidedeck: a React carousel built on native scroll snap");
  });

  test("the hero states the version and the size, and links the quickstart and the repo", () => {
    const hero = present(home().querySelector(".landing-hero"), "the hero");
    expect(text(hero.querySelector(".landing-eyebrow"))).toBe(`slidedeck ${version}`);
    expect(text(hero.querySelector("h1"))).toBe("Smooth. Natively.");
    expect(text(hero.querySelector(".landing-lede"))).toBe(
      `A carousel for React that lets the browser do the scrolling. Native momentum, native snapping and native focus scrolling, in ${size} min+gzip.`,
    );
    expect(links(hero)).toEqual([
      ["Get started", "/docs/quickstart/"],
      ["View on GitHub ›", REPOSITORY],
    ]);
  });

  // The shapes, not the values: each release of slidedeck brings its own.
  test("reads the installed @slidedeck/react's version and size", () => {
    expect(version).toMatch(/^\d+\.\d+$/);
    expect(size).toMatch(/^\d+\.\d\d KB$/);
  });

  test("the sections follow in order", () => {
    const sections = [...home().querySelectorAll("main section[aria-labelledby]")];
    expect(sections.map((section) => text(home().getElementById(section.getAttribute("aria-labelledby") ?? "")))).toEqual([
      "Get to know slidedeck.",
      "Feels native. Because it is.",
      "Scroll it. It bends.",
      "A few components.One deck.",
      "Built with slidedeck.",
      "Compare.",
    ]);
  });

  test("renders its four decks on the server, each a labelled carousel", () => {
    const labels = [...home().querySelectorAll('main [aria-roledescription="carousel"]')].map((deck) =>
      deck.getAttribute("aria-label"),
    );
    expect(labels).toEqual(["Features", "Curve effect", "Product photos", "Travel stories"]);
  });

  test("the quickstart is the README's, highlighted, in a block the keyboard reaches", () => {
    const code = present(home().querySelector(".landing-quickstart pre"), "the quickstart");
    expect(code.getAttribute("tabindex")).toBe("0");
    expect(code.classList.contains("github-dark-default")).toBe(true);
    expect(code.textContent).toMatch(/^import \* as Deck from '@slidedeck\/react';\n/);
    expect(text(home().querySelector(".landing-install"))).toBe("pnpm add @slidedeck/react");
  });

  test("the comparison is the README's, one tile per library", () => {
    const tiles = [...home().querySelectorAll(".landing-compare li")];
    expect(tiles.map((tile) => text(tile.querySelector("strong")))).toEqual(libraries.map((row) => row.size));
    expect(tiles.map((tile) => text(tile.querySelector("h3")))).toContain("@slidedeck/react");
  });
});

describe("the Examples page", () => {
  test("is titled as before", () => {
    expect(examples().title).toBe("Examples: decks built with slidedeck");
  });

  test("shows each example in order, its deck rendered on the server", () => {
    const sections = [...examples().querySelectorAll("main section.example")];
    expect(sections.map((section) => text(section.querySelector("h2")))).toEqual([
      "Product gallery",
      "Hero banner",
      "Testimonials",
      "Stories",
      "Right to left",
      "Cover flow",
    ]);
    expect(sections.map((section) => section.querySelector('[aria-roledescription="carousel"]')?.getAttribute("aria-label"))).toEqual([
      "Product photos",
      "Trips",
      "Customer reviews",
      "Travel stories",
      "وجهات للسفر",
      "Albums",
    ]);
  });

  test("credits every photo it shows, linking its page on Unsplash", () => {
    const credits = links(present(examples().querySelector(".examples-credits"), "the credits"));
    expect(credits.length).toBeGreaterThan(10);
    for (const [, href] of credits) expect(href).toMatch(/^https:\/\/unsplash\.com\/photos\/[\w-]+$/);
  });
});

describe("every page", () => {
  test.each(PAGES)("%s shows only images the site serves", (_path, file) => {
    for (const img of parse(file).querySelectorAll("img")) {
      const src = present(img.getAttribute("src"), "an image's src");
      expect(existsSync(`${OUT}${src}`), src).toBe(true);
    }
  });

  // Until #51 builds /docs/, the links there have no page; the build only warns.
  test("every link the build warns names nothing is under /docs/", () => {
    const output = readFileSync(BUILD_OUTPUT, "utf8");
    const broken = [...output.matchAll(/^pagedeck: {3}en \S+ — "([^"]+)"$/gm)].map(([, href]) => href);
    if (output.includes("references name nothing this build emitted")) expect(broken).not.toHaveLength(0);
    for (const href of broken) expect(href).toMatch(/^\/docs\//);
  });

  test.each(PAGES)("%s links only pages the site builds, or the docs to come", (_path, file) => {
    for (const [, href] of links(parse(file))) {
      if (href === null || !href.startsWith("/") || href.startsWith("/docs/")) continue;
      const path = href.split("#")[0] ?? "";
      expect(existsSync(`${OUT}${path.endsWith("/") ? `${path}index.html` : path}`), href).toBe(true);
    }
  });

  // CONTEXT.md: each package site links its own deck's repo, never the maintainer's profile.
  test.each(readdirSync(OUT, { recursive: true, encoding: "utf8" }).filter((file) => file.endsWith(".html")))(
    "%s links nothing on github.com but slidedeck's repo",
    (file) => {
      const html = readFileSync(`${OUT}/${file}`, "utf8");
      for (const [, href] of html.matchAll(/href="(https?:\/\/(?:[^/"]+\.)?github\.com[^"]*)"/gi)) {
        expect(href).toBe(REPOSITORY);
      }
    },
  );
});

test("the search index holds the two pages, within what one keystroke may fetch", () => {
  const index = `${OUT}/search/en/`;
  const documents = JSON.parse(readFileSync(`${index}documents.json`, "utf8")) as { path: string; title?: string }[];
  expect(documents.map(({ path }) => path)).toEqual(["/", "/examples/"]);
  const bytes = readdirSync(index).reduce((total, file) => total + statSync(`${index}${file}`).size, 0);
  expect(bytes).toBeLessThanOrEqual(QUERY_CAP);
});

test("the sitemap and robots.txt name slide.deck.cool", () => {
  const sitemap = readFileSync(`${OUT}/sitemap-en.xml`, "utf8");
  expect([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(([, loc]) => loc)).toEqual([
    `${SITE_ORIGIN}/`,
    `${SITE_ORIGIN}/examples/`,
  ]);
  expect(readFileSync(`${OUT}/robots.txt`, "utf8")).toContain(`Sitemap: ${SITE_ORIGIN}/sitemap.xml`);
});

const rules = parseHeaders(readFileSync(`${OUT}/_headers`, "utf8"));
/** Every path the host serves: each page, and each file but the ones wrangler reads as configuration. */
const served = [...PAGES.map(([path]) => path), ...manifest.paths.filter((path) => !/^\/_(headers|redirects)$/.test(path))];

/** The headers every response carries, page or file. */
const EVERY_RESPONSE = {
  [CONTENT_SECURITY_POLICY.name]: CONTENT_SECURITY_POLICY.value,
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
};

describe("the served headers", () => {
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

  test("_headers caches /assets/, which holds only hashed names, as immutable, and nothing else", () => {
    const assets = served.filter((path) => path.startsWith("/assets/"));
    expect(assets.filter((path) => path.endsWith(".js"))).not.toHaveLength(0);
    // A hashed name (`name-AbCd1234.js`) outside /assets/ would need its own rule (docs/deploy.md).
    const hashed = /[.-][A-Za-z0-9_-]{8}\.(css|js)$/;
    for (const path of served) {
      if (hashed.test(path)) expect(path.startsWith("/assets/"), path).toBe(true);
    }
    for (const path of served) {
      expect(headersFor(rules, path).get("Cache-Control"), path).toBe(
        path.startsWith("/assets/") ? "public, max-age=31536000, immutable" : undefined,
      );
    }
  });

  test(".assetsignore keeps the deploy manifest, the deploy directory and the fallback 404 out of the upload", () => {
    const ignored = readFileSync(`${OUT}/.assetsignore`, "utf8")
      .split("\n")
      .filter((line) => line !== "" && !line.startsWith("#"));
    expect(ignored).toEqual(["/manifest.json", "/.pagedeck", "/404.html"]);
    expect(manifest.notFound.map((page) => page ?? undefined)).toEqual([undefined]);
    const redirects = readFileSync(`${OUT}/_redirects`, "utf8");
    expect(redirects).toContain("/manifest.json /404.html 200\n");
    expect(redirects).toContain("/.pagedeck/* /404.html 200\n");
  });
});
