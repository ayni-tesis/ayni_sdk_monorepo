/**
 * One check of `Verificar documentación`: `run` returns its problems, each a
 * line that names the file, the line and the cause. A check that does not
 * block only warns, like the one for links to other sites (US-150).
 */
export type Check = { name: string; blocking: boolean; run: () => Promise<string[]> };

type Options = {
  log: (line: string) => void;
  /** Also write each problem as a GitHub Actions annotation. */
  annotate: boolean;
};

/**
 * Runs every check, even after one fails, so a single run reports every
 * problem. Returns whether no blocking check failed.
 */
export async function runChecks(checks: Check[], { log, annotate }: Options): Promise<boolean> {
  const failed: string[] = [];
  for (const { name, blocking, run } of checks) {
    let problems: string[];
    try {
      problems = await run();
    } catch (error) {
      problems = [error instanceof Error ? error.message : String(error)];
    }
    if (problems.length === 0) {
      log(`✓ ${name}`);
      continue;
    }
    if (blocking) failed.push(name);
    log(blocking ? `✗ ${name}` : `⚠ ${name} (aviso, no bloquea)`);
    for (const problem of problems) {
      log(`  ${problem}`);
      if (annotate) log(`::${blocking ? "error" : "warning"} title=${name}::${problem}`);
    }
  }
  log(
    failed.length === 0
      ? "Verificar documentación: todas las comprobaciones pasaron."
      : `Verificar documentación: ${failed.length === 1 ? "falló 1 comprobación" : `fallaron ${failed.length} comprobaciones`} (${failed.join(", ")}).`,
  );
  return failed.length === 0;
}
