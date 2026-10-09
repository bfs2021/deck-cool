import { expect, test } from "vitest";
import { formatBytes, utf8Bytes } from "./bytes.ts";

test("a count below 1,000 prints as whole bytes, zero included", () => {
  expect(formatBytes(0)).toBe("0 B");
  expect(formatBytes(307)).toBe("307 B");
  expect(formatBytes(999)).toBe("999 B");
});

test("a count of 1,000 or more prints as SI kilobytes to one decimal", () => {
  expect(formatBytes(1000)).toBe("1.0 kB");
  expect(formatBytes(3093)).toBe("3.1 kB");
  expect(formatBytes(67096)).toBe("67.1 kB");
  expect(formatBytes(133_120)).toBe("133.1 kB");
  expect(formatBytes(452_538)).toBe("452.5 kB");
});

test("a string's size is its UTF-8 length, not its length in code units", () => {
  expect(utf8Bytes("abc")).toBe(3);
  expect(utf8Bytes("é")).toBe(2);
});
