import { Info, Loader2, Minus, Plus, Printer, Search, SlidersHorizontal, X } from "lucide-react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { CapabilityChoice, DriverCapability, PrinterCapabilities, PrinterInfo } from "@/features/printers/types";
import { type PrintSettings } from "./types";

interface SettingsPanelProps {
  printers: PrinterInfo[];
  capabilities: PrinterCapabilities | null;
  isLoadingCapabilities: boolean;
  settings: PrintSettings;
  onChange: (settings: PrintSettings) => void;
  canPrint: boolean;
  isPrinting: boolean;
  status: string | null;
  onPrint: () => void;
}

type SettingKind = "select" | "number";
type SettingKey = keyof PrintSettings | `driver:${string}`;
type SettingSection = "paper" | "layout" | "colorQuality" | "advanced" | "expert" | "unknown";

interface SettingDescriptor {
  key: SettingKey;
  label: string;
  section: SettingSection;
  kind: SettingKind;
  choices?: CapabilityChoice[];
  disabled?: boolean;
  disabledReason?: string;
  keywords: string[];
}

const quickSections: SettingSection[] = ["paper", "layout", "colorQuality"];
const modalSections: SettingSection[] = ["advanced", "expert", "unknown"];

const sectionLabels: Record<SettingSection, string> = {
  paper: "Paper",
  layout: "Layout",
  colorQuality: "Color & Quality",
  advanced: "Advanced",
  expert: "Expert",
  unknown: "Unknown Driver Options"
};

const normalizedCapabilityKeywords = new Set([
  "PageSize",
  "media",
  "MediaSize",
  "KMInputSlot",
  "InputSlot",
  "APInputSlot",
  "PaperSources",
  "MediaType",
  "KMMediaType",
  "MediaWeight",
  "KMDuplex",
  "sides",
  "Duplex",
  "EFDuplex",
  "SelectColor",
  "ColorModel",
  "ColorMode",
  "BRColorMode",
  "Resolution",
  "printer-resolution",
  "CNResolution",
  "cupsPrintQuality"
]);

