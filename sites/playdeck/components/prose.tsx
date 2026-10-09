import { unescapedHtml } from "@pagedeck/core/tree";

/** A stretch of rendered markdown. Not an island: it ships no JavaScript. */
export default function Prose({ html }: { html: string }) {
  return <div {...unescapedHtml(html)} />;
}
