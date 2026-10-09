import { expect, test } from "vitest";
import { CONTENT_SECURITY_POLICY, MEDIA_ORIGINS } from "./csp.ts";

const directives = new Map(
  CONTENT_SECURITY_POLICY.value.split(";").map((directive) => {
    const [name = "", ...sources] = directive.trim().split(/\s+/);
    return [name, sources];
  }),
);

test("is the Content-Security-Policy header", () => {
  expect(CONTENT_SECURITY_POLICY.name).toBe("Content-Security-Policy");
});

test("allows scripts from the site only, and never eval or any inline script", () => {
  expect(directives.get("script-src")).toEqual(["'self'"]);
});

test("allows stylesheets from the site only, and inline style only in an attribute", () => {
  expect(directives.get("style-src")).toEqual(["'self'"]);
  for (const [name, sources] of directives) {
    if (name !== "style-src-attr") expect(sources, name).not.toContain("'unsafe-inline'");
  }
  expect(directives.get("style-src-attr")).toEqual(["'unsafe-inline'"]);
});

test("plays media from the site and the clips' one host, over HTTPS", () => {
  expect(MEDIA_ORIGINS).toEqual(["https://download.blender.org"]);
  expect(directives.get("media-src")).toEqual(["'self'", ...MEDIA_ORIGINS]);
});

test("fetches and shows images from the site only, and frames nothing", () => {
  expect(directives.get("connect-src")).toEqual(["'self'"]);
  expect(directives.get("img-src")).toEqual(["'self'"]);
  expect(directives.has("frame-src")).toBe(false);
  expect(directives.has("child-src")).toBe(false);
});

test("falls back to nothing, and refuses forms, framing by others and a <base>", () => {
  expect(directives.get("default-src")).toEqual(["'none'"]);
  expect(directives.get("form-action")).toEqual(["'none'"]);
  expect(directives.get("frame-ancestors")).toEqual(["'none'"]);
  expect(directives.get("base-uri")).toEqual(["'none'"]);
});
