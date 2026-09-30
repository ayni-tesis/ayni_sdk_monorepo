import { db } from "@ayni/db";
import * as schema from "@ayni/db/schema/auth";
import { env } from "@ayni/env/server";
import { CURRENT_TERMS_VERSION, hasAcceptedCurrentTerms } from "@ayni/env/terms";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { organization } from "better-auth/plugins";
import { eq } from "drizzle-orm";

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
      if (
        ctx.path === "/sign-up/email" &&
        !hasAcceptedCurrentTerms(ctx.body?.termsAcceptedVersion)
      ) {
        throw new APIError("BAD_REQUEST", {
          message: "Debes aceptar los Términos y condiciones para crear tu cuenta.",
        });
      }
      if (ctx.path === "/sign-in/email" && typeof ctx.body?.email === "string") {
        const [existing] = await db
          .select({ termsAcceptedVersion: schema.user.termsAcceptedVersion })
          .from(schema.user)
          .where(eq(schema.user.email, ctx.body.email.toLowerCase()))
          .limit(1);
        if (
          existing &&
          existing.termsAcceptedVersion !== CURRENT_TERMS_VERSION &&
          !hasAcceptedCurrentTerms(ctx.body.termsAcceptedVersion)
        ) {
          throw new APIError("UNAUTHORIZED", {
            message:
              "No pudimos iniciar sesión. Revisa tu correo y contraseña e inténtalo de nuevo.",
          });
        }
      }
    }),
    after: createAuthMiddleware(async (ctx) => {
      if (
        ctx.path === "/sign-in/email" &&
        hasAcceptedCurrentTerms(ctx.body?.termsAcceptedVersion) &&
        typeof ctx.body?.email === "string"
      ) {
        await db
          .update(schema.user)
          .set({ termsAcceptedVersion: CURRENT_TERMS_VERSION, termsAcceptedAt: new Date() })
          .where(eq(schema.user.email, ctx.body.email.toLowerCase()));
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
          if (!hasAcceptedCurrentTerms(user.termsAcceptedVersion)) {
            throw new APIError("BAD_REQUEST", {
              message: "Debes aceptar los Términos y condiciones para crear tu cuenta.",
            });
          }
          return { data: { ...user, termsAcceptedAt: new Date() } };
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
