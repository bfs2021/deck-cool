import type { HeaderField } from "@pagedeck/core";

/**
 * Where each clip on /examples plays from, the one origin a page here loads
 * from that is not its own. A player fetches nothing until a reader presses
 * play, so before that press no page reaches it.
 */
export const MEDIA_ORIGINS = [
  // The Blender Foundation's download host. Both archetype players play an
  // open-movie trailer from it through the native provider, as a plain
  // <video> source (Sintel, and Big Buck Bunny), with no CORS and no
  // redirect. A <video> loads under media-src, so this is the whole grant.
  "https://download.blender.org",
] as const;

/**
 * Scripts, stylesheets, images, the captions and the search index come from
 * the site itself, the clips from MEDIA_ORIGINS, and everything else is
 * refused. No page frames a provider: YouTube, Vimeo and Wistia's iframes and
 * scripts, and HLS's blob: media, wait for #52's demos, which add their
 * origins here. `style-src-attr 'unsafe-inline'` is for the code
 * highlighter's `style=` colours and the players' own inline styles.
 */
export const CONTENT_SECURITY_POLICY: HeaderField = {
  name: "Content-Security-Policy",
  value: [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self'",
    "style-src-attr 'unsafe-inline'",
    "img-src 'self'",
    `media-src 'self' ${MEDIA_ORIGINS.join(" ")}`,
    "connect-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join("; "),
};
