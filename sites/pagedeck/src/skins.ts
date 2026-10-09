import { readFileSync } from "node:fs";

/**
 * The home page's two skins for one teaser. Each is a stylesheet the build
 * compiles into the site's sheet, and the home page shows the source file the
 * stylesheet is compiled from beside the teaser it styles.
 */
export const SKINS = [
  { name: "Paper", className: "paper", file: "styles/skins/paper.css" },
  { name: "Signal", className: "signal", file: "styles/skins/signal.css" },
] as const;

export type Skin = (typeof SKINS)[number] & { readonly css: string };

/** Each skin with its stylesheet's text, read at build time. */
export function skins(): Skin[] {
  return SKINS.map((skin) => ({ ...skin, css: readFileSync(new URL(`../${skin.file}`, import.meta.url), "utf8").trim() }));
}
