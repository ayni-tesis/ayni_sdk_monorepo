"use client";

import { IconRefresh } from "@tabler/icons-react";
import axios from "axios";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { errorMessage } from "@/lib/api-error";
import { httpClient } from "@/lib/http-client";
import type { Application } from "../../types";
import { WORKFLOW_STATUS_LABELS, type WorkflowItem } from "./workflows-view";

export type WorkflowDetailItem = {
  workflow: WorkflowItem;
  draft: { nodes: unknown[] };
  versions: unknown[];
};

const WORKFLOW_LOAD_ERROR = "No pudimos cargar el workflow. Inténtalo nuevamente.";
const WORKFLOW_NOT_FOUND_MESSAGE = "No encontramos este workflow.";
const EMPTY_DRAFT_MESSAGE = "Este borrador aún no tiene nodos.";
const NO_VERSIONS_MESSAGE = "Aún no hay versiones publicadas.";
const WORKFLOW_NAME_REQUIRED_MESSAGE = "Ingresa un nombre para el workflow.";

export type RenameWorkflowDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  setName: (name: string) => void;
  nameError: string;
  setNameError: (error: string) => void;
  saving: boolean;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
};

export function RenameWorkflowDialog({
  open,
  onOpenChange,
  name,
  setName,
  nameError,
  setNameError,
  saving,
  onSubmit,
}: RenameWorkflowDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar nombre del workflow</DialogTitle>
          <DialogDescription className="sr-only">
            Cambia el nombre visible de este workflow sin afectar su id ni sus versiones.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="rename-workflow-name" className="font-semibold text-sm">
              Nombre del workflow
            </label>
            <Input
              id="rename-workflow-name"
              autoFocus
              required
              aria-required="true"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                if (nameError) setNameError("");
              }}
            />
            {nameError && (
              <p className="text-destructive text-sm" role="alert">
                {nameError}
              </p>
            )}
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

export type WorkflowDetailViewProps = {
  application: Application;
  workflowId: string;
  canManage?: boolean;
  onBackToWorkflows?: () => void;
};

export function WorkflowDetailView({
  application,
  workflowId,
  canManage = false,
  onBackToWorkflows,
}: WorkflowDetailViewProps) {
  const [detail, setDetail] = useState<WorkflowDetailItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState("");

  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameName, setRenameName] = useState("");
  const [renameError, setRenameError] = useState("");
  const [savingRename, setSavingRename] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);

  const loadDetail = useCallback(async (applicationId: string, id: string) => {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    setNotFound(false);
    setError("");
    try {
      const { data } = await httpClient.get<WorkflowDetailItem>(
        `/applications/${applicationId}/workflows/${encodeURIComponent(id)}`,
        { signal: controller.signal },
      );
      if (controller.signal.aborted) return;
      setDetail(data);
    } catch (loadError) {
      if (controller.signal.aborted) return;
      setDetail(null);
      if (axios.isAxiosError(loadError) && loadError.response?.status === 404) {
        setNotFound(true);
      } else {
        setError(errorMessage(loadError, WORKFLOW_LOAD_ERROR));
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadDetail(application.id, workflowId);
    return () => {
      abortControllerRef.current?.abort();
    };
  }, [application.id, workflowId, loadDetail]);

  function openRenameWorkflow(currentName: string) {
    setRenameName(currentName);
    setRenameError("");
    setRenameDialogOpen(true);
  }

  async function handleRenameWorkflow(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = renameName.trim();
    if (!trimmed) {
      setRenameError(WORKFLOW_NAME_REQUIRED_MESSAGE);
      return;
    }

    setSavingRename(true);
    try {
      const { data } = await httpClient.patch<{ workflow: WorkflowItem }>(
        `/applications/${application.id}/workflows/${encodeURIComponent(workflowId)}`,
        { name: trimmed },
      );
      setDetail((current) => (current ? { ...current, workflow: data.workflow } : current));
      setRenameDialogOpen(false);
      toast.success("Nombre del workflow actualizado.");
    } catch (renameRequestError) {
      toast.error(
        errorMessage(
          renameRequestError,
          "No pudimos actualizar el workflow. Inténtalo nuevamente.",
        ),
      );
    } finally {
      setSavingRename(false);
    }
  }

  if (loading) {
    return (
      <p data-testid="workflow-detail-loading" className="text-muted-foreground text-sm">
        Cargando workflow…
      </p>
    );
  }

  if (notFound) {
    return (
      <p data-testid="workflow-detail-not-found" className="text-muted-foreground text-sm">
        {WORKFLOW_NOT_FOUND_MESSAGE}
      </p>
    );
  }

  if (error || !detail) {
    return (
      <div
        className="applications-error flex items-center gap-3"
        data-testid="workflow-detail-error"
      >
        <p className="text-destructive text-sm">{error || WORKFLOW_LOAD_ERROR}</p>
        <Button
          variant="outline"
          size="sm"
          data-testid="workflow-detail-retry"
          onClick={() => void loadDetail(application.id, workflowId)}
        >
          <IconRefresh className="mr-1 size-4" />
          Reintentar
        </Button>
      </div>
    );
  }

  const { workflow, draft, versions } = detail;

  return (
    <section className="space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink
              href={`/dashboard/applications/${application.id}/workflows`}
              onClick={(event) => {
                if (!onBackToWorkflows) return;
                event.preventDefault();
                onBackToWorkflows();
              }}
            >
              Workflows
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{workflow.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <header
        data-testid="workflow-detail-header"
        className="flex items-start justify-between gap-4"
      >
        <div className="space-y-2">
          <h2 className="font-semibold text-lg">{workflow.name}</h2>
          <div className="flex items-center gap-3 text-sm">
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-muted-foreground text-xs">
              {workflow.id}
            </code>
            <span className="text-muted-foreground">
              {WORKFLOW_STATUS_LABELS[workflow.status] ?? workflow.status}
            </span>
          </div>
        </div>
        {canManage && application.status === "active" && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="outline" size="sm" data-testid="workflow-detail-actions">
                  Acciones
                </Button>
              }
            />
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                data-testid="workflow-detail-rename-trigger"
                onClick={() => openRenameWorkflow(workflow.name)}
              >
                Editar nombre
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </header>

      <Tabs defaultValue="draft">
        <TabsList>
          <TabsTrigger value="draft">Borrador</TabsTrigger>
          <TabsTrigger value="versions">Versiones publicadas</TabsTrigger>
        </TabsList>
        <TabsContent value="draft">
          {draft.nodes.length === 0 && (
            <p className="text-muted-foreground text-sm">{EMPTY_DRAFT_MESSAGE}</p>
          )}
        </TabsContent>
        <TabsContent value="versions">
          {versions.length === 0 && (
            <p className="text-muted-foreground text-sm">{NO_VERSIONS_MESSAGE}</p>
          )}
        </TabsContent>
      </Tabs>

      <RenameWorkflowDialog
        open={renameDialogOpen}
        onOpenChange={setRenameDialogOpen}
        name={renameName}
        setName={setRenameName}
        nameError={renameError}
        setNameError={setRenameError}
        saving={savingRename}
        onSubmit={handleRenameWorkflow}
      />
    </section>
  );
}
