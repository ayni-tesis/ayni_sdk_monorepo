"use client";

import { IconChevronDown, IconCirclePlus, IconRefresh } from "@tabler/icons-react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { authClient } from "@/lib/auth-client";
import { generateWorkspaceSlug } from "@/lib/slug";
import { formatWorkspaceRole } from "@/lib/workspace-roles";
import type { WorkspaceItem } from "../types";

export type WorkspaceHeaderProps = {
  userName: string;
  workspaceName?: string;
  workspaces: WorkspaceItem[];
  loadingWorkspaces: boolean;
  workspacesError: string;
  switchingWorkspace: boolean;
  onSelectWorkspace?: (id: string) => void;
  onRetryWorkspaces?: () => void;
  onWorkspaceCreated?: (newWorkspaceId: string) => Promise<void> | void;
  createDialogOpen?: boolean;
  onOpenCreateDialog?: () => void;
  onCloseCreateDialog?: () => void;
};

export function CreateWorkspaceDialog({
  open,
  onOpenChange,
  workspaceName,
  setWorkspaceName,
  workspaceError,
  setWorkspaceError,
  creatingWorkspace,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceName: string;
  setWorkspaceName: (value: string) => void;
  workspaceError: string;
  setWorkspaceError: (value: string) => void;
  creatingWorkspace: boolean;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          setWorkspaceName("");
          setWorkspaceError("");
        }
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Crear workspace</DialogTitle>
          <DialogDescription className="sr-only">
            Ingresa el nombre del nuevo workspace.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="workspace-name" className="font-semibold text-sm">
              Nombre del workspace
            </label>
            <Input
              id="workspace-name"
              autoFocus
              value={workspaceName}
              onChange={(event) => {
                setWorkspaceName(event.target.value);
                if (workspaceError) setWorkspaceError("");
              }}
            />
            {workspaceError && (
              <p className="text-destructive text-sm" role="alert">
                {workspaceError}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              disabled={creatingWorkspace}
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              data-testid="create-workspace-submit"
              disabled={creatingWorkspace}
            >
              {creatingWorkspace ? "Creando workspace…" : "Crear workspace"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function WorkspaceHeader({
  userName,
  workspaceName,
  workspaces,
  loadingWorkspaces,
  workspacesError,
  switchingWorkspace,
  onSelectWorkspace,
  onRetryWorkspaces,
  onWorkspaceCreated,
  createDialogOpen,
  onOpenCreateDialog,
  onCloseCreateDialog,
}: WorkspaceHeaderProps) {
  const [internalDialogOpen, setInternalDialogOpen] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const [workspaceError, setWorkspaceError] = useState("");
  const [creatingWorkspace, setCreatingWorkspace] = useState(false);

  const isDialogOpen = createDialogOpen !== undefined ? createDialogOpen : internalDialogOpen;
  const handleOpenChange = (open: boolean) => {
    if (open) {
      if (onOpenCreateDialog) onOpenCreateDialog();
      else setInternalDialogOpen(true);
    } else {
      if (onCloseCreateDialog) onCloseCreateDialog();
      else setInternalDialogOpen(false);
      setNewWorkspaceName("");
      setWorkspaceError("");
    }
  };

  async function handleCreateWorkspace(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = newWorkspaceName.trim();
    if (!trimmedName) {
      setWorkspaceError("Ingresa un nombre para el workspace.");
      return;
    }
    setWorkspaceError("");
    setCreatingWorkspace(true);
    try {
      let createdOrganization: { id: string } | null = null;
      const maxRetries = 3;

      for (let attempt = 0; attempt < maxRetries; attempt++) {
        const slug = generateWorkspaceSlug(trimmedName);
        const res = await authClient.organization.create({
          name: trimmedName,
          slug,
        });

        if (res?.error) {
          const isSlugTaken =
            res.error.code === "ORGANIZATION_SLUG_ALREADY_TAKEN" ||
            res.error.message === "Organization slug already taken";

          if (isSlugTaken && attempt < maxRetries - 1) {
            continue;
          }

          toast.error(res.error.message || "No pudimos crear el workspace. Inténtalo nuevamente.");
          return;
        }

        createdOrganization = res?.data ?? null;
        break;
      }

      if (!createdOrganization?.id) {
        toast.error("No pudimos crear el workspace. Inténtalo nuevamente.");
        return;
      }

      const activeRes = await authClient.organization.setActive({
        organizationId: createdOrganization.id,
      });

      if (activeRes?.error) {
        toast.error(
          activeRes.error.message || "No pudimos activar el workspace. Inténtalo nuevamente.",
        );
        handleOpenChange(false);
        if (onWorkspaceCreated) {
          await onWorkspaceCreated(createdOrganization.id);
        }
        return;
      }

      toast.success("Workspace creado.");
      handleOpenChange(false);
      if (onWorkspaceCreated) {
        await onWorkspaceCreated(createdOrganization.id);
      }
    } catch {
      toast.error("No pudimos crear el workspace. Inténtalo nuevamente.");
    } finally {
      setCreatingWorkspace(false);
    }
  }

  return (
    <>
      <header className="flex min-h-15 items-center justify-between border-b px-4">
        <div className="flex min-w-0 items-center gap-3">
          <SidebarTrigger />
          <span className="text-muted-foreground text-sm">Workspace actual</span>
          <DropdownMenu>
            <DropdownMenuTrigger
              data-testid="workspace-selector-trigger"
              disabled={switchingWorkspace}
              render={
                <Button
                  variant="ghost"
                  data-testid="workspace-selector-trigger"
                  disabled={switchingWorkspace}
                  className="flex items-center gap-1 px-2 font-semibold"
                />
              }
            >
              <span className="truncate">
                {switchingWorkspace
                  ? "Cambiando workspace…"
                  : loadingWorkspaces
                    ? "Cargando workspace…"
                    : workspacesError
                      ? "Error al cargar workspaces"
                      : workspaces.length === 0
                        ? "Aún no perteneces a ningún workspace."
                        : (workspaceName ?? "Cargando workspace…")}
              </span>
              <IconChevronDown className="size-4 opacity-50" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {workspacesError && onRetryWorkspaces && (
                <DropdownMenuItem onClick={onRetryWorkspaces}>
                  <IconRefresh className="mr-2 size-4" />
                  <span>Reintentar</span>
                </DropdownMenuItem>
              )}
              {workspaces.map((ws) => (
                <DropdownMenuItem
                  key={ws.id}
                  onClick={() => onSelectWorkspace?.(ws.id)}
                  className="flex flex-col items-start gap-0.5"
                >
                  <span className="font-medium">{ws.name}</span>
                  <span className="text-muted-foreground text-xs">
                    {formatWorkspaceRole(ws.role)}
                  </span>
                </DropdownMenuItem>
              ))}
              <DropdownMenuItem onClick={() => handleOpenChange(true)}>
                <IconCirclePlus className="mr-2 size-4" />
                <span>Crear workspace</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <span className="truncate text-muted-foreground text-sm">{userName}</span>
      </header>

      <CreateWorkspaceDialog
        open={isDialogOpen}
        onOpenChange={handleOpenChange}
        workspaceName={newWorkspaceName}
        setWorkspaceName={setNewWorkspaceName}
        workspaceError={workspaceError}
        setWorkspaceError={setWorkspaceError}
        creatingWorkspace={creatingWorkspace}
        onSubmit={handleCreateWorkspace}
      />
    </>
  );
}
