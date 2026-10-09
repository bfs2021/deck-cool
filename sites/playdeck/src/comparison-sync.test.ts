import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

/**
 * Where ../comparison/ was copied from: pedrosousa13/playdeck's
 * docs/comparison at this commit. To refresh it, copy the three files again
 * (`git -C <playdeck> show <sha>:docs/comparison/<file>`), then set the commit
 * and each file's sha256 here. A hand edit to a copy fails this test.
 */
const UPSTREAM = "cf72813b2bdd4edd074f8ec4d10aa71d40124b39";
const SHA256: Record<string, string> = {
  "features.md": "851a066959993f0bb8aa624b7c2c9904b9f2656439d90020cf366da07d1d3836",
  "method.md": "03b7977751f0584b4ce77cf0cc8f42ad090637d24d071bf21718d761237996f5",
  "results.md": "f4a0ea3c8c59f1eb05ba919935035492d9bafa4f754d5a8aaa043db20422c61d",
};

const DIR = fileURLToPath(new URL("../comparison/", import.meta.url));

test(`the comparison sources are playdeck's docs/comparison at ${UPSTREAM.slice(0, 7)}, byte for byte`, () => {
  expect(UPSTREAM).toMatch(/^[0-9a-f]{40}$/);
  expect(readdirSync(DIR).sort()).toEqual(Object.keys(SHA256).sort());
  for (const [file, sha256] of Object.entries(SHA256)) {
    expect(createHash("sha256").update(readFileSync(`${DIR}${file}`)).digest("hex"), file).toBe(sha256);
  }
});
