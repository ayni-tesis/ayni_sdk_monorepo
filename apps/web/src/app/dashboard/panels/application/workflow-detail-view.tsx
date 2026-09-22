"use client";

import { IconRefresh } from "@tabler/icons-react";
import axios from "axios";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
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

export type WorkflowDetailViewProps = {
  application: Application;
  workflowId: string;
  onBackToWorkflows?: () => void;
};

export function WorkflowDetailView({
  application,
  workflowId,
  onBackToWorkflows,
}: WorkflowDetailViewProps) {
  const [detail, setDetail] = useState<WorkflowDetailItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState("");

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

      <header data-testid="workflow-detail-header" className="space-y-2">
        <h2 className="font-semibold text-lg">{workflow.name}</h2>
        <div className="flex items-center gap-3 text-sm">
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-muted-foreground text-xs">
            {workflow.id}
          </code>
          <span className="text-muted-foreground">
            {WORKFLOW_STATUS_LABELS[workflow.status] ?? workflow.status}
          </span>
        </div>
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
    </section>
  );
}
