// A copy of sites/slidedeck/src/live-check.ts with this site's paths, and the
// font sheet besides the main one. #56 moves the sites' shared plumbing into one
// package; this file goes with it.
import { HASHED_FILE_HEADERS, RESPONSE_HEADERS } from "./headers.ts";

/** Every page, and the embed demo's script, none content-hashed, so none may be immutable. */
const SERVED = ["/", "/interactive/", "/features/", "/server-data/", "/docs/search/", "/embed/demo-embed.js"];
/** Proxied to the fallback 404 page, which .assetsignore keeps out of the upload. */
const NOT_UPLOADED = "/manifest.json";
/** No page, no file and no redirect: with no 404 page, Cloudflare answers a bare 404. */
const MISSING = "/no-such-page/";

/** The stylesheets the build names by their content's hash: the one sheet, which `/` links, and the subset font's, which only `/features/` links. */
const SHEETS = [
  { page: "/", directory: "/assets/" },
  { page: "/features/", directory: "/fonts/" },
] as const;

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
  const bodies = new Map<string, string>();
  for (const path of SERVED) {
    const { response, body } = await get(origin, path);
    bodies.set(path, body);
    if (response.status !== 200) failures.push(`${path}: status ${response.status}, expected 200`);
    failures.push(...headerFailures(path, response, RESPONSE_HEADERS));
    if (/\bimmutable\b/.test(response.headers.get("Cache-Control") ?? "")) {
      failures.push(`${path}: Cache-Control is immutable, but ${path} is not content-hashed`);
    }
  }

  for (const { page, directory } of SHEETS) {
    const pattern = new RegExp(`<link rel="stylesheet" href="(${directory}[^"]+)"`);
    const sheet = pattern.exec(bodies.get(page) ?? "")?.[1];
    if (sheet === undefined) {
      failures.push(`${page}: links no stylesheet under ${directory}`);
      continue;
    }
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
