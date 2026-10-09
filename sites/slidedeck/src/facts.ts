// What the home page states about the package, read from the installed
// @slidedeck/react's README and package.json when the site builds. Never
// retyped: a new release, with a new `pnpm compare` measurement, changes the
// page on the next build.
import { createMarkdownRenderer } from "@pagedeck/markdown-loader";
import { readFileSync } from "node:fs";
import { comparison, fence, slidedeckRow } from "./readme.ts";

const read = (file: string) => readFileSync(new URL(`../node_modules/@slidedeck/react/${file}`, import.meta.url), "utf8");

const readme = read("README.md");

/** The README's comparison, in its order. */
export const libraries = comparison(readme);

/** Slidedeck's min+gzip size, as the comparison measures it. */
export const size = slidedeckRow(libraries).size;

/** A release's `MAJOR.MINOR.PATCH` as "MAJOR.MINOR". A prerelease fails: the page would name it as the release. */
export function minorOf(version: string): string {
  const match = /^(\d+\.\d+)\.\d+$/.exec(version);
  if (match?.[1] === undefined) {
    throw new Error(`@slidedeck/react's version is "${version}", not MAJOR.MINOR.PATCH — install a release, not a prerelease`);
  }
  return match[1];
}

/** The installed version, as "1.0". */
export const version = minorOf((JSON.parse(read("package.json")) as { version: string }).version);

/** The README's install command. */
export const install = fence(readme, "Install");

/** The theme the site's code is highlighted in: dark, as the site is. */
export const CODE_THEME = "github-dark-default";

const renderer = await createMarkdownRenderer({ languages: ["tsx"], theme: CODE_THEME });

/** The README's quickstart, highlighted, as HTML. */
export const quickstart = (
  await renderer.render(`\`\`\`tsx\n${fence(readme, "Quickstart")}\n\`\`\`\n`, "@slidedeck/react/README.md")
).html;
