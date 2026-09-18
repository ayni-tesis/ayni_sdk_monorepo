import { Hono } from "hono";

export type MemberItem = {
  id: string;
  name: string;
  email: string;
  role: string;
};

export type RemoveMemberResult = { ok: true } | { ok: false; reason: "not-found" | "last-admin" };

export type MembersDependencies = {
  getSession: (headers: Headers) => Promise<{ user: { id: string } } | null>;
  members: {
    getMembership: (userId: string, organizationId: string) => Promise<string | undefined>;
    listOthers: (userId: string, organizationId: string) => Promise<MemberItem[]>;
    remove: (organizationId: string, memberId: string) => Promise<RemoveMemberResult>;
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

  app.delete("/organizations/:organizationId/members/:memberId", async (c) => {
    const session = await getSession(c.req.raw.headers);
    if (!session) return c.json({ message: "Authentication required" }, 401);

    const organizationId = c.req.param("organizationId");
    const role = await members.getMembership(session.user.id, organizationId);
    if (!role) {
      return c.json({ message: "No tienes acceso a este workspace." }, 403);
    }
    if (role !== "admin" && role !== "owner") {
      return c.json({ message: "No tienes permiso para retirar miembros de este workspace." }, 403);
    }

    const memberId = c.req.param("memberId");
    const result = await members.remove(organizationId, memberId);
    if (!result.ok) {
      if (result.reason === "not-found") {
        return c.json({ message: "No encontramos a este miembro en el workspace." }, 404);
      }
      return c.json({ message: "El workspace necesita al menos un administrador." }, 409);
    }

    return c.json({ message: "Miembro retirado." });
  });

  return app;
}
