import type { Metadata } from "next";
import Link from "next/link";
import styles from "@/app/auth/auth-diptych.module.css";
import { ResetPasswordForm } from "@/app/auth/recovery-forms";

export const metadata: Metadata = {
  title: "Nueva contraseña | Ayni",
  description: "Define una nueva contraseña para tu cuenta de Ayni.",
};

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
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
            <h1 className={styles.consoleTitle}>Define una nueva contraseña</h1>
            <p className={styles.consoleSubtitle}>Usa al menos 8 caracteres.</p>
          </div>
          <ResetPasswordForm token={token} />
        </div>
      </section>
    </main>
  );
}
