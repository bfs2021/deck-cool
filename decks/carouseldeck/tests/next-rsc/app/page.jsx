// A server component: no 'use client' here. It renders decks as the package
// README documents them, with each effect and the theme.
import * as Deck from '@carouseldeck/react';
import { curve } from '@carouseldeck/react/curve';
import { fade } from '@carouseldeck/react/fade';
import '@carouseldeck/react/theme.css';

export default function Page() {
  return (
    <main>
      <Deck.Root aria-label="Featured" loop>
        <Deck.Viewport effect={fade}>
          <Deck.Slide>Slide one</Deck.Slide>
          <Deck.Slide>Slide two</Deck.Slide>
          <Deck.Slide>Slide three</Deck.Slide>
        </Deck.Viewport>
        <Deck.Prev />
        <Deck.Next />
        <Deck.Dots />
        <Deck.Counter />
      </Deck.Root>
      <Deck.Root aria-label="Curved" defaultIndex={1}>
        <Deck.Viewport effect={curve}>
          <Deck.Slide>Curved one</Deck.Slide>
          <Deck.Slide>Curved two</Deck.Slide>
          <Deck.Slide>Curved three</Deck.Slide>
        </Deck.Viewport>
      </Deck.Root>
    </main>
  );
}
