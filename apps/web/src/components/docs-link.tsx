import { env } from "@ayni/env/web";
import type * as React from "react";
import { type DocsPage, docsPages } from "@/lib/docs-pages";

/** Keeps any path of `NEXT_PUBLIC_DOCS_URL`, such as `https://example.com/docs`. */
export function docsUrl(page: DocsPage): string {
  const base = env.NEXT_PUBLIC_DOCS_URL.endsWith("/")
    ? env.NEXT_PUBLIC_DOCS_URL
    : `${env.NEXT_PUBLIC_DOCS_URL}/`;
  return new URL(docsPages[page].slice(1), base).href;
}

export type DocsLinkProps = Omit<React.ComponentProps<"a">, "href" | "target" | "rel"> & {
  page: DocsPage;
};

/**
 * A link to a page of the SDK documentation (US-149). It opens in a new tab,
 * so the dashboard keeps its open dialogs and unsaved data. Without a
 * `className`, it looks like an inline text link.
 */
export function DocsLink({
  page,
  children,
  className = "text-primary text-sm underline-offset-4 hover:underline",
  ...props
}: DocsLinkProps) {
  return (
    <a
      href={docsUrl(page)}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      {...props}
    >
      {children} <span className="sr-only">(se abre en una pestaña nueva)</span>
    </a>
  );
}
