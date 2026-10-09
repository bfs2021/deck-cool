// The social card each page shares with: a 1200 by 630 PNG on the brand's
// dark ground, with slidedeck's icon, drawn by build.socialImages. The SVG is
// written here and resvg paints it.
//
// The site sets its text in the system SF stack, and so does the card: it
// takes the first family of the stack the build machine has (SF Pro or
// Helvetica Neue on a Mac, a sans-serif such as Nimbus Sans or DejaVu Sans on
// Linux), and fails on a machine with none. A card built on another machine
// can differ in its type.

import { readFileSync } from "node:fs";
import type { SocialImageAdapter } from "@pagedeck/core";
import { Resvg } from "@resvg/resvg-js";

const WIDTH = 1200;
const HEIGHT = 630;
const PADDING = 72;

/** brand.css's palette. */
const COLOUR = {
  ground: "#000",
  text: "#f5f5f7",
  secondary: "#a1a1a6",
  accent: "#0071e3",
} as const;

/** The site's SF stack, then sans-serifs a Linux build machine has. */
const STACK = ["SF Pro Display", "Helvetica Neue", "Helvetica", "Arial", "Nimbus Sans", "Liberation Sans", "DejaVu Sans"];

const OPTIONS = { font: { loadSystemFonts: true } } as const;

/** How wide resvg draws a line in `family`: a family it lacks draws in its default. */
const width = (family: string) =>
  new Resvg(
    `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="60"><text x="0" y="40" font-size="30" font-family="'${family}'">slidedeck 0123</text></svg>`,
    OPTIONS,
  ).innerBBox()?.width;

/**
 * The first family of the stack this machine has. resvg draws a missing
 * family in its default face, a serif, rather than trying the next one.
 */
function pickFont(): string {
  const missing = width("No such family");
  const found = STACK.find((family) => width(family) !== missing);
  if (found === undefined) throw new Error(`Social card: this machine has none of ${STACK.join(", ")}`);
  return found;
}

const FONT = pickFont();

const ICON = readFileSync(new URL("../node_modules/@deck-cool/brand/public/icons/slidedeck/still.svg", import.meta.url), "utf8");

const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * The headline's lines, broken between words. A glyph is taken as 0.6em wide,
 * wider than most, so a line fits the card in any of the stack's families.
 */
export function lines(text: string, fontSize: number, width: number): string[] {
  const perLine = Math.floor(width / (fontSize * 0.6));
  const out: string[] = [];
  for (const word of text.split(/\s+/)) {
    const last = out.at(-1);
    if (last !== undefined && `${last} ${word}`.length <= perLine) out[out.length - 1] = `${last} ${word}`;
    else out.push(word);
  }
  return out;
}

function card(headline: string, host: string): string {
  const fontSize = headline.length > 40 ? 64 : 80;
  const lineHeight = Math.round(fontSize * 1.1);
  const headlineLines = lines(headline, fontSize, WIDTH - 2 * PADDING);
  // The headline sits above the host line, its last line's baseline 72px over it.
  const lastBaseline = HEIGHT - PADDING - 16 - 28 - 56;
  const text = headlineLines
    .map((line, at) => {
      const y = lastBaseline - (headlineLines.length - 1 - at) * lineHeight;
      return `<text x="${PADDING}" y="${y}" font-size="${fontSize}" font-weight="600" letter-spacing="${-0.025 * fontSize}">${escape(line)}</text>`;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
<rect width="${WIDTH}" height="${HEIGHT}" fill="${COLOUR.ground}"/>
<rect y="${HEIGHT - 16}" width="${WIDTH}" height="16" fill="${COLOUR.accent}"/>
<svg x="${PADDING}" y="${PADDING - 8}" width="72" height="72" viewBox="0 0 64 64">${ICON.replace(/<\/?svg[^>]*>/g, "")}</svg>
<g font-family="'${FONT}'" fill="${COLOUR.text}">
<text x="${PADDING + 72 + 20}" y="${PADDING + 42}" font-size="40" font-weight="600" letter-spacing="-0.8">slidedeck</text>
${text}
<text x="${PADDING}" y="${HEIGHT - PADDING - 16}" font-size="28" fill="${COLOUR.secondary}">${escape(host)}</text>
</g>
</svg>`;
}

/** The card renderer. Each page's `inputs` give its `headline`. */
export function socialCard(origin: string): SocialImageAdapter {
  const host = new URL(origin).host;
  return {
    name: "slidedeck social card",
    draw({ inputs, title }) {
      const headline = typeof inputs["headline"] === "string" ? inputs["headline"] : title;
      if (headline === undefined) throw new Error("Social card: the page has no headline to draw.");
      const bytes = new Resvg(card(headline, host), OPTIONS).render().asPng();
      return { bytes, width: WIDTH, height: HEIGHT };
    },
  };
}
