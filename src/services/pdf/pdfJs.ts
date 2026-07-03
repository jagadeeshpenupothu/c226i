import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.js?url";

const cMapAssetUrls = import.meta.glob("../../../node_modules/pdfjs-dist/cmaps/*.bcmap", {
  eager: true,
  import: "default",
  query: "?url"
}) as Record<string, string>;

const standardFontAssetUrls = import.meta.glob("../../../node_modules/pdfjs-dist/standard_fonts/*", {
  eager: true,
  import: "default",
  query: "?url"
}) as Record<string, string>;

const cMapUrlsByName = toAssetUrlMap(cMapAssetUrls);
const standardFontUrlsByName = toAssetUrlMap(standardFontAssetUrls);

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

export const pdfResourceUrls = {
  cMapUrl: "",
  standardFontDataUrl: "",
  CMapReaderFactory: class BundledCMapReaderFactory {
    async fetch({ name }: { name: string }) {
      const url = cMapUrlsByName[`${name}.bcmap`];
      if (!url) {
        throw new Error(`Unable to load binary CMap: ${name}`);
      }

      return {
        cMapData: await fetchAsset(url),
        compressionType: pdfjsLib.CMapCompressionType.BINARY
      };
    }
  },
  StandardFontDataFactory: class BundledStandardFontDataFactory {
    async fetch({ filename }: { filename: string }) {
      const url = standardFontUrlsByName[filename];
      if (!url) {
        throw new Error(`Unable to load standard font data: ${filename}`);
      }

      return fetchAsset(url);
    }
  }
};

export { pdfjsLib };

function toAssetUrlMap(assets: Record<string, string>) {
  return Object.fromEntries(Object.entries(assets).map(([path, url]) => [path.split("/").pop() || path, url]));
}

async function fetchAsset(url: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Unable to load PDF.js asset: ${url}`);
  }

  return new Uint8Array(await response.arrayBuffer());
}
