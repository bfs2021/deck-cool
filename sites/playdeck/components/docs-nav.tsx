import { SEARCH_ATTRIBUTE } from "@pagedeck/core/tree";
import type { NavGroup } from "@deck-cool/docs";

/** Keeps an element out of the search index, and changes nothing a reader gets. */
export const UNINDEXED = { [SEARCH_ATTRIBUTE]: "ignore" } as const;

/**
 * The docs' nav, in nav.json's order. A disclosure on a narrow screen, and
 * open beside the page on a wide one. Not a component of its own in
 * build.components: the docs layout and the search page render it.
 */
export default function DocsNav({ nav, href }: { nav: readonly NavGroup[]; href: string }) {
  if (nav.length === 0) return null;
  return (
    <nav className="pd-docnav" aria-label="Documentation" {...UNINDEXED}>
      <details className="pd-docnav__toggle">
        <summary className="pd-docnav__summary">Contents</summary>
        {nav.map((group) => (
          <section key={group.label}>
            <h2>{group.label}</h2>
            <ul>
              {group.pages.map((page) => (
                <li key={page.href}>
                  <a href={page.href} aria-current={page.href === href ? "page" : undefined}>
                    {page.title}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </details>
    </nav>
  );
}
