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
import { formatLongDateEs } from "@/lib/format-date";
import { httpClient } from "@/lib/http-client";
import type { Application } from "../../types";
import { WorkflowAddNodePanel } from "./workflow-add-node-panel";
import {
  sameWorkflowConnection,
  WORKFLOW_CYCLE_MESSAGE,
  WorkflowCanvas,
  type WorkflowCanvasDraft,
  type WorkflowCanvasPosition,
  type WorkflowCanvasPositions,
  type WorkflowCanvasConnection as WorkflowConnectionItem,
  workflowCanvasEdges,
  workflowNodePosition,
  workflowNodeTitle,
} from "./workflow-canvas";
import {
  WORKFLOW_PORT_LABELS,
  WORKFLOW_PORTS_CONNECTED_MESSAGE,
  WORKFLOW_PORTS_INCOMPATIBLE_MESSAGE,
  workflowPortCompatibility,
} from "./workflow-canvas-ports";
import type {
  WorkflowModelOption,
  WorkflowModelVersionContract,
  WorkflowNewNode,
  WorkflowNodeOrigin,
} from "./workflow-node-catalog";
import { type WorkflowNodeChanges, WorkflowNodeDetailsPanel } from "./workflow-node-details-panel";
import { WORKFLOW_STATUS_LABELS, type WorkflowItem } from "./workflows-view";

export type WorkflowVersionItem = {
  id: string;
  workflowId: string;
  version: string;
  createdAt: string;
};

export type WorkflowDetailItem = {
  workflow: WorkflowItem;
  draft: WorkflowCanvasDraft;
  versions: WorkflowVersionItem[];
};

export function findWorkflowCycleNodeIds(
  draft: WorkflowDetailItem["draft"],
  connection: WorkflowConnectionItem,
): string[] | undefined {
  const pending = [connection.targetNodeId];
  const previous = new Map<string, string>();
  const visited = new Set(pending);
  while (pending.length) {
    const nodeId = pending.pop();
    if (nodeId === undefined) continue;
    if (nodeId === connection.sourceNodeId) {
      const path = [nodeId];
      let currentNodeId = nodeId;
      while (currentNodeId !== connection.targetNodeId) {
        const parentNodeId = previous.get(currentNodeId);
        if (!parentNodeId) return undefined;
        path.unshift(parentNodeId);
        currentNodeId = parentNodeId;
      }
      return [...new Set([connection.sourceNodeId, ...path])];
    }
    for (const edge of draft.connections ?? []) {
      if (edge.sourceNodeId === nodeId && !visited.has(edge.targetNodeId)) {
        visited.add(edge.targetNodeId);
        previous.set(edge.targetNodeId, nodeId);
        pending.push(edge.targetNodeId);
      }
    }
  }
}

type WorkflowValidationResult = {
  publishable: boolean;
  errors: {
    code: string;
    nodeId: string | null;
    nodeName: string | null;
    port: string | null;
    message: string;
  }[];
};

const WORKFLOW_LOAD_ERROR = "No pudimos cargar el workflow. Inténtalo nuevamente.";
const WORKFLOW_POSITIONS_SAVE_ERROR =
  "No pudimos guardar las posiciones. Se restauró la ubicación anterior.";
const WORKFLOW_ARRANGE_ERROR = "No pudimos ordenar los nodos. Inténtalo nuevamente.";
const WORKFLOW_CONNECTION_RESTORE_CHANGED_MESSAGE =
  "No pudimos restaurar la conexión porque el borrador cambió.";
