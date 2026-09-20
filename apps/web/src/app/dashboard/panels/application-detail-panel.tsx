"use client";

import { IconArchive, IconArrowLeft, IconPencil } from "@tabler/icons-react";
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
import type { Application, GeneratedCredential } from "../types";

export type RenameApplicationDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  setName: (name: string) => void;
  saving: boolean;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
};

export function RenameApplicationDialog({
  open,
  onOpenChange,
  name,
  setName,
  saving,
  onSubmit,
}: RenameApplicationDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar nombre de la aplicación</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="application-name" className="font-semibold text-sm">
              Nombre de la aplicación
            </label>
            <Input
              id="application-name"
              autoFocus
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              disabled={saving}
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Guardando cambios…" : "Guardar cambios"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export type ArchiveApplicationDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  applicationName: string;
  archiving: boolean;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
};

export function ArchiveApplicationDialog({
  open,
  onOpenChange,
  applicationName,
  archiving,
  onSubmit,
}: ArchiveApplicationDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>¿Archivar &quot;{applicationName}&quot;?</DialogTitle>
          <DialogDescription>
            La aplicación dejará de sincronizar recursos nuevos. Sus workflows y modelos se
            conservarán.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              disabled={archiving}
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={archiving}>
              {archiving ? "Archivando aplicación…" : "Archivar aplicación"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export type GenerateCredentialDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDiscard: () => void;
  generated: GeneratedCredential | null;
  generating: boolean;
  onGenerate: (event: React.FormEvent<HTMLFormElement>) => void;
  onCopy: () => void;
};

export function GenerateCredentialDialog({
  open,
  onOpenChange,
  onDiscard,
  generated,
  generating,
  onGenerate,
  onCopy,
}: GenerateCredentialDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (generating) return;
        if (!nextOpen && generated) return;
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent showCloseButton={!generated && !generating}>
        <DialogHeader>
          <DialogTitle>Generar credencial SDK</DialogTitle>
          <DialogDescription>
            {generated
              ? "Copia tu credencial ahora. No podrás verla nuevamente."
              : "El secreto se mostrará una sola vez. Guárdalo en un lugar seguro."}
          </DialogDescription>
        </DialogHeader>
        {generated ? (
          <div className="flex flex-col gap-4">
            <code className="credential-secret" data-testid="credential-secret">
              {generated.secret}
            </code>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                data-testid="close-credential"
                onClick={onDiscard}
              >
                Cerrar
              </Button>
              <Button type="button" data-testid="copy-credential" onClick={onCopy}>
                Copiar credencial
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={onGenerate} className="flex flex-col gap-4">
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                disabled={generating}
                onClick={() => onOpenChange(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" data-testid="generate-credential-submit" disabled={generating}>
                {generating ? "Generando credencial…" : "Generar credencial"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

export type RegisterModelDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  modelName: string;
  setModelName: (value: string) => void;
  modelError: string;
  setModelError: (value: string) => void;
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

export type ApplicationDetailPanelProps = {
  application: Application;
  workspaceName?: string;
  canManage?: boolean;
  onBack: () => void;
  onApplicationUpdated: (updated: Application) => void;
  onApplicationArchived: (archived: Application) => void;
  onMutationStart?: () => void;
  onMutationEnd?: () => void;
  onArchiveStart?: () => void;
  onArchiveEnd?: () => void;
};

export function ApplicationDetailPanel({
  application,
  workspaceName,
  canManage = false,
  onBack,
  onApplicationUpdated,
  onApplicationArchived,
  onMutationStart,
  onMutationEnd,
  onArchiveStart,
  onArchiveEnd,
}: ApplicationDetailPanelProps) {
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameName, setRenameName] = useState("");
  const [savingRename, setSavingRename] = useState(false);

  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [archiving, setArchiving] = useState(false);

  const [credentialDialogOpen, setCredentialDialogOpen] = useState(false);
  const [generatingCredential, setGeneratingCredential] = useState(false);
  const [generatedCredential, setGeneratedCredential] = useState<GeneratedCredential | null>(null);

  const [registerModelDialogOpen, setRegisterModelDialogOpen] = useState(false);
  const [modelName, setModelName] = useState("");
  const [modelError, setModelError] = useState("");
  const [registeringModel, setRegisteringModel] = useState(false);

  function openRename() {
    setRenameName(application.name);
    setRenameDialogOpen(true);
  }

  async function handleRename(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = renameName.trim();
    if (!trimmed) return;

    onMutationStart?.();
    setSavingRename(true);
    try {
      const { data } = await httpClient.patch<Application>(`/applications/${application.id}`, {
        name: trimmed,
      });
      onApplicationUpdated(data);
      setRenameDialogOpen(false);
      toast.success("Nombre actualizado.");
    } catch (err) {
      toast.error(errorMessage(err, "No pudimos actualizar la aplicación. Inténtalo nuevamente."));
    } finally {
      setSavingRename(false);
      onMutationEnd?.();
    }
  }

  async function handleArchive(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (onArchiveStart) onArchiveStart();
    else onMutationStart?.();
    setArchiving(true);
    try {
      const { data } = await httpClient.post<Application>(
        `/applications/${application.id}/archive`,
      );
      onApplicationArchived(data);
      setArchiveDialogOpen(false);
      toast.success("Aplicación archivada.");
    } catch (err) {
      toast.error(errorMessage(err, "No pudimos archivar la aplicación. Inténtalo nuevamente."));
    } finally {
      setArchiving(false);
      if (onArchiveEnd) onArchiveEnd();
      else onMutationEnd?.();
    }
  }

  function openGenerateCredential() {
    setGeneratedCredential(null);
    setCredentialDialogOpen(true);
  }

  function closeCredentialDialog() {
    setCredentialDialogOpen(false);
    setGeneratedCredential(null);
  }

  async function handleGenerateCredential(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setGeneratingCredential(true);
    try {
      const { data } = await httpClient.post<{ credential: GeneratedCredential }>(
        `/applications/${application.id}/sdk-credentials`,
      );
      setGeneratedCredential(data.credential);
      toast.success("Credencial generada.");
    } catch (err) {
      toast.error(errorMessage(err, "No pudimos generar la credencial. Inténtalo nuevamente."));
    } finally {
      setGeneratingCredential(false);
    }
  }

  async function handleCopyCredential() {
    if (!generatedCredential) return;
    try {
      await navigator.clipboard.writeText(generatedCredential.secret);
      toast.success("Credencial copiada.");
    } catch {
      toast.error("No pudimos copiar la credencial. Inténtalo de nuevo.");
    }
  }

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
    <>
      <header className="applications-header">
        <div>
          <p>{workspaceName ?? "Cargando workspace…"}</p>
          <h1>{application.name}</h1>
        </div>
      </header>
      <section className="application-detail" aria-live="polite">
        <Button variant="ghost" onClick={onBack}>
          <IconArrowLeft />
          Aplicaciones
        </Button>
        <div className="detail-heading">
          <div>
            <span>ID de aplicación</span>
            <code>{application.id}</code>
          </div>
          <span className="application-status">
            {application.status === "active" ? "Activa" : "Archivada"}
          </span>
        </div>
        {canManage && (
          <Button variant="outline" onClick={openRename}>
            <IconPencil />
            Editar nombre
          </Button>
        )}
        {canManage && application.status === "active" && (
          <Button variant="outline" onClick={() => setArchiveDialogOpen(true)}>
            <IconArchive />
            Archivar aplicación
          </Button>
        )}
        <div className="application-sections">
          <section>
            <h2>Workflows</h2>
            <p>Aún no hay workflows configurados.</p>
          </section>
          <section>
            <div className="application-section-heading">
              <h2>Modelos</h2>
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
            <p>Aún no hay modelos configurados.</p>
          </section>
          <section>
            <div className="application-section-heading">
              <h2>Credenciales SDK</h2>
              {canManage && application.status === "active" && (
                <Button
                  size="sm"
                  variant="outline"
                  data-testid="generate-credential-trigger"
                  onClick={openGenerateCredential}
                >
                  Generar credencial
                </Button>
              )}
            </div>
            <p>Genera una credencial para autenticar al SDK de esta aplicación.</p>
          </section>
          <section>
            <h2>Datasets</h2>
            <p>Aún no hay datasets configurados.</p>
          </section>
          <section>
            <h2>Telemetría</h2>
            <p>La telemetría estará disponible cuando la aplicación la configure.</p>
          </section>
        </div>
      </section>

      <RenameApplicationDialog
        open={renameDialogOpen}
        onOpenChange={setRenameDialogOpen}
        name={renameName}
        setName={setRenameName}
        saving={savingRename}
        onSubmit={handleRename}
      />
      <ArchiveApplicationDialog
        open={archiveDialogOpen}
        onOpenChange={setArchiveDialogOpen}
        applicationName={application.name}
        archiving={archiving}
        onSubmit={handleArchive}
      />
      <GenerateCredentialDialog
        open={credentialDialogOpen}
        onOpenChange={(open) => {
          if (open) setCredentialDialogOpen(true);
          else closeCredentialDialog();
        }}
        onDiscard={closeCredentialDialog}
        generated={generatedCredential}
        generating={generatingCredential}
        onGenerate={handleGenerateCredential}
        onCopy={() => void handleCopyCredential()}
      />
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
    </>
  );
}
