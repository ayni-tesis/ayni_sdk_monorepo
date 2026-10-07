import { Hono, type Handler } from "hono";

export type WorkspaceItem = {
  id: string;
  name: string;
  slug: string;
  role: string;
};

export type WorkspacesDependencies = {
  getSession: (headers: Headers) => Promise<{ user: { id: string } } | null>;
  workspaces: {
    listByUser: (userId: string) => Promise<WorkspaceItem[]>;
  };
};

export function createWorkspacesApp({ getSession, workspaces }: WorkspacesDependencies) {
  const app = new Hono();

  const listWorkspaces: Handler = async (c) => {
    const session = await getSession(c.req.raw.headers);
    if (!session) {
      return c.json({ message: "Authentication required" }, 401);
    }
    const list = await workspaces.listByUser(session.user.id);
    return c.json(list);
  };

  app.get("/workspaces", listWorkspaces);
  app.get("/workspaces/", listWorkspaces);

  return app;
}
