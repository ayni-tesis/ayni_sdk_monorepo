import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Loader } from "astro/loaders";
import { z } from "astro/zod";
import { parseChangelog, releaseSections, sectionTitles, stabilities } from "./changelog";

/** A version of `ayni_sdk` ready for `Notas de versión y compatibilidad`, its Markdown as HTML. */
export const releaseSchema = z.object({
  /** Its position in `CHANGELOG.md`: 0 is the newest version. */
  order: z.number(),
  version: z.string(),
  date: z.string(),
  stability: z.enum(stabilities),
  breaking: z.boolean(),
  summary: z.string(),
  sections: z.array(z.object({ title: z.enum(sectionTitles), html: z.string() })),
});

/**
 * Loads the versions of `packages/sdk_flutter/CHANGELOG.md`, the file pub.dev
 * also shows, so the site keeps no copy of the notes (US-148). A malformed
 * entry fails the build with `parseChangelog`'s error.
 */
export function changelogLoader(): Loader {
  return {
    name: "ayni-sdk-changelog",
    load: async ({ config, store, parseData, renderMarkdown, generateDigest, watcher }) => {
      const file = fileURLToPath(new URL("../../packages/sdk_flutter/CHANGELOG.md", config.root));
      const html = async (markdown: string) =>
        markdown === "" ? "" : (await renderMarkdown(markdown)).html;

      const sync = async () => {
        const releases = parseChangelog(await readFile(file, "utf8"));
        store.clear();
        for (const [order, release] of releases.entries()) {
          const data = await parseData({
            id: release.version,
            data: {
              order,
              version: release.version,
              date: release.date,
              stability: release.stability,
              breaking: release.sections["Cambios incompatibles"] !== undefined,
              summary: await html(release.summary),
              sections: await Promise.all(
                releaseSections(release).map(async ({ title, markdown }) => ({
                  title,
                  html: await html(markdown),
                })),
              ),
            },
          });
          store.set({ id: release.version, data, digest: generateDigest(data) });
        }
      };

      await sync();
      watcher?.add(file);
      watcher?.on("change", (changed) => {
        if (resolve(changed) === resolve(file)) void sync();
      });
    },
  };
}
