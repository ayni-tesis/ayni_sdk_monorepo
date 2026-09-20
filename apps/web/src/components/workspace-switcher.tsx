"use client";

import { IconCheck, IconCirclePlus, IconRefresh, IconSelector } from "@tabler/icons-react";
import * as React from "react";
import { toast } from "sonner";
import type { WorkspaceItem } from "@/app/dashboard/types";
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
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { authClient } from "@/lib/auth-client";
import { generateWorkspaceSlug } from "@/lib/slug";
import { formatWorkspaceRole } from "@/lib/workspace-roles";

export type CreateWorkspaceDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceName: string;
  setWorkspaceName: (value: string) => void;
  workspaceError: string;
  setWorkspaceError: (value: string) => void;
  creatingWorkspace: boolean;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
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
}: CreateWorkspaceDialogProps) {
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

export type WorkspaceSwitcherProps = {
  workspaces: WorkspaceItem[];
  activeWorkspaceId?: string;
  workspaceName?: string;
  role?: string;
  loadingWorkspaces?: boolean;
  workspacesError?: string;
  switchingWorkspace?: boolean;
  onSelectWorkspace?: (id: string) => void;
  onRetryWorkspaces?: () => void;
  onWorkspaceCreated?: (newWorkspaceId: string) => Promise<void> | void;
  createDialogOpen?: boolean;
  onOpenCreateDialog?: () => void;
  onCloseCreateDialog?: () => void;
};

export function WorkspaceSwitcher({
  workspaces,
  activeWorkspaceId,
  workspaceName,
  role,
  loadingWorkspaces = false,
  workspacesError = "",
  switchingWorkspace = false,
  onSelectWorkspace,
  onRetryWorkspaces,
  onWorkspaceCreated,
  createDialogOpen,
  onOpenCreateDialog,
  onCloseCreateDialog,
}: WorkspaceSwitcherProps) {
  const [internalDialogOpen, setInternalDialogOpen] = React.useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = React.useState("");
  const [workspaceError, setWorkspaceError] = React.useState("");
  const [creatingWorkspace, setCreatingWorkspace] = React.useState(false);

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

  const initial = (workspaceName?.[0] ?? "W").toUpperCase();
  const displayName = switchingWorkspace
    ? "Cambiando workspace…"
    : loadingWorkspaces
      ? "Cargando workspace…"
      : workspacesError
        ? "Error al cargar workspaces"
        : (workspaceName ??
          (workspaces.length === 0
            ? "Aún no perteneces a ningún workspace."
            : "Cargando workspace…"));

  return (
    <>
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton
                size="lg"
                data-testid="workspace-selector-trigger"
                disabled={switchingWorkspace}
                className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
              >
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary font-semibold text-sidebar-primary-foreground text-sm">
                  {initial}
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">{displayName}</span>
                  <span className="truncate text-muted-foreground text-xs">
                    {role ? formatWorkspaceRole(role) : "Workspace"}
                  </span>
                </div>
                <IconSelector className="ml-auto size-4 opacity-60" />
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="w-(--radix-dropdown-menu-trigger-width) min-w-56"
              align="start"
              sideOffset={4}
            >
              <DropdownMenuLabel className="text-muted-foreground text-xs">
                Espacios de trabajo
              </DropdownMenuLabel>
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
                  className="flex items-center justify-between gap-2"
                >
                  <div className="flex items-center gap-2 truncate">
                    <div className="flex size-6 items-center justify-center rounded-sm border bg-muted/50 font-semibold text-xs">
                      {ws.name[0]?.toUpperCase() ?? "W"}
                    </div>
                    <div className="flex flex-col text-left">
                      <span className="truncate font-medium text-sm">{ws.name}</span>
                      <span className="text-muted-foreground text-xs">
                        {formatWorkspaceRole(ws.role)}
                      </span>
                    </div>
                  </div>
                  {ws.id === activeWorkspaceId && (
                    <IconCheck className="size-4 shrink-0 text-primary" />
                  )}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => handleOpenChange(true)}>
                <IconCirclePlus className="mr-2 size-4" />
                <span>Crear workspace</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>

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
