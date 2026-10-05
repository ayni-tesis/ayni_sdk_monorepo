export type Application = {
  id: string;
  organizationId: string;
  name: string;
  status: "active" | "archived";
};

export type WorkspaceItem = {
  id: string;
  name: string;
  slug: string;
  role: string;
};

export type MemberItem = {
  id: string;
  name: string;
  email: string;
  role: string;
};

export type GeneratedCredential = {
  id: string;
  applicationId: string;
  secret: string;
};

export type SdkCredentialItem = {
  id: string;
  applicationId: string;
  prefix: string | null;
  status: "active" | "revoked";
  createdAt: string;
  lastUsedAt: string | null;
};

export type DashboardView =
  | "applications"
  | "members"
  | "overview"
  | "workflows"
  | "models"
  | "datasets"
  | "credentials"
  | "privacy"
  | "collection"
  | "traces"
  | "settings";

export type ApplicationSection =
  | "overview"
  | "workflows"
  | "models"
  | "datasets"
  | "credentials"
  | "privacy"
  | "collection"
  | "traces"
  | "settings";

export type DashboardViewDescriptor = {
  id: DashboardView;
  label: string;
  segment: string | null;
};

export const DASHBOARD_VIEWS: Record<DashboardView, DashboardViewDescriptor> = {
  applications: { id: "applications", label: "Aplicaciones", segment: null },
  members: { id: "members", label: "Miembros", segment: "members" },
  overview: { id: "overview", label: "Resumen", segment: "overview" },
  workflows: { id: "workflows", label: "Workflows", segment: "workflows" },
  models: { id: "models", label: "Modelos", segment: "models" },
  datasets: { id: "datasets", label: "Datasets de validación", segment: "validation-datasets" },
  credentials: { id: "credentials", label: "Credenciales SDK", segment: "credentials" },
  privacy: { id: "privacy", label: "Privacidad y datos", segment: "privacy" },
  collection: { id: "collection", label: "Recolección de evidencia", segment: "collection" },
  traces: { id: "traces", label: "Trazas", segment: "traces" },
  settings: { id: "settings", label: "Configuración", segment: "settings" },
};
