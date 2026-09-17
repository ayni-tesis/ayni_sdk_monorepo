import { Hono } from "hono";

export type MemberItem = {
  id: string;
  name: string;
  email: string;
  role: string;
};

export type MembersDependencies = {
  getSession: (headers: Headers) => Promise<{ user: { id: string } } | null>;
  members: {
    getMembership: (userId: string, organizationId: string) => Promise<string | undefined>;
    listOthers: (userId: string, organizationId: string) => Promise<MemberItem[]>;
  };
};

export function createMembersApp({ getSession, members }: MembersDependencies) {
  const app = new Hono();

  app.get("/organizations/:organizationId/members", async (c) => {
    const session = await getSession(c.req.raw.headers);
    if (!session) return c.json({ message: "Authentication required" }, 401);

    const organizationId = c.req.param("organizationId");
    if (!(await members.getMembership(session.user.id, organizationId))) {
      return c.json({ message: "No tienes acceso a este workspace." }, 403);
    }

    return c.json(await members.listOthers(session.user.id, organizationId));
  });

  return app;
}
