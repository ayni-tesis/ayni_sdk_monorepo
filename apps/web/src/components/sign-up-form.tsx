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

export default function SignUpForm({ onSwitchToSignIn }: { onSwitchToSignIn: () => void }) {
  const router = useRouter();
  const { isPending } = authClient.useSession();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const form = useForm({
    defaultValues: {
      email: "",
      password: "",
      name: "",
    },
    onSubmit: async ({ value }) => {
      setSubmitError(null);
      await authClient.signUp.email(
        {
          email: value.email,
          password: value.password,
          name: value.name,
        },
        {
          onSuccess: () => {
            router.push("/dashboard");
            toast.success("Cuenta creada correctamente");
          },
          onError: () => {
            const message = "No pudimos crear la cuenta. Revisa los datos e inténtalo de nuevo.";
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
        <CardTitle className="text-2xl">Crea tu cuenta</CardTitle>
        <CardDescription>Crea tu cuenta para empezar a configurar aplicaciones.</CardDescription>
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

        <form.Subscribe>
          {(state) => (
            <Button
              type="submit"
              className="h-11 w-full text-base"
              disabled={state.isSubmitting}
            >
              {state.isSubmitting ? "Creando..." : "Crear cuenta"}
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
          onClick={onSwitchToSignIn}
          className="min-h-11 text-primary hover:text-primary/80"
        >
          ¿Ya tienes una cuenta? Iniciar sesión
        </Button>
      </div></CardContent>
    </Card>
  );
}
