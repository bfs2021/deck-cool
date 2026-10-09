import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SITE = fileURLToPath(new URL("..", import.meta.url));

/** What `pagedeck build` printed, its warnings among it, for site.build.test.ts. */
export const BUILD_OUTPUT = `${SITE}.pagedeck/build-output.txt`;

/** Builds the site once, before the test files that read its output. */
export default function setup() {
  execFileSync("pnpm", ["exec", "pagedeck", "sync"], { cwd: SITE });
  // Pagedeck prints its warnings to stderr, so both streams are kept.
  const output = execFileSync("sh", ["-c", "pnpm exec pagedeck build 2>&1"], { cwd: SITE, encoding: "utf8" });
  mkdirSync(`${SITE}.pagedeck`, { recursive: true });
  writeFileSync(BUILD_OUTPUT, output);
}
