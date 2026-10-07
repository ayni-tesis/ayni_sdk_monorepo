"use client";

import Link from "next/link";
import { type FormEvent, useState } from "react";
import z from "zod";
import { authClient } from "@/lib/auth-client";
import styles from "./auth-diptych.module.css";

const requestSuccess =
  "Si existe una cuenta con ese correo, recibirás instrucciones para recuperar el acceso.";
const invalidLink = "Este enlace ya no es válido. Solicita recuperar tu contraseña nuevamente.";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setError(null);
    if (!z.email().safeParse(email.trim()).success) {
      setError("Ingresa un correo electrónico válido.");
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await authClient.requestPasswordReset({
        email: email.trim(),
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (result.error) throw result.error;
      setMessage(requestSuccess);
    } catch {
      setError("No pudimos procesar la solicitud. Inténtalo nuevamente.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form noValidate onSubmit={submit} className={styles.formBody}>
      <div className={styles.fieldGroup}>
        <label htmlFor="recovery-email" className={styles.fieldLabel}>
          Correo electrónico
        </label>
        <input
          id="recovery-email"
          type="email"
          autoComplete="email"
          required
          className={styles.fieldInput}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "recovery-error" : undefined}
        />
      </div>
      {error && (
        <p id="recovery-error" className={styles.errorCallout} role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className={styles.draftCardText} role="status">
          {message}
        </p>
      )}
      <button type="submit" disabled={isSubmitting} className={styles.actionButton}>
        {isSubmitting ? "Procesando solicitud..." : "Enviar instrucciones"}
      </button>
      <div className={styles.switchBar}>
        <Link href="/sign-in" className={styles.linkButton}>
          Volver a iniciar sesión
        </Link>
      </div>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token?: string }) {
  const [newPassword, setNewPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(token ? null : invalidLink);
  const [isComplete, setIsComplete] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) {
      setError(invalidLink);
      return;
    }
    if (newPassword.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      const result = await authClient.resetPassword({ newPassword, token });
      if (result.error) {
        if (result.error.code === "PASSWORD_TOO_SHORT") {
          setError("La contraseña debe tener al menos 8 caracteres.");
        } else if (result.error.code === "PASSWORD_TOO_LONG") {
          setError("La contraseña nueva no cumple la política vigente del sistema.");
        } else if (result.error.code === "INVALID_TOKEN") {
          setError(invalidLink);
        } else {
          setError("No pudimos actualizar la contraseña. Inténtalo nuevamente.");
        }
        return;
      }
      setIsComplete(true);
    } catch {
      setError("No pudimos actualizar la contraseña. Inténtalo nuevamente.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isComplete) {
    return (
      <div className={styles.formBody}>
        <p className={styles.draftCardText} role="status">
          Contraseña actualizada. Ya puedes iniciar sesión.
        </p>
        <Link href="/sign-in" className={styles.actionButton}>
          Iniciar sesión
        </Link>
      </div>
    );
  }

  if (!token) {
    return (
      <div className={styles.formBody}>
        <p className={styles.errorCallout} role="alert">
          {invalidLink}
        </p>
        <Link href="/forgot-password" className={styles.linkButton}>
          Solicitar otro enlace
        </Link>
      </div>
    );
  }

  return (
    <form noValidate onSubmit={submit} className={styles.formBody}>
      <div className={styles.fieldGroup}>
        <label htmlFor="reset-new-password" className={styles.fieldLabel}>
          Nueva contraseña
        </label>
        <input
          id="reset-new-password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          className={styles.fieldInput}
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "reset-error" : undefined}
        />
      </div>
      {error && (
        <div className={styles.errorCallout} role="alert" id="reset-error">
          <p>{error}</p>
          <Link href="/forgot-password" className={styles.linkButton}>
            Solicitar otro enlace
          </Link>
        </div>
      )}
      <button type="submit" disabled={isSubmitting} className={styles.actionButton}>
        {isSubmitting ? "Actualizando contraseña..." : "Actualizar contraseña"}
      </button>
    </form>
  );
}

export function VerifyEmailStatus({ error }: { error?: string }) {
  return (
    <div className={styles.formBody}>
      {error ? (
        <>
          <p className={styles.errorCallout} role="alert">
            Este enlace ya no es válido. Solicita uno nuevo para verificar tu correo.
          </p>
          <Link href="/dashboard" className={styles.linkButton}>
            Volver a mi perfil para solicitar otro enlace
          </Link>
        </>
      ) : (
        <>
          <p className={styles.draftCardText} role="status">
            Correo verificado. Tu dirección se confirmó correctamente.
          </p>
          <Link href="/dashboard" className={styles.actionButton}>
            Continuar al dashboard
          </Link>
        </>
      )}
    </div>
  );
}
