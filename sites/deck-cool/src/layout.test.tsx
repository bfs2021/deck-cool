import { Window } from "happy-dom";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import { text } from "@deck-cool/site-kit/build-test";
import Layout from "../components/layout.tsx";

// Renders in Node, where the page reads files when the site builds. A fixture
// README stands in for the installed one, with a size no release has:
// slidedeck's landing.test.tsx gives its home page the same one.
vi.mock("@deck-cool/site-kit/slidedeck-readme", async (original) => {
  const { fixtureReadme } = await import("@deck-cool/site-kit/slidedeck-readme.fixture");
  return {
    ...(await original<typeof import("@deck-cool/site-kit/slidedeck-readme")>()),
    readSlidedeckReadme: () => fixtureReadme("12.34 KB"),
  };
});

test("slidedeck's card shows the size its README gives", () => {
  const page = new Window().document;
  page.body.innerHTML = renderToStaticMarkup(<Layout title="deck.cool" />);
  expect(text(page.querySelector("#slidedeck .card__figure > p"))).toBe("12.34 KB");
});
