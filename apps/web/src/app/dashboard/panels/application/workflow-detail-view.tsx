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
import {
  nextWorkflowCanvasPosition,
  sameWorkflowConnection,
  WORKFLOW_CYCLE_MESSAGE,
  WorkflowCanvas,
  type WorkflowCanvasDraft,
  type WorkflowCanvasNodeType,
  type WorkflowCanvasPosition,
  type WorkflowCanvasPositions,
  type WorkflowCanvasConnection as WorkflowConnectionItem,
  type WorkflowCanvasNode as WorkflowNodeItem,
  WorkflowPaletteButton,
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

type ModelVersionContract = {
  input: { type: "image"; width: number; height: number; channels: number; normalization: string };
  output:
    | { type: "classification"; labels: string[] }
    | { type: "detection"; labels: string[]; scoreThreshold: number };
};

type WorkflowModelOption = {
  id: string;
  name: string;
  versions: { id: string; version: string; contract: ModelVersionContract | null }[];
};
type WorkflowOutputOption = {
  id: string;
  port: "result" | "true" | "false";
  type: "classification" | "detection" | "boolean";
  label: string;
};

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
const IMAGE_INPUT_EXISTS_MESSAGE = "Este workflow ya tiene una entrada de imagen.";
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
  const [addingImageInput, setAddingImageInput] = useState(false);
  const [modelOptions, setModelOptions] = useState<WorkflowModelOption[]>([]);
  const [modelOptionsLoading, setModelOptionsLoading] = useState(false);
  const [modelOptionsError, setModelOptionsError] = useState("");
  const [modelOptionsReload, setModelOptionsReload] = useState(0);
  const [selectedModelVersionId, setSelectedModelVersionId] = useState("");
  const [addingModel, setAddingModel] = useState(false);
  const [conditionSourceId, setConditionSourceId] = useState("");
  const [conditionLabel, setConditionLabel] = useState("");
  const [conditionOperator, setConditionOperator] = useState<"gte" | "gt" | "lte" | "lt">("gte");
  const [conditionThreshold, setConditionThreshold] = useState("0.5");
  const [addingCondition, setAddingCondition] = useState(false);
  const [outputName, setOutputName] = useState("");
  const [outputSource, setOutputSource] = useState("");
  const [outputTypeError, setOutputTypeError] = useState("");
  const [addingOutput, setAddingOutput] = useState(false);
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
  const addingImageInputRef = useRef(false);
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
              versions: { id: string; version: string; contract: ModelVersionContract | null }[];
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

  function newNodePosition(position?: WorkflowCanvasPosition) {
    return position ?? (detail ? nextWorkflowCanvasPosition(detail.draft) : undefined);
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

  async function addImageInput(position?: WorkflowCanvasPosition) {
    if (addingImageInputRef.current) return;
    addingImageInputRef.current = true;
    setAddingImageInput(true);
    try {
      const { data } = await httpClient.post<{ draft: WorkflowDetailItem["draft"] }>(
        `/applications/${application.id}/workflows/${encodeURIComponent(workflowId)}/nodes`,
        { type: "input.image", position: newNodePosition(position) },
      );
      setDetail((current) => (current ? { ...current, draft: data.draft } : current));
      toast.success("Nodo agregado.");
    } catch (addError) {
      toast.error(errorMessage(addError, "No pudimos agregar el nodo."));
      void loadDetail(application.id, workflowId);
    } finally {
      addingImageInputRef.current = false;
      setAddingImageInput(false);
    }
  }

  async function addModelNode(position?: WorkflowCanvasPosition) {
    if (!selectedModelVersionId || addingModel) return;
    setAddingModel(true);
    try {
      const { data } = await httpClient.post<{ draft: WorkflowDetailItem["draft"] }>(
        `/applications/${application.id}/workflows/${encodeURIComponent(workflowId)}/nodes`,
        {
          type: "model.tflite",
          modelVersionId: selectedModelVersionId,
          position: newNodePosition(position),
        },
      );
      setDetail((current) => (current ? { ...current, draft: data.draft } : current));
      toast.success("Nodo de modelo agregado.");
    } catch (addError) {
      toast.error(errorMessage(addError, "No pudimos agregar el nodo."));
      void loadDetail(application.id, workflowId);
    } finally {
      setAddingModel(false);
    }
  }

  async function addConditionNode(position?: WorkflowCanvasPosition) {
    if (!conditionThreshold.trim()) return;
    const threshold = Number(conditionThreshold);
    if (
      !detail ||
      !conditionSourceId ||
      !conditionLabel.trim() ||
      !Number.isFinite(threshold) ||
      threshold < 0 ||
      threshold > 1 ||
      addingCondition
    )
      return;
    setAddingCondition(true);
    try {
      const { data } = await httpClient.post<{ draft: WorkflowDetailItem["draft"] }>(
        `/applications/${application.id}/workflows/${encodeURIComponent(workflowId)}/nodes`,
        {
          type: "condition",
          sourceNodeId: conditionSourceId,
          label: conditionLabel.trim(),
          operator: conditionOperator,
          threshold,
          position: newNodePosition(position),
        },
      );
      setDetail((current) => (current ? { ...current, draft: data.draft } : current));
      setConditionLabel("");
      toast.success("Condición agregada.");
    } catch (addError) {
      toast.error(errorMessage(addError, "No pudimos agregar la condición."));
      void loadDetail(application.id, workflowId);
    } finally {
      setAddingCondition(false);
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
  const validationResult = validation?.draft === draft ? validation.result : null;
  const classificationNodes = draft.nodes.filter(
    (node): node is Extract<WorkflowNodeItem, { type: "model.tflite" }> =>
      node.type === "model.tflite" && node.outputs.result.type === "classification",
  );
  const contractedModelVersionCount = modelOptions.reduce(
    (count, item) => count + item.versions.filter((version) => version.contract).length,
    0,
  );
  const outputOptions: WorkflowOutputOption[] = draft.nodes.flatMap(
    (node): WorkflowOutputOption[] => {
      if (node.type === "model.tflite")
        return [
          {
            id: node.id,
            port: "result",
            type: node.outputs.result.type,
            label: `${node.modelName} · ${node.version} · ${node.outputs.result.type}`,
          },
        ];
      if (node.type === "condition")
        return [
          {
            id: node.id,
            port: "true",
            type: "boolean" as const,
            label: `Condición: ${node.label} · Verdadero`,
          },
          {
            id: node.id,
            port: "false",
            type: "boolean" as const,
            label: `Condición: ${node.label} · Falso`,
          },
        ];
      return [];
    },
  );

  async function addOutputNode(position?: WorkflowCanvasPosition) {
    const name = outputName.trim();
    const selected = outputOptions.find(
      (option) => `${option.id}:${option.port ?? "result"}` === outputSource,
    );
    if (!name || addingOutput) return;
    if (!selected) {
      setOutputTypeError("Selecciona un tipo de resultado para la salida.");
      return;
    }
    setAddingOutput(true);
    try {
      const { data } = await httpClient.post<{ draft: WorkflowDetailItem["draft"] }>(
        `/applications/${application.id}/workflows/${encodeURIComponent(workflowId)}/nodes`,
        {
          type: "output",
          name,
          sourceNodeId: selected.id,
          sourcePort: selected.port ?? "result",
          resultType: selected.type,
          position: newNodePosition(position),
        },
      );
      setDetail((current) => (current ? { ...current, draft: data.draft } : current));
      setOutputName("");
      toast.success("Nodo de salida agregado.");
    } catch (addError) {
      toast.error(errorMessage(addError, "No pudimos agregar la salida."));
      void loadDetail(application.id, workflowId);
    } finally {
      setAddingOutput(false);
    }
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

  function dropPaletteNode(nodeType: WorkflowCanvasNodeType, position: WorkflowCanvasPosition) {
    if (nodeType === "input.image") void addImageInput(position);
    else if (nodeType === "model.tflite") void addModelNode(position);
    else if (nodeType === "condition") void addConditionNode(position);
    else void addOutputNode(position);
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
      if (conditionSourceId && !remainingNodeIds.has(conditionSourceId)) {
        setConditionSourceId("");
        setConditionLabel("");
      }
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
            onDropPalette={dropPaletteNode}
            onRemoveConnection={(connection) => void removeConnection(connection)}
            palette={
              canManage && application.status === "active" ? (
                <aside
                  aria-label="Nodos"
                  className="max-h-[720px] space-y-3 overflow-y-auto rounded-lg border bg-card p-3"
                >
                  <h3 className="font-medium text-sm">Nodos disponibles</h3>
                  <WorkflowPaletteButton
                    nodeType="input.image"
                    disabled={
                      savingPositions ||
                      addingImageInput ||
                      draft.nodes.some((node) => node.type === "input.image")
                    }
                    onClick={() => void addImageInput()}
                  >
                    Entrada de imagen
                  </WorkflowPaletteButton>
                  {draft.nodes.some((node) => node.type === "input.image") && (
                    <p className="text-muted-foreground text-xs">{IMAGE_INPUT_EXISTS_MESSAGE}</p>
                  )}

                  <div className="space-y-2 border-t pt-3">
                    <label htmlFor="workflow-model-version" className="block font-medium text-sm">
                      Modelo
                    </label>
                    <select
                      id="workflow-model-version"
                      className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
                      value={selectedModelVersionId}
                      onChange={(event) => setSelectedModelVersionId(event.target.value)}
                    >
                      <option value="">
                        {modelOptionsLoading
                          ? "Cargando modelos…"
                          : contractedModelVersionCount
                            ? "Selecciona una versión"
                            : modelOptionsError
                              ? "No se pudieron cargar los modelos"
                              : modelOptions.length === 0
                                ? "No hay modelos registrados"
                                : "No hay versiones con contrato"}
                      </option>
                      {modelOptions.flatMap((item) =>
                        item.versions
                          .filter((version) => version.contract)
                          .map((version) => (
                            <option key={version.id} value={version.id}>
                              {item.name} · {version.version}
                            </option>
                          )),
                      )}
                    </select>
                    {modelOptionsLoading && (
                      <p role="status" className="text-muted-foreground text-xs">
                        Cargando modelos y versiones…
                      </p>
                    )}
                    {modelOptionsError && (
                      <div role="alert" className="space-y-2">
                        <p className="text-destructive text-xs">{modelOptionsError}</p>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => setModelOptionsReload((value) => value + 1)}
                        >
                          <IconRefresh className="mr-1 size-4" />
                          Reintentar
                        </Button>
                      </div>
                    )}
                    {!modelOptionsLoading &&
                      !modelOptionsError &&
                      modelOptions.length > 0 &&
                      contractedModelVersionCount === 0 && (
                        <p className="text-muted-foreground text-xs">
                          Registra una versión y configura su contrato para usar ese modelo en el
                          workflow.
                        </p>
                      )}
                    {contractedModelVersionCount > 0 &&
                      modelOptions.some((item) =>
                        item.versions.some((version) => !version.contract),
                      ) && (
                        <p className="text-muted-foreground text-xs">
                          Las versiones sin contrato no se pueden agregar al workflow.
                        </p>
                      )}
                    <WorkflowPaletteButton
                      nodeType="model.tflite"
                      disabled={savingPositions || !selectedModelVersionId || addingModel}
                      onClick={() => void addModelNode()}
                    >
                      {addingModel ? "Agregando…" : "Agregar modelo"}
                    </WorkflowPaletteButton>
                  </div>

                  <div className="space-y-2 border-t pt-3">
                    <h4 className="font-medium text-sm">Condición</h4>
                    <label htmlFor="condition-source" className="block text-sm">
                      Resultado de origen
                    </label>
                    <select
                      id="condition-source"
                      className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
                      value={conditionSourceId}
                      disabled={classificationNodes.length === 0}
                      onChange={(event) => {
                        setConditionSourceId(event.target.value);
                        setConditionLabel("");
                      }}
                    >
                      <option value="">Selecciona una clasificación</option>
                      {classificationNodes.map((node) => (
                        <option key={node.id} value={node.id}>
                          {node.modelName} · {node.version}
                        </option>
                      ))}
                    </select>
                    {classificationNodes.length === 0 && (
                      <p role="status" className="text-muted-foreground text-xs">
                        Agrega primero al lienzo una versión contratada de un modelo de
                        clasificación.
                      </p>
                    )}
                    <label htmlFor="condition-label" className="block text-sm">
                      Etiqueta
                    </label>
                    <select
                      id="condition-label"
                      className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
                      value={conditionLabel}
                      disabled={!conditionSourceId}
                      onChange={(event) => setConditionLabel(event.target.value)}
                    >
                      <option value="">Selecciona una etiqueta</option>
                      {classificationNodes
                        .find((node) => node.id === conditionSourceId)
                        ?.outputs.result.labels.map((label) => (
                          <option key={label} value={label}>
                            {label}
                          </option>
                        ))}
                    </select>
                    <label htmlFor="condition-operator" className="block text-sm">
                      Operador
                    </label>
                    <select
                      id="condition-operator"
                      className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
                      value={conditionOperator}
                      onChange={(event) =>
                        setConditionOperator(event.target.value as typeof conditionOperator)
                      }
                    >
                      <option value="gte">≥</option>
                      <option value="gt">&gt;</option>
                      <option value="lte">≤</option>
                      <option value="lt">&lt;</option>
                    </select>
                    <label htmlFor="condition-threshold" className="block text-sm">
                      Umbral
                    </label>
                    <Input
                      id="condition-threshold"
                      type="number"
                      min="0"
                      max="1"
                      step="0.01"
                      value={conditionThreshold}
                      onChange={(event) => setConditionThreshold(event.target.value)}
                    />
                    <WorkflowPaletteButton
                      nodeType="condition"
                      disabled={
                        savingPositions || !conditionSourceId || !conditionLabel || addingCondition
                      }
                      onClick={() => void addConditionNode()}
                    >
                      {addingCondition ? "Guardando…" : "Agregar condición"}
                    </WorkflowPaletteButton>
                  </div>

                  <div className="space-y-2 border-t pt-3">
                    <h4 className="font-medium text-sm">Salida</h4>
                    <label htmlFor="workflow-output-name" className="block text-sm">
                      Nombre de salida
                    </label>
                    <Input
                      id="workflow-output-name"
                      value={outputName}
                      onChange={(event) => setOutputName(event.target.value)}
                    />
                    <label htmlFor="workflow-output-type" className="block text-sm">
                      Tipo de resultado
                    </label>
                    <select
                      id="workflow-output-type"
                      className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
                      value={outputSource}
                      aria-invalid={Boolean(outputTypeError)}
                      aria-describedby={outputTypeError ? "workflow-output-type-error" : undefined}
                      onChange={(event) => {
                        setOutputSource(event.target.value);
                        if (outputTypeError) setOutputTypeError("");
                      }}
                    >
                      <option value="">Selecciona un tipo de resultado</option>
                      {outputOptions.map((option) => (
                        <option
                          key={`${option.id}:${option.port}`}
                          value={`${option.id}:${option.port}`}
                        >
                          {option.label}
                        </option>
                      ))}
                    </select>
                    {outputTypeError && (
                      <p
                        id="workflow-output-type-error"
                        className="text-destructive text-sm"
                        role="alert"
                      >
                        {outputTypeError}
                      </p>
                    )}
                    <WorkflowPaletteButton
                      nodeType="output"
                      disabled={savingPositions || !outputName.trim() || addingOutput}
                      onClick={() => void addOutputNode()}
                    >
                      {addingOutput ? "Agregando…" : "Agregar salida"}
                    </WorkflowPaletteButton>
                  </div>
                  <p className="text-muted-foreground text-xs">
                    Arrastra un botón al lienzo para colocarlo; también puedes seleccionarlo para
                    usar su ubicación sugerida.
                  </p>
                </aside>
              ) : null
            }
          />
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
