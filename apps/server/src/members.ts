import { Hono } from "hono";

export type MemberItem = {
  id: string;
  name: string;
  email: string;
  role: string;
};

export type RemoveMemberResult =
  | { ok: true }
  | { ok: false; reason: "not-found" | "last-admin" | "owner" | "forbidden" };

export type UpdateMemberRoleResult =
  | { success: true; member: MemberItem }
  | {
      success: false;
      error:
        | "FORBIDDEN"
        | "SELF_MODIFICATION_NOT_ALLOWED"
        | "MEMBER_NOT_FOUND"
        | "CANNOT_MODIFY_OWNER"
        | "AT_LEAST_ONE_ADMIN_REQUIRED";
    };

export type MembersDependencies = {
  getSession: (headers: Headers) => Promise<{ user: { id: string } } | null>;
  members: {
    getMembership: (userId: string, organizationId: string) => Promise<string | undefined>;
    listOthers: (userId: string, organizationId: string) => Promise<MemberItem[]>;
    remove: (
      requesterUserId: string,
      organizationId: string,
      memberId: string,
    ) => Promise<RemoveMemberResult>;
    updateRole?: (
      requesterUserId: string,
      organizationId: string,
      memberId: string,
      newRole: "admin" | "member",
    ) => Promise<UpdateMemberRoleResult>;
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
    const result = await members.remove(session.user.id, organizationId, memberId);
    if (result.ok === false) {
      if (result.reason === "not-found") {
        return c.json({ message: "No encontramos a este miembro en el workspace." }, 404);
      }
      if (result.reason === "forbidden") {
        return c.json(
          { message: "No tienes permiso para retirar miembros de este workspace." },
          403,
        );
      }
      if (result.reason === "owner") {
        return c.json({ message: "No se puede retirar al propietario del workspace." }, 403);
      }
      return c.json({ message: "El workspace necesita al menos un administrador." }, 409);
    }

    return c.json({ message: "Miembro retirado." });
  });

  app.patch("/organizations/:organizationId/members/:memberId", async (c) => {
    const session = await getSession(c.req.raw.headers);
    if (!session) return c.json({ message: "Authentication required" }, 401);

    const organizationId = c.req.param("organizationId");
    const callerRole = await members.getMembership(session.user.id, organizationId);
    if (callerRole !== "admin" && callerRole !== "owner") {
      return c.json({ message: "No tienes permiso para cambiar roles en este workspace." }, 403);
    }

    const rawBody = await c.req.json().catch(() => ({}));
    const body =
      typeof rawBody === "object" && rawBody !== null ? (rawBody as { role?: unknown }) : {};
    if (body.role !== "admin" && body.role !== "member") {
      return c.json({ message: "Rol inválido." }, 400);
    }

    if (!members.updateRole) {
      return c.json({ message: "Operación no implementada." }, 501);
    }

    const memberId = c.req.param("memberId");
    const result = await members.updateRole(
      session.user.id,
      organizationId,
      memberId,
      body.role as "admin" | "member",
    );

    if (result.success === false) {
      switch (result.error) {
        case "FORBIDDEN":
          return c.json(
            { message: "No tienes permiso para cambiar roles en este workspace." },
            403,
          );
        case "SELF_MODIFICATION_NOT_ALLOWED":
          return c.json({ message: "No puedes cambiar tu propio rol." }, 400);
        case "CANNOT_MODIFY_OWNER":
          return c.json({ message: "No se puede cambiar el rol del propietario." }, 400);
        case "AT_LEAST_ONE_ADMIN_REQUIRED":
          return c.json({ message: "El workspace debe conservar al menos un administrador." }, 400);
        case "MEMBER_NOT_FOUND":
          return c.json({ message: "Miembro no encontrado." }, 404);
        default:
          return c.json({ message: "Error al actualizar rol." }, 400);
      }
    }

    return c.json(result.member, 200);
  });

  return app;
}
