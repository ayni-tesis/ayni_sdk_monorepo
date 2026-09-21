export function formatLongDateEs(value: Date | string): string {
  return new Date(value).toLocaleDateString("es", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}
