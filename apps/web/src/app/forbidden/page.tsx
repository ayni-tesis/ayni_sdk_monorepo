/* Hallmark · pre-emit critique: P5 H4 E4 S5 R5 V3 */

import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function ForbiddenPage() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-6 py-16 text-foreground">
      <section
        aria-labelledby="forbidden-title"
        className="w-full max-w-lg rounded-lg border border-border bg-card p-6 sm:p-8"
      >
        <p className="font-mono text-muted-foreground text-sm">403 · Acceso denegado</p>
        <h1 id="forbidden-title" className="mt-4 font-semibold text-3xl tracking-tight">
          No tienes permisos
        </h1>
        <p className="mt-4 text-muted-foreground text-sm leading-6 sm:text-base">
          No puedes ver esta pantalla. Si necesitas acceso, consulta a un administrador de tu
          workspace.
        </p>
        <Button asChild className="mt-6">
          <Link href="/dashboard">Volver al panel</Link>
        </Button>
      </section>
    </main>
  );
}
