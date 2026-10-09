// The consent banner's record of a visitor's answer.
import type { ConsentCategory } from "@pagedeck/core/consent";

// `localStorage`, not a cookie, so the record is never sent to the server the
// visitor is deciding about.
export const CONSENT_BANNER_STORAGE_KEY = "fw-consent";

export interface ConsentDecision {
  analytics: boolean;
  functional: boolean;
  marketing: boolean;
}

// Optional: a browser refusing storage throws on the property itself, and it is
// absent in the server render and in the `pagedeck` process.
interface Storage {
  localStorage?: {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
  };
}
const browser = globalThis as unknown as Storage;

// A partial record is refused, never completed: the invented half would be a
// consent answer nobody gave (#500).
export function storedDecision(): ConsentDecision | undefined {
  try {
    const raw = browser.localStorage?.getItem(CONSENT_BANNER_STORAGE_KEY);
    if (raw === null || raw === undefined) return undefined;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return undefined;
    const held = parsed as Partial<ConsentDecision>;
    if (typeof held.analytics !== "boolean") return undefined;
    if (typeof held.functional !== "boolean") return undefined;
    if (typeof held.marketing !== "boolean") return undefined;
    return {
      analytics: held.analytics,
      functional: held.functional,
      marketing: held.marketing,
    };
  } catch {
    return undefined;
  }
}

export function storeDecision(decision: ConsentDecision): void {
  try {
    browser.localStorage?.setItem(
      CONSENT_BANNER_STORAGE_KEY,
      JSON.stringify(decision),
    );
  } catch {
    // Unrecorded, the answer still governs this page; the next page asks again.
  }
}

export function grantedBy(
  decision: ConsentDecision,
  category: ConsentCategory,
): boolean {
  if (category === "necessary") return true;
  return decision[category];
}
