import { BookMarked, ChevronRight, Copy, FileText, Gauge, Inbox, Layers, LayoutDashboard, Palette, Printer, RectangleHorizontal, RefreshCw, SlidersHorizontal } from "lucide-react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import {
  Button,
  Icon,
  Input,
  NumberInput,
  PrimaryButton,
  ScrollableContainer,
  SearchBox,
  Segmented,
  Select,
  SettingRow,
  SettingsGroup,
  typography
} from "@/design";
import type { MarginMode, OrientationMode, PrintLayout, ScaleMode } from "@/features/layout/types";
import { PrinterSelector, type Printer as PrinterEntity } from "@/features/printers";
import { ProfileSelector, type PrintProfile } from "@/features/profiles";
import type { CapabilityChoice, DriverCapability, PrinterCapabilities } from "@/features/printers/types";
import { type PrintSettings } from "./types";

interface SettingsPanelProps {
  printers: PrinterEntity[];
  capabilities: PrinterCapabilities | null;
  isLoadingCapabilities: boolean;
  isLoadingPrinters: boolean;
  settings: PrintSettings;
  onChange: (settings: PrintSettings) => void;
  layout: PrintLayout;
  onLayoutChange: (layout: PrintLayout) => void;
  paperChoices: CapabilityChoice[];
  hasPrinter: boolean;
  canPrint: boolean;
  isPrinting: boolean;
  printDisabledReason: string | null;
  onRefresh: () => void;
  onOpenPrinterDashboard: () => void;
  onApplyProfile: (profile: PrintProfile) => void;
  onOpenProfileLibrary: () => void;
  onPrint: () => void;
}

type CategoryId = "layout" | "paperHandling" | "finishing" | "imageColor" | "printerFeatures" | "performance";

const CATEGORIES: { id: CategoryId; label: string; info: string }[] = [
  { id: "layout", label: "Layout", info: "How your document sits on the sheet — scaling, margins, and position. Changes here update the preview instantly." },
  { id: "paperHandling", label: "Paper Handling", info: "How paper is fed and what it's made of — paper type, weight, and where pages come out." },
  { id: "finishing", label: "Finishing", info: "Stapling, hole-punching, and folding. Available when your printer has a finisher unit." },
  { id: "imageColor", label: "Image & Color", info: "Fine-tune brightness, contrast, and color matching. Most users can leave these at their defaults." },
  { id: "printerFeatures", label: "Printer Features", info: "Extra capabilities like watermarks, secure print, and stored jobs offered by your printer." },
  { id: "performance", label: "Performance", info: "How the job is processed and sent to the printer. Change only if you hit speed or quality issues." }
];

// Plain-language help for the settings most users recognise.
const INFO: Record<string, string> = {
  copies: "How many copies to print. Use the − and + buttons or type a number.",
  paperSize: "The size of the paper you're printing on. Match this to the paper loaded in the tray.",
  tray: "Which tray the printer pulls paper from. “Auto” lets the printer choose the right source.",
  colorMode: "Full color or black & white. Black & white usually prints faster and uses less toner.",
  duplex: "Prints on both sides of the paper. Use it to save paper and make booklet-style documents.",
  quality: "Print resolution. Higher quality looks sharper but prints slower and uses more toner.",
  orientation: "Portrait is upright, Landscape is sideways. “Auto” follows each page's own shape.",
  scale: "“Fit” shrinks or grows the page to fill the printable area, “Actual” prints at 100%, and “Custom” lets you set an exact percentage.",
  margins: "The unprintable border around the page. “Default” uses the printer's minimum, “None” prints edge-to-edge, and “Custom” sets your own.",
  position: "Where the document sits on the sheet when it's smaller than the paper.",
  paperType: "The kind of media you're printing on (plain, glossy, cardstock…). It affects how the printer lays down toner.",
  driver: "An advanced option from your printer's driver. Most users can safely leave it at the default."
};

