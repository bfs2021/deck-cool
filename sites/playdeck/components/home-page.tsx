import type { ReactNode } from "react";
import { unescapedHtml } from "@pagedeck/core/tree";
import { PAGE } from "./shell.ts";

export interface Card {
  readonly headline: string;
  readonly lines: readonly string[];
  /** The snippet, highlighted at build time. */
  readonly html: string;
  readonly href: string;
}

/**
 * playdeck.video's home page, with its copy as it stood on 2026-10-09 (#15):
 * the thesis, the four feature cards and the close. The bench, the live
 * player that sat under the thesis, is not ported. The install line arrives
 * as the child, the copy island.
 */
export default function HomePage({
  display,
  lede,
  start,
  cards,
  measured,
  links,
  children,
}: {
  display: string;
  lede: string;
  start: string;
  cards: readonly Card[];
  measured: string;
  links: readonly (readonly [label: string, href: string])[];
  children?: ReactNode;
}) {
  return (
    <div className={`${PAGE} pd-home`}>
      <section className="pd-thesis" aria-labelledby="pd-thesis-name">
        <h1 id="pd-thesis-name" className="pd-thesis__name">
          Playdeck
        </h1>
        <p className="pd-thesis__display">{display}</p>
        <p className="pd-thesis__lede">{lede}</p>
        <div className="pd-thesis__actions">
          {children}
          <a className="pd-button" href={start}>
            Start →
          </a>
        </div>
      </section>

      <section className="pd-cards" aria-label="Features">
        {cards.map((card, index) => (
          <a key={card.headline} className="pd-card" href={card.href}>
            <span className="pd-card__number">{String(index + 1).padStart(2, "0")}</span>
            <h2 className="pd-card__headline">{card.headline}</h2>
            {card.lines.map((line) => (
              <p key={line} className="pd-card__line">
                {line}
              </p>
            ))}
            <div className="pd-card__snippet" {...unescapedHtml(card.html)} />
          </a>
        ))}
      </section>

      <section className="pd-close" aria-label="In short">
        <p className="pd-close__measured">{measured}</p>
        <a className="pd-button" href={start}>
          Start →
        </a>
        <p className="pd-close__links">
          {links.map(([label, href]) => (
            <a key={href} href={href}>
              {label} →
            </a>
          ))}
        </p>
      </section>
    </div>
  );
}
