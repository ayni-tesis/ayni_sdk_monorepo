import { describe, expect, it } from "vitest";
import { type Check, runChecks } from "./checks";

function check(name: string, problems: string[], blocking = true): Check {
  return { name, blocking, run: async () => problems };
}

async function run(checks: Check[], annotate = false) {
  const lines: string[] = [];
  const passed = await runChecks(checks, { log: (line) => lines.push(line), annotate });
  return { passed, lines };
}

describe("runChecks", () => {
  it("passes when every check passes", async () => {
    const result = await run([check("Ejemplos Dart", []), check("Enlaces internos", [])]);

    expect(result).toEqual({
      passed: true,
      lines: [
        "✓ Ejemplos Dart",
        "✓ Enlaces internos",
        "Verificar documentación: todas las comprobaciones pasaron.",
      ],
    });
  });

  it("fails after running every check, naming each problem and the checks that failed", async () => {
    const result = await run([
      check("Enlaces internos", [
        "Enlace roto: /referencia/estados/#uptodate en comenzar/inicio-rapido.mdx:42 (la página no tiene el ancla #uptodate)",
      ]),
      check("Ejemplos Dart", []),
      {
        name: "OpenAPI",
        blocking: true,
        run: async () => {
          throw new Error("spawn bun ENOENT");
        },
      },
    ]);

    expect(result).toEqual({
      passed: false,
      lines: [
        "✗ Enlaces internos",
        "  Enlace roto: /referencia/estados/#uptodate en comenzar/inicio-rapido.mdx:42 (la página no tiene el ancla #uptodate)",
        "✓ Ejemplos Dart",
        "✗ OpenAPI",
        "  spawn bun ENOENT",
        "Verificar documentación: fallaron 2 comprobaciones (Enlaces internos, OpenAPI).",
      ],
    });
  });

  it("only warns about a check that does not block, such as external links", async () => {
    const result = await run([
      check(
        "Enlaces externos",
        ["Enlace externo no disponible: https://x.example en a.md:1 (HTTP 503)"],
        false,
      ),
    ]);

    expect(result).toEqual({
      passed: true,
      lines: [
        "⚠ Enlaces externos (aviso, no bloquea)",
        "  Enlace externo no disponible: https://x.example en a.md:1 (HTTP 503)",
        "Verificar documentación: todas las comprobaciones pasaron.",
      ],
    });
  });

  it("writes each problem as a GitHub Actions annotation in CI", async () => {
    const result = await run(
      [
        check("Enlaces internos", ["Enlace roto: /x en a.md:1 (no existe la página)"]),
        check(
          "Enlaces externos",
          ["Enlace externo no disponible: https://x.example en a.md:2 (HTTP 503)"],
          false,
        ),
      ],
      true,
    );

    expect(result.lines).toContain(
      "::error title=Enlaces internos::Enlace roto: /x en a.md:1 (no existe la página)",
    );
    expect(result.lines).toContain(
      "::warning title=Enlaces externos::Enlace externo no disponible: https://x.example en a.md:2 (HTTP 503)",
    );
  });
});
