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
  | "credentials"
  | "settings";

export type ApplicationSection = "overview" | "workflows" | "models" | "credentials" | "settings";

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
  credentials: { id: "credentials", label: "Credenciales SDK", segment: "credentials" },
  settings: { id: "settings", label: "Configuración", segment: "settings" },
};
