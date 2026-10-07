import type { Metadata } from "next";
import Link from "next/link";
import styles from "@/app/auth/auth-diptych.module.css";
import { VerifyEmailStatus } from "@/app/auth/recovery-forms";

export const metadata: Metadata = {
  title: "Verificación de correo | Ayni",
  description: "Estado de verificación del correo de tu cuenta de Ayni.",
};

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; verified?: string }>;
}) {
  const { error, verified: verifiedParam } = await searchParams;
  const verified = !error && verifiedParam === "1";
  return (
    <main className={styles.authRoot}>
      <header className={styles.topBar}>
        <Link href="/" className={styles.brandLink} aria-label="Ayni - Inicio">
          <span className={styles.brandText}>ayni</span>
        </Link>
      </header>
      <section className={styles.stageContainer}>
        <div className={styles.consoleCard}>
          <div className={styles.consoleHeader}>
            <h1 className={styles.consoleTitle}>
              {error ? "Enlace no válido" : "Verificación del correo"}
            </h1>
          </div>
          <VerifyEmailStatus error={error} verified={verified} />
        </div>
      </section>
    </main>
  );
}
