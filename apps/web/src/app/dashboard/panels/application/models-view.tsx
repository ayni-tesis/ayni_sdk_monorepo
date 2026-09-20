"use client";

import { IconCpu } from "@tabler/icons-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { errorMessage } from "@/lib/api-error";
import { httpClient } from "@/lib/http-client";
import type { Application } from "../../types";

export type RegisterModelDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  modelName: string;
  setModelName: (name: string) => void;
  modelError: string;
  setModelError: (error: string) => void;
  registering: boolean;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
};

export function RegisterModelDialog({
  open,
  onOpenChange,
  modelName,
  setModelName,
  modelError,
  setModelError,
  registering,
  onSubmit,
}: RegisterModelDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          setModelName("");
          setModelError("");
        }
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar modelo</DialogTitle>
          <DialogDescription className="sr-only">
            Registra un nuevo modelo TensorFlow Lite para esta aplicación.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="model-name" className="font-semibold text-sm">
              Nombre del modelo
            </label>
            <Input
              id="model-name"
              autoFocus
              required
              aria-required="true"
              value={modelName}
              onChange={(event) => {
                setModelName(event.target.value);
                if (modelError) setModelError("");
              }}
            />
            {modelError && (
              <p className="text-destructive text-sm" role="alert">
                {modelError}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="model-runtime" className="font-semibold text-sm">
              Runtime
            </label>
            <Input id="model-runtime" value="TensorFlow Lite" disabled readOnly />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              disabled={registering}
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" data-testid="register-model-submit" disabled={registering}>
              {registering ? "Registrando modelo…" : "Registrar modelo"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export type ModelsViewProps = {
  application: Application;
  canManage?: boolean;
};

export function ModelsView({ application, canManage = false }: ModelsViewProps) {
  const [registerModelDialogOpen, setRegisterModelDialogOpen] = useState(false);
  const [modelName, setModelName] = useState("");
  const [modelError, setModelError] = useState("");
  const [registeringModel, setRegisteringModel] = useState(false);

  function openRegisterModel() {
    setModelName("");
    setModelError("");
    setRegisterModelDialogOpen(true);
  }

  async function handleRegisterModel(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = modelName.trim();
    if (!trimmed) {
      setModelError("Ingresa un nombre para el modelo.");
      return;
    }

    setRegisteringModel(true);
    try {
      await httpClient.post(`/applications/${application.id}/models`, {
        name: trimmed,
        runtime: "tensorflow_lite",
      });
      toast.success("Modelo registrado.");
      setRegisterModelDialogOpen(false);
      setModelName("");
      setModelError("");
    } catch (err) {
      toast.error(errorMessage(err, "No pudimos registrar el modelo. Inténtalo nuevamente."));
    } finally {
      setRegisteringModel(false);
    }
  }

  return (
    <section className="space-y-4">
      <div className="application-section-heading flex items-center justify-between">
        <div className="flex items-center gap-2">
          <IconCpu className="size-5 text-primary" />
          <h2 className="font-semibold text-lg">Modelos</h2>
        </div>
        {canManage && application.status === "active" && (
          <Button
            size="sm"
            variant="outline"
            data-testid="register-model-trigger"
            onClick={openRegisterModel}
          >
            Registrar modelo
          </Button>
        )}
      </div>

      <p className="text-muted-foreground text-sm">Aún no hay modelos configurados.</p>

      <RegisterModelDialog
        open={registerModelDialogOpen}
        onOpenChange={setRegisterModelDialogOpen}
        modelName={modelName}
        setModelName={setModelName}
        modelError={modelError}
        setModelError={setModelError}
        registering={registeringModel}
        onSubmit={handleRegisterModel}
      />
    </section>
  );
}
