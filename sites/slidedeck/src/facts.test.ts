import { expect, test } from "vitest";
import { minorOf } from "./facts.ts";

test("names a release by its major and minor version", () => {
  expect(minorOf("1.0.3")).toBe("1.0");
  expect(minorOf("12.34.56")).toBe("12.34");
});

test("refuses a prerelease or anything but MAJOR.MINOR.PATCH, rather than cutting it short", () => {
  for (const version of ["1.1.0-beta.1", "1.1.0+build.5", "1.1", "v1.1.0"]) {
    expect(() => minorOf(version), version).toThrow(/MAJOR\.MINOR\.PATCH/);
  }
});
