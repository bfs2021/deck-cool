// The smallest deck a React user writes with carouseldeck: three slides and
// Prev and Next. It needs no stylesheet, so it imports none.
import { createRoot } from 'react-dom/client';
import * as Deck from '@carouseldeck/react';

const Fixture = () => (
  <Deck.Root aria-label="Slides">
    <Deck.Viewport>
      <Deck.Slide>One</Deck.Slide>
      <Deck.Slide>Two</Deck.Slide>
      <Deck.Slide>Three</Deck.Slide>
    </Deck.Viewport>
    <Deck.Prev />
    <Deck.Next />
  </Deck.Root>
);

createRoot(document.getElementById('root')!).render(<Fixture />);
