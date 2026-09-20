"use client";

import { IconArchive, IconPencil, IconSettings } from "@tabler/icons-react";
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

export type SettingsViewProps = {
  application: Application;
  canManage?: boolean;
  onApplicationUpdated?: (updated: Application) => void;
  onApplicationArchived?: (archived: Application) => void;
  onMutationStart?: () => void;
  onMutationEnd?: () => void;
  onArchiveStart?: () => void;
  onArchiveEnd?: () => void;
};

export function SettingsView({
  application,
  canManage = false,
  onApplicationUpdated,
  onApplicationArchived,
  onMutationStart,
  onMutationEnd,
  onArchiveStart,
  onArchiveEnd,
}: SettingsViewProps) {
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameName, setRenameName] = useState("");
  const [savingRename, setSavingRename] = useState(false);

  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [archiving, setArchiving] = useState(false);

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
      onApplicationUpdated?.(data);
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
      onApplicationArchived?.(data);
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

  return (
    <section className="space-y-6">
      <div className="flex items-center gap-2">
        <IconSettings className="size-5 text-primary" />
        <h2 className="font-semibold text-lg">Configuración de la aplicación</h2>
      </div>

      <div className="detail-heading flex flex-wrap items-center justify-between gap-4 rounded-lg border bg-muted/20 p-4">
        <div>
          <span className="block font-medium text-muted-foreground text-xs">ID de aplicación</span>
          <code className="font-mono text-sm">{application.id}</code>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-xs">Estado:</span>
          <span
            className={`inline-flex rounded-full px-2.5 py-0.5 font-semibold text-xs ${
              application.status === "active"
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {application.status === "active" ? "Activa" : "Archivada"}
          </span>
        </div>
      </div>

      {canManage && (
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" onClick={openRename}>
            <IconPencil className="mr-1.5 size-4" />
            Editar nombre
          </Button>
          {application.status === "active" && (
            <Button
              variant="outline"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setArchiveDialogOpen(true)}
            >
              <IconArchive className="mr-1.5 size-4" />
              Archivar aplicación
            </Button>
          )}
        </div>
      )}

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
    </section>
  );
}
