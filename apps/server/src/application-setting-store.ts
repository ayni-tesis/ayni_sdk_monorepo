import type { ApplicationDatabase, TransactionExecutor } from "./application-actions";

type SelectExecutor = {
  select: () => {
    from: (table: unknown) => {
      where: (condition: unknown) => {
        limit: (count: number) => Promise<Record<string, unknown>[]>;
      };
    };
  };
};

type UpsertExecutor = {
  insert: (table: unknown) => {
    values: (value: Record<string, unknown>) => {
      onConflictDoUpdate: (config: { target: unknown; set: Record<string, unknown> }) => {
        returning: () => Promise<Record<string, unknown>[]>;
      };
    };
  };
};

export async function getApplicationSetting(
  database: ApplicationDatabase,
  table: unknown,
  condition: unknown,
): Promise<Record<string, unknown> | undefined> {
  return database.transaction(async (transaction) => {
    const tx = transaction as SelectExecutor;
    const [row] = await tx.select().from(table).where(condition).limit(1);
    return row;
  });
}

export async function upsertApplicationSetting(
  transaction: TransactionExecutor,
  table: unknown,
  values: Record<string, unknown>,
  target: unknown,
  set: Record<string, unknown>,
): Promise<Record<string, unknown> | undefined> {
  const tx = transaction as unknown as UpsertExecutor;
  const [row] = await tx
    .insert(table)
    .values(values)
    .onConflictDoUpdate({ target, set })
    .returning();
  return row;
}
