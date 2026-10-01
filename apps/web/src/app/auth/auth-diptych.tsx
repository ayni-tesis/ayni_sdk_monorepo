"use client";

import { AYNI_PRIVACY_NOTICE } from "@ayni/env/privacy-notice";
import { CURRENT_TERMS_VERSION } from "@ayni/env/terms";
import { useForm } from "@tanstack/react-form";
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import z from "zod";
import { authClient } from "@/lib/auth-client";
import { getBrowserPostAuthRedirect } from "@/lib/post-auth";
import styles from "./auth-diptych.module.css";

export type AuthMode = "sign-in" | "sign-up";

interface AuthDiptychProps {
  initialMode: AuthMode;
}

export function AuthDiptych({ initialMode }: AuthDiptychProps) {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const { isPending: isSessionPending } = authClient.useSession();

  const handleModeChange = (newMode: AuthMode) => {
    setSubmitError(null);
    setMode(newMode);
    if (newMode === "sign-in") {
      router.push("/sign-in" as Route);
    } else {
      router.push("/sign-up" as Route);
    }
  };

  const signInForm = useForm({
    defaultValues: {
      email: "",
      password: "",
      acceptUpdatedTerms: false,
    },
    onSubmit: async ({ value }) => {
      setSubmitError(null);
      await authClient.signIn.email(
        {
          email: value.email,
          password: value.password,
          termsAcceptedVersion: value.acceptUpdatedTerms ? CURRENT_TERMS_VERSION : "",
        } as Parameters<typeof authClient.signIn.email>[0] & { termsAcceptedVersion: string },
        {
          onSuccess: () => {
            router.push(getBrowserPostAuthRedirect());
            toast.success(
              value.acceptUpdatedTerms
                ? "Términos aceptados. Sesión iniciada correctamente."
                : "Sesión iniciada correctamente",
            );
          },
          onError: () => {
            const message =
              "No pudimos iniciar sesión. Revisa tu correo y contraseña e inténtalo de nuevo.";
            setSubmitError(message);
            toast.error(message);
          },
        },
      );
    },
    validators: {
      onSubmit: z.object({
        email: z.email("Ingresa un correo electrónico válido."),
        password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres."),
        acceptUpdatedTerms: z.boolean(),
      }),
    },
  });

  const signUpForm = useForm({
    defaultValues: {
      name: "",
      email: "",
      password: "",
      acceptedTerms: false,
    },
    onSubmit: async ({ value }) => {
      setSubmitError(null);
      await authClient.signUp.email(
        {
          email: value.email,
          password: value.password,
          name: value.name,
          termsAcceptedVersion: value.acceptedTerms ? CURRENT_TERMS_VERSION : "",
        } as Parameters<typeof authClient.signUp.email>[0] & { termsAcceptedVersion: string },
        {
          onSuccess: () => {
            router.push(getBrowserPostAuthRedirect());
            toast.success("Términos aceptados. Cuenta creada correctamente.");
          },
          onError: () => {
            const message = "No pudimos registrar tu aceptación. Inténtalo nuevamente.";
            setSubmitError(message);
            toast.error(message);
          },
        },
      );
    },
    validators: {
      onSubmit: z.object({
        name: z.string().min(2, "El nombre debe tener al menos 2 caracteres."),
        email: z.email("Ingresa un correo electrónico válido."),
        password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres."),
        acceptedTerms: z.literal(true, {
          error: "Debes aceptar los Términos y condiciones para crear tu cuenta.",
        }),
      }),
    },
  });

  return (
    <div className={styles.authRoot}>
      {/* Top minimal bar */}
      <header className={styles.topBar}>
        <Link href="/" className={styles.brandLink} aria-label="Ayni - Inicio">
          <svg
            className={styles.brandGlyph}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 2L2 7l10 5 10-5-10-5z" />
            <path d="M2 17l10 5 10-5" />
            <path d="M2 12l10 5 10-5" />
          </svg>
          <span className={styles.brandText}>ayni</span>
        </Link>

        <div className={styles.statusIndicator} aria-label="Estado del runtime">
          <span className={styles.statusDot} aria-hidden="true" />
          <span>RUNTIME READY</span>
        </div>
      </header>

      {/* Monolithic Console Stage */}
      <main className={styles.stageContainer}>
        <div className={styles.consoleCard}>
          <div className={`${styles.cornerMarker} ${styles.cornerTopLeft}`} aria-hidden="true" />
          <div className={`${styles.cornerMarker} ${styles.cornerBottomRight}`} aria-hidden="true" />

          <div className={styles.consoleHeader}>
            <h1 className={styles.consoleTitle}>
              {mode === "sign-in" ? "Inicia sesión" : "Crea tu cuenta"}
            </h1>
            <p className={styles.consoleSubtitle}>
              {mode === "sign-in"
                ? "Accede a tus workspaces y orquesta modelos en el dispositivo."
                : "Aprovisiona tu cuenta de desarrollador para compilar grafos de inferencia."}
            </p>
          </div>

          {/* Segmented Switcher */}
          <div className={styles.segmentedControl} role="tablist" aria-label="Modo de acceso">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "sign-in"}
              className={`${styles.segmentBtn} ${mode === "sign-in" ? styles.segmentActive : ""}`}
              onClick={() => handleModeChange("sign-in")}
            >
              Iniciar sesión
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "sign-up"}
              className={`${styles.segmentBtn} ${mode === "sign-up" ? styles.segmentActive : ""}`}
              onClick={() => handleModeChange("sign-up")}
            >
              Registrarse
            </button>
          </div>

          {mode === "sign-in" ? (
            <form
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                e.stopPropagation();
                signInForm.handleSubmit();
              }}
              className={styles.formBody}
            >
              <signInForm.Field name="email">
                {(field) => (
                  <div className={styles.fieldGroup}>
                    <div className={styles.fieldHeader}>
                      <label htmlFor={field.name} className={styles.fieldLabel}>
                        Correo electrónico
                      </label>
                    </div>
                    <div className={styles.inputWrapper}>
                      <input
                        id={field.name}
                        name={field.name}
                        type="email"
                        autoComplete="email"
                        inputMode="email"
                        required
                        aria-invalid={field.state.meta.errors.length > 0}
                        aria-describedby={`${field.name}-error`}
                        className={styles.fieldInput}
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                        placeholder="tu@organizacion.com"
                      />
                    </div>
                    {field.state.meta.errors.map((error) => (
                      <p
                        id={`${field.name}-error`}
                        key={error?.message}
                        className={styles.fieldError}
                        role="alert"
                      >
                        {error?.message}
                      </p>
                    ))}
                  </div>
                )}
              </signInForm.Field>

              <signInForm.Field name="password">
                {(field) => (
                  <div className={styles.fieldGroup}>
                    <div className={styles.fieldHeader}>
                      <label htmlFor={field.name} className={styles.fieldLabel}>
                        Contraseña
                      </label>
                      <span id={`${field.name}-hint`} className={styles.fieldHint}>
                        Mín. 8 caracteres
                      </span>
                    </div>
                    <div className={styles.inputWrapper}>
                      <input
                        id={field.name}
                        name={field.name}
                        type="password"
                        autoComplete="current-password"
                        minLength={8}
                        required
                        aria-invalid={field.state.meta.errors.length > 0}
                        aria-describedby={`${field.name}-hint ${field.name}-error`}
                        className={styles.fieldInput}
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                      />
                    </div>
                    {field.state.meta.errors.map((error) => (
                      <p
                        id={`${field.name}-error`}
                        key={error?.message}
                        className={styles.fieldError}
                        role="alert"
                      >
                        {error?.message}
                      </p>
                    ))}
                  </div>
                )}
              </signInForm.Field>

              <signInForm.Field name="acceptUpdatedTerms">
                {(field) => (
                  <label className={styles.checkboxContainer}>
                    <input
                      type="checkbox"
                      name={field.name}
                      checked={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.checked)}
                      className={styles.checkboxControl}
                    />
                    <span>
                      Si los términos cambiaron, acepto la versión vigente tras revisarla en{" "}
                      <a
                        href={`/terms/${CURRENT_TERMS_VERSION}`}
                        className={styles.linkButton}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Términos y condiciones
                      </a>
                      .
                    </span>
                  </label>
                )}
              </signInForm.Field>

              <signInForm.Subscribe>
                {(state) => (
                  <button
                    type="submit"
                    disabled={state.isSubmitting || isSessionPending}
                    className={styles.actionButton}
                  >
                    <span>{state.isSubmitting ? "Iniciando sesión..." : "Iniciar sesión"}</span>
                    <span className={styles.enterKeyHint} aria-hidden="true">
                      ↵
                    </span>
                  </button>
                )}
              </signInForm.Subscribe>

              {submitError && (
                <p className={styles.errorCallout} role="alert">
                  {submitError}
                </p>
              )}

              <div className={styles.switchBar}>
                <span>¿No tienes una cuenta aún?</span>
                <button
                  type="button"
                  onClick={() => handleModeChange("sign-up")}
                  className={styles.linkButton}
                >
                  Registrarse
                </button>
              </div>
            </form>
          ) : AYNI_PRIVACY_NOTICE.status !== "published" ? (
            <div className={styles.draftCard}>
              <h2 className={styles.draftCardTitle}>Registro temporalmente no disponible</h2>
              <p className={styles.draftCardText}>
                Ayni habilitará la creación de cuentas cuando publique su aviso de privacidad
                completo. Mientras tanto, puedes iniciar sesión con cuentas previamente
                aprovisionadas.
              </p>
              <div className={styles.switchBar}>
                <span>¿Ya tienes credenciales?</span>
                <button
                  type="button"
                  onClick={() => handleModeChange("sign-in")}
                  className={styles.linkButton}
                >
                  Iniciar sesión
                </button>
              </div>
            </div>
          ) : (
            <form
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                e.stopPropagation();
                signUpForm.handleSubmit();
              }}
              className={styles.formBody}
            >
              <signUpForm.Field name="name">
                {(field) => (
                  <div className={styles.fieldGroup}>
                    <div className={styles.fieldHeader}>
                      <label htmlFor={field.name} className={styles.fieldLabel}>
                        Nombre completo
                      </label>
                    </div>
                    <div className={styles.inputWrapper}>
                      <input
                        id={field.name}
                        name={field.name}
                        type="text"
                        autoComplete="name"
                        minLength={2}
                        required
                        aria-invalid={field.state.meta.errors.length > 0}
                        aria-describedby={`${field.name}-error`}
                        className={styles.fieldInput}
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                        placeholder="Ada Lovelace"
                      />
                    </div>
                    {field.state.meta.errors.map((error) => (
                      <p
                        id={`${field.name}-error`}
                        key={error?.message}
                        className={styles.fieldError}
                        role="alert"
                      >
                        {error?.message}
                      </p>
                    ))}
                  </div>
                )}
              </signUpForm.Field>

              <signUpForm.Field name="email">
                {(field) => (
                  <div className={styles.fieldGroup}>
                    <div className={styles.fieldHeader}>
                      <label htmlFor={field.name} className={styles.fieldLabel}>
                        Correo electrónico
                      </label>
                    </div>
                    <div className={styles.inputWrapper}>
                      <input
                        id={field.name}
                        name={field.name}
                        type="email"
                        autoComplete="email"
                        inputMode="email"
                        required
                        aria-invalid={field.state.meta.errors.length > 0}
                        aria-describedby={`${field.name}-error`}
                        className={styles.fieldInput}
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                        placeholder="tu@organizacion.com"
                      />
                    </div>
                    {field.state.meta.errors.map((error) => (
                      <p
                        id={`${field.name}-error`}
                        key={error?.message}
                        className={styles.fieldError}
                        role="alert"
                      >
                        {error?.message}
                      </p>
                    ))}
                  </div>
                )}
              </signUpForm.Field>

              <signUpForm.Field name="password">
                {(field) => (
                  <div className={styles.fieldGroup}>
                    <div className={styles.fieldHeader}>
                      <label htmlFor={field.name} className={styles.fieldLabel}>
                        Contraseña
                      </label>
                      <span id={`${field.name}-hint`} className={styles.fieldHint}>
                        Mín. 8 caracteres
                      </span>
                    </div>
                    <div className={styles.inputWrapper}>
                      <input
                        id={field.name}
                        name={field.name}
                        type="password"
                        autoComplete="new-password"
                        minLength={8}
                        required
                        aria-invalid={field.state.meta.errors.length > 0}
                        aria-describedby={`${field.name}-hint ${field.name}-error`}
                        className={styles.fieldInput}
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                      />
                    </div>
                    {field.state.meta.errors.map((error) => (
                      <p
                        id={`${field.name}-error`}
                        key={error?.message}
                        className={styles.fieldError}
                        role="alert"
                      >
                        {error?.message}
                      </p>
                    ))}
                  </div>
                )}
              </signUpForm.Field>

              <signUpForm.Field name="acceptedTerms">
                {(field) => (
                  <div className={styles.fieldGroup}>
                    <label className={styles.checkboxContainer}>
                      <input
                        type="checkbox"
                        name={field.name}
                        checked={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.checked)}
                        className={styles.checkboxControl}
                      />
                      <span>
                        Acepto los{" "}
                        <a
                          href={`/terms/${CURRENT_TERMS_VERSION}`}
                          className={styles.linkButton}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Acepto los Términos y condiciones ({CURRENT_TERMS_VERSION}) y declaro
                          tener 18 años o más.
                        </a>.
                      </span>
                    </label>
                    {field.state.meta.errors.map((error) => (
                      <p key={error?.message} className={styles.fieldError} role="alert">
                        {error?.message}
                      </p>
                    ))}
                  </div>
                )}
              </signUpForm.Field>

              <signUpForm.Subscribe>
                {(state) => (
                  <button
                    type="submit"
                    disabled={state.isSubmitting || isSessionPending}
                    className={styles.actionButton}
                  >
                    <span>{state.isSubmitting ? "Creando cuenta..." : "Crear cuenta"}</span>
                    <span className={styles.enterKeyHint} aria-hidden="true">
                      ↵
                    </span>
                  </button>
                )}
              </signUpForm.Subscribe>

              {submitError && (
                <p className={styles.errorCallout} role="alert">
                  {submitError}
                </p>
              )}

              <div className={styles.switchBar}>
                <span>¿Ya tienes una cuenta registrada?</span>
                <button
                  type="button"
                  onClick={() => handleModeChange("sign-in")}
                  className={styles.linkButton}
                >
                  Iniciar sesión
                </button>
              </div>
            </form>
          )}
        </div>
      </main>

      {/* Minimal Bottom Colophon */}
      <footer className={styles.bottomColophon}>
        <div>
          <span>AYNI // RUNTIME 0.1.0 · ON-DEVICE DAG ENGINE</span>
        </div>
        <div className={styles.legalLinks}>
          <a href={`/terms/${CURRENT_TERMS_VERSION}`} className={styles.legalLink}>
            Términos
          </a>
          <span className={styles.legalSep} aria-hidden="true">
            /
          </span>
          <a href={`/privacy/ayni/${AYNI_PRIVACY_NOTICE.version}`} className={styles.legalLink}>
            Aviso de Privacidad
          </a>
        </div>
      </footer>
    </div>
  );
}
