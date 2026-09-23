"use client";

import type { Application, ApplicationSection } from "../types";
import { CredentialsView } from "./application/credentials-view";
import { ModelDetailView } from "./application/model-detail-view";
import { ModelsView } from "./application/models-view";
import { OverviewView } from "./application/overview-view";
import { SettingsView } from "./application/settings-view";
import { WorkflowDetailView } from "./application/workflow-detail-view";
import { WorkflowsView } from "./application/workflows-view";

export type { ApplicationSection } from "../types";
export type {
  CredentialsViewProps,
  GenerateCredentialDialogProps,
  RegenerateCredentialDialogProps,
  RevokeCredentialDialogProps,
} from "./application/credentials-view";
// Re-export modular components and dialogs for backwards compatibility
export {
  CredentialsView,
  credentialsErrorMessage,
  formatCredentialDate,
  GenerateCredentialDialog,
  RegenerateCredentialDialog,
  RevokeCredentialDialog,
} from "./application/credentials-view";
export type { ModelDetailViewProps } from "./application/model-detail-view";
export { ModelDetailView } from "./application/model-detail-view";
export type { ModelVersionsDialogProps } from "./application/model-versions-dialog";
export { ModelVersionsDialog } from "./application/model-versions-dialog";
export type { ModelsViewProps, RegisterModelDialogProps } from "./application/models-view";
export { ModelsView, RegisterModelDialog } from "./application/models-view";
export type { OverviewViewProps } from "./application/overview-view";
export { OverviewView } from "./application/overview-view";
export type {
  ArchiveApplicationDialogProps,
  RenameApplicationDialogProps,
  SettingsViewProps,
} from "./application/settings-view";
export {
  ArchiveApplicationDialog,
  RenameApplicationDialog,
  SettingsView,
} from "./application/settings-view";
export type { ModelVersionDto } from "./application/upload-model-version";
export type { UploadModelVersionDialogProps } from "./application/upload-model-version-dialog";
export { UploadModelVersionDialog } from "./application/upload-model-version-dialog";
export type { WorkflowDetailViewProps } from "./application/workflow-detail-view";
export { WorkflowDetailView } from "./application/workflow-detail-view";
export type { WorkflowsViewProps } from "./application/workflows-view";
export { WorkflowsView } from "./application/workflows-view";

export type ApplicationDetailPanelProps = {
  application: Application;
  workspaceName?: string;
  canManage?: boolean;
  activeSection?: ApplicationSection;
  workflowId?: string;
  modelId?: string;
  onBack?: () => void;
  onOpenWorkflow?: (workflowId: string) => void;
  onBackToWorkflows?: () => void;
  onOpenModel?: (modelId: string) => void;
  onBackToModels?: () => void;
  onApplicationUpdated: (updated: Application) => void;
  onApplicationArchived: (archived: Application) => void;
  onMutationStart?: () => void;
  onMutationEnd?: () => void;
  onArchiveStart?: () => void;
  onArchiveEnd?: () => void;
};

export function ApplicationDetailPanel({
  application,
  canManage = false,
  activeSection = "overview",
  workflowId,
  modelId,
  onOpenWorkflow,
  onBackToWorkflows,
  onOpenModel,
  onBackToModels,
  onApplicationUpdated,
  onApplicationArchived,
  onMutationStart,
  onMutationEnd,
  onArchiveStart,
  onArchiveEnd,
}: ApplicationDetailPanelProps) {
  return (
    <section className="application-detail space-y-6" aria-live="polite">
      {activeSection === "overview" && (
        <OverviewView application={application} canManage={canManage} />
      )}

      {activeSection === "settings" && (
        <SettingsView
          application={application}
          canManage={canManage}
          onApplicationUpdated={onApplicationUpdated}
          onApplicationArchived={onApplicationArchived}
          onMutationStart={onMutationStart}
          onMutationEnd={onMutationEnd}
          onArchiveStart={onArchiveStart}
          onArchiveEnd={onArchiveEnd}
        />
      )}

      {activeSection === "workflows" &&
        (workflowId ? (
          <WorkflowDetailView
            key={`${application.id}:${workflowId}`}
            application={application}
            workflowId={workflowId}
            canManage={canManage}
            onBackToWorkflows={onBackToWorkflows}
          />
        ) : (
          <WorkflowsView
            key={application.id}
            application={application}
            canManage={canManage}
            onOpenWorkflow={onOpenWorkflow}
          />
        ))}

      {activeSection === "models" &&
        (modelId ? (
          <ModelDetailView
            key={`${application.id}:${modelId}`}
            application={application}
            modelId={modelId}
            onBackToModels={onBackToModels}
          />
        ) : (
          <ModelsView application={application} canManage={canManage} onOpenModel={onOpenModel} />
        ))}

      {activeSection === "credentials" && (
        <CredentialsView application={application} canManage={canManage} />
      )}
    </section>
  );
}
