import type { HeaderField } from "@pagedeck/core";

/**
 * Pinned: core composes the facade loader inline on the one page that holds a
 * facade, /features/, and keeps the script's text internal, so its hash is
 * copied from the build. site.build.test.ts fails when it goes stale.
 */
const FACADE_LOADER_HASH = "'sha256-nDzs2CUaBUH8lVSWkaSI/d1UaCtKcTfHbRKUIcp7buQ='";

/**
 * Scripts, stylesheets, images and the search index come from the site
 * itself, and everything else is refused. `style-src-attr 'unsafe-inline'` is
 * for the code highlighter's `style=` colours and the ruler's `--share`.
 */
export const CONTENT_SECURITY_POLICY: HeaderField = {
  name: "Content-Security-Policy",
  value: [
    "default-src 'none'",
    `script-src 'self' ${FACADE_LOADER_HASH}`,
    "style-src 'self'",
    "style-src-attr 'unsafe-inline'",
    "img-src 'self'",
    "connect-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join("; "),
};
