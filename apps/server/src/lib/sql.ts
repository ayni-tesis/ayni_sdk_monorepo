import { type Column, type SQL, sql, type Table } from "drizzle-orm";

/**
 * A column written with its table. When a query selects from one table,
 * drizzle drops the table of every column in its SQL fields, so a correlated
 * subquery there must name the outer table's columns this way.
 */
export function qualifiedColumn(table: Table, column: Column): SQL {
  return sql`${table}.${sql.identifier(column.name)}`;
}
