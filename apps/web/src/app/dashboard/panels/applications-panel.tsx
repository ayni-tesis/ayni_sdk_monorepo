"use client";

import { IconCirclePlus, IconRefresh } from "@tabler/icons-react";
import { useState } from "react";
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
import type { Application } from "../types";

export type CreateApplicationDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  creating?: boolean;
  onSubmit: (name: string) => Promise<boolean | undefined>;
};

export function CreateApplicationDialog({
  open,
  onOpenChange,
  creating = false,
  onSubmit,
}: CreateApplicationDialogProps) {
  const [name, setName] = useState("");

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) setName("");
    onOpenChange(nextOpen);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    const result = await onSubmit(trimmed);
    if (result !== false) {
      setName("");
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Crear aplicación</DialogTitle>
          <DialogDescription>Usa un nombre que tu equipo pueda reconocer.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
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
              disabled={creating}
              onClick={() => handleOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={creating}>
              {creating ? "Creando aplicación…" : "Crear aplicación"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export type ApplicationsPanelProps = {
  workspaceName?: string;
  applications: Application[];
  loading?: boolean;
  error?: string;
  canManage?: boolean;
  isCreating?: boolean;
  onRetry?: () => void;
  onSelectApplication: (id: string) => void;
  onCreateApplication: (name: string) => Promise<boolean | undefined>;
};

export function ApplicationsPanel({
  workspaceName: _workspaceName,
  applications,
  loading = false,
  error = "",
  canManage = false,
  isCreating = false,
  onRetry,
  onSelectApplication,
  onCreateApplication,
}: ApplicationsPanelProps) {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <>
      <header className="applications-header">
        <h1>Aplicaciones</h1>
        {canManage && (
          <Button onClick={() => setDialogOpen(true)}>
            <IconCirclePlus />
            Nueva aplicación
          </Button>
        )}
      </header>
      <section className="applications-list" aria-live="polite">
        {loading ? (
          <p>Cargando aplicaciones…</p>
        ) : error ? (
          <div className="applications-error">
            <p>{error}</p>
            {onRetry && (
              <Button variant="outline" onClick={onRetry}>
                <IconRefresh />
                Reintentar
              </Button>
            )}
          </div>
        ) : applications.length === 0 ? (
          <div className="applications-empty">
            <h2>Aún no hay aplicaciones en este workspace.</h2>
            {canManage && <Button onClick={() => setDialogOpen(true)}>Crear aplicación</Button>}
          </div>
        ) : (
          <ul>
            {applications.map((application) => (
              <li key={application.id}>
                <button type="button" onClick={() => onSelectApplication(application.id)}>
                  <strong>{application.name}</strong>
                  <code>{application.id}</code>
                </button>
                <span className="application-status">
                  {application.status === "active" ? "Activa" : "Archivada"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <CreateApplicationDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        creating={isCreating}
        onSubmit={onCreateApplication}
      />
    </>
  );
}
