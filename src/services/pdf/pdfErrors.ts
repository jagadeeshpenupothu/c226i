export function friendlyPdfError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();

  if (lower.includes("password")) {
    return "Password protected PDFs are not supported yet.";
  }

  if (lower.includes("invalid") || lower.includes("corrupt") || lower.includes("xref")) {
    return "The PDF appears to be damaged or incomplete.";
  }

  if (lower.includes("missing")) {
    return "The selected file could not be read.";
  }

  return message && message !== "undefined" ? message : "Rendering failed.";
}
