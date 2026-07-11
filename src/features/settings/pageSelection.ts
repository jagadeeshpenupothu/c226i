import type { PageSelectionMode } from "./types";

export interface PageSelectionValidation {
  ok: boolean;
  pages: number[];
  normalized: string;
  error: string | null;
}

export function validatePageSelection(input: {
  mode: PageSelectionMode;
  value: string;
  currentPage: number;
  pageCount: number;
}): PageSelectionValidation {
  const pageCount = Math.max(0, Math.floor(input.pageCount || 0));
  if (pageCount <= 0) {
    return fail("The PDF page count is not available yet.");
  }

  if (input.mode === "all") {
    return { ok: true, pages: Array.from({ length: pageCount }, (_, index) => index + 1), normalized: "", error: null };
  }

  if (input.mode === "current") {
    const current = Math.floor(input.currentPage || 1);
    if (current < 1 || current > pageCount) {
      return fail(`Current page must be between 1 and ${pageCount}.`);
    }
    return { ok: true, pages: [current], normalized: String(current), error: null };
  }

  const raw = input.value.trim();
  if (!raw) return fail("Enter a page number or range.");
  const seen = new Set<number>();
  const pages: number[] = [];

  for (const token of raw.split(",")) {
    const part = token.trim();
    if (!part) return fail("Page selection contains an empty item.");
    const range = part.match(/^(\d+)\s*-\s*(\d+)$/);
    const single = part.match(/^\d+$/);
    if (range) {
      const start = Number(range[1]);
      const end = Number(range[2]);
      const error = validatePageNumber(start, pageCount) || validatePageNumber(end, pageCount);
      if (error) return fail(error);
      if (start > end) return fail("Page ranges cannot be reversed.");
      for (let page = start; page <= end; page += 1) {
        if (!seen.has(page)) {
          seen.add(page);
          pages.push(page);
        }
      }
      continue;
    }
    if (single) {
      const page = Number(part);
      const error = validatePageNumber(page, pageCount);
      if (error) return fail(error);
      if (!seen.has(page)) {
        seen.add(page);
        pages.push(page);
      }
      continue;
    }
    return fail("Use page numbers and ranges like 1,3-5,8.");
  }

  return { ok: true, pages, normalized: compressPages(pages), error: null };
}

function validatePageNumber(page: number, pageCount: number) {
  if (!Number.isInteger(page) || page < 1) return "Pages start at 1.";
  if (page > pageCount) return `Page ${page} is beyond the ${pageCount}-page document.`;
  return null;
}

function compressPages(pages: number[]) {
  const parts: string[] = [];
  let index = 0;
  while (index < pages.length) {
    const start = pages[index];
    let end = start;
    while (index + 1 < pages.length && pages[index + 1] === end + 1) {
      index += 1;
      end = pages[index];
    }
    parts.push(start === end ? String(start) : `${start}-${end}`);
    index += 1;
  }
  return parts.join(",");
}

function fail(error: string): PageSelectionValidation {
  return { ok: false, pages: [], normalized: "", error };
}