// Primary capability driver keywords are shown in the main block, so they must
// never be duplicated inside the More Settings categories.
const PRIMARY_KEYWORDS = new Set([
  "PageSize", "media", "MediaSize", "KMInputSlot", "InputSlot", "APInputSlot", "PaperSources",
  "MediaType", "KMMediaType", "MediaWeight", "KMDuplex", "sides", "Duplex", "EFDuplex",
  "SelectColor", "ColorModel", "ColorMode", "BRColorMode", "Resolution", "printer-resolution",
  "CNResolution", "cupsPrintQuality"
]);

export function SettingsPanel({
  printers,
  capabilities,
  isLoadingCapabilities,
  isLoadingPrinters,
  settings,
  onChange,
  layout,
  onLayoutChange,
  paperChoices,
  hasPrinter,
  canPrint,
  isPrinting,
  printDisabledReason,
  onRefresh,
  onOpenPrinterDashboard,
  onApplyProfile,
  onOpenProfileLibrary,
  onPrint
}: SettingsPanelProps) {
  const [showMore, setShowMore] = useState(false);
  const [search, setSearch] = useState("");
  const [openCats, setOpenCats] = useState<Record<CategoryId, boolean>>({
    layout: true,
    paperHandling: false,
    finishing: false,
    imageColor: false,
    printerFeatures: false,
    performance: false
  });

  const naPlaceholder = isLoadingCapabilities ? "Loading…" : hasPrinter ? "Not supported" : "Connect a printer";

  // Group the printer's extra driver options into readable categories once.
  const groups = useMemo(() => classifyCapabilities(capabilities), [capabilities]);

  function patch(next: Partial<PrintSettings>) {
    onChange({ ...settings, ...next });
  }
  function setDriver(keyword: string, value: string) {
    patch({ driverOptions: { ...settings.driverOptions, [keyword]: value } });
  }
  function setLayoutValue<K extends keyof PrintLayout>(key: K, value: PrintLayout[K]) {
    onLayoutChange({ ...layout, [key]: value });
  }
  function toggleCat(id: CategoryId) {
    setOpenCats((current) => ({ ...current, [id]: !current[id] }));
  }

  const query = search.trim().toLowerCase();
  const matches = (text: string) => !query || text.toLowerCase().includes(query);

  const copies = Number(settings.copies) || 1;
  const jobSummary = [
    choiceLabel(paperChoices, settings.paperSize),
    choiceLabel(capabilities?.colorModes, settings.colorMode),
    choiceLabel(capabilities?.duplexModes, settings.duplex)
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Printer picker — a first-class printer selector + dashboard access. */}
      <div className="shrink-0 px-4 pb-3 pt-4">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <p className={cn(typography.labelCaps, "flex items-center gap-1.5 text-ink-muted")}>
            <Icon icon={Printer} size="xs" />
            Printer
          </p>
          <button
            type="button"
            onClick={onOpenPrinterDashboard}
            className={cn(typography.caption, "inline-flex items-center gap-1 rounded text-brand outline-none transition hover:underline focus-visible:ring-2 focus-visible:ring-brand")}
          >
            <Icon icon={LayoutDashboard} size="xs" />
            Dashboard
          </button>
        </div>
        <PrinterSelector
          printers={printers}
          value={settings.printerId}
          onSelect={(id) => patch({ printerId: id })}
          onOpenDashboard={onOpenPrinterDashboard}
          loading={isLoadingPrinters}
        />
        {!hasPrinter && (
          <div className="mt-2 rounded-md border border-edge-subtle bg-warning-soft px-3 py-2 text-xs text-warning">
            <p className="font-semibold">No printer connected</p>
            <p className="mt-0.5 leading-5 text-ink-secondary">Keep preparing your document — everything except printing works. Connect a printer, then refresh.</p>
            <Button variant="secondary" size="sm" className="mt-2" leadingIcon={RefreshCw} loading={isLoadingPrinters} onClick={onRefresh}>
              Refresh Printers
            </Button>
          </div>
        )}
      </div>

      {/* Quick-access print profiles */}
      <div className="shrink-0 border-t border-edge-subtle px-4 pb-3 pt-3">
        <p className={cn(typography.labelCaps, "mb-1.5 flex items-center gap-1.5 text-ink-muted")}>
          <Icon icon={BookMarked} size="xs" />
          Profile
        </p>
        <ProfileSelector onApply={onApplyProfile} onSaveCurrent={onOpenProfileLibrary} onOpenLibrary={onOpenProfileLibrary} />
      </div>

      {/* Scrollable settings — only this region scrolls */}
      <ScrollableContainer className="px-4 pb-3 pt-1">
        <SettingsGroup title="Print Settings">
          <SettingRow icon={Copy} label="Copies" info={INFO.copies}>
            <NumberInput label="Copies" value={copies} min={1} max={999} onChange={(value) => patch({ copies: clampInt(value, 1, 999) })} />
          </SettingRow>
          <SettingRow icon={FileText} label="Paper Size" info={INFO.paperSize}>
            <ChoiceSelect label="Paper Size" value={settings.paperSize} choices={paperChoices} placeholder={naPlaceholder} onChange={(value) => patch({ paperSize: value })} />
          </SettingRow>
          <SettingRow icon={Inbox} label="Tray" info={INFO.tray}>
            <ChoiceSelect label="Tray" value={settings.tray} choices={capabilities?.trays || []} placeholder={naPlaceholder} onChange={(value) => patch({ tray: value })} />
          </SettingRow>
          <SettingRow icon={Palette} label="Color Mode" info={INFO.colorMode}>
            <ChoiceSelect label="Color Mode" value={settings.colorMode} choices={capabilities?.colorModes || []} placeholder={naPlaceholder} onChange={(value) => patch({ colorMode: value })} />
          </SettingRow>
          <SettingRow icon={Layers} label="Duplex" info={INFO.duplex}>
            <ChoiceSelect label="Duplex" value={settings.duplex} choices={capabilities?.duplexModes || []} placeholder={naPlaceholder} onChange={(value) => patch({ duplex: value })} />
          </SettingRow>
          <SettingRow icon={Gauge} label="Print Quality" info={INFO.quality}>
            <ChoiceSelect label="Print Quality" value={settings.quality} choices={capabilities?.resolutions || []} placeholder={naPlaceholder} onChange={(value) => patch({ quality: value })} />
          </SettingRow>
          <SettingRow icon={RectangleHorizontal} label="Orientation" info={INFO.orientation}>
            <Segmented<OrientationMode>
              label="Orientation"
              value={layout.orientation}
              options={[
                { value: "auto", label: "Auto" },
                { value: "portrait", label: "Portrait" },
                { value: "landscape", label: "Landscape" }
              ]}
              onChange={(value) => setLayoutValue("orientation", value)}
            />
          </SettingRow>
        </SettingsGroup>

        {/* More Settings — collapsible, preserves state */}
        <button
          type="button"
          onClick={() => setShowMore((value) => !value)}
          aria-expanded={showMore}
          className="mt-3 flex w-full items-center justify-between rounded-lg border border-edge-subtle bg-white/[0.03] px-3 py-2.5 text-left outline-none transition hover:bg-white/[0.06] focus-visible:ring-2 focus-visible:ring-brand"
        >
          <span className="flex items-center gap-2">
            <Icon icon={SlidersHorizontal} className="text-ink-muted" />
            <span className="grid leading-tight">
              <span className={cn(typography.label, "text-ink")}>More Settings</span>
              <span className={cn(typography.caption, "text-ink-muted")}>Layout, finishing, color, and advanced driver settings</span>
            </span>
          </span>
          <Icon icon={ChevronRight} className={cn("text-ink-muted transition-transform", showMore && "rotate-90")} />
        </button>

        {showMore && (
          <div className="mt-2 grid gap-2">
            <SearchBox aria-label="Search all options" placeholder="Search all options" value={search} onChange={setSearch} />

            {CATEGORIES.map((category) => {
              const content = renderCategory(category.id, {
                layout,
                setLayoutValue,
                capabilities,
                groups,
                settings,
                setSetting: patch,
                setDriver,
                naPlaceholder,
                matches
              });
              if (query.length > 0 && content.count === 0) return null;
              const empty = content.count === 0;
              const isOpen = !empty && (openCats[category.id] || query.length > 0);

              return (
                <section key={category.id} className="overflow-hidden rounded-lg border border-edge-subtle bg-white/[0.02]">
                  <button
                    type="button"
                    disabled={empty}
                    aria-expanded={isOpen}
                    onClick={() => toggleCat(category.id)}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left outline-none transition focus-visible:ring-2 focus-visible:ring-brand",
                      empty ? "cursor-default" : "hover:bg-white/[0.04]"
                    )}
                  >
                    <span className="flex items-center gap-1.5">
                      <Icon icon={ChevronRight} className={cn("text-ink-muted transition-transform", empty && "opacity-30", isOpen && "rotate-90")} />
                      <span className={cn(typography.label, empty ? "text-ink-muted" : "text-ink")}>{category.label}</span>
                    </span>
                    <span className={cn(typography.caption, "text-ink-muted")}>
                      {empty ? "None available" : `${content.count} ${content.count === 1 ? "option" : "options"}`}
                    </span>
                  </button>
                  {isOpen && <div className="border-t border-edge-subtle">{content.node}</div>}
                </section>
              );
            })}
          </div>
        )}
      </ScrollableContainer>

      {/* Sticky footer — Print is the primary action, always visible */}
      <div className="shrink-0 border-t border-edge-subtle bg-black/10 px-4 py-3">
        {!canPrint && printDisabledReason && <p className={cn(typography.caption, "mb-2 text-ink-muted")}>{printDisabledReason}</p>}
        {canPrint && jobSummary && <p className={cn(typography.caption, "mb-2 truncate text-center text-ink-muted")} title={jobSummary}>{jobSummary}</p>}
        <PrimaryButton
          className="h-11 w-full text-base"
          leadingIcon={Printer}
          loading={isPrinting}
          disabled={!canPrint}
          onClick={onPrint}
          title={!canPrint ? printDisabledReason || undefined : undefined}
        >
          {isPrinting ? "Printing…" : copies > 1 ? `Print ${copies} copies` : "Print"}
        </PrimaryButton>
      </div>
    </div>
  );
}

