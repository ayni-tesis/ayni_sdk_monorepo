import { sdkCredential } from "@ayni/db/schema/index";
import {
  type ApplicationDatabase,
  executeApplicationAction,
  type TransactionExecutor,
} from "./application-actions";
import { generateSdkCredentialSecret, hashSdkCredentialSecret } from "./sdk-credentials";

export type { TransactionExecutor };
export type CredentialDatabase = ApplicationDatabase;

export type CreatedSdkCredential = {
  id: string;
  applicationId: string;
  secret: string;
};

export type CreateSdkCredentialResult =
  | { ok: true; credential: CreatedSdkCredential }
  | { ok: false; reason: "forbidden" | "notFound" | "archived" };

export type CreateSdkCredentialInput = {
  applicationId: string;
  userId: string;
};

export async function createSdkCredential(
  database: CredentialDatabase,
  { applicationId, userId }: CreateSdkCredentialInput,
): Promise<CreateSdkCredentialResult> {
  const result = await executeApplicationAction(
    database,
    { applicationId, userId },
    async (tx, application) => {
      const secret = generateSdkCredentialSecret();
      const credentialRows = (await tx
        .insert(sdkCredential)
        .values({
          id: crypto.randomUUID(),
          applicationId: application.id,
          secretHash: hashSdkCredentialSecret(secret),
        })
        .returning()) as { id: string; applicationId: string }[];
      const created = credentialRows[0];

      if (!created) throw new Error("SDK credential creation returned no record");

      return {
        id: created.id,
        applicationId: created.applicationId,
        secret,
      };
    },
  );

  if (!result.ok) return result;
  return { ok: true, credential: result.value };
}
