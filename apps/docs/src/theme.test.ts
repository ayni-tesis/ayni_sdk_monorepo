import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

type Rgb = [number, number, number];
type Palette = Record<string, Rgb | undefined>;

const css = readFileSync(join(import.meta.dirname, "styles", "theme.css"), "utf8");

/** Reads the `--sl-color-*: rgb(r g b)` declarations of the block that opens with `selector {`. */
function palette(selector: string): Palette {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`theme.css has no "${selector}" block`);
  const block = css.slice(start, css.indexOf("}", start));
  const colors: Palette = {};
  for (const [, name, r, g, b] of block.matchAll(
    /--sl-color-([\w-]+):\s*rgb\((\d+) (\d+) (\d+)\)/g,
  )) {
    colors[name as string] = [Number(r), Number(g), Number(b)];
  }
  return colors;
}

function luminance([r, g, b]: Rgb): number {
  const [lr, lg, lb] = [r, g, b].map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as Rgb;
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

function contrast(a: Rgb, b: Rgb): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

// Text and background pairs Starlight draws with these tokens: body text,
// headings, secondary text (breadcrumbs, edit link, last update) on the page
// and the sidebar, links, and the current sidebar entry.
const dark = palette(":root");
const light = palette(':root[data-theme="light"]');
const themes: Record<string, Palette> = {
  oscuro: {
    ...dark,
    "text-accent": dark["accent-high"],
    "text-invert": dark["accent-low"],
    "bg-accent": dark["accent-high"],
    "bg-sidebar": dark["gray-6"],
  },
  claro: {
    ...light,
    "text-accent": light.accent,
    "text-invert": light.black,
    "bg-accent": light.accent,
    "bg-sidebar": light.black,
  },
};
const pairs = [
  ["gray-2", "black"],
  ["white", "black"],
  ["gray-3", "black"],
  ["gray-2", "bg-sidebar"],
  ["gray-3", "bg-sidebar"],
  ["text-accent", "black"],
  ["text-invert", "bg-accent"],
] as const;

describe.each(Object.entries(themes))("tema %s", (_, colors) => {
  it.each(pairs)("%s sobre %s cumple WCAG AA (4.5:1)", (text, background) => {
    const foreground = colors[text];
    const backdrop = colors[background];
    if (!foreground || !backdrop) throw new Error(`theme.css lacks ${text} or ${background}`);
    expect(contrast(foreground, backdrop)).toBeGreaterThanOrEqual(4.5);
  });
});