export function SettingsPanel({
  printers,
  capabilities,
  isLoadingCapabilities,
  settings,
  onChange,
  canPrint,
  isPrinting,
  status,
  onPrint
}: SettingsPanelProps) {
  const [isMoreOptionsOpen, setIsMoreOptionsOpen] = useState(false);
  const [modalSearch, setModalSearch] = useState("");
  const capabilityPlaceholder = isLoadingCapabilities ? "Loading..." : "Not supported";

  const descriptors = useMemo(
    () => buildDescriptors(capabilities, isLoadingCapabilities, capabilityPlaceholder),
    [capabilities, capabilityPlaceholder, isLoadingCapabilities]
  );
  const quickDescriptors = descriptors.filter((descriptor) => quickSections.includes(descriptor.section));
  const modalDescriptors = descriptors.filter((descriptor) => modalSections.includes(descriptor.section));
  const filteredModalDescriptors = filterDescriptors(modalDescriptors, modalSearch);

  function patch(next: Partial<PrintSettings>) {
    onChange({ ...settings, ...next });
  }

  function updateSetting(descriptor: SettingDescriptor, value: string | number) {
    if (descriptor.key === "copies") {
      patch({ copies: Math.max(1, Math.min(999, Number(value) || 1)) });
    } else if (String(descriptor.key).startsWith("driver:")) {
      const keyword = String(descriptor.key).replace(/^driver:/, "");
      patch({
        driverOptions: {
          ...settings.driverOptions,
          [keyword]: String(value)
        }
      });
    } else {
      patch({ [descriptor.key]: String(value) } as Partial<PrintSettings>);
    }
  }

  function resetKeys(keys: SettingKey[]) {
    const nextSettings: PrintSettings = { ...settings, driverOptions: { ...settings.driverOptions } };

    keys.forEach((key) => {
      const descriptor = descriptors.find((item) => item.key === key);
      if (!descriptor) return;

      if (key === "copies") {
        nextSettings.copies = 1;
      } else if (String(key).startsWith("driver:")) {
        const keyword = String(key).replace(/^driver:/, "");
        const defaultChoice = descriptor.choices?.find((choice) => choice.isDefault) || descriptor.choices?.[0];
        if (defaultChoice) {
          nextSettings.driverOptions = { ...nextSettings.driverOptions, [keyword]: defaultChoice.value };
        }
      } else {
        const defaultChoice = descriptor.choices?.find((choice) => choice.isDefault) || descriptor.choices?.[0];
        if (defaultChoice) {
          (nextSettings as unknown as Record<string, string>)[String(key)] = defaultChoice.value;
        }
      }
    });

    onChange(nextSettings);
  }

  function renderSetting(descriptor: SettingDescriptor, compact = false) {
    return (
      <div
        key={descriptor.key}
        className={`grid min-h-8 gap-2 border-b border-white/10 px-3 py-1.5 last:border-b-0 ${
          compact ? "sm:grid-cols-[150px_minmax(0,1fr)]" : "sm:grid-cols-[minmax(118px,0.8fr)_minmax(0,1.35fr)]"
        } sm:items-center`}
      >
        <label className="text-[13px] font-medium text-[#F0F0F2]" htmlFor={settingId(descriptor)}>
          {descriptor.label}
        </label>
        <SettingControl
          id={settingId(descriptor)}
          descriptor={descriptor}
          settings={settings}
          onChange={(value) => updateSetting(descriptor, value)}
        />
        {descriptor.disabled && descriptor.disabledReason && (
          <p className="text-[11px] text-[#AEAEB2] sm:col-start-2">{descriptor.disabledReason}</p>
        )}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 px-4 pb-2 pt-3">
        <div className="grid gap-1.5">
          <p className="text-[13px] font-semibold text-white">Printer</p>
          <div>
            <Select
              className="h-8 rounded-md border-white/10 bg-[#111214] text-sm"
              label=""
              value={settings.printerId}
              onChange={(event) => patch({ printerId: event.target.value })}
            >
              {printers.length === 0 ? (
                <option value="">No printers detected</option>
              ) : (
                printers.map((printer) => (
                  <option key={printer.id} value={printer.id}>
                    {printer.status === "online" ? "Online" : "Offline"} - {printer.name}
                    {printer.isDefault ? " (Default)" : ""}
                  </option>
                ))
              )}
            </Select>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-4 pb-2 pt-1">
        <div className="grid gap-1.5">
          {renderSetting({
            key: "copies",
            label: "Copies",
            section: "layout",
            kind: "number",
            keywords: ["copies", "quantity", "sets"]
          })}

          {quickSections.map((section) => {
            const sectionSettings = quickDescriptors.filter((descriptor) => descriptor.section === section);
            if (!sectionSettings.length) return null;

            return (
              <section className="grid gap-1 border-t border-white/10 pt-1.5" key={section}>
                <h3 className="text-[13px] font-semibold text-white">{sectionLabels[section]}</h3>
                <div className="overflow-hidden rounded-md border border-white/10 bg-black/10">
                  {sectionSettings.map((descriptor) => renderSetting(descriptor))}
                </div>
              </section>
            );
          })}
        </div>
      </div>

      <div className="shrink-0 border-t border-white/10 bg-black/10 px-4 py-3">
        {status && <p className="mb-2 rounded-md bg-accent px-3 py-2 text-sm text-accent-foreground">{status}</p>}
        <div className="flex justify-end gap-2">
          <Button className="h-10 min-w-44 rounded-md px-4" variant="secondary" onClick={() => setIsMoreOptionsOpen(true)}>
            <SlidersHorizontal className="h-4 w-4" />
            <span className="grid text-left leading-tight">
              <span>More Options...</span>
              <span className="text-xs font-normal text-[#B9BABE]">Open all driver options</span>
            </span>
          </Button>
          <Button className="h-10 w-48 rounded-md text-base" onClick={onPrint} disabled={!canPrint}>
            {isPrinting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Printer className="h-5 w-5" />}
            {isPrinting ? "Printing..." : "Print"}
          </Button>
        </div>
      </div>

      {isMoreOptionsOpen && (
        <MoreOptionsDialog
          descriptors={filteredModalDescriptors}
          modalSearch={modalSearch}
          onSearchChange={setModalSearch}
          onClose={() => setIsMoreOptionsOpen(false)}
          onResetSection={(section) => resetKeys(modalDescriptors.filter((descriptor) => descriptor.section === section).map((descriptor) => descriptor.key))}
          renderSetting={(descriptor) => renderSetting(descriptor, true)}
        />
      )}
    </div>
  );
}

function MoreOptionsDialog({
  descriptors,
  modalSearch,
  onSearchChange,
  onClose,
  onResetSection,
  renderSetting
}: {
  descriptors: SettingDescriptor[];
  modalSearch: string;
  onSearchChange: (value: string) => void;
  onClose: () => void;
  onResetSection: (section: SettingSection) => void;
  renderSetting: (descriptor: SettingDescriptor) => ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-6">
      <div className="flex h-[80vh] w-[80vw] max-w-6xl flex-col overflow-hidden rounded-xl border border-[#48484A] bg-[#2C2C2E] shadow-2xl">
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-[#3A3A3C] px-5 py-4">
          <div>
            <h2 className="text-xl font-semibold text-white">More Options</h2>
            <p className="mt-1 text-sm text-[#AEAEB2]">Advanced driver settings for this printer.</p>
          </div>
          <button className="rounded-md p-1.5 text-[#AEAEB2] transition hover:bg-white/10 hover:text-white" onClick={onClose} type="button">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="shrink-0 border-b border-[#3A3A3C] px-5 py-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#AEAEB2]" />
            <Input
              aria-label="Search driver options"
              className="h-10 rounded-md pl-9"
              placeholder="Search every driver capability"
              value={modalSearch}
              onChange={(event) => onSearchChange(event.target.value)}
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
          <div className="grid gap-4">
            {modalSections.map((section) => {
              const sectionDescriptors = descriptors.filter((descriptor) => descriptor.section === section);
              if (!sectionDescriptors.length) return null;

              return (
                <section className="rounded-lg border border-[#3A3A3C] bg-[#242426]" key={section}>
                  <div className="flex items-center justify-between gap-3 border-b border-[#3A3A3C] px-4 py-3">
                    <div>
                      <h3 className="text-sm font-semibold text-white">{sectionLabels[section]}</h3>
                      <p className="mt-0.5 text-xs text-[#AEAEB2]">{sectionDescriptors.length} options</p>
                    </div>
                    <button className="text-xs text-[#AEAEB2] hover:text-white" onClick={() => onResetSection(section)} type="button">
                      Reset Section
                    </button>
                  </div>
                  <div className="grid gap-3 p-4 xl:grid-cols-2">{sectionDescriptors.map((descriptor) => renderSetting(descriptor))}</div>
                </section>
              );
            })}

            {!descriptors.length && (
              <div className="rounded-lg border border-[#3A3A3C] bg-[#242426] p-6 text-sm text-[#AEAEB2]">
                No driver options match the current search.
              </div>
            )}
          </div>
        </div>

        <div className="flex shrink-0 justify-end border-t border-[#3A3A3C] px-5 py-3">
          <Button className="h-10 rounded-md px-6" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}

function SettingControl({
  id,
  descriptor,
  settings,
  onChange
}: {
  id: string;
  descriptor: SettingDescriptor;
  settings: PrintSettings;
  onChange: (value: string | number) => void;
}) {
  if (descriptor.kind === "number") {
    const value = Number(settings.copies) || 1;
    return (
      <div className="grid grid-cols-[36px_minmax(0,1fr)_36px_22px] gap-2">
        <Button
          aria-label="Decrease copies"
          className="h-8 w-9 rounded-md"
          disabled={descriptor.disabled}
          variant="secondary"
          size="icon"
          onClick={() => onChange(value - 1)}
        >
          <Minus className="h-4 w-4" />
        </Button>
        <Input
          id={id}
          disabled={descriptor.disabled}
          min={1}
          max={999}
          type="number"
          value={value}
          onChange={(event) => onChange(Number(event.target.value) || 1)}
          className="h-8 rounded-md bg-[#111214] text-center"
        />
        <Button
          aria-label="Increase copies"
          className="h-8 w-9 rounded-md"
          disabled={descriptor.disabled}
          variant="secondary"
          size="icon"
          onClick={() => onChange(value + 1)}
        >
          <Plus className="h-4 w-4" />
        </Button>
        <span className="grid h-8 place-items-center text-[#A7A9AF]">
          <Info className="h-4 w-4" />
        </span>
      </div>
    );
  }

  const value = valueForDescriptor(descriptor, settings);
  return (
    <select
      id={id}
      aria-label={descriptor.label}
      className="h-8 w-full appearance-none rounded-md border border-white/10 bg-[#111214] px-3 text-sm text-white outline-none transition hover:border-white/20 focus:ring-2 focus:ring-primary disabled:opacity-60"
      disabled={descriptor.disabled}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {descriptor.choices?.length ? (
        descriptor.choices.map((choice) => (
          <option key={choice.value} value={choice.value}>
            {choice.label}
            {choice.isDefault ? " (Default)" : ""}
          </option>
        ))
      ) : (
        <option value="">Not supported</option>
      )}
    </select>
  );
}

function buildDescriptors(
  capabilities: PrinterCapabilities | null,
  isLoadingCapabilities: boolean,
  capabilityPlaceholder: string
): SettingDescriptor[] {
  const descriptors: SettingDescriptor[] = [
    choiceDescriptor("paperSize", "Paper Size", "paper", capabilities?.paperSizes, isLoadingCapabilities, capabilityPlaceholder, [
      "paper",
      "media",
      "size",
      "page"
    ]),
    choiceDescriptor("paperWeight", "Paper Type", "paper", capabilities?.paperTypes, isLoadingCapabilities, capabilityPlaceholder, [
      "paper",
      "type",
      "media",
      "stock"
    ]),
    choiceDescriptor("tray", "Tray / Input Slot", "paper", capabilities?.trays, isLoadingCapabilities, capabilityPlaceholder, [
      "tray",
      "source",
      "input",
      "bypass"
    ]),
    choiceDescriptor("duplex", "Duplex", "layout", capabilities?.duplexModes, isLoadingCapabilities, capabilityPlaceholder, [
      "duplex",
      "double",
      "sides"
    ]),
    choiceDescriptor("colorMode", "Color Mode", "colorQuality", capabilities?.colorModes, isLoadingCapabilities, capabilityPlaceholder, [
      "color",
      "mono",
      "grayscale"
    ]),
    choiceDescriptor("quality", "Print Quality / Resolution", "colorQuality", capabilities?.resolutions, isLoadingCapabilities, capabilityPlaceholder, [
      "quality",
      "resolution",
      "dpi"
    ])
  ];

  const quickDriverKeywords = new Set<string>();
  let hasOrientationControl = false;

  for (const capability of capabilities?.driverCapabilities || []) {
    if (normalizedCapabilityKeywords.has(capability.option.keyword)) continue;

    if (isQuickDriverCapability(capability)) {
      quickDriverKeywords.add(capability.option.keyword);
      if (isOrientationCapability(capability)) hasOrientationControl = true;
      descriptors.push(driverDescriptor(capability, quickSectionForDriverCapability(capability)));
    }
  }

  if (!hasOrientationControl) {
    descriptors.push(placeholderDescriptor("Orientation", "layout", ["orientation", "portrait", "landscape"], isLoadingCapabilities, capabilityPlaceholder));
  }

  for (const capability of capabilities?.driverCapabilities || []) {
    if (normalizedCapabilityKeywords.has(capability.option.keyword) || quickDriverKeywords.has(capability.option.keyword)) continue;
    descriptors.push(driverDescriptor(capability, modalSectionForCapability(capability)));
  }

  return descriptors;
}

function choiceDescriptor(
  key: keyof PrintSettings,
  label: string,
  section: SettingSection,
  choices: CapabilityChoice[] | undefined,
  isLoadingCapabilities: boolean,
  capabilityPlaceholder: string,
  keywords: string[]
): SettingDescriptor {
  const hasChoices = Boolean(choices?.length);
  return {
    key,
    label,
    section,
    kind: "select",
    choices: choices || [],
    disabled: !hasChoices || isLoadingCapabilities,
    disabledReason: isLoadingCapabilities ? "Reading driver capabilities." : capabilityPlaceholder,
    keywords
  };
}

function driverDescriptor(capability: DriverCapability, section: SettingSection): SettingDescriptor {
  const option = capability.option;

  return {
    key: `driver:${option.keyword}`,
    label: option.displayName || option.keyword,
    section,
    kind: "select",
    choices: option.choices,
    disabled: !option.choices.length,
    disabledReason: "No choices were reported for this driver option.",
    keywords: [option.keyword, option.displayName, capability.category, capability.controlType, ...capability.searchKeywords]
  };
}

function placeholderDescriptor(
  label: string,
  section: SettingSection,
  keywords: string[],
  isLoadingCapabilities: boolean,
  capabilityPlaceholder: string
): SettingDescriptor {
  return {
    key: `driver:unsupported-${label.toLowerCase().replace(/\s+/g, "-")}`,
    label,
    section,
    kind: "select",
    choices: [],
    disabled: true,
    disabledReason: isLoadingCapabilities ? "Reading driver capabilities." : capabilityPlaceholder,
    keywords
  };
}

function isQuickDriverCapability(capability: DriverCapability) {
  const text = capabilityText(capability);
  return /(orientation|landscape|portrait|scale|scaling|fitto|fit to|resolution|printquality|print quality)/.test(text);
}

function isOrientationCapability(capability: DriverCapability) {
  return /(orientation|landscape|portrait)/.test(capabilityText(capability));
}

function quickSectionForDriverCapability(capability: DriverCapability): SettingSection {
  const text = capabilityText(capability);
  if (/(orientation|landscape|portrait|scale|scaling|fitto|fit to)/.test(text)) return "layout";
  return "colorQuality";
}

function modalSectionForCapability(capability: DriverCapability): SettingSection {
  if (capability.category === "expert") return "expert";
  if (capability.category === "unknown") return "unknown";
  return "advanced";
}

function filterDescriptors(descriptors: SettingDescriptor[], search: string) {
  const normalizedSearch = search.trim().toLowerCase();
  if (!normalizedSearch) return descriptors;

  return descriptors.filter((descriptor) => settingSearchText(descriptor).includes(normalizedSearch));
}

function capabilityText(capability: DriverCapability) {
  return [
    capability.id,
    capability.category,
    capability.controlType,
    capability.option.keyword,
    capability.option.displayName,
    ...capability.searchKeywords,
    ...capability.option.choices.flatMap((choice) => [choice.label, choice.value])
  ]
    .join(" ")
    .toLowerCase();
}

function settingSearchText(descriptor: SettingDescriptor) {
  return [
    descriptor.label,
    descriptor.section,
    ...descriptor.keywords,
    ...(descriptor.choices || []).flatMap((choice) => [choice.label, choice.value])
  ]
    .join(" ")
    .toLowerCase();
}

function valueForDescriptor(descriptor: SettingDescriptor, settings: PrintSettings) {
  if (String(descriptor.key).startsWith("driver:")) {
    const keyword = String(descriptor.key).replace(/^driver:/, "");
    return settings.driverOptions?.[keyword] || descriptor.choices?.find((choice) => choice.isDefault)?.value || descriptor.choices?.[0]?.value || "";
  }

  const value = settings[descriptor.key as keyof PrintSettings];
  return typeof value === "string" ? value : "";
}

function settingId(descriptor: SettingDescriptor) {
  return `print-setting-${String(descriptor.key).replace(/[^a-z0-9_-]/gi, "-")}`;
}
