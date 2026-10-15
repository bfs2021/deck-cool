import type { ReactNode } from "react";
import { decks, type Deck, type umbrella } from "./decks.ts";

export interface FamilyBarLink {
  readonly label: string;
  readonly href: string;
}

export interface FamilyBarProps {
  /** The deck whose site this is, or the umbrella on deck.cool. */
  readonly current: Deck | typeof umbrella;
  /** The site's own links, such as Docs, Examples and GitHub. */
  readonly links: readonly FamilyBarLink[];
  /** Where the Install pill points. No pill without it. */
  readonly install?: string;
  /** Last in the row, after the Install pill, such as a site's search box. */
  readonly children?: ReactNode;
}

/** The switcher's panel. One bar per page, so a fixed id. */
const PANEL = "family-bar-decks";
/** The links menu's panel, folded in at the phone breakpoint (#156). One bar per page, so a fixed id. */
const LINKS_PANEL = "family-bar-links";

/**
 * The top bar every deck.cool site shares (design direction C). The switcher
 * and, at the phone breakpoint, the links menu are each a popover its own
 * button toggles, which closes on Escape and on a click outside it. Every
 * motion is CSS in `styles/family-bar.css`, which a site lists in its
 * `build.css`, so the bar ships no JavaScript.
 */
export function FamilyBar({ current, links, install, children }: FamilyBarProps) {
  const deck = "kind" in current ? current : undefined;
  return (
    <header className="family-bar" data-deck={deck?.name}>
      <nav aria-label="Main" className="family-bar__row">
        <button type="button" className="family-bar__switch" popoverTarget={PANEL} aria-label="Switch deck">
          <svg className="family-bar__fan" width="26" height="26" viewBox="0 0 64 64" aria-hidden="true">
            <rect className="family-bar__fan-left" x="22" y="15" width="20" height="28" rx="4" />
            <rect className="family-bar__fan-right" x="22" y="15" width="20" height="28" rx="4" />
            <rect className="family-bar__fan-front" x="22" y="15" width="20" height="28" rx="4" />
          </svg>
          <svg className="family-bar__chevron" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <path d="M2 3.5 L5 6.5 L8 3.5" />
          </svg>
        </button>
        {/* The panel covers the page under the bar: the sheet of decks, then
            the shade, which closes the panel and keeps the click from the page. */}
        <div id={PANEL} popover="auto" className="family-bar__panel">
          <div className="family-bar__sheet">
            <div className="family-bar__decks">
              <p id={`${PANEL}-label`}>The decks</p>
              <ul aria-labelledby={`${PANEL}-label`}>
                {decks.map((each) => (
                  <li key={each.name}>
                    <a href={each.url} aria-current={each === deck ? "page" : undefined}>
                      {/* Low priority, and not lazy: React then writes no preload,
                          and the icons are there before the panel first opens. */}
                      <img src={each.icons.still} alt="" width="44" height="44" fetchPriority="low" />
                      <span>
                        <strong>{each.name}</strong>
                        <span>{each.kind}</span>
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <button
            type="button"
            className="family-bar__shade"
            popoverTarget={PANEL}
            popoverTargetAction="hide"
            tabIndex={-1}
            aria-hidden="true"
          />
        </div>
        {deck && (
          <span className="family-bar__slash" aria-hidden="true">
            /
          </span>
        )}
        <a href="/" className="family-bar__name">
          <span>{current.name}</span>
        </a>
        {links.length > 0 && (
          <ul className="family-bar__links">
            {links.map(({ label, href }) => (
              <li key={href}>
                <a href={href}>{label}</a>
              </li>
            ))}
          </ul>
        )}
        {install && (
          <a href={install} className="family-bar__install">
            Install
          </a>
        )}
        {children}
        {links.length > 0 && (
          <>
            <button type="button" className="family-bar__menu" popoverTarget={LINKS_PANEL} aria-label="Menu">
              <svg className="family-bar__burger" width="18" height="12" viewBox="0 0 18 12" aria-hidden="true">
                <line x1="1" y1="1" x2="17" y2="1" />
                <line x1="1" y1="6" x2="17" y2="6" />
                <line x1="1" y1="11" x2="17" y2="11" />
              </svg>
            </button>
            {/* Below the bar, like the switcher's panel: the sheet of links, then
                the shade, which closes the menu and keeps the click from the page. */}
            <div id={LINKS_PANEL} popover="auto" className="family-bar__panel">
              <div className="family-bar__sheet">
                <ul className="family-bar__menu-list" aria-label="Links">
                  {links.map(({ label, href }) => (
                    <li key={href}>
                      <a href={href}>{label}</a>
                    </li>
                  ))}
                </ul>
              </div>
              <button
                type="button"
                className="family-bar__shade"
                popoverTarget={LINKS_PANEL}
                popoverTargetAction="hide"
                tabIndex={-1}
                aria-hidden="true"
              />
            </div>
          </>
        )}
      </nav>
    </header>
  );
}
