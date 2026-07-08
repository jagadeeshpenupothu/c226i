export interface PdfFile {
  name: string;
  path?: string;
  previewUrl: string;
  origin?: "guest-local-import" | "authenticated-local-import" | "cloud-library-download" | "app-cache-reopen";
  cloudDocumentId?: string;
}
