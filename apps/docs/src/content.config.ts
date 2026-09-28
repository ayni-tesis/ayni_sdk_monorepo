import { defineCollection } from "astro:content";
import { docsLoader, i18nLoader } from "@astrojs/starlight/loaders";
import { docsSchema, i18nSchema } from "@astrojs/starlight/schema";
import { changelogLoader, releaseSchema } from "./resources/changelog-loader";

export const collections = {
  docs: defineCollection({ loader: docsLoader(), schema: docsSchema() }),
  i18n: defineCollection({ loader: i18nLoader(), schema: i18nSchema() }),
  // The versions of `ayni_sdk`, from `packages/sdk_flutter/CHANGELOG.md` (US-148).
  releases: defineCollection({ loader: changelogLoader(), schema: releaseSchema }),
};
