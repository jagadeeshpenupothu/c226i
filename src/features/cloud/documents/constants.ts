export const CLOUD_PDF_LIMIT_BYTES = 524_288_000;
export const CLOUD_USER_QUOTA_BYTES = 5_368_709_120;
export const CLOUD_DOCUMENT_SCHEMA_VERSION = 1;
export const GUEST_HISTORY_SCHEMA_VERSION = 1;
export const MAX_GUEST_HISTORY_ITEMS = 50;

export function formatBytes(bytes: number): string {
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 || unit === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
}