// Adapts a CapabilityChoice[] to the design-system <Select>.
function ChoiceSelect({
  label,
  value,
  choices,
  onChange,
  placeholder
}: {
  label: string;
  value: string;
  choices: CapabilityChoice[];
  onChange: (value: string) => void;
  placeholder: string;
}) {
  const disabled = choices.length === 0;
  return (
    <Select aria-label={label} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
      {disabled ? (
        <option value="">{placeholder}</option>
      ) : (
        choices.map((choice) => (
          <option key={choice.value} value={choice.value}>
            {choice.label}
            {choice.isDefault ? " (Default)" : ""}
          </option>
        ))
      )}
    </Select>
  );
}

// Builds the body + option count for one More Settings category.
function renderCategory(
  id: CategoryId,
  ctx: {
    layout: PrintLayout;
    setLayoutValue: <K extends keyof PrintLayout>(key: K, value: PrintLayout[K]) => void;
    capabilities: PrinterCapabilities | null;
    groups: Record<CategoryId, DriverCapability[]>;
    settings: PrintSettings;
    setSetting: (next: Partial<PrintSettings>) => void;
    setDriver: (keyword: string, value: string) => void;
    naPlaceholder: string;
    matches: (text: string) => boolean;
  }
): { node: ReactNode; count: number } {
  const { layout, setLayoutValue, capabilities, groups, settings, setSetting, setDriver, naPlaceholder, matches } = ctx;

  if (id === "layout") {
    const rows: ReactNode[] = [];
    if (matches("scale fit actual custom")) {
      rows.push(
        <SettingRow key="scale" label="Scaling" info={INFO.scale}>
          <div className="grid gap-2">
            <Segmented<ScaleMode>
              label="Scaling"
              value={layout.scaleMode}
              options={[
                { value: "fit", label: "Fit" },
                { value: "actual", label: "Actual" },
                { value: "custom", label: "Custom" }
              ]}
              onChange={(value) => setLayoutValue("scaleMode", value)}
            />
            {layout.scaleMode === "custom" && (
              <div className="flex items-center gap-2">
                <input
                  aria-label="Custom scale percent"
                  className="h-1.5 w-24 cursor-pointer appearance-none rounded-pill bg-white/15 accent-brand"
                  type="range"
                  min={10}
                  max={400}
                  step={5}
                  value={layout.customScalePercent}
                  onChange={(event) => setLayoutValue("customScalePercent", Number(event.target.value))}
                />
                <Input
                  aria-label="Scale value"
                  className="h-7 w-16 text-center"
                  type="number"
                  min={10}
                  max={400}
                  value={layout.customScalePercent}
                  onChange={(event) => setLayoutValue("customScalePercent", clampInt(Number(event.target.value), 10, 400))}
                />
                <span className="text-xs text-ink-muted">%</span>
              </div>
            )}
          </div>
        </SettingRow>
      );
    }
    if (matches("margins default none custom border")) {
      rows.push(
        <SettingRow key="margins" label="Margins" info={INFO.margins}>
          <div className="grid gap-2">
            <Segmented<MarginMode>
              label="Margins"
              value={layout.marginMode}
              options={[
                { value: "default", label: "Default" },
                { value: "none", label: "None" },
                { value: "custom", label: "Custom" }
              ]}
              onChange={(value) => setLayoutValue("marginMode", value)}
            />
            {layout.marginMode === "custom" && (
              <div className="flex items-center gap-1">
                <Input
                  aria-label="Custom margin millimetres"
                  className="h-7 w-16 text-center"
                  type="number"
                  min={0}
                  max={50}
                  value={layout.customMarginMm}
                  onChange={(event) => setLayoutValue("customMarginMm", clampInt(Number(event.target.value), 0, 50))}
                />
                <span className="text-xs text-ink-muted">mm</span>
              </div>
            )}
          </div>
        </SettingRow>
      );
    }
    if (matches("position center top-left align")) {
      rows.push(
        <SettingRow key="position" label="Position" info={INFO.position}>
          <Segmented<PrintLayout["align"]>
            label="Position"
            value={layout.align}
            options={[
              { value: "center", label: "Center" },
              { value: "top-left", label: "Top-Left" }
            ]}
            onChange={(value) => setLayoutValue("align", value)}
          />
        </SettingRow>
      );
    }
    const showRoadmap = matches("n-up nup poster booklet coming soon");
    return {
      count: rows.length,
      node: (
        <>
          {rows}
          {showRoadmap && (
            <p className="px-3 py-2 text-[11px] leading-5 text-ink-muted">
              N-Up, Booklet, and Poster layouts are coming soon — they'll reuse this same preview.
            </p>
          )}
        </>
      )
    };
  }

  // Paper Handling leads with the printer's Paper Type, then its handling driver options.
  const driverRows: DriverCapability[] = (groups[id] || []).filter((cap) =>
    matches([cap.option.displayName, cap.option.keyword, ...(cap.searchKeywords || [])].join(" "))
  );

  const rows: ReactNode[] = [];
  if (id === "paperHandling" && matches("paper type media stock")) {
    rows.push(
      <SettingRow key="paperType" label="Paper Type" info={INFO.paperType}>
        <ChoiceSelect
          label="Paper Type"
          value={settings.paperWeight}
          choices={capabilities?.paperTypes || []}
          placeholder={naPlaceholder}
          onChange={(value) => setSetting({ paperWeight: value })}
        />
      </SettingRow>
    );
  }

  rows.push(
    ...driverRows.map((cap) => (
      <SettingRow key={cap.option.keyword} label={cap.option.displayName || cap.option.keyword} info={optionInfo(cap, id)}>
        <ChoiceSelect
          label={cap.option.displayName || cap.option.keyword}
          value={driverValue(cap, settings)}
          choices={cap.option.choices}
          placeholder={cap.option.choices.length ? naPlaceholder : "No choices reported"}
          onChange={(value) => setDriver(cap.option.keyword, value)}
        />
      </SettingRow>
    ))
  );

  return {
    count: rows.length,
    node:
      rows.length > 0 ? (
        <>{rows}</>
      ) : (
        <p className="px-3 py-3 text-[11px] leading-5 text-ink-muted">
          {capabilities ? "This printer reports no options in this category." : "Connect a printer to see these options."}
        </p>
      )
  };
}

