import { DOCS, PATHS, REPO } from "./links.ts";

const LINKS = [
  ["Home", PATHS.home],
  ["Docs", DOCS.start],
  ["Examples", PATHS.examples],
  ["Comparison", PATHS.comparison],
  ["GitHub", REPO],
] as const;

/** Rendered by build.chrome after <main>, so it is the page's contentinfo landmark. */
export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <div>
        <p>playdeck is MIT licensed. This site is built with Pagedeck.</p>
        <nav aria-label="Footer">
          <ul>
            {LINKS.map(([label, href]) => (
              <li key={href}>
                <a href={href}>{label}</a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </footer>
  );
}
