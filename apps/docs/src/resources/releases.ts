import { getCollection } from "astro:content";

/** The versions of the `releases` collection, newest first as in `CHANGELOG.md` (US-148). */
export async function releases() {
  return (await getCollection("releases"))
    .map(({ data }) => data)
    .sort((a, b) => a.order - b.order);
}
