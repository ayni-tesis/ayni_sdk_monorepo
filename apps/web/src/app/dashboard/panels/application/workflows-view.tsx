"use client";

import { IconGitBranch } from "@tabler/icons-react";
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

export type WorkflowsViewProps = {
  application: Application;
  canManage?: boolean;
};

export function WorkflowsView({ application, canManage = false }: WorkflowsViewProps) {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [workflowName, setWorkflowName] = useState("");
  const [workflowError, setWorkflowError] = useState("");
  const [creatingWorkflow, setCreatingWorkflow] = useState(false);

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

      <p className="text-muted-foreground text-sm">Aún no hay workflows configurados.</p>

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
