import type { ReactNode } from "react";
import type { NavGroup } from "@deck-cool/docs";
import { PATHS } from "./links.ts";
import DocsNav from "./docs-nav.tsx";
import { PAGE } from "./shell.ts";

/** The docs' search page: the docs' nav, then the search island as its child. */
export default function SearchPage({
  title,
  intro,
  nav,
  children,
}: {
  title: string;
  intro: string;
  nav: readonly NavGroup[];
  children?: ReactNode;
}) {
  return (
    <div className={`${PAGE} pd-docs`}>
      <DocsNav nav={nav} href={PATHS.search} />
      <div className="pd-doc">
        <h1>{title}</h1>
        <p className="pd-lede">{intro}</p>
        {children}
      </div>
    </div>
  );
}
