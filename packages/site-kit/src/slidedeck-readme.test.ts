import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "vitest";
import { comparison, fence, readSlidedeckReadme, SLIDEDECK, slidedeckRow, slidedeckSize } from "./slidedeck-readme.ts";
import { fixtureReadme } from "./slidedeck-readme.fixture.ts";

const table = [
  '| Library    | Version   | Min+gzip | Native scroll | Accessibility out of the box | API shape |',
  '| ---------- | --------- | -------- | ------------- | ---------------------------- | --------- |',
  '| `a-lib`    | this repo | 1.25 KB  | Yes: snap     | Labelled, "n of m"           | Parts     |',
  '| `b-lib`    | 2.0.0     | 3.50 KB  | No: `x(…)`    | None                         | A hook    |'
].join('\n');

const readme = (between: string) =>
  [
    '# Title',
    '',
    '## Quickstart',
    '',
    '```tsx',
    "import * as Deck from '@slidedeck/react';",
    '',
    '<Deck.Root />',
    '```',
    '',
    '## Comparison',
    '',
    '| Not | The | Table |',
    '| --- | --- | ----- |',
    '',
    '<!-- comparison:start -->',
    between,
    '<!-- comparison:end -->'
  ].join('\n');

test('comparison reads each row between the markers, cell by cell', () => {
  assert.deepEqual(comparison(readme(`\n${table}\n\nMin+gzip: notes.\n`)), [
    {
      library: 'a-lib',
      version: 'this repo',
      size: '1.25 KB',
      nativeScroll: 'Yes: snap',
      accessibility: 'Labelled, "n of m"',
      api: 'Parts'
    },
    {
      library: 'b-lib',
      version: '2.0.0',
      size: '3.50 KB',
      nativeScroll: 'No: `x(…)`',
      accessibility: 'None',
      api: 'A hook'
    }
  ]);
});

test('comparison follows the table: a new size is a new value', () => {
  const [row] = comparison(readme(table.replace('1.25 KB', '9.99 KB')));
  assert.equal(row?.size, '9.99 KB');
});

test('comparison refuses a README without the markers or a table', () => {
  assert.throws(() => comparison('# No markers'), /comparison:start/);
  assert.throws(() => comparison(readme('No table.')), /table/);
});

test('comparison refuses a table whose columns moved', () => {
  assert.throws(
    () => comparison(readme(table.replace('Min+gzip', 'Size'))),
    /Min\+gzip/
  );
});

test('comparison refuses a row whose cells do not match the header', () => {
  const short = table.replace('| A hook    |', '|');
  assert.throws(() => comparison(readme(short)), /b-lib.*5 cells.*6/);
});

test("slidedeckRow finds slidedeck's row by its name, wherever it is", () => {
  const rows = comparison(readme(table.replace('`b-lib`', `\`${SLIDEDECK}\``)));
  assert.equal(slidedeckRow(rows).size, '3.50 KB');
});

test("slidedeckRow refuses a comparison without slidedeck's row", () => {
  assert.throws(
    () => slidedeckRow(comparison(readme(table))),
    /@slidedeck\/react/
  );
});

test("fence reads the first code block of a section, by the section's heading", () => {
  assert.equal(
    fence(readme(table), 'Quickstart'),
    "import * as Deck from '@slidedeck/react';\n\n<Deck.Root />"
  );
  assert.throws(() => fence(readme(table), 'Install'), /Install/);
});

test("slidedeckSize is slidedeck's Min+gzip cell, whatever the README says", () => {
  assert.equal(slidedeckSize(fixtureReadme("12.34 KB")), "12.34 KB");
  assert.equal(slidedeckSize(fixtureReadme("7.5 KB")), "7.5 KB");
});

test("readSlidedeckReadme reads the README of the @slidedeck/react a site has installed", () => {
  const site = mkdtempSync(join(tmpdir(), "site-"));
  try {
    const dir = join(site, "node_modules/@slidedeck/react");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "README.md"), fixtureReadme("12.34 KB"));
    const readme = readSlidedeckReadme(pathToFileURL(`${site}/`));
    assert.equal(slidedeckSize(readme), "12.34 KB");
  } finally {
    rmSync(site, { recursive: true });
  }
});

test("readSlidedeckReadme names the package a site has not installed", () => {
  const site = mkdtempSync(join(tmpdir(), "site-"));
  try {
    assert.throws(() => readSlidedeckReadme(pathToFileURL(`${site}/`)), /@slidedeck\/react/);
  } finally {
    rmSync(site, { recursive: true });
  }
});
