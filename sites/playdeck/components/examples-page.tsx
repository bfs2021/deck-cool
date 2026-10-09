import { Children, type ReactNode } from "react";
import { unescapedHtml } from "@pagedeck/core/tree";
import { PAGE } from "./shell.ts";

/** One file an archetype is made of, as it is on disk, highlighted at build time. */
export interface SourceFile {
  /** The file's path in this repo, from the site's root. */
  readonly path: string;
  readonly html: string;
}

/** The file under a player, closed until a reader opens it. A <details>, so it opens with no script. */
function Source({ path, html }: SourceFile) {
  return (
    <details className="pd-source">
      <summary className="pd-source__summary">
        <code>{path}</code>
      </summary>
      <div className="pd-source__well" {...unescapedHtml(html)} />
    </details>
  );
}

/**
 * playdeck.video's /examples, with its copy as it stood on 2026-10-09 (#15):
 * two composed players, each beside the files it is. The two players arrive
 * as the children, streaming service first, because a tree position is what
 * fold tuning reads.
 */
export default function ExamplesPage({
  streaming,
  course,
  children,
}: {
  streaming: readonly SourceFile[];
  course: readonly SourceFile[];
  children?: ReactNode;
}) {
  const [streamingPlayer, coursePlayer] = Children.toArray(children);
  return (
    <div className={`${PAGE} pd-examples`}>
      <h1>Examples</h1>
      <p className="pd-lede">
        Two composed players, built from the same primitives for two different jobs. Each is named for its job and not
        for a company that does it, and each is printed below exactly as it is on disk: the component, then its
        stylesheet.
      </p>
      <p className="pd-muted">
        Both players are dormant until you press them. <code>loading="interaction"</code> holds the root closed, so no
        clip is fetched and no provider is attached before that press — this page makes no third-party request until you
        ask it to. Every control you then see is one the player reported it can honour; the ones it cannot are absent
        rather than present and disabled.
      </p>

      <section className="pd-archetype" aria-labelledby="streaming-service">
        <h2 id="streaming-service">A streaming service</h2>
        <p>
          Long-form viewing. The picture owns the frame, the chrome sits on top of it, chapters are marks on the
          scrubber, and the one thing a viewer chooses — quality — is folded into a settings menu. That menu is absent
          here, and that is the point: the native provider cannot switch renditions of a progressive file, so{" "}
          <code>selectQuality</code> reads <code>unavailable</code> and nothing draws a ladder the provider never
          published. The caption toggle prints the renderer that actually honoured it beside itself.
        </p>
        <div className="pd-stage">{streamingPlayer}</div>
        {streaming.map((file) => (
          <Source key={file.path} {...file} />
        ))}
      </section>

      <section className="pd-archetype" aria-labelledby="course-platform">
        <h2 id="course-platform">A course platform</h2>
        <p>
          Study rather than viewing, and deliberately not the layout above with different colours. The video shares the
          page with the lesson instead of owning it; the transport is docked under the picture rather than laid over it,
          so nothing ever covers what is being read; playback speed is a visible row rather than a menu entry, because
          somebody working through a recording changes it constantly; and navigation is an outline of real buttons
          rather than ticks on a bar.
        </p>
        <div className="pd-stage">{coursePlayer}</div>
        {course.map((file) => (
          <Source key={file.path} {...file} />
        ))}
      </section>

      <section className="pd-archetype" aria-labelledby="media">
        <h2 id="media">Media and licence</h2>
        <p>
          Both clips are Blender Foundation open-movie trailers, played from the foundation's own download host:{" "}
          <em>Sintel</em> above and <em>Big Buck Bunny</em> below it. Both are © Blender Foundation and licensed{" "}
          <a href="https://creativecommons.org/licenses/by/3.0/" rel="license">
            CC BY 3.0
          </a>
          , which is the attribution this line exists to give.
        </p>
        <p className="pd-muted">
          Chapter marks, outline titles and caption text are fixtures the examples ship. They mark time in each clip and
          describe neither film — a demo that implied it had read metadata it invented would be the one dishonest thing
          on a page about honesty.
        </p>
      </section>
    </div>
  );
}
