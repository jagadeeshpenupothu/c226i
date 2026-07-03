import { useEffect, useState } from "react";
import type { PdfFile } from "@/features/pdf/types";
import { friendlyPdfError } from "@/services/pdf/pdfErrors";
import { pdfjsLib, pdfResourceUrls } from "@/services/pdf/pdfJs";
import { readFirstPageSize, readPdfFileMetadata } from "@/services/pdf/pdfMetadata";
import type { PdfDocumentState, PdfLoadProgress } from "@/types/pdf";

const emptyDocumentState: PdfDocumentState = {
  document: null,
  pageCount: 0,
  firstPage: null,
  fileSizeBytes: null
};

export function usePdfDocument(file: PdfFile | null) {
  const [state, setState] = useState<PdfDocumentState>(emptyDocumentState);
  const [progress, setProgress] = useState<PdfLoadProgress>({ loaded: 0, total: null, percent: null });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setState(emptyDocumentState);
      setProgress({ loaded: 0, total: null, percent: null });
      setIsLoading(false);
      setError(null);
      return;
    }

    const selectedFile = file;
    let cancelled = false;
    const loadingTask = pdfjsLib.getDocument({
      url: selectedFile.previewUrl,
      disableAutoFetch: false,
      disableStream: false,
      useSystemFonts: true,
      cMapPacked: true,
      cMapUrl: pdfResourceUrls.cMapUrl,
      CMapReaderFactory: pdfResourceUrls.CMapReaderFactory,
      standardFontDataUrl: pdfResourceUrls.standardFontDataUrl,
      StandardFontDataFactory: pdfResourceUrls.StandardFontDataFactory
    });

    setState(emptyDocumentState);
    setProgress({ loaded: 0, total: null, percent: null });
    setIsLoading(true);
    setError(null);

    loadingTask.onProgress = ({ loaded, total }: { loaded: number; total: number }) => {
      if (cancelled) return;
      setProgress({
        loaded,
        total: total || null,
        percent: total ? Math.min(100, Math.round((loaded / total) * 100)) : null
      });
    };

    async function loadDocument() {
      try {
        const [document, metadata] = await Promise.all([
          loadingTask.promise,
          readPdfFileMetadata(selectedFile)
        ]);
        const firstPage = await readFirstPageSize(document);

        if (cancelled) {
          await document.destroy();
          return;
        }

        setState({
          document,
          pageCount: document.numPages,
          firstPage,
          fileSizeBytes: metadata?.fileSizeBytes ?? null
        });
      } catch (loadError) {
        if (!cancelled) {
          setError(friendlyPdfError(loadError));
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    loadDocument();

    return () => {
      cancelled = true;
      loadingTask.destroy();
    };
  }, [file]);

  return {
    ...state,
    progress,
    isLoading,
    error
  };
}
