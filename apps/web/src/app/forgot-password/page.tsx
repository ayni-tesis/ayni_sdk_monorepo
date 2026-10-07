import type { Metadata } from "next";
import Link from "next/link";
import styles from "@/app/auth/auth-diptych.module.css";
import { ForgotPasswordForm } from "@/app/auth/recovery-forms";

export const metadata: Metadata = {
  title: "Recuperar contraseña | Ayni",
  description: "Solicita un enlace para recuperar el acceso a tu cuenta de Ayni.",
};

export default function ForgotPasswordPage() {
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
            <h1 className={styles.consoleTitle}>Recupera tu contraseña</h1>
            <p className={styles.consoleSubtitle}>
              Te enviaremos instrucciones si existe una cuenta con ese correo.
            </p>
          </div>
          <ForgotPasswordForm />
        </div>
      </section>
    </main>
  );
}
