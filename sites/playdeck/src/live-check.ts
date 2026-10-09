// A copy of sites/slidedeck/src/live-check.ts with this site's paths, and the
// canonical links besides. #56 moves the sites' shared plumbing into one
// package; this file goes with it.
import { ORIGIN } from "../components/links.ts";
import { HASHED_FILE_HEADERS, RESPONSE_HEADERS } from "./headers.ts";

/** Every page, each of which names its own path on playdeck.video as canonical. */
const PAGES = ["/", "/examples/", "/guides/comparison/", "/docs/search/"];
/** The pages and the captions file, none content-hashed, so none may be immutable. */
const SERVED = [...PAGES, "/archetype-captions.vtt"];
/** Proxied to the fallback 404 page, which .assetsignore keeps out of the upload. */
const NOT_UPLOADED = "/manifest.json";
/** No page, no file and no redirect: with no 404 page, Cloudflare answers a bare 404. */
const MISSING = "/no-such-page/";

async function get(origin: string, path: string): Promise<{ response: Response; body: string }> {
  const response = await fetch(new URL(path, origin), { redirect: "manual" });
  return { response, body: await response.text() };
}

/** Lists every response header in `expected` that `response` lacks or holds at another value. */
function headerFailures(path: string, response: Response, expected: typeof RESPONSE_HEADERS): string[] {
  const failures: string[] = [];
  for (const { name, value } of expected) {
    const served = response.headers.get(name);
    if (served === null) failures.push(`${path}: ${name} missing`);
    else if (served !== value) failures.push(`${path}: ${name} is "${served}", expected "${value}"`);
  }
  return failures;
}

/**
 * Fetches a few paths from `origin` and lists every way they differ from what
 * the build declares. `httpOrigin` is the same host over plain HTTP, which the
 * zone's Always Use HTTPS must answer with a 301 to the same path at `origin`.
 */
export async function checkSite(origin: string, httpOrigin = origin.replace(/^https:/, "http:")): Promise<string[]> {
  const failures: string[] = [];
  let home = "";
  for (const path of SERVED) {
    const { response, body } = await get(origin, path);
    if (path === "/") home = body;
    if (response.status !== 200) failures.push(`${path}: status ${response.status}, expected 200`);
    failures.push(...headerFailures(path, response, RESPONSE_HEADERS));
    if (/\bimmutable\b/.test(response.headers.get("Cache-Control") ?? "")) {
      failures.push(`${path}: Cache-Control is immutable, but ${path} is not content-hashed`);
    }
    if (PAGES.includes(path)) {
      // playdeck.video stays canonical while the site is also served here (CONTEXT.md).
      const canonical = /<link rel="canonical" href="([^"]+)"/.exec(body)?.[1];
      const expected = new URL(path, ORIGIN).href;
      if (canonical === undefined) failures.push(`${path}: no canonical link, expected ${expected}`);
      else if (canonical !== expected) failures.push(`${path}: canonical is ${canonical}, expected ${expected}`);
    }
  }

  // The one stylesheet, which the build names by its content's hash.
  const sheet = /<link rel="stylesheet" href="(\/assets\/[^"]+)"/.exec(home)?.[1];
  if (sheet === undefined) {
    failures.push("/: links no stylesheet under /assets/");
  } else {
    const { response } = await get(origin, sheet);
    if (response.status !== 200) failures.push(`${sheet}: status ${response.status}, expected 200`);
    failures.push(...headerFailures(sheet, response, [...RESPONSE_HEADERS, ...HASHED_FILE_HEADERS]));
  }

  for (const path of [NOT_UPLOADED, MISSING]) {
    const { response } = await get(origin, path);
    if (response.status !== 404) failures.push(`${path}: status ${response.status}, expected 404`);
  }

  const plain = new URL("/", httpOrigin).href;
  const secure = new URL("/", origin).href;
  const redirect = await fetch(plain, { redirect: "manual" });
  const location = redirect.headers.get("Location");
  if (redirect.status !== 301) failures.push(`${plain}: status ${redirect.status}, expected 301 to ${secure}`);
  else if (location !== secure) failures.push(`${plain}: redirects to ${location ?? "nowhere"}, expected ${secure}`);
  return failures;
}
