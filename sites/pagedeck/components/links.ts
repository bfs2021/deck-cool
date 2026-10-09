/** pagedeck's own repo. CONTEXT.md: a package site links its deck's repo, never a GitHub profile. */
export const REPO = "https://github.com/pedrosousa13/pagedeck";

/**
 * The landing's placeholder docs host, under RFC 2606's `.example`. The docs
 * move to /docs in #53, which points these links there: until the pages exist,
 * the build's link check refuses a /docs/ link.
 */
export const DOCS_ORIGIN = "https://docs.pagedeck.example";

/** Each page this site builds. */
export const PATHS = {
  home: "/",
  interactive: "/interactive/",
  features: "/features/",
  serverData: "/server-data/",
  search: "/docs/search/",
} as const;
