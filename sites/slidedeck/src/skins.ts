import { readFileSync } from "node:fs";

/**
 * The home page's two skins for one deck. Each is a stylesheet the build
 * compiles into the site's sheet, and the home page shows the source file the
 * stylesheet is compiled from beside the deck it styles.
 */
export const SKINS = [
  { name: "Soft", className: "soft", file: "styles/skins/soft.css" },
  { name: "Stark", className: "stark", file: "styles/skins/stark.css" },
] as const;

export type Skin = (typeof SKINS)[number] & { readonly css: string };

/** Each skin with its stylesheet's text, read at build time. */
export function skins(): Skin[] {
  return SKINS.map((skin) => ({ ...skin, css: readFileSync(new URL(`../${skin.file}`, import.meta.url), "utf8").trim() }));
}
