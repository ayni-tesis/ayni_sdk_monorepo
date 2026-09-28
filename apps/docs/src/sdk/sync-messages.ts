/** One text `SyncResourceResult.message` can return, and when it does. */
export type SyncResourceMessage = {
  status: string;
  /** Set when the text depends on `previousVersionRetained`. */
  previousVersionRetained?: boolean;
  /** Set when the text is the one for a model whose hash changed. */
  remoteHashConflict?: boolean;
  /** The Dart text, with its interpolations (such as `$name`) as written. */
  message: string;
};

/**
 * Every text of the `SyncResourceResult.message` getter in `source`, in
 * declaration order, so `Referencia → Estados y errores` (US-146) quotes them
 * exactly as the SDK returns them.
 */
export function syncResourceMessages(source: string): SyncResourceMessage[] {
  const text = source.replace(/\r\n/g, "\n");
  const start = text.indexOf("String? get message =>");
  // The getter ends with its `switch`, at the first `};` after it.
  const end = start === -1 ? null : /\n\s*\};/.exec(text.slice(start));
  if (start === -1 || !end) {
    throw new Error("The source has no SyncResourceResult.message getter.");
  }
  const getter = text.slice(start, start + end.index);

  const conflicts = [
    ...getter.matchAll(
      /status == SyncResourceStatus\.(\w+) && remoteHashConflict\s*\?\s*'([^']+)'/g,
    ),
  ].map(([, status, message]) => ({
    status: status ?? "",
    remoteHashConflict: true,
    message: message ?? "",
  }));

  const arms = [
    ...getter.matchAll(
      /SyncResourceStatus\.(\w+)(?:\s+(when previousVersionRetained))?\s*=>\s*'([^']+)'/g,
    ),
  ];
  const statusesByPreviousVersion = new Set(
    arms.filter(([, , when]) => when).map(([, status]) => status),
  );
  const cases = arms.map(([, status, when, message]) => ({
    status: status ?? "",
    ...(statusesByPreviousVersion.has(status)
      ? { previousVersionRetained: when !== undefined }
      : {}),
    message: message ?? "",
  }));

  return [...conflicts, ...cases];
}
