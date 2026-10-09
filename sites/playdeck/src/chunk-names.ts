import type { BuildSection } from "@pagedeck/core";

type SitePlugin = NonNullable<NonNullable<BuildSection["vite"]>["plugins"]>[number];

const PACKAGE = /^@playdeck\/(core|provider-[a-z]+)$/;
const PREFIX = "\0playdeck-";

/**
 * Names each @playdeck/* chunk for its package. Every one of them is
 * `dist/index.js`, so the bundler names their chunks all `dist`, and Pagedeck
 * 0.2.3 refuses two chunks under one name. Each package is reached through a
 * module named for it that re-exports it, and the bundler names the chunk for
 * that. What loads, and when, is unchanged: a provider is still a dynamic
 * import, fetched when a player plays.
 */
export function playdeckChunkNames(): SitePlugin {
  return {
    name: "playdeck:chunk-names",
    enforce: "pre",
    resolveId(source: string, importer: string | undefined) {
      const match = PACKAGE.exec(source);
      if (match === null || importer?.startsWith(PREFIX)) return null;
      return `${PREFIX}${match[1]}.js`;
    },
    load(id: string) {
      if (!id.startsWith(PREFIX)) return null;
      const name = id.slice(PREFIX.length, -".js".length);
      return `export * from "@playdeck/${name}";`;
    },
  };
}
