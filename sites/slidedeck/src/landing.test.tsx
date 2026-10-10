import { Window } from "happy-dom";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import { text } from "@deck-cool/site-kit/build-test";
import Landing from "../components/landing.tsx";

// Renders in Node, where the page reads files when the site builds. A fixture
// README stands in for the installed one, with a size no release has:
// deck.cool's layout.test.tsx gives its card the same one.
vi.mock("@deck-cool/site-kit/slidedeck-readme", async (original) => {
  const { fixtureReadme } = await import("@deck-cool/site-kit/slidedeck-readme.fixture");
  return {
    ...(await original<typeof import("@deck-cool/site-kit/slidedeck-readme")>()),
    readSlidedeckReadme: () => fixtureReadme("12.34 KB"),
  };
});

test("the home page shows the size its README gives, in the proof and in the small section", () => {
  const page = new Window().document;
  page.body.innerHTML = renderToStaticMarkup(<Landing />);
  expect(text(page.querySelector(".home-proof__figure > p"))).toBe("12.34 KB");
  expect(text(page.getElementById("small")?.parentElement?.querySelector("p"))).toContain(
    "a carousel with Prev and Next is 12.34 KB, min+gzip",
  );
});