// --- classification & helpers ------------------------------------------------

function classifyCapabilities(capabilities: PrinterCapabilities | null): Record<CategoryId, DriverCapability[]> {
  const groups = emptyGroups();
  for (const cap of capabilities?.driverCapabilities || []) {
    if (PRIMARY_KEYWORDS.has(cap.option.keyword) || cap.hidden) continue;
    groups[categoryFor(cap)].push(cap);
  }
  return groups;
}

function emptyGroups(): Record<CategoryId, DriverCapability[]> {
  return { layout: [], paperHandling: [], finishing: [], imageColor: [], printerFeatures: [], performance: [] };
}

function categoryFor(cap: DriverCapability): CategoryId {
  const text = [cap.option.keyword, cap.option.displayName, cap.category, ...(cap.searchKeywords || []), ...cap.option.choices.flatMap((choice) => [choice.label, choice.value])]
    .join(" ")
    .toLowerCase();
  if (/stapl|punch|fold|bind|booklet|finish|hole|crease|saddle|offset/.test(text)) return "finishing";
  if (/bright|contrast|gamma|colormatch|color match|matching|grayscale|greyscale|toner|saturat|halftone|dither|\bicc\b|density|\brgb\b|\bcmyk\b|profile|sharp|smoothing/.test(text)) return "imageColor";
  if (/watermark|secure|encrypt|storage|stored|\bjob\b|banner|separator|account|stamp|overlay|annotat|protect|\bpin\b|user box/.test(text)) return "printerFeatures";
  if (/raster|render|spool|compress|pipeline|process|edge.to.edge/.test(text)) return "performance";
  if (/tray|slot|source|output|feed|media|paper type|weight|stock|cassette|bypass|manual|custom size/.test(text)) return "paperHandling";
  return "printerFeatures";
}

