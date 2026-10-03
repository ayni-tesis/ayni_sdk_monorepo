/* Hallmark · pre-emit critique: P5 H4 E4 S5 R5 V3 */

import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function ForbiddenPage() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-6 py-16 text-foreground">
      <section
        aria-labelledby="forbidden-title"
        className="w-full max-w-lg rounded-xl border border-border bg-card p-8 shadow-sm sm:p-10"
      >
        <p className="font-mono text-sm text-muted-foreground">403 · ACCESO DENEGADO</p>
        <h1 id="forbidden-title" className="mt-5 text-3xl font-semibold tracking-tight">
          No tienes permisos
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground sm:text-base">
          No puedes ver esta pantalla. Si necesitas acceso, consulta a un administrador de tu
          workspace.
        </p>
        <Button asChild className="mt-7">
          <Link href="/dashboard">Volver al panel</Link>
        </Button>
      </section>
    </main>
  );
}
