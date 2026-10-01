import { AYNI_PRIVACY_NOTICE } from "@ayni/env/privacy-notice";
import { CURRENT_TERMS_VERSION } from "@ayni/env/terms";
import { useForm } from "@tanstack/react-form";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import z from "zod";
import { authClient } from "@/lib/auth-client";
import { getBrowserPostAuthRedirect } from "@/lib/post-auth";

import Loader from "./loader";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { ShineBorder } from "./ui/shine-border";

export default function SignUpForm({ onSwitchToSignIn }: { onSwitchToSignIn: () => void }) {
  const router = useRouter();
  const { isPending } = authClient.useSession();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const form = useForm({
    defaultValues: {
      email: "",
      password: "",
      name: "",
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

  if (isPending) {
    return <Loader />;
  }

  if (AYNI_PRIVACY_NOTICE.status !== "published") {
    return (
      <Card className="mx-auto w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Registro temporalmente no disponible</CardTitle>
          <CardDescription>
            Ayni habilitará la creación de cuentas cuando publique su aviso de privacidad completo.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="relative mx-auto w-full max-w-md overflow-hidden">
      <ShineBorder duration={18} shineColor={["rgb(54 182 201)", "rgb(80 126 175)"]} />
      <CardHeader className="text-center">
        <p className="text-primary text-sm">AYNI</p>
        <CardTitle className="text-2xl">Crea tu cuenta</CardTitle>
        <CardDescription>Crea tu cuenta para empezar a configurar aplicaciones.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            form.handleSubmit();
          }}
          className="space-y-4"
        >
          <div>
            <form.Field name="name">
              {(field) => (
                <div className="space-y-2">
                  <Label htmlFor={field.name}>Nombre</Label>
                  <Input
                    id={field.name}
                    name={field.name}
                    autoComplete="name"
                    minLength={2}
                    required
                    className="h-11 text-base"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                  />
                  {field.state.meta.errors.map((error) => (
                    <p key={error?.message} className="text-destructive" role="alert">
                      {error?.message}
                    </p>
                  ))}
                </div>
              )}
            </form.Field>
          </div>

          <div>
            <form.Field name="email">
              {(field) => (
                <div className="space-y-2">
                  <Label htmlFor={field.name}>Correo electrónico</Label>
                  <Input
                    id={field.name}
                    name={field.name}
                    type="email"
                    autoComplete="email"
                    inputMode="email"
                    required
                    className="h-11 text-base"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                  />
                  {field.state.meta.errors.map((error) => (
                    <p key={error?.message} className="text-destructive" role="alert">
                      {error?.message}
                    </p>
                  ))}
                </div>
              )}
            </form.Field>
          </div>

          <div>
            <form.Field name="password">
              {(field) => (
                <div className="space-y-2">
                  <Label htmlFor={field.name}>Contraseña</Label>
                  <Input
                    id={field.name}
                    name={field.name}
                    type="password"
                    autoComplete="new-password"
                    minLength={8}
                    required
                    className="h-11 text-base"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                  />
                  {field.state.meta.errors.map((error) => (
                    <p key={error?.message} className="text-destructive" role="alert">
                      {error?.message}
                    </p>
                  ))}
                </div>
              )}
            </form.Field>
          </div>

          <p className="text-sm">
            Antes de crear tu cuenta, consulta el{" "}
            <a
              className="underline"
              href={`/privacy/ayni/${AYNI_PRIVACY_NOTICE.version}`}
              target="_blank"
              rel="noreferrer"
            >
              Aviso de privacidad de Ayni
            </a>
            .
          </p>

          <form.Field name="acceptedTerms">
            {(field) => (
              <div className="space-y-2">
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    name={field.name}
                    checked={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.checked)}
                  />
                  <span>
                    Acepto los{" "}
                    <a
                      className="underline"
                      href={`/terms/${CURRENT_TERMS_VERSION}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Términos y condiciones de Ayni
                    </a>
                    {" "}y declaro tener 18 años o más.
                  </span>
                </label>
                {field.state.meta.errors.map((error) => (
                  <p key={error?.message} className="text-destructive" role="alert">
                    {error?.message}
                  </p>
                ))}
              </div>
            )}
          </form.Field>

          <form.Subscribe>
            {(state) => (
              <Button type="submit" className="h-11 w-full text-base" disabled={state.isSubmitting}>
                {state.isSubmitting ? "Creando..." : "Crear cuenta"}
              </Button>
            )}
          </form.Subscribe>
        </form>

        {submitError && (
          <p className="mt-4 text-destructive text-sm" role="alert">
            {submitError}
          </p>
        )}

        <div className="mt-4 text-center">
          <Button
            variant="link"
            onClick={onSwitchToSignIn}
            className="min-h-11 text-primary hover:text-primary/80"
          >
            ¿Ya tienes una cuenta? Iniciar sesión
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
