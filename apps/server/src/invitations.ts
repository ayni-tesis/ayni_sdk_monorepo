import { Hono } from "hono";
import { z } from "zod";

export type CreatedInvitation = {
  id: string;
  token: string;
  organizationId: string;
  role: string;
  inviterId: string;
  expiresAt: string;
};

export type InvitationPreview = {
  id: string;
  organizationId: string;
  organizationName: string;
  role: string;
  expiresAt: string;
};

export type AcceptedInvitation = {
  id: string;
  organizationId: string;
  organizationName: string;
  role: string;
};

export type AcceptResult = AcceptedInvitation | "already-member";

export const INVITATION_ROLES = ["admin", "member"] as const;

export type InvitationRole = (typeof INVITATION_ROLES)[number];

export type InvitationsDependencies = {
  getSession: (headers: Headers) => Promise<{ user: { id: string } } | null>;
  invitations: {
    getMembership: (userId: string, organizationId: string) => Promise<string | undefined>;
    create: (input: {
      organizationId: string;
      role: InvitationRole;
      createdById: string;
    }) => Promise<CreatedInvitation>;
    getByToken: (token: string) => Promise<InvitationPreview | undefined>;
    accept: (token: string, userId: string) => Promise<AcceptResult | undefined>;
  };
};

const invitationRoleSchema = z.object({ role: z.enum(INVITATION_ROLES) });

export function createInvitationsApp({ getSession, invitations }: InvitationsDependencies) {
  const app = new Hono();

  app.post("/organizations/:organizationId/invitation-links", async (c) => {
    const session = await getSession(c.req.raw.headers);
    if (!session) return c.json({ message: "Authentication required" }, 401);

    const organizationId = c.req.param("organizationId");
    const role = await invitations.getMembership(session.user.id, organizationId);
    if (role !== "admin" && role !== "owner") {
      return c.json(
        { message: "No tienes permiso para crear invitaciones en este workspace." },
        403,
      );
    }

    let rawBody: unknown;
    try {
      rawBody = await c.req.json();
    } catch {
      return c.json({ message: "Selecciona un rol válido para la invitación." }, 400);
    }

    const body = invitationRoleSchema.safeParse(rawBody);
    if (!body.success) {
      return c.json({ message: "Selecciona un rol válido para la invitación." }, 400);
    }

    const invitation = await invitations.create({
      organizationId,
      role: body.data.role,
      createdById: session.user.id,
    });

    return c.json(
      {
        invitation: {
          id: invitation.id,
          token: invitation.token,
          organizationId: invitation.organizationId,
          role: invitation.role,
          expiresAt: invitation.expiresAt,
        },
      },
      201,
    );
  });

  app.get("/invitation-links/:token", async (c) => {
    const session = await getSession(c.req.raw.headers);
    if (!session) return c.json({ message: "Authentication required" }, 401);

    const invitation = await invitations.getByToken(c.req.param("token"));
    if (!invitation) {
      return c.json({ message: "Este enlace de invitación no es válido." }, 404);
    }

    return c.json({ invitation });
  });

  app.post("/invitation-links/:token/accept", async (c) => {
    const session = await getSession(c.req.raw.headers);
    if (!session) return c.json({ message: "Authentication required" }, 401);

    const result = await invitations.accept(c.req.param("token"), session.user.id);
    if (!result) {
      return c.json({ message: "Este enlace de invitación no es válido." }, 404);
    }
    if (result === "already-member") {
      return c.json({ message: "Ya eres miembro de este workspace." }, 409);
    }

    return c.json({
      organization: { id: result.organizationId, name: result.organizationName, role: result.role },
    });
  });

  return app;
}
