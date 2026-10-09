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

test("writes footnotes out: numbered references, and the notes as a list with a way back, each id under the document's", () => {
  const html = footnotes("| a | b[^x] |\n\nText[^y], again[^x].\n\n[^x]: **X** note.\n\n[^y]: Y note\n  goes on.\n", "doc");
  expect(html).toContain('b<sup><a href="#doc-fn-1" id="doc-fnref-1">1</a></sup>');
  expect(html).toContain('Text<sup><a href="#doc-fn-2" id="doc-fnref-2">2</a></sup>, again<sup><a href="#doc-fn-1">1</a></sup>.');
  expect(html).toContain('1. <span id="doc-fn-1"></span>**X** note. <a href="#doc-fnref-1" aria-label="Back to reference 1">↩</a>');
  expect(html).toContain('2. <span id="doc-fn-2"></span>Y note goes on.');
  expect(html).not.toContain("[^");
});

test("gives two documents' notes ids that cannot meet", () => {
  const one = footnotes("a[^1]\n\n[^1]: one", "first");
  const two = footnotes("a[^1]\n\n[^1]: one", "second");
  const ids = (html: string) => [...html.matchAll(/id="([^"]+)"/g)].map(([, id]) => id);
  expect(ids(one).filter((id) => ids(two).includes(id))).toEqual([]);
});

test("refuses a reference with no note, and a note with no reference", () => {
  expect(() => footnotes("a[^1]", "doc")).toThrow("[^1] has no note");
  expect(() => footnotes("a[^1]\n\n[^1]: one\n\n[^2]: two", "doc")).toThrow("no reference names the footnotes 2");
});

test("refuses a note with a bare < or &, which would reach the page as HTML, but allows them in a code span", () => {
  expect(() => footnotes("a[^1]\n\n[^1]: a <script> tag", "doc")).toThrow("[^1] holds a bare <");
  expect(() => footnotes("a[^1]\n\n[^1]: this & that", "doc")).toThrow("[^1] holds a bare &");
  expect(footnotes("a[^1]\n\n[^1]: a `<video>` & `a && b`".replace(" & ", " and "), "doc")).toContain("`<video>`");
});

test("reads no note, and rewrites no reference, inside a fence", () => {
  const html = footnotes("a[^1]\n\n```md\n[^2]: not a note\nb[^2]\n```\n\n[^1]: one", "doc");
  expect(html).toContain("```md\n[^2]: not a note\nb[^2]\n```");
  expect(html).toContain('1. <span id="doc-fn-1"></span>one');
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
