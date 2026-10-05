import { db } from "@ayni/db";
import * as schema from "@ayni/db/schema/auth";
import { AYNI_PRIVACY_NOTICE } from "@ayni/env/privacy-notice";
import { env } from "@ayni/env/server";
import { CURRENT_TERMS_VERSION, hasAcceptedCurrentTerms } from "@ayni/env/terms";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { organization } from "better-auth/plugins";
import { and, eq } from "drizzle-orm";

async function recordCurrentTermsAcceptance(userId: string) {
  await db.transaction(async (tx) => {
    const [user] = await tx
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(eq(schema.user.id, userId))
      .for("update")
      .limit(1);
    if (!user) return;

    const [existing] = await tx
      .select({ id: schema.userTermsAcceptance.id })
      .from(schema.userTermsAcceptance)
      .where(
        and(
          eq(schema.userTermsAcceptance.userId, user.id),
          eq(schema.userTermsAcceptance.version, CURRENT_TERMS_VERSION),
        ),
      )
      .limit(1);
    if (existing) return;

    const acceptedAt = new Date();
    await tx
      .update(schema.user)
      .set({ termsAcceptedVersion: CURRENT_TERMS_VERSION, termsAcceptedAt: acceptedAt })
      .where(eq(schema.user.id, user.id));
    await tx.insert(schema.userTermsAcceptance).values({
      id: crypto.randomUUID(),
      userId: user.id,
      version: CURRENT_TERMS_VERSION,
      acceptedAt,
    });
  });
}

function ensureAyniPrivacyNoticeIsPublished() {
  if (AYNI_PRIVACY_NOTICE.status !== "published") {
    throw new APIError("SERVICE_UNAVAILABLE", {
      message:
        "El registro no está disponible mientras el aviso de privacidad de Ayni siga pendiente.",
    });
  }
}

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",

    schema: schema,
  }),
  trustedOrigins: [env.CORS_ORIGIN],
  emailAndPassword: {
    enabled: true,
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path === "/sign-up/email") ensureAyniPrivacyNoticeIsPublished();
      if (
        ctx.path === "/sign-up/email" &&
        !hasAcceptedCurrentTerms(ctx.body?.termsAcceptedVersion)
      ) {
        throw new APIError("BAD_REQUEST", {
          message: "Debes aceptar los Términos y condiciones para crear tu cuenta.",
        });
      }
      if (
        ctx.path === "/sign-in/email" &&
        !hasAcceptedCurrentTerms(ctx.body?.termsAcceptedVersion)
      ) {
        throw new APIError("BAD_REQUEST", {
          message: "Debes aceptar los Términos y condiciones para iniciar sesión.",
        });
      }
    }),
    after: createAuthMiddleware(async (ctx) => {
      if (
        ctx.path === "/sign-in/email" &&
        hasAcceptedCurrentTerms(ctx.body?.termsAcceptedVersion) &&
        typeof ctx.body?.email === "string"
      ) {
        const returnedUser = (ctx.context.returned as { user?: { id?: string } } | undefined)?.user;
        const userId = returnedUser?.id ?? ctx.context.newSession?.user?.id;
        if (userId) {
          await recordCurrentTermsAcceptance(userId);
        }
      }
    }),
  },
  user: {
    additionalFields: {
      termsAcceptedVersion: { type: "string", required: true, input: true },
      termsAcceptedAt: { type: "date", required: false, input: false },
    },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          ensureAyniPrivacyNoticeIsPublished();
          if (!hasAcceptedCurrentTerms(user.termsAcceptedVersion)) {
            throw new APIError("BAD_REQUEST", {
              message: "Debes aceptar los Términos y condiciones para crear tu cuenta.",
            });
          }
          return { data: { ...user, termsAcceptedAt: new Date() } };
        },
        after: async (user) => {
          if (!hasAcceptedCurrentTerms(user.termsAcceptedVersion)) return;
          await recordCurrentTermsAcceptance(user.id);
        },
      },
    },
  },
  advanced: {
    defaultCookieAttributes: {
      sameSite: "none",
      secure: true,
      httpOnly: true,
    },
  },
  plugins: [organization()],
});
