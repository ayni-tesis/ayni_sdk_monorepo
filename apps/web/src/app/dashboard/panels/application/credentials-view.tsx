"use client";

import { IconKey, IconRefresh } from "@tabler/icons-react";
import axios from "axios";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { errorMessage } from "@/lib/api-error";
import { httpClient } from "@/lib/http-client";
import type { Application, GeneratedCredential, SdkCredentialItem } from "../../types";

const CREDENTIALS_LOAD_ERROR = "No pudimos cargar las credenciales. Inténtalo nuevamente.";
const CREDENTIALS_FORBIDDEN = "No tienes permiso para ver las credenciales de esta aplicación.";

export function credentialsErrorMessage(error: unknown) {
  if (!axios.isAxiosError<{ message?: string }>(error)) return CREDENTIALS_LOAD_ERROR;
  if (error.response?.status === 403) {
    return error.response.data?.message ?? CREDENTIALS_FORBIDDEN;
  }
  return CREDENTIALS_LOAD_ERROR;
}

export function formatCredentialDate(value: string) {
  return new Date(value).toLocaleDateString("es", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export type GenerateCredentialDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDiscard: () => void;
  generated: GeneratedCredential | null;
  generating: boolean;
  onGenerate: (event: React.FormEvent<HTMLFormElement>) => void;
  onCopied: () => void;
};

export function GenerateCredentialDialog({
  open,
  onOpenChange,
  onDiscard,
  generated,
  generating,
  onGenerate,
  onCopied,
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
            <div className="flex items-center justify-between gap-3 rounded-md border border-dashed bg-muted/30 p-3">
              <code
                className="credential-secret flex-1 break-all border-0 bg-transparent p-0"
                data-testid="credential-secret"
              >
                {generated.secret}
              </code>
              <CopyButton
                variant="ghost"
                size="sm"
                content={generated.secret}
                onCopiedChange={(copied) => {
                  if (copied) onCopied();
                }}
                data-testid="copy-credential-inline"
                title="Copiar credencial"
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                data-testid="close-credential"
                onClick={onDiscard}
              >
                Cerrar
              </Button>
              <CopyButton
                type="button"
                data-testid="copy-credential"
                content={generated.secret}
                onCopiedChange={(copied) => {
                  if (copied) onCopied();
                }}
              >
                Copiar credencial
              </CopyButton>
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
  generated: GeneratedCredential | null;
  regenerating: boolean;
  onRegenerate: (event: React.FormEvent<HTMLFormElement>) => void;
  onCopied: () => void;
};

export function RegenerateCredentialDialog({
  open,
  onOpenChange,
  onDiscard,
  generated,
  regenerating,
  onRegenerate,
  onCopied,
}: RegenerateCredentialDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (regenerating) return;
        if (!nextOpen && generated) return;
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent showCloseButton={!generated && !regenerating}>
        <DialogHeader>
          <DialogTitle>¿Regenerar esta credencial?</DialogTitle>
          <DialogDescription>
            {generated
              ? "Copia la nueva credencial ahora. No podrás verla nuevamente."
              : "La credencial actual se revocará inmediatamente. Actualiza la configuración de tu app con el nuevo secreto."}
          </DialogDescription>
        </DialogHeader>
        {generated ? (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3 rounded-md border border-dashed bg-muted/30 p-3">
              <code
                className="credential-secret flex-1 break-all border-0 bg-transparent p-0"
                data-testid="regenerated-credential-secret"
              >
                {generated.secret}
              </code>
              <CopyButton
                variant="ghost"
                size="sm"
                content={generated.secret}
                onCopiedChange={(copied) => {
                  if (copied) onCopied();
                }}
                data-testid="copy-regenerated-credential-inline"
                title="Copiar credencial"
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                data-testid="close-regenerated-credential"
                onClick={onDiscard}
              >
                Cerrar
              </Button>
              <CopyButton
                type="button"
                data-testid="copy-regenerated-credential"
                content={generated.secret}
                onCopiedChange={(copied) => {
                  if (copied) onCopied();
                }}
              >
                Copiar credencial
              </CopyButton>
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

export type CredentialsViewProps = {
  application: Application;
  canManage?: boolean;
};

export function CredentialsView({ application, canManage = false }: CredentialsViewProps) {
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

  function openGenerateCredential() {
    setGeneratedCredential(null);
    setCredentialDialogOpen(true);
  }

  function closeGenerateDialog() {
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
    } catch (credentialError) {
      toast.error(
        errorMessage(credentialError, "No pudimos generar la credencial. Inténtalo nuevamente."),
      );
    } finally {
      setGeneratingCredential(false);
    }
  }

  function handleCredentialCopied() {
    toast.success("Credencial copiada.");
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

  function handleRegeneratedCredentialCopied() {
    toast.success("Credencial copiada.");
  }

  return (
    <section className="space-y-4">
      <div className="application-section-heading flex items-center justify-between">
        <div className="flex items-center gap-2">
          <IconKey className="size-5 text-primary" />
          <h2 className="font-semibold text-lg">Credenciales SDK</h2>
        </div>
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
        <p data-testid="credentials-restricted" className="text-muted-foreground text-sm">
          Solo los administradores del workspace pueden gestionar las credenciales SDK.
        </p>
      ) : (
        <div className="credential-rows" data-testid="credential-rows">
          {credentialsLoading ? (
            <p data-testid="credentials-loading" className="text-muted-foreground text-sm">
              Cargando credenciales…
            </p>
          ) : credentialsError ? (
            <div
              className="applications-error flex items-center gap-3"
              data-testid="credentials-error"
            >
              <p className="text-destructive text-sm">{credentialsError}</p>
              <Button
                variant="outline"
                size="sm"
                data-testid="credentials-retry"
                onClick={() => void loadCredentials(application.id)}
              >
                <IconRefresh className="mr-1 size-4" />
                Reintentar
              </Button>
            </div>
          ) : credentials.length === 0 ? (
            <p data-testid="credentials-empty" className="text-muted-foreground text-sm">
              Esta aplicación aún no tiene credenciales SDK.
            </p>
          ) : (
            <table className="credentials-table w-full text-sm" data-testid="credentials-table">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="pb-2 font-medium">Prefijo</th>
                  <th className="pb-2 font-medium">Estado</th>
                  <th className="pb-2 font-medium">Creada el</th>
                  <th className="pb-2 font-medium">Último uso</th>
                  <th className="pb-2 font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {credentials.map((credential) => (
                  <tr
                    key={credential.id}
                    data-testid={`credential-row-${credential.id}`}
                    className="border-b last:border-0"
                  >
                    <td className="py-2.5">
                      <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                        {credential.prefix ?? "—"}
                      </code>
                    </td>
                    <td className="py-2.5">
                      <span
                        className="credential-status inline-flex rounded-full px-2 py-0.5 font-medium text-xs"
                        data-testid={`credential-status-${credential.id}`}
                        data-status={credential.status}
                      >
                        {credential.status === "active" ? "Activa" : "Revocada"}
                      </span>
                    </td>
                    <td className="py-2.5 text-muted-foreground">
                      {formatCredentialDate(credential.createdAt)}
                    </td>
                    <td
                      className="py-2.5 text-muted-foreground"
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
                    <td className="py-2.5">
                      {canManage && credential.status === "active" && (
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

      <GenerateCredentialDialog
        open={credentialDialogOpen}
        onOpenChange={setCredentialDialogOpen}
        onDiscard={closeGenerateDialog}
        generated={generatedCredential}
        generating={generatingCredential}
        onGenerate={handleGenerateCredential}
        onCopied={handleCredentialCopied}
      />

      <RevokeCredentialDialog
        open={revokeDialogOpen}
        onOpenChange={setRevokeDialogOpen}
        revoking={revokingCredential}
        onSubmit={handleRevokeCredential}
      />

      <RegenerateCredentialDialog
        open={regenerateDialogOpen}
        onOpenChange={setRegenerateDialogOpen}
        onDiscard={closeRegenerateDialog}
        generated={regeneratedCredential}
        regenerating={regeneratingCredential}
        onRegenerate={handleRegenerateCredential}
        onCopied={handleRegeneratedCredentialCopied}
      />
    </section>
  );
}