// Deshacer stays available while the notice is visible.
const WORKFLOW_UNDO_DURATION = 5000;
const MODEL_OPTIONS_LOAD_ERROR = "No pudimos cargar los modelos. Inténtalo nuevamente.";
const WORKFLOW_NOT_FOUND_MESSAGE = "No encontramos este workflow.";
const NO_VERSIONS_MESSAGE = "Aún no hay versiones publicadas.";
const WORKFLOW_NAME_REQUIRED_MESSAGE = "Ingresa un nombre para el workflow.";
// Each node type keeps the messages it had before Agregar nodo.
const ADD_NODE_MESSAGES: Record<WorkflowNewNode["type"], { success: string; failure: string }> = {
  "input.image": { success: "Nodo agregado.", failure: "No pudimos agregar el nodo." },
  "model.tflite": { success: "Nodo de modelo agregado.", failure: "No pudimos agregar el nodo." },
  condition: { success: "Condición agregada.", failure: "No pudimos agregar la condición." },
  output: { success: "Nodo de salida agregado.", failure: "No pudimos agregar la salida." },
};
// Any type added after an output port (US-128).
const ADD_CONNECTED_NODE_MESSAGES = {
  success: "Nodo agregado y conectado.",
  failure: "No pudimos agregar el nodo.",
};
const INVALID_VERSION_MESSAGE = "Ingresa una versión con formato SemVer, por ejemplo 1.0.0.";
const SEMVER_PATTERN = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/;

export type PublishWorkflowVersionDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  version: string;
  setVersion: (version: string) => void;
  versionError: string;
  setVersionError: (error: string) => void;
  publishing: boolean;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
};

