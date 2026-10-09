import { SECURITY_HEADERS, type HeaderField } from "@pagedeck/core";
import { CONTENT_SECURITY_POLICY } from "./csp.ts";

/**
 * Each powerful feature is off, for the page and for anything it embeds, but
 * fullscreen, which the players' fullscreen buttons use, and only the site's
 * own pages may.
 */
const PERMISSIONS_POLICY = [
  "accelerometer",
  "camera",
  "display-capture",
  "geolocation",
  "gyroscope",
  "hid",
  "magnetometer",
  "microphone",
  "midi",
  "payment",
  "publickey-credentials-get",
  "screen-wake-lock",
  "serial",
  "usb",
  "xr-spatial-tracking",
]
  .map((feature) => `${feature}=()`)
  .concat("fullscreen=(self)")
  .join(", ");

/**
 * What every response from play.deck.cool carries, page or file. HSTS covers the
 * subdomains, as deck.cool's does: every package site is served over HTTPS.
 */
export const RESPONSE_HEADERS: readonly HeaderField[] = [
  ...SECURITY_HEADERS,
  CONTENT_SECURITY_POLICY,
  { name: "Permissions-Policy", value: PERMISSIONS_POLICY },
  { name: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { name: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
];

/**
 * What a content-hashed file carries besides RESPONSE_HEADERS, under each of
 * HASHED_PREFIXES. A cached copy never goes stale.
 */
export const HASHED_FILE_HEADERS: readonly HeaderField[] = [
  { name: "Cache-Control", value: "public, max-age=31536000, immutable" },
];

/** The directory the build names each file in by its content's hash: the stylesheet and the scripts. */
export const HASHED_PREFIXES = ["/assets/"] as const;
