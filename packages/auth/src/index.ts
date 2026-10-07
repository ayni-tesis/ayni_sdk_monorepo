import { db } from "@ayni/db";
import * as schema from "@ayni/db/schema/auth";
import { AYNI_PRIVACY_NOTICE } from "@ayni/env/privacy-notice";
import { env } from "@ayni/env/server";
import { CURRENT_TERMS_VERSION, hasAcceptedCurrentTerms } from "@ayni/env/terms";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware, getOAuthState } from "better-auth/api";
import { organization } from "better-auth/plugins";
import { and, eq } from "drizzle-orm";
import { sendAyniEmail } from "./email";
import { getGitHubUserInfo } from "./github";
import {
  consumeEmailVerificationToken,
  EMAIL_VERIFICATION_TOKEN_TTL_SECONDS,
  storeEmailVerificationToken,
} from "./verification";

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

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character] ?? character;
  });
}

function normalizeName(value: unknown) {
  if (typeof value !== "string") return undefined;
  const name = value.trim();
  return name.length >= 2 && name.length <= 100 ? name : undefined;
}

const socialProviders =
  env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET
    ? {
        github: {
          clientId: env.GITHUB_CLIENT_ID,
          clientSecret: env.GITHUB_CLIENT_SECRET,
          async getUserInfo({ accessToken }: { accessToken?: string }) {
            const oauthState = await getOAuthState();
            return getGitHubUserInfo(accessToken, oauthState?.termsAcceptedVersion);
          },
        },
      }
    : undefined;

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",

    schema: schema,
  }),
  trustedOrigins: [env.CORS_ORIGIN],
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    requireEmailVerification: false,
    resetPasswordTokenExpiresIn: 60 * 60,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      try {
        await sendAyniEmail(
          user.email,
          "Restablece tu contraseña de Ayni",
          `<p>Solicitaste restablecer tu contraseña.</p><p><a href="${escapeHtml(url)}">Restablecer contraseña</a></p><p>Si no hiciste esta solicitud, ignora este correo.</p>`,
        );
      } catch (error) {
        console.error("Ayni password reset email delivery failed.", error);
      }
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: true,
    autoSignInAfterVerification: false,
    expiresIn: EMAIL_VERIFICATION_TOKEN_TTL_SECONDS,
    sendVerificationEmail: async ({ user, url, token }) => {
      await storeEmailVerificationToken(user.id, token);
      await sendAyniEmail(
        user.email,
        "Verifica tu correo electrónico de Ayni",
        `<p>Confirma tu correo electrónico para continuar con tu cuenta de Ayni.</p><p><a href="${escapeHtml(url)}">Verificar correo electrónico</a></p>`,
      );
    },
  },
  socialProviders,
  account: {
    accountLinking: {
      enabled: true,
      requireLocalEmailVerified: true,
      trustedProviders: [],
    },
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path === "/sign-up/email") ensureAyniPrivacyNoticeIsPublished();
      if (ctx.path === "/sign-up/email") {
        const name = normalizeName(ctx.body?.name);
        if (!name) {
          throw new APIError("BAD_REQUEST", {
            message: "El nombre debe tener entre 2 y 100 caracteres.",
          });
        }
        ctx.body.name = name;
      }
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
      if (ctx.path === "/sign-in/social" && ctx.body?.provider === "github") {
        if (ctx.body.scopes !== undefined) {
          throw new APIError("BAD_REQUEST", {
            message: "GitHub solo solicita acceso al perfil y al correo electrónico.",
          });
        }
        if (!hasAcceptedCurrentTerms(ctx.body.additionalData?.termsAcceptedVersion)) {
          throw new APIError("BAD_REQUEST", {
            message: "Debes aceptar los Términos y condiciones para iniciar sesión.",
          });
        }
      }
      if (ctx.path === "/update-user") {
        const body = ctx.body ?? {};
        if (Object.keys(body).some((key) => key !== "name")) {
          throw new APIError("BAD_REQUEST", {
            message: "Solo puedes actualizar tu nombre desde este flujo.",
          });
        }
        const name = normalizeName(body.name);
        if (!name) {
          throw new APIError("BAD_REQUEST", {
            message: "El nombre debe tener entre 2 y 100 caracteres.",
          });
        }
        body.name = name;
      }
      if (ctx.path === "/verify-email") {
        const token = ctx.query?.token;
        if (typeof token !== "string" || !(await consumeEmailVerificationToken(token))) {
          throw new APIError("BAD_REQUEST", {
            message: "El enlace de verificación no es válido o ya expiró.",
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
        before: async (user, context) => {
          ensureAyniPrivacyNoticeIsPublished();
          const acceptedVersion =
            user.termsAcceptedVersion ??
            (context?.path === "/callback/github"
              ? (await getOAuthState())?.termsAcceptedVersion
              : undefined);
          if (!hasAcceptedCurrentTerms(acceptedVersion)) {
            throw new APIError("BAD_REQUEST", {
              message: "Debes aceptar los Términos y condiciones para crear tu cuenta.",
            });
          }
          return {
            data: {
              ...user,
              termsAcceptedVersion: CURRENT_TERMS_VERSION,
              termsAcceptedAt: new Date(),
            },
          };
        },
        after: async (user) => {
          if (!hasAcceptedCurrentTerms(user.termsAcceptedVersion)) return;
          await recordCurrentTermsAcceptance(user.id);
        },
      },
    },
    session: {
      create: {
        before: async (session, context) => {
          if (context?.path !== "/callback/github") return;
          const oauthState = await getOAuthState();
          if (!hasAcceptedCurrentTerms(oauthState?.termsAcceptedVersion)) {
            throw new APIError("BAD_REQUEST", {
              message: "Debes aceptar los Términos y condiciones para iniciar sesión.",
            });
          }
          await recordCurrentTermsAcceptance(session.userId);
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
