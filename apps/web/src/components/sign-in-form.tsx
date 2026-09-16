import { useForm } from "@tanstack/react-form";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import z from "zod";

import { authClient } from "@/lib/auth-client";

import Loader from "./loader";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { ShineBorder } from "./ui/shine-border";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

export default function SignInForm({ onSwitchToSignUp }: { onSwitchToSignUp: () => void }) {
  const router = useRouter();
  const { isPending } = authClient.useSession();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const form = useForm({
    defaultValues: {
      email: "",
      password: "",
    },
    onSubmit: async ({ value }) => {
      setSubmitError(null);
      await authClient.signIn.email(
        {
          email: value.email,
          password: value.password,
        },
        {
          onSuccess: () => {
            router.push("/dashboard");
            toast.success("Sesión iniciada correctamente");
          },
          onError: () => {
            const message = "No pudimos iniciar sesión. Revisa tu correo y contraseña e inténtalo de nuevo.";
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
      }),
    },
  });

  if (isPending) {
    return <Loader />;
  }

  return (
    <Card className="relative mx-auto w-full max-w-md overflow-hidden"><ShineBorder duration={18} shineColor={["rgb(54 182 201)", "rgb(80 126 175)"]} />
      <CardHeader className="text-center">
        <p className="text-sm text-primary">AYNI</p>
        <CardTitle className="text-2xl">Inicia sesión</CardTitle>
        <CardDescription>Accede a Ayni y continúa donde lo dejaste.</CardDescription>
      </CardHeader>
      <CardContent><form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          form.handleSubmit();
        }}
        className="space-y-4"
      >
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
                  aria-invalid={field.state.meta.errors.length > 0}
                  aria-describedby={`${field.name}-error`}
                  className="h-11 text-base"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
                {field.state.meta.errors.map((error) => (
                  <p id={`${field.name}-error`} key={error?.message} className="text-destructive" role="alert">
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
                  autoComplete="current-password"
                  minLength={8}
                  required
                  aria-invalid={field.state.meta.errors.length > 0}
                  aria-describedby={`${field.name}-hint ${field.name}-error`}
                  className="h-11 text-base"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
                <p id={`${field.name}-hint`} className="text-muted-foreground text-sm">
                  Usa la contraseña de tu cuenta. Mínimo 8 caracteres.
                </p>
                {field.state.meta.errors.map((error) => (
                  <p id={`${field.name}-error`} key={error?.message} className="text-destructive" role="alert">
                    {error?.message}
                  </p>
                ))}
              </div>
            )}
          </form.Field>
        </div>

        <form.Subscribe>
          {(state) => (
            <Button
              type="submit"
              className="h-11 w-full text-base"
              disabled={state.isSubmitting}
            >
              {state.isSubmitting ? "Iniciando sesión..." : "Iniciar sesión"}
            </Button>
          )}
        </form.Subscribe>
      </form>

      {submitError && (
        <p className="mt-4 text-sm text-destructive" role="alert">
          {submitError}
        </p>
      )}

      <div className="mt-4 text-center">
        <Button
          variant="link"
          onClick={onSwitchToSignUp}
          className="min-h-11 text-primary hover:text-primary/80"
        >
          ¿Primera vez en Ayni? Crear una cuenta
        </Button>
      </div></CardContent>
    </Card>
  );
}