function optionInfo(cap: DriverCapability, id: CategoryId): string {
  const text = `${cap.option.keyword} ${cap.option.displayName}`.toLowerCase();
  if (/stapl/.test(text)) return "Fastens printed sheets together with staples. Needs a finisher unit.";
  if (/punch|hole/.test(text)) return "Punches binding holes into the printed sheets. Needs a finisher unit.";
  if (/fold/.test(text)) return "Folds the output — useful for booklets and mailers. Needs a finisher unit.";
  if (/watermark/.test(text)) return "Prints faint text (like “Confidential”) behind your document.";
  if (/secure|\bpin\b|encrypt/.test(text)) return "Holds the job at the printer until you enter a PIN, keeping documents private.";
  if (/storage|stored|user box/.test(text)) return "Saves the job on the printer so it can be reprinted later without resending.";
  if (/toner/.test(text)) return "Uses less toner to save cost, at the expense of slightly lighter output.";
  const category = CATEGORIES.find((entry) => entry.id === id);
  return category ? `${category.label} option from your printer's driver. ${INFO.driver}` : INFO.driver;
}

function driverValue(cap: DriverCapability, settings: PrintSettings) {
  const keyword = cap.option.keyword;
  return (
    settings.driverOptions?.[keyword] ||
    cap.option.choices.find((choice) => choice.isDefault)?.value ||
    cap.option.choices[0]?.value ||
    ""
  );
}

function choiceLabel(choices: CapabilityChoice[] | undefined, value: string) {
  if (!value) return "";
  return choices?.find((choice) => choice.value === value)?.label || value;
}

function clampInt(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}
