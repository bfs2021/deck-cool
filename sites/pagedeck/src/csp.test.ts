import { expect, test } from "vitest";
import { CONTENT_SECURITY_POLICY } from "./csp.ts";

const directives = new Map(
  CONTENT_SECURITY_POLICY.value.split(";").map((directive) => {
    const [name = "", ...sources] = directive.trim().split(/\s+/);
    return [name, sources];
  }),
);

test("is the Content-Security-Policy header", () => {
  expect(CONTENT_SECURITY_POLICY.name).toBe("Content-Security-Policy");
});

test("allows scripts from the site and the one inline loader it names, and never eval or any inline script", () => {
  const [self, ...hashes] = directives.get("script-src") ?? [];
  expect(self).toBe("'self'");
  expect(hashes).toHaveLength(1);
  for (const hash of hashes) expect(hash).toMatch(/^'sha256-[A-Za-z0-9+/]+=*'$/);
});

test("allows stylesheets from the site only, and inline style only in an attribute", () => {
  expect(directives.get("style-src")).toEqual(["'self'"]);
  for (const [name, sources] of directives) {
    if (name !== "style-src-attr") expect(sources, name).not.toContain("'unsafe-inline'");
  }
  expect(directives.get("style-src-attr")).toEqual(["'unsafe-inline'"]);
});

test("fetches and shows images and fonts from the site only", () => {
  expect(directives.get("connect-src")).toEqual(["'self'"]);
  expect(directives.get("img-src")).toEqual(["'self'"]);
  expect(directives.get("font-src")).toEqual(["'self'"]);
});

test("falls back to nothing, and refuses forms, frames and a <base>", () => {
  expect(directives.get("default-src")).toEqual(["'none'"]);
  expect(directives.get("form-action")).toEqual(["'none'"]);
  expect(directives.get("frame-ancestors")).toEqual(["'none'"]);
  expect(directives.get("base-uri")).toEqual(["'none'"]);
});