export function PublishWorkflowVersionDialog({
  open,
  onOpenChange,
  version,
  setVersion,
  versionError,
  setVersionError,
  publishing,
  onSubmit,
}: PublishWorkflowVersionDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Publicar versión</DialogTitle>
          <DialogDescription>Se publicará una versión inmutable del workflow.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="publish-workflow-version" className="font-semibold text-sm">
              Versión
            </label>
            <Input
              id="publish-workflow-version"
              autoFocus
              required
              aria-required="true"
              placeholder="1.0.0"
              value={version}
              onChange={(event) => {
                setVersion(event.target.value);
                if (versionError) setVersionError("");
              }}
            />
            {versionError && (
              <p className="text-destructive text-sm" role="alert">
                {versionError}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              disabled={publishing}
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={publishing}>
              {publishing ? "Publicando versión…" : "Publicar versión"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

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

export type ArchiveWorkflowDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workflowName: string;
  archiving: boolean;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
};

export function ArchiveWorkflowDialog({
  open,
  onOpenChange,
  workflowName,
  archiving,
  onSubmit,
}: ArchiveWorkflowDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>¿Archivar &quot;{workflowName}&quot;?</DialogTitle>
          <DialogDescription>
            El SDK dejará de recibir versiones nuevas de este workflow. El historial se conservará.
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
              {archiving ? "Archivando workflow…" : "Archivar workflow"}
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
  const [savingPositions, setSavingPositions] = useState(false);
  const [arrangingNodes, setArrangingNodes] = useState(false);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  // Deleting a node applies only when exactly one node is selected.
  const selectedNodeId = selectedNodeIds.length === 1 ? selectedNodeIds[0] : null;
  const [deleteNodeDialogOpen, setDeleteNodeDialogOpen] = useState(false);
  const [deletingNode, setDeletingNode] = useState(false);
  // The node whose Detalles del nodo panel is open.
  const [detailsNodeId, setDetailsNodeId] = useState<string | null>(null);
  const [savingNodeDetails, setSavingNodeDetails] = useState(false);
  // Where to go once unsaved node changes are discarded: another node, or `null` to close.
  const [discardNodeChanges, setDiscardNodeChanges] = useState<{ nodeId: string | null } | null>(
    null,
  );
  // Whether the open panel holds unsaved changes; read when a node or close is requested.
  const nodeDetailsDirtyRef = useRef(false);
  const reportNodeDetailsDirty = useCallback((dirty: boolean) => {
    nodeDetailsDirtyRef.current = dirty;
  }, []);

  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameName, setRenameName] = useState("");
  const [renameError, setRenameError] = useState("");
  const [savingRename, setSavingRename] = useState(false);
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [publishVersion, setPublishVersion] = useState("");
  const [publishError, setPublishError] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [addNodeOpen, setAddNodeOpen] = useState(false);
  // The output port Agregar nodo was opened from, or `null` when opened from the bar.
  const [addNodeOrigin, setAddNodeOrigin] = useState<WorkflowNodeOrigin | null>(null);
  const [addingNode, setAddingNode] = useState(false);
  const [modelOptions, setModelOptions] = useState<WorkflowModelOption[]>([]);
  const [modelOptionsLoading, setModelOptionsLoading] = useState(false);
  const [modelOptionsError, setModelOptionsError] = useState("");
  const [modelOptionsReload, setModelOptionsReload] = useState(0);
  const [selectedConnection, setSelectedConnection] = useState<WorkflowConnectionItem | null>(null);
  const [connectionSource, setConnectionSource] = useState<{
    sourceNodeId: string;
    sourcePort: string;
  } | null>(null);
  const [cycleNodeIds, setCycleNodeIds] = useState<string[]>([]);
  const [validating, setValidating] = useState(false);
  // The draft the result belongs to; any later draft change hides the stale result.
  const [validation, setValidation] = useState<{
    draft: WorkflowCanvasDraft;
    result: WorkflowValidationResult;
  } | null>(null);
  // Set at once, unlike state, so a double click or a click and a drop add one node.
  const addingNodeRef = useRef(false);
  const removingConnectionRef = useRef(false);
  // Moving, arranging and undoing an arrangement all write the layout; set at
  // once, unlike state, so a Deshacer run from an older notice sees it too.
  const savingLayoutRef = useRef(false);
  // A notice's Deshacer runs later than the render that created it.
  const detailRef = useRef(detail);
  detailRef.current = detail;

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

  useEffect(() => {
    let active = true;
    if (!canManage || application.status !== "active") {
      setModelOptions([]);
      setModelOptionsLoading(false);
      setModelOptionsError("");
      return () => {
        active = false;
      };
    }
    async function loadModelOptions() {
      setModelOptionsLoading(true);
      setModelOptionsError("");
      try {
        const { data } = await httpClient.get<{ models: { id: string; name: string }[] }>(
          `/applications/${application.id}/models`,
        );
        const versionResults = await Promise.allSettled(
          data.models.map(async (item) => {
            const response = await httpClient.get<{
              versions: {
                id: string;
                version: string;
                contract: WorkflowModelVersionContract | null;
              }[];
            }>(`/applications/${application.id}/models/${encodeURIComponent(item.id)}/versions`);
            return { ...item, versions: response.data.versions };
          }),
        );
        if (active) {
          setModelOptions(
            versionResults.flatMap((result) =>
              result.status === "fulfilled" ? [result.value] : [],
            ),
          );
          if (versionResults.some((result) => result.status === "rejected")) {
            setModelOptionsError("No pudimos cargar las versiones de todos los modelos.");
          }
        }
      } catch (loadError) {
        if (active) {
          setModelOptions([]);
          setModelOptionsError(errorMessage(loadError, MODEL_OPTIONS_LOAD_ERROR));
        }
      } finally {
        if (active) setModelOptionsLoading(false);
      }
    }
    void loadModelOptions();
    return () => {
      active = false;
    };
  }, [application.id, application.status, canManage, modelOptionsReload]);

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

  async function handleArchiveWorkflow(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (archiving) return;
    setArchiving(true);
    try {
      const { data } = await httpClient.post<{ workflow: WorkflowItem }>(
        `/applications/${application.id}/workflows/${encodeURIComponent(workflowId)}/archive`,
      );
      setDetail((current) => (current ? { ...current, workflow: data.workflow } : current));
      setArchiveDialogOpen(false);
      toast.success("Workflow archivado.");
    } catch (archiveError) {
      toast.error(
        errorMessage(archiveError, "No pudimos archivar el workflow. Inténtalo nuevamente."),
      );
    } finally {
      setArchiving(false);
    }
  }

  // Agregar nodo closes once the node is saved; after a failure it stays open, with
  // the settings typed, over the draft reloaded from the server. A node added
  // after an output port is saved with its connection, so the canvas changes
  // only once both are.
  async function addNode(
    node: WorkflowNewNode,
    position: WorkflowCanvasPosition,
    connected = false,
  ) {
    if (addingNodeRef.current) return;
    addingNodeRef.current = true;
    setAddingNode(true);
    const messages = connected ? ADD_CONNECTED_NODE_MESSAGES : ADD_NODE_MESSAGES[node.type];
    try {
      const { data } = await httpClient.post<{ draft: WorkflowDetailItem["draft"] }>(
        `/applications/${application.id}/workflows/${encodeURIComponent(workflowId)}/nodes`,
        { ...node, position },
      );
      setDetail((current) => (current ? { ...current, draft: data.draft } : current));
      setAddNodeOpen(false);
      setAddNodeOrigin(null);
      toast.success(messages.success);
    } catch (addError) {
      // US-128 names a single failure message for a node added after a port.
      toast.error(connected ? messages.failure : errorMessage(addError, messages.failure));
      void loadDetail(application.id, workflowId);
    } finally {
      addingNodeRef.current = false;
      setAddingNode(false);
    }
  }

  async function validateWorkflow() {
    if (!detail || validating) return;
    const validatedDraft = detail.draft;
    setValidating(true);
    try {
      const { data } = await httpClient.get<WorkflowValidationResult>(
        `/applications/${application.id}/workflows/${encodeURIComponent(workflowId)}/validation`,
      );
      setValidation({ draft: validatedDraft, result: data });
    } catch (validationError) {
      setValidation(null);
      toast.error(
        errorMessage(validationError, "No pudimos validar el workflow. Inténtalo nuevamente."),
      );
    } finally {
      setValidating(false);
    }
  }

  function openPublishWorkflowVersion() {
    setPublishVersion("");
    setPublishError("");
    setPublishDialogOpen(true);
  }

  async function handlePublishWorkflowVersion(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detail || publishing) return;
    const version = publishVersion.trim();
    if (!SEMVER_PATTERN.test(version)) {
      setPublishError(INVALID_VERSION_MESSAGE);
      return;
    }
    const publishedDraft = detail.draft;
    setPublishing(true);
    try {
      const { data } = await httpClient.post<{ version: WorkflowVersionItem }>(
        `/applications/${application.id}/workflows/${encodeURIComponent(workflowId)}/versions`,
        { version },
      );
      setDetail((current) =>
        current ? { ...current, versions: [data.version, ...current.versions] } : current,
      );
      setPublishDialogOpen(false);
      toast.success(`Versión ${data.version.version} publicada.`);
    } catch (publishRequestError) {
      const response = axios.isAxiosError(publishRequestError)
        ? publishRequestError.response
        : undefined;
      if (response?.data?.code === "workflowInvalid") {
        // Show why the server refused: the errors belong to the draft on screen.
        setValidation({
          draft: publishedDraft,
          result: { publishable: false, errors: response.data.errors ?? [] },
        });
        setPublishDialogOpen(false);
        toast.error(errorMessage(publishRequestError, "No pudimos publicar la versión."));
      } else if (response?.status === 400 || response?.data?.code === "versionExists") {
        setPublishError(errorMessage(publishRequestError, INVALID_VERSION_MESSAGE));
      } else {
        toast.error(
          errorMessage(
            publishRequestError,
            "No pudimos publicar la versión. Inténtalo nuevamente.",
          ),
        );
      }
    } finally {
      setPublishing(false);
    }
  }

  // A reload after a failed edit keeps the draft on screen, so open panels keep
  // what was typed; only the first load shows the loading state.
  if (loading && !detail) {
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
  // The panel closes by itself once its node leaves the draft.
  const detailsNode = draft.nodes.find((node) => node.id === detailsNodeId);
  const validationResult = validation?.draft === draft ? validation.result : null;
  // Errors that belong to a node also show on it, with the panel's messages.
  const nodeErrors: Record<string, string[]> = {};
  for (const { nodeId, message } of validationResult?.errors ?? []) {
    if (nodeId) nodeErrors[nodeId] = [...(nodeErrors[nodeId] ?? []), message];
  }
  const layoutUrl = `/applications/${application.id}/workflows/${encodeURIComponent(workflowId)}/layout`;

  function showPositions(positions: WorkflowCanvasPositions) {
    setDetail((current) =>
      current
        ? {
            ...current,
            draft: { ...current.draft, layout: { ...current.draft.layout, ...positions } },
          }
        : current,
    );
  }

  // Saves every moved node in one operation; moving is frequent, so success is silent.
  async function moveWorkflowNodes(positions: WorkflowCanvasPositions) {
    if (!detail || savingLayoutRef.current || !canManage || application.status !== "active") return;
    const previousLayout = detail.draft.layout;
    savingLayoutRef.current = true;
    setSavingPositions(true);
    showPositions(positions);
    try {
      await httpClient.patch(layoutUrl, { positions });
    } catch {
      setDetail((current) => {
        if (!current) return current;
        const layout = { ...current.draft.layout };
        for (const nodeId of Object.keys(positions)) {
          const previous = previousLayout?.[nodeId];
          if (previous) layout[nodeId] = previous;
          else delete layout[nodeId];
        }
        return { ...current, draft: { ...current.draft, layout } };
      });
      // Unlike other edits, a failed move always reads the same: the nodes were restored.
      toast.error(WORKFLOW_POSITIONS_SAVE_ERROR);
    } finally {
      savingLayoutRef.current = false;
      setSavingPositions(false);
    }
  }

  // Ordenar nodos saves every position in one operation and shows them only once
  // saved, so a failure leaves the canvas as it was. Resolves whether it saved.
  async function arrangeNodes(positions: WorkflowCanvasPositions): Promise<boolean> {
    if (!detail || savingLayoutRef.current || !canManage || application.status !== "active")
      return false;
    const { draft } = detail;
    const previous = Object.fromEntries(
      draft.nodes.map((node, index) => [node.id, workflowNodePosition(draft, node, index)]),
    );
    savingLayoutRef.current = true;
    setArrangingNodes(true);
    try {
      await httpClient.patch(layoutUrl, { positions });
    } catch {
      toast.error(WORKFLOW_ARRANGE_ERROR);
      return false;
    } finally {
      savingLayoutRef.current = false;
      setArrangingNodes(false);
    }
    showPositions(positions);
    toast.success("Nodos ordenados.", {
      duration: WORKFLOW_UNDO_DURATION,
      action: { label: "Deshacer", onClick: () => void undoArrangeNodes(previous) },
    });
    return true;
  }

  // Deshacer puts back the positions the nodes had before Ordenar nodos, for the
  // nodes still in the draft. It does nothing while other positions are saving.
  async function undoArrangeNodes(previous: WorkflowCanvasPositions) {
    if (savingLayoutRef.current) return;
    const nodeIds = new Set(detailRef.current?.draft.nodes.map((node) => node.id));
    const positions = Object.fromEntries(
      Object.entries(previous).filter(([nodeId]) => nodeIds.has(nodeId)),
    );
    if (Object.keys(positions).length === 0) return;
    savingLayoutRef.current = true;
    setSavingPositions(true);
    try {
      await httpClient.patch(layoutUrl, { positions });
      showPositions(positions);
      toast.success("Posiciones restauradas.");
    } catch (restoreError) {
      toast.error(errorMessage(restoreError, "No pudimos restaurar las posiciones."));
    } finally {
      savingLayoutRef.current = false;
      setSavingPositions(false);
    }
  }

  const connectionsUrl = `/applications/${application.id}/workflows/${encodeURIComponent(workflowId)}/connections`;

  async function changeConnection(connection: WorkflowConnectionItem) {
    if (detail) {
      // Rejected connections never reach the server and leave the draft as it is.
      const compatibility = workflowPortCompatibility(detail.draft, connection);
      if (compatibility !== "compatible") {
        toast.error(
          compatibility === "connected"
            ? WORKFLOW_PORTS_CONNECTED_MESSAGE
            : WORKFLOW_PORTS_INCOMPATIBLE_MESSAGE,
        );
        return;
      }
      const cycle = findWorkflowCycleNodeIds(detail.draft, connection);
      if (cycle) {
        setCycleNodeIds(cycle);
        toast.error(WORKFLOW_CYCLE_MESSAGE);
        return;
      }
    }
    try {
      const { data } = await httpClient.post<{ draft: WorkflowDetailItem["draft"] }>(
        connectionsUrl,
        connection,
      );
      setDetail((current) => (current ? { ...current, draft: data.draft } : current));
      setCycleNodeIds([]);
      setSelectedConnection(null);
      setConnectionSource(null);
      toast.success("Conexión creada.");
    } catch (connectionError) {
      if (
        axios.isAxiosError(connectionError) &&
        connectionError.response?.data?.code === "workflowCycle"
      )
        setCycleNodeIds(connectionError.response.data.nodeIds ?? []);
      toast.error(errorMessage(connectionError, "No pudimos crear la conexión."));
      void loadDetail(application.id, workflowId);
    }
  }

  // Deshacer restores the connection only on the very draft the deletion left.
  // TODO(US-130): compare the server's draft revision instead, so that changes
  // made by someone else also block the restore.
  async function removeConnection(connection: WorkflowConnectionItem) {
    if (removingConnectionRef.current) return;
    removingConnectionRef.current = true;
    try {
      const { data } = await httpClient.delete<{ draft: WorkflowDetailItem["draft"] }>(
        connectionsUrl,
        { data: connection },
      );
      setDetail((current) => (current ? { ...current, draft: data.draft } : current));
      setCycleNodeIds([]);
      setSelectedConnection(null);
      toast.success("Conexión eliminada.", {
        duration: WORKFLOW_UNDO_DURATION,
        action: {
          label: "Deshacer",
          onClick: () => void restoreConnection(connection, data.draft),
        },
      });
    } catch (removeError) {
      toast.error(errorMessage(removeError, "No pudimos eliminar la conexión."));
      void loadDetail(application.id, workflowId);
    } finally {
      removingConnectionRef.current = false;
    }
  }

  async function restoreConnection(
    connection: WorkflowConnectionItem,
    draftAfterRemoval: WorkflowDetailItem["draft"],
  ) {
    if (detailRef.current?.draft !== draftAfterRemoval) {
      toast.error(WORKFLOW_CONNECTION_RESTORE_CHANGED_MESSAGE);
      return;
    }
    try {
      const { data } = await httpClient.post<{ draft: WorkflowDetailItem["draft"] }>(
        connectionsUrl,
        connection,
      );
      setDetail((current) => (current ? { ...current, draft: data.draft } : current));
      toast.success("Conexión restaurada.");
    } catch (restoreError) {
      toast.error(errorMessage(restoreError, "No pudimos restaurar la conexión."));
      void loadDetail(application.id, workflowId);
    }
  }

  // Leaving a panel with unsaved changes, for another node or none, asks first.
  function openNodeDetails(nodeId: string | null) {
    if (nodeId === detailsNodeId) return;
    if (detailsNode && nodeDetailsDirtyRef.current) setDiscardNodeChanges({ nodeId });
    else setDetailsNodeId(nodeId);
  }

  function confirmDiscardNodeChanges() {
    if (!discardNodeChanges) return;
    nodeDetailsDirtyRef.current = false;
    setDetailsNodeId(discardNodeChanges.nodeId);
    setDiscardNodeChanges(null);
  }

  // The canvas shows the node as saved: nothing changes there until the server accepts it.
  async function saveNodeDetails(nodeId: string, changes: WorkflowNodeChanges) {
    if (savingNodeDetails) return;
    setSavingNodeDetails(true);
    try {
      const { data } = await httpClient.patch<{ draft: WorkflowDetailItem["draft"] }>(
        `/applications/${application.id}/workflows/${encodeURIComponent(workflowId)}/nodes/${encodeURIComponent(nodeId)}`,
        changes,
      );
      setDetail((current) => (current ? { ...current, draft: data.draft } : current));
      toast.success("Nodo actualizado.");
    } catch (saveError) {
      toast.error(errorMessage(saveError, "No pudimos guardar los cambios del nodo."));
    } finally {
      setSavingNodeDetails(false);
    }
  }

  async function deleteSelectedNode() {
    if (!selectedNodeId || deletingNode) return;
    setDeletingNode(true);
    try {
      const { data } = await httpClient.delete<{ draft: WorkflowDetailItem["draft"] }>(
        `/applications/${application.id}/workflows/${encodeURIComponent(workflowId)}/nodes/${encodeURIComponent(selectedNodeId)}`,
      );
      setDetail((current) => (current ? { ...current, draft: data.draft } : current));
      setSelectedNodeIds([]);
      setSelectedConnection((current) =>
        current
          ? (workflowCanvasEdges(data.draft).find((edge) =>
              sameWorkflowConnection(edge, current),
            ) ?? null)
          : null,
      );
      setConnectionSource((current) =>
        current && data.draft.nodes.some((node) => node.id === current.sourceNodeId)
          ? current
          : null,
      );
      const remainingNodeIds = new Set(data.draft.nodes.map((node) => node.id));
      setCycleNodeIds((current) => current.filter((nodeId) => remainingNodeIds.has(nodeId)));
      setDeleteNodeDialogOpen(false);
      toast.success("Nodo eliminado.");
    } catch (deleteError) {
      setDeleteNodeDialogOpen(false);
      setSelectedNodeIds([]);
      toast.error(errorMessage(deleteError, "No pudimos eliminar el nodo."));
      void loadDetail(application.id, workflowId);
    } finally {
      setDeletingNode(false);
    }
  }

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
              {workflow.status !== "archived" && (
                <DropdownMenuItem
                  data-testid="workflow-detail-archive-trigger"
                  variant="destructive"
                  onClick={() => setArchiveDialogOpen(true)}
                >
                  Archivar workflow
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </header>

      <Tabs defaultValue="draft">
        <TabsList>
          <TabsTrigger value="draft">Borrador</TabsTrigger>
          <TabsTrigger value="versions">Versiones publicadas</TabsTrigger>
        </TabsList>
        <TabsContent value="draft" className="space-y-4">
          {canManage && application.status === "active" && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={validating}
                  onClick={() => void validateWorkflow()}
                >
                  {validating ? "Validando workflow…" : "Validar workflow"}
                </Button>
                <Button type="button" size="sm" onClick={openPublishWorkflowVersion}>
                  Publicar versión
                </Button>
              </div>
              {validationResult?.publishable && (
                <p role="status" className="text-sm">
                  El workflow está listo para publicarse.
                </p>
              )}
              {validationResult && !validationResult.publishable && (
                <section
                  aria-labelledby="workflow-validation-errors-title"
                  className="rounded-lg border border-destructive/50 p-3"
                >
                  <h3
                    id="workflow-validation-errors-title"
                    className="mb-2 font-medium text-destructive text-sm"
                  >
                    Errores de validación
                  </h3>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="pb-2 font-medium">Nodo</th>
                        <th className="pb-2 font-medium">Puerto</th>
                        <th className="pb-2 font-medium">Descripción</th>
                      </tr>
                    </thead>
                    <tbody>
                      {validationResult.errors.map((validationError) => (
                        <tr
                          key={`${validationError.code}:${validationError.nodeId}:${validationError.port}:${validationError.message}`}
                          className="border-b last:border-0"
                        >
                          <td className="py-2">{validationError.nodeName ?? "Workflow"}</td>
                          <td className="py-2">
                            {validationError.port
                              ? (WORKFLOW_PORT_LABELS[validationError.port] ?? validationError.port)
                              : "—"}
                          </td>
                          <td className="py-2">{validationError.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              )}
            </div>
          )}
          <WorkflowCanvas
            draft={draft}
            canManage={canManage && application.status === "active"}
            selectedConnection={selectedConnection}
            connectionSource={connectionSource}
            cycleNodeIds={cycleNodeIds}
            nodeErrors={nodeErrors}
            savingPositions={savingPositions}
            arrangingNodes={arrangingNodes}
            onSelectSource={setConnectionSource}
            selectedNodeIds={selectedNodeIds}
            onSelectNodes={setSelectedNodeIds}
            onRequestDeleteNode={(nodeId) => {
              setSelectedNodeIds([nodeId]);
              setDeleteNodeDialogOpen(true);
            }}
            onSelectConnection={setSelectedConnection}
            onConnect={(connection) => void changeConnection(connection)}
            onMoveNodes={(positions) => void moveWorkflowNodes(positions)}
            onArrangeNodes={arrangeNodes}
            onDropPalette={(node, position) => void addNode(node, position)}
            onRemoveConnection={(connection) => void removeConnection(connection)}
            onOpenNodeDetails={openNodeDetails}
            onCloseNodeDetails={() => openNodeDetails(null)}
            details={
              detailsNode ? (
                <WorkflowNodeDetailsPanel
                  key={detailsNode.id}
                  node={detailsNode}
                  draft={draft}
                  canManage={canManage && application.status === "active"}
                  saving={savingNodeDetails}
                  onSave={(changes) => void saveNodeDetails(detailsNode.id, changes)}
                  onClose={() => openNodeDetails(null)}
                  onDirtyChange={reportNodeDetailsDirty}
                />
              ) : null
            }
            addNode={
              canManage && application.status === "active"
                ? {
                    open: addNodeOpen,
                    onToggle: () => {
                      setAddNodeOrigin(null);
                      setAddNodeOpen((open) => !open);
                    },
                    onAddAfter: (origin) => {
                      setAddNodeOrigin(origin);
                      setAddNodeOpen(true);
                    },
                    panel: (placement) => (
                      <WorkflowAddNodePanel
                        // Another port starts over, without the previous search or form.
                        key={
                          addNodeOrigin
                            ? `${addNodeOrigin.sourceNodeId}:${addNodeOrigin.sourcePort}`
                            : "all"
                        }
                        draft={draft}
                        models={modelOptions}
                        modelsLoading={modelOptionsLoading}
                        modelsError={modelOptionsError}
                        onRetryModels={() => setModelOptionsReload((value) => value + 1)}
                        busy={loading || addingNode || savingPositions || arrangingNodes}
                        origin={addNodeOrigin ?? undefined}
                        onAdd={(node) =>
                          void (addNodeOrigin
                            ? addNode(node, placement.after(addNodeOrigin.sourceNodeId), true)
                            : addNode(node, placement.visibleCenter()))
                        }
                        onClose={() => {
                          setAddNodeOpen(false);
                          setAddNodeOrigin(null);
                        }}
                      />
                    ),
                  }
                : undefined
            }
          />
          <Dialog
            open={discardNodeChanges !== null}
            onOpenChange={(open) => {
              if (!open) setDiscardNodeChanges(null);
            }}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>¿Descartar los cambios del nodo?</DialogTitle>
                <DialogDescription>Los cambios sin guardar se perderán.</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setDiscardNodeChanges(null)}>
                  Seguir editando
                </Button>
                <Button type="button" variant="destructive" onClick={confirmDiscardNodeChanges}>
                  Descartar cambios
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Dialog open={deleteNodeDialogOpen} onOpenChange={setDeleteNodeDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  ¿Eliminar &quot;
                  {(() => {
                    const node = draft.nodes.find((item) => item.id === selectedNodeId);
                    return node ? workflowNodeTitle(node) : "";
                  })()}
                  &quot;?
                </DialogTitle>
                <DialogDescription>También se eliminarán sus conexiones.</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={deletingNode}
                  onClick={() => setDeleteNodeDialogOpen(false)}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={deletingNode}
                  onClick={() => void deleteSelectedNode()}
                >
                  Eliminar nodo
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>
        <TabsContent value="versions">
          {versions.length === 0 ? (
            <p className="text-muted-foreground text-sm">{NO_VERSIONS_MESSAGE}</p>
          ) : (
            <table aria-label="Versiones publicadas" className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="pb-2 font-medium">Versión</th>
                  <th className="pb-2 font-medium">Publicada</th>
                </tr>
              </thead>
              <tbody>
                {versions.map((version) => (
                  <tr key={version.id} className="border-b last:border-0">
                    <td className="py-2.5 font-mono">{version.version}</td>
                    <td className="py-2.5 text-muted-foreground">
                      {formatLongDateEs(version.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </TabsContent>
      </Tabs>

      <PublishWorkflowVersionDialog
        open={publishDialogOpen}
        onOpenChange={setPublishDialogOpen}
        version={publishVersion}
        setVersion={setPublishVersion}
        versionError={publishError}
        setVersionError={setPublishError}
        publishing={publishing}
        onSubmit={handlePublishWorkflowVersion}
      />

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

      <ArchiveWorkflowDialog
        open={archiveDialogOpen}
        onOpenChange={setArchiveDialogOpen}
        workflowName={workflow.name}
        archiving={archiving}
        onSubmit={handleArchiveWorkflow}
      />
    </section>
  );
}
