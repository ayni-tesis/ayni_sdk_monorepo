"use client";

import { IconArchive, IconArrowLeft, IconPencil, IconRefresh } from "@tabler/icons-react";
import axios from "axios";
import { useCallback, useEffect, useRef, useState } from "react";
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
import type { Application, GeneratedCredential, SdkCredentialItem } from "../types";

const CREDENTIALS_LOAD_ERROR = "No pudimos cargar las credenciales. Inténtalo nuevamente.";
const CREDENTIALS_FORBIDDEN = "No tienes permiso para ver las credenciales de esta aplicación.";

function credentialsErrorMessage(error: unknown) {
  if (!axios.isAxiosError<{ message?: string }>(error)) return CREDENTIALS_LOAD_ERROR;
  if (error.response?.status === 403) {
    return error.response.data?.message ?? CREDENTIALS_FORBIDDEN;
  }
  return CREDENTIALS_LOAD_ERROR;
}

function formatCredentialDate(value: string) {
  return new Date(value).toLocaleDateString("es", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

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

export type RevokeCredentialDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  revoking: boolean;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
};

export function RevokeCredentialDialog({
  open,
  onOpenChange,
  revoking,
  onSubmit,
}: RevokeCredentialDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (revoking) return;
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent showCloseButton={!revoking}>
        <DialogHeader>
          <DialogTitle>¿Revocar esta credencial?</DialogTitle>
          <DialogDescription>
            Los SDK que la usan no podrán sincronizar recursos nuevos. Esta acción no elimina
            recursos ya guardados offline.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              disabled={revoking}
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" data-testid="revoke-credential-submit" disabled={revoking}>
              {revoking ? "Revocando credencial…" : "Revocar credencial"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export type RegenerateCredentialDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDiscard: () => void;
  regenerated: GeneratedCredential | null;
  regenerating: boolean;
  onRegenerate: (event: React.FormEvent<HTMLFormElement>) => void;
  onCopy: () => void;
};

export function RegenerateCredentialDialog({
  open,
  onOpenChange,
  onDiscard,
  regenerated,
  regenerating,
  onRegenerate,
  onCopy,
}: RegenerateCredentialDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (regenerating) return;
        if (!nextOpen && regenerated) return;
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent showCloseButton={!regenerated && !regenerating}>
        <DialogHeader>
          <DialogTitle>¿Regenerar esta credencial?</DialogTitle>
          <DialogDescription>
            {regenerated
              ? "Copia la nueva credencial ahora. No podrás verla nuevamente."
              : "La credencial actual se revocará inmediatamente. Actualiza la configuración de tu app con el nuevo secreto."}
          </DialogDescription>
        </DialogHeader>
        {regenerated ? (
          <div className="flex flex-col gap-4">
            <code className="credential-secret" data-testid="regenerated-credential-secret">
              {regenerated.secret}
            </code>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                data-testid="close-regenerated-credential"
                onClick={onDiscard}
              >
                Cerrar
              </Button>
              <Button type="button" data-testid="copy-regenerated-credential" onClick={onCopy}>
                Copiar credencial
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={onRegenerate} className="flex flex-col gap-4">
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                disabled={regenerating}
                onClick={() => onOpenChange(false)}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                data-testid="regenerate-credential-submit"
                disabled={regenerating}
              >
                {regenerating ? "Regenerando credencial…" : "Regenerar credencial"}
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

  const [credentials, setCredentials] = useState<SdkCredentialItem[]>([]);
  const [credentialsLoading, setCredentialsLoading] = useState(false);
  const [credentialsError, setCredentialsError] = useState("");

  const [credentialToRevoke, setCredentialToRevoke] = useState<SdkCredentialItem | null>(null);
  const [revokeDialogOpen, setRevokeDialogOpen] = useState(false);
  const [revokingCredential, setRevokingCredential] = useState(false);

  const [targetCredentialToRegenerate, setTargetCredentialToRegenerate] =
    useState<SdkCredentialItem | null>(null);
  const [regenerateDialogOpen, setRegenerateDialogOpen] = useState(false);
  const [regeneratedCredential, setRegeneratedCredential] = useState<GeneratedCredential | null>(
    null,
  );
  const [regeneratingCredential, setRegeneratingCredential] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);

  const loadCredentials = useCallback(async (applicationId: string) => {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setCredentialsLoading(true);
    setCredentialsError("");
    try {
      const { data } = await httpClient.get<{ credentials: SdkCredentialItem[] }>(
        `/applications/${applicationId}/sdk-credentials`,
        { signal: controller.signal },
      );
      if (controller.signal.aborted) return;
      const filtered = data.credentials.filter((item) => item.applicationId === applicationId);
      setCredentials(filtered);
    } catch (loadError) {
      if (controller.signal.aborted) return;
      setCredentialsError(credentialsErrorMessage(loadError));
    } finally {
      if (!controller.signal.aborted) {
        setCredentialsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (canManage) {
      void loadCredentials(application.id);
    } else {
      setCredentials([]);
      setCredentialsLoading(false);
      setCredentialsError("");
    }
    return () => {
      abortControllerRef.current?.abort();
    };
  }, [application.id, canManage, loadCredentials]);

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
      void loadCredentials(application.id);
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

  function openRevokeCredential(credential: SdkCredentialItem) {
    setCredentialToRevoke(credential);
    setRevokeDialogOpen(true);
  }

  function closeRevokeDialog() {
    setRevokeDialogOpen(false);
    setCredentialToRevoke(null);
  }

  async function handleRevokeCredential(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!credentialToRevoke) return;
    const credentialId = credentialToRevoke.id;
    setRevokingCredential(true);
    try {
      await httpClient.post<{ credential: { id: string; revokedAt: string } }>(
        `/applications/${application.id}/sdk-credentials/${credentialId}/revoke`,
      );
      setCredentials((items) =>
        items.map((item) =>
          item.id === credentialId ? { ...item, status: "revoked" as const } : item,
        ),
      );
      closeRevokeDialog();
      toast.success("Credencial revocada.");
    } catch (revokeError) {
      toast.error(
        errorMessage(revokeError, "No pudimos revocar la credencial. Inténtalo nuevamente."),
      );
    } finally {
      setRevokingCredential(false);
    }
  }

  function openRegenerateCredential(credential: SdkCredentialItem) {
    setTargetCredentialToRegenerate(credential);
    setRegeneratedCredential(null);
    setRegenerateDialogOpen(true);
  }

  function closeRegenerateDialog() {
    setRegenerateDialogOpen(false);
    setTargetCredentialToRegenerate(null);
    setRegeneratedCredential(null);
  }

  async function handleRegenerateCredential(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!targetCredentialToRegenerate) return;
    const credentialId = targetCredentialToRegenerate.id;
    setRegeneratingCredential(true);
    try {
      const { data } = await httpClient.post<{ credential: GeneratedCredential }>(
        `/applications/${application.id}/sdk-credentials/${credentialId}/regenerate`,
      );
      setRegeneratedCredential(data.credential);
      toast.success("Nueva credencial generada. La anterior fue revocada.");
      void loadCredentials(application.id);
    } catch (credentialError) {
      toast.error(
        errorMessage(credentialError, "No pudimos regenerar la credencial. Inténtalo nuevamente."),
      );
    } finally {
      setRegeneratingCredential(false);
    }
  }

  async function handleCopyRegeneratedCredential() {
    if (!regeneratedCredential) return;
    try {
      await navigator.clipboard.writeText(regeneratedCredential.secret);
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
            {!canManage ? (
              <p data-testid="credentials-restricted">
                Solo los administradores del workspace pueden gestionar las credenciales SDK.
              </p>
            ) : (
              <div className="credential-rows" data-testid="credential-rows">
                {credentialsLoading ? (
                  <p data-testid="credentials-loading">Cargando credenciales…</p>
                ) : credentialsError ? (
                  <div className="applications-error" data-testid="credentials-error">
                    <p>{credentialsError}</p>
                    <Button
                      variant="outline"
                      size="sm"
                      data-testid="credentials-retry"
                      onClick={() => void loadCredentials(application.id)}
                    >
                      <IconRefresh />
                      Reintentar
                    </Button>
                  </div>
                ) : credentials.length === 0 ? (
                  <p data-testid="credentials-empty">
                    Esta aplicación aún no tiene credenciales SDK.
                  </p>
                ) : (
                  <table className="credentials-table" data-testid="credentials-table">
                    <thead>
                      <tr>
                        <th>Prefijo</th>
                        <th>Estado</th>
                        <th>Creada el</th>
                        <th>Último uso</th>
                        <th>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {credentials.map((credential) => (
                        <tr key={credential.id} data-testid={`credential-row-${credential.id}`}>
                          <td>
                            <code>{credential.prefix ?? "—"}</code>
                          </td>
                          <td>
                            <span
                              className="credential-status"
                              data-testid={`credential-status-${credential.id}`}
                              data-status={credential.status}
                            >
                              {credential.status === "active" ? "Activa" : "Revocada"}
                            </span>
                          </td>
                          <td>{formatCredentialDate(credential.createdAt)}</td>
                          <td
                            title={
                              credential.status === "active" && credential.lastUsedAt
                                ? "Última autenticación correcta del SDK"
                                : undefined
                            }
                          >
                            {credential.status === "revoked"
                              ? "—"
                              : credential.lastUsedAt
                                ? new Date(credential.lastUsedAt).toLocaleString()
                                : "Sin uso registrado"}
                          </td>
                          <td>
                            {credential.status === "active" && (
                              <div className="flex items-center gap-2">
                                {application.status === "active" && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    data-testid={`regenerate-credential-${credential.id}`}
                                    onClick={() => openRegenerateCredential(credential)}
                                  >
                                    Regenerar
                                  </Button>
                                )}
                                <Button
                                  size="sm"
                                  variant="outline"
                                  data-testid={`revoke-credential-${credential.id}`}
                                  onClick={() => openRevokeCredential(credential)}
                                >
                                  Revocar
                                </Button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
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
      <RevokeCredentialDialog
        open={revokeDialogOpen}
        onOpenChange={(open) => {
          if (!open) closeRevokeDialog();
        }}
        revoking={revokingCredential}
        onSubmit={handleRevokeCredential}
      />
      <RegenerateCredentialDialog
        open={regenerateDialogOpen}
        onOpenChange={(open) => {
          if (open) setRegenerateDialogOpen(true);
          else closeRegenerateDialog();
        }}
        onDiscard={closeRegenerateDialog}
        regenerated={regeneratedCredential}
        regenerating={regeneratingCredential}
        onRegenerate={handleRegenerateCredential}
        onCopy={() => void handleCopyRegeneratedCredential()}
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
