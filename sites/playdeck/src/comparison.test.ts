import { expect, test } from "vitest";
import { demoteHeadings, footnotes, iconizeFeaturesTable, rewriteTarget, scrollTables } from "./comparison.ts";

test("demotes every heading one level, but inside a fence and at ######", () => {
  expect(demoteHeadings("# A\n\n## B\n\n```sh\n# a comment\n```\n\n###### F")).toBe(
    "## A\n\n### B\n\n```sh\n# a comment\n```\n\n###### F",
  );
});

test("points a sibling document at its anchor, another file at playdeck's repo, and leaves the rest", () => {
  expect(rewriteTarget("./features.md")).toBe("#comparison-features");
  expect(rewriteTarget("method.md#features")).toBe("#features");
  expect(rewriteTarget("../../packages/react/README.md")).toBe(
    "https://github.com/pedrosousa13/playdeck/blob/main/packages/react/README.md",
  );
  expect(rewriteTarget("https://vidstack.io")).toBe("https://vidstack.io");
  expect(rewriteTarget("#results")).toBe("#results");
});

test("writes footnotes out: numbered references, and the notes as a list with a way back", () => {
  const html = footnotes("| a | b[^x] |\n\nText[^y], again[^x].\n\n[^x]: **X** note.\n\n[^y]: Y note\n  goes on.\n");
  expect(html).toContain('b<sup><a href="#fn-1" id="fnref-1">1</a></sup>');
  expect(html).toContain('Text<sup><a href="#fn-2" id="fnref-2">2</a></sup>, again<sup><a href="#fn-1">1</a></sup>.');
  expect(html).toContain('1. <span id="fn-1"></span>**X** note. <a href="#fnref-1" aria-label="Back to reference 1">↩</a>');
  expect(html).toContain('2. <span id="fn-2"></span>Y note goes on.');
  expect(html).not.toContain("[^");
});

test("refuses a reference with no note, and a note with no reference", () => {
  expect(() => footnotes("a[^1]")).toThrow("[^1] has no note");
  expect(() => footnotes("a[^1]\n\n[^1]: one\n\n[^2]: two")).toThrow("no reference names the footnotes 2");
});

test("draws an icon beside each status word in the features table alone", () => {
  const features = "<table><thead><tr><th>Axis</th></tr></thead><tbody><tr><td>HLS</td><td>yes<sup><a>1</a></sup></td><td>n/a</td></tr></tbody></table>";
  const results = "<table><thead><tr><th>Library</th></tr></thead><tbody><tr><td>yes</td></tr></tbody></table>";
  const out = iconizeFeaturesTable(features + results);
  expect(out).toContain('<table class="cmp-features">');
  expect(out).toContain('<td><span class="cmp-status" data-status="yes"><svg');
  expect(out).toContain('<span class="cmp-status__word">yes</span></span><sup><a>1</a></sup></td>');
  expect(out).toContain('data-status="n/a"');
  expect(out).toContain(results);
});

test("puts each table in a focusable region named for the heading above it", () => {
  expect(scrollTables('<h2 id="a">Results &amp; more</h2><table><tr><td>1</td></tr></table>')).toBe(
    '<h2 id="a">Results &amp; more</h2><div class="cmp-table" role="region" tabindex="0" aria-label="Results &amp; more"><table><tr><td>1</td></tr></table></div>',
  );
});
