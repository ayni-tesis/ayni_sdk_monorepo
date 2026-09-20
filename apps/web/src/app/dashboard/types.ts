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

export type RegisteredModel = {
  id: string;
  applicationId: string;
  name: string;
  runtime: "tensorflow_lite";
  createdAt?: string;
  updatedAt?: string;
};
