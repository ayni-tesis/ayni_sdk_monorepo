"use client";

import { IconGitBranch, IconRefresh } from "@tabler/icons-react";
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
import { formatLongDateEs } from "@/lib/format-date";
import { httpClient } from "@/lib/http-client";
import type { Application } from "../../types";

export type CreateWorkflowDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workflowName: string;
  setWorkflowName: (name: string) => void;
  workflowError: string;
  setWorkflowError: (error: string) => void;
  creating: boolean;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
};

export function CreateWorkflowDialog({
  open,
  onOpenChange,
  workflowName,
  setWorkflowName,
  workflowError,
  setWorkflowError,
  creating,
  onSubmit,
}: CreateWorkflowDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          setWorkflowName("");
          setWorkflowError("");
        }
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Crear workflow</DialogTitle>
          <DialogDescription className="sr-only">
            Crea un workflow borrador para definir un DAG de inferencia en esta aplicación.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="workflow-name" className="font-semibold text-sm">
              Nombre del workflow
            </label>
            <Input
              id="workflow-name"
              autoFocus
              required
              aria-required="true"
              value={workflowName}
              onChange={(event) => {
                setWorkflowName(event.target.value);
                if (workflowError) setWorkflowError("");
              }}
            />
            {workflowError && (
              <p className="text-destructive text-sm" role="alert">
                {workflowError}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              disabled={creating}
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" data-testid="create-workflow-submit" disabled={creating}>
              {creating ? "Creando borrador…" : "Crear borrador"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export type WorkflowItem = {
  id: string;
  applicationId: string;
  name: string;
  status: "draft";
  createdAt: string;
  updatedAt: string;
};

const WORKFLOWS_LOAD_ERROR = "No pudimos cargar los workflows. Inténtalo nuevamente.";
const WORKFLOWS_EMPTY_MESSAGE = "Aún no hay workflows en esta aplicación.";

export const WORKFLOW_STATUS_LABELS: Record<WorkflowItem["status"], string> = {
  draft: "Borrador",
};

// Workflow versions are not published yet, so no workflow has a latest version.
const NO_PUBLISHED_VERSION_LABEL = "Sin publicar";

export type WorkflowsViewProps = {
  application: Application;
  canManage?: boolean;
  onOpenWorkflow?: (workflowId: string) => void;
};

export function WorkflowsView({
  application,
  canManage = false,
  onOpenWorkflow,
}: WorkflowsViewProps) {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [workflowName, setWorkflowName] = useState("");
  const [workflowError, setWorkflowError] = useState("");
  const [creatingWorkflow, setCreatingWorkflow] = useState(false);

  const [workflows, setWorkflows] = useState<WorkflowItem[]>([]);
  const [workflowsLoading, setWorkflowsLoading] = useState(true);
  const [workflowsError, setWorkflowsError] = useState("");

  const abortControllerRef = useRef<AbortController | null>(null);

  const loadWorkflows = useCallback(async (applicationId: string) => {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setWorkflowsLoading(true);
    setWorkflowsError("");
    try {
      const { data } = await httpClient.get<{ workflows?: WorkflowItem[] }>(
        `/applications/${applicationId}/workflows`,
        { signal: controller.signal },
      );
      if (controller.signal.aborted) return;
      setWorkflows(Array.isArray(data?.workflows) ? data.workflows : []);
    } catch (loadError) {
      if (controller.signal.aborted) return;
      setWorkflowsError(errorMessage(loadError, WORKFLOWS_LOAD_ERROR));
    } finally {
      if (!controller.signal.aborted) {
        setWorkflowsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadWorkflows(application.id);
    return () => {
      abortControllerRef.current?.abort();
    };
  }, [application.id, loadWorkflows]);

  function openCreateWorkflow() {
    setWorkflowName("");
    setWorkflowError("");
    setCreateDialogOpen(true);
  }

  async function handleCreateWorkflow(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = workflowName.trim();
    if (!trimmed) {
      setWorkflowError("Ingresa un nombre para el workflow.");
      return;
    }

    setCreatingWorkflow(true);
    try {
      await httpClient.post(`/applications/${application.id}/workflows`, { name: trimmed });
      toast.success("Workflow creado. Ya puedes agregar nodos.");
      setCreateDialogOpen(false);
      setWorkflowName("");
      setWorkflowError("");
      void loadWorkflows(application.id);
    } catch (error) {
      toast.error(errorMessage(error, "No pudimos crear el workflow. Inténtalo nuevamente."));
    } finally {
      setCreatingWorkflow(false);
    }
  }

  return (
    <section className="space-y-4">
      <div className="application-section-heading flex items-center justify-between">
        <div className="flex items-center gap-2">
          <IconGitBranch className="size-5 text-primary" />
          <h2 className="font-semibold text-lg">Workflows</h2>
        </div>
        {canManage && application.status === "active" && (
          <Button
            size="sm"
            variant="outline"
            data-testid="create-workflow-trigger"
            onClick={openCreateWorkflow}
          >
            Crear workflow
          </Button>
        )}
      </div>

      {workflowsLoading ? (
        <p data-testid="workflows-loading" className="text-muted-foreground text-sm">
          Cargando workflows…
        </p>
      ) : workflowsError ? (
        <div className="applications-error flex items-center gap-3" data-testid="workflows-error">
          <p className="text-destructive text-sm">{workflowsError}</p>
          <Button
            variant="outline"
            size="sm"
            data-testid="workflows-retry"
            onClick={() => void loadWorkflows(application.id)}
          >
            <IconRefresh className="mr-1 size-4" />
            Reintentar
          </Button>
        </div>
      ) : workflows.length === 0 ? (
        <p data-testid="workflows-empty" className="text-muted-foreground text-sm">
          {WORKFLOWS_EMPTY_MESSAGE}
        </p>
      ) : (
        <table className="workflows-table w-full text-sm" data-testid="workflows-table">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="pb-2 font-medium">Nombre</th>
              <th className="pb-2 font-medium">Estado</th>
              <th className="pb-2 font-medium">Última versión</th>
              <th className="pb-2 font-medium">Actualizado</th>
            </tr>
          </thead>
          <tbody>
            {workflows.map((workflowItem) => (
              <tr key={workflowItem.id} data-testid={`workflow-row-${workflowItem.id}`}>
                <td className="py-2.5">
                  <button
                    type="button"
                    className="font-medium text-primary underline-offset-4 hover:underline"
                    onClick={() => onOpenWorkflow?.(workflowItem.id)}
                  >
                    {workflowItem.name}
                  </button>
                  <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-muted-foreground text-xs">
                    {workflowItem.id}
                  </code>
                </td>
                <td className="py-2.5 text-muted-foreground">
                  {WORKFLOW_STATUS_LABELS[workflowItem.status] ?? workflowItem.status}
                </td>
                <td className="py-2.5 text-muted-foreground">{NO_PUBLISHED_VERSION_LABEL}</td>
                <td className="py-2.5 text-muted-foreground">
                  {formatLongDateEs(workflowItem.updatedAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <CreateWorkflowDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        workflowName={workflowName}
        setWorkflowName={setWorkflowName}
        workflowError={workflowError}
        setWorkflowError={setWorkflowError}
        creating={creatingWorkflow}
        onSubmit={handleCreateWorkflow}
      />
    </section>
  );
}
