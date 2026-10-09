import { decks, type Deck } from "@deck-cool/brand/decks";
import { FamilyBar, type FamilyBarLink } from "@deck-cool/brand/family-bar";

function find(name: string): Deck {
  const deck = decks.find((each) => each.name === name);
  if (deck === undefined) throw new Error(`the decks module has no ${name}`);
  return deck;
}

const pagedeck = find("pagedeck");

/**
 * Rendered by build.chrome before <main> on every page. The page's viewport
 * and icons go with it, and React lifts them into <head>. The favicon is the
 * still icon: pagedeck never animates it by script (CONTEXT.md).
 */
export default function SiteFamilyBar({ links }: { links: readonly FamilyBarLink[] }) {
  return (
    <>
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <link rel="icon" type="image/svg+xml" href={pagedeck.icons.still} />
      <link rel="apple-touch-icon" href={pagedeck.icons.appleTouch} />
      <FamilyBar current={pagedeck} links={links} />
    </>
  );
}
