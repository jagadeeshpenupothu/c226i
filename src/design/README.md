# PrintPilot Design System

The visual language and reusable UI foundation for PrintPilot. Phase 1 establishes
**tokens + components + theming infrastructure** without changing any existing
screen. Phase 2 (the shell redesign) will migrate features onto this foundation.

> Golden rule: **components consume tokens; screens consume components.** No screen
> should hardcode a color, radius, shadow, or magic pixel value again.

---

## 1. Folder structure

```
src/design/
  tokens/          # Source of truth for values
    colors.ts        primitive palette + semantic CSS-var accessors + ThemeColors
    typography.ts    type scale (ready-to-use class strings) + font families
    spacing.ts       8-point scale (mirrors Tailwind's numeric scale)
    radius.ts        sm | md | lg | xl | pill
    shadows.ts       sm | md | lg | floating | dialog
    motion.ts        durations + easing curves + transition() helper
    layout.ts        sidebar width, toolbar height, control heights, split range…
    breakpoints.ts   small-laptop | laptop | desktop | ultrawide
    index.ts         barrel
  themes/          # Semantic value maps per theme (dark active, light prepared)
    dark.ts  light.ts  index.ts (applyTheme / resolveTheme)
  tokens.css       # The CSS custom properties (--pp-*) the DOM + Tailwind read
  components/      # Reusable UI (see §4)
  index.ts         # `import { Button, color, spacing } from "@/design"`
```

> **Why `src/design/components/` and not `components/ui/Button/`?**
> The app already ships `src/components/ui/{button,card,input,select}.tsx`. Creating
> `Button/` next to `button.tsx` collides on case-insensitive filesystems (macOS,
> Windows — both are shipping targets). Housing the system under `src/design/` keeps
> it cohesive and cross-platform safe. The legacy `components/ui/*` files are left
> untouched and will be retired during Phase 2 migration.

---

## 2. Design tokens

### Colors

Two layers. **Never** use `palette` directly in a component.

- `palette` — primitive raw values (neutral / blue / green / amber / red / sky).
- Semantic tokens — resolve to CSS variables (`--pp-color-*`) that are themed:

| Group | Tokens |
|---|---|
| Backgrounds | `app` · `surface` · `elevated` · `card` · `sidebar` · `preview` |
| Text | `text.primary` · `text.secondary` · `text.muted` · `text.disabled` |
| Brand | `brand.primary` · `brand.primaryHover` · `brand.primaryActive` · `brand.onPrimary` |
| Semantic | `success` · `warning` · `error` · `info` (+ `*-soft` tints) |
| Borders | `border.default` · `border.subtle` · `border.strong` |

Consume them **in JSX via Tailwind utilities** (preferred):

```tsx
<div className="bg-surface text-ink border border-edge-subtle" />
<span className="text-ink-muted" />
<button className="bg-brand text-brand-fg hover:bg-brand-hover" />
<Badge className="bg-success-soft text-success" />
```

…or **in JS/inline styles** via the accessor:

```ts
import { color } from "@/design";
element.style.background = color.bg.surface; // "var(--pp-color-surface)"
```

> ⚠️ Tailwind cannot apply an `/opacity` modifier to a plain `var()` color. For
> tints use the pre-mixed `*-soft` tokens (`bg-brand-soft`), and for focus rings use
> the solid `ring-brand`. Opacity modifiers on `white`/`black` are fine.

### Typography

Ready-to-use class strings — apply with `cn(typography.headingM, "text-ink")`.

`display · headingXl · headingL · headingM · headingS · body · bodySmall · caption · label · labelCaps · mono`

### Spacing

An 8-point (4px base) scale that lines up 1:1 with Tailwind's numeric spacing, so
`p-4` === 16px === `spacing[16]`. Use Tailwind utilities in JSX; use the `spacing`
constants only for inline styles or layout math.

### Radius · Shadows · Motion

- Radius: `rounded-sm|md|lg|xl|pill`.
- Shadows: `shadow-e-sm|e-md|e-lg|floating|dialog`.
- Motion: `duration-fast|medium|slow` + `ease-standard|decelerate|accelerate`, or the
  `transition(props, duration, easing)` helper for inline styles.

### Layout & breakpoints

`layout.*` centralizes widths/heights (sidebar, settings panel, toolbar, controls,
split range). Breakpoints are mirrored into Tailwind `screens`: `laptop:` `desktop:`
`ultrawide:`. **No layout uses these yet** — they're ready for Phase 2.

---

## 3. Theme architecture

- The **dark** theme lives on `:root` in `tokens.css` and is what ships today.
- The **light** theme is defined under `:root[data-theme="light"]` — fully prepared,
  **not activated**.
- `applyTheme("light" | "dark" | "system")` stamps `data-theme` on `<html>`.
  Nothing calls it in Phase 1; a future Settings toggle will.

To add/adjust a themed value: edit the variable in `tokens.css` under both themes,
and mirror it in `themes/dark.ts` / `light.ts` (used by JS consumers like canvas).

---

## 4. Components

Import from `@/design` (or `@/design/components`). All support hover, focus-visible
rings, disabled, and keyboard/`aria` semantics.

| Component | Purpose |
|---|---|
| `Icon` | The one way to render a lucide icon — standard size, stroke, alignment, a11y. |
| `Button` / `PrimaryButton` / `SecondaryButton` / `GhostButton` | Variants: primary, secondary, ghost, outline, danger. `leadingIcon`, `loading`. |
| `IconButton` | Icon-only button; `label` is required for accessibility. |
| `AppCard` | Standard surface container (`elevated`, `padded`). |
| `Section` / `SectionHeader` | Titled block + header with optional actions/eyebrow. |
| `Input` / `NumberInput` / `SearchBox` | Text field, ± stepper (no native popup), search field. |
| `Select` | Styled native select. **Never wrap in `<label>`** (WebKitGTK dismisses the popup). |
| `Toggle` / `Checkbox` / `RadioGroup` | Single-element controls (no label re-fire). |
| `Divider` | Hairline separator, horizontal or vertical. |
| `Badge` / `Chip` | Status pill / selectable-removable token. |
| `Tooltip` | Portal-rendered; never clipped; opens on hover + focus. |
| `ScrollableContainer` | Themed scroll region for flex columns. |
| `SettingsGroup` / `SettingRow` | Building blocks of a settings panel with inline help. |
| `EmptyState` | Icon + title + description + CTA. |
| `Skeleton` / `SkeletonText` (`LoadingSkeleton`) | Loading placeholders. |
| `StatusIndicator` | Colored status dot (online/offline/busy/idle/error). |

Example:

```tsx
import { SettingsGroup, SettingRow, Select, NumberInput, PrimaryButton } from "@/design";

<SettingsGroup title="Print Settings">
  <SettingRow label="Copies" info="How many copies to print.">
    <NumberInput label="Copies" value={copies} min={1} max={999} onChange={setCopies} />
  </SettingRow>
  <SettingRow label="Paper Size">
    <Select value={size} onChange={(e) => setSize(e.target.value)} aria-label="Paper size">…</Select>
  </SettingRow>
</SettingsGroup>
<PrimaryButton leadingIcon={Printer} onClick={print}>Print</PrimaryButton>
```

---

## 5. Naming conventions

- **Files/exports:** PascalCase components (`Button.tsx`), camelCase tokens (`spacing.ts`).
- **CSS variables:** `--pp-<category>-<name>` (`--pp-color-surface`, `--pp-shadow-lg`).
- **Tailwind color tokens:** surfaces (`surface`, `elevated`), text (`ink`, `ink-muted`),
  brand (`brand`, `brand-hover`, `brand-fg`, `brand-soft`), feedback (`success`,
  `success-soft`…), borders (`edge`, `edge-subtle`, `edge-strong`).
- **Props:** booleans read as adjectives (`elevated`, `padded`, `loading`, `disabled`);
  handlers are `on*`; every icon-only control takes a `label`.

---

## 6. Best practices

- ✅ Reach for a component first; a raw element only if none fits.
- ✅ Use semantic tokens (`bg-surface`, `text-ink-muted`), never raw hex.
- ✅ Keep the `<select>` / label rules in mind (see `Select`, `Checkbox`).
- ✅ Route all icons through `Icon`.
- ❌ No magic numbers — pull from `spacing`, `layout`, `radius`.
- ❌ No `/opacity` on `var()` colors — use `*-soft` tokens.
- ❌ Don't restyle a component inline to fight its variant — add/extend a variant.

---

## 7. Extending the system

1. **New token value** → add the `--pp-*` variable to `tokens.css` (both themes),
   map it in `tailwind.config.ts` if it needs a utility, and expose a typed accessor.
2. **New component** → add `src/design/components/<Name>.tsx`, consume tokens, support
   hover/focus/disabled + a11y, export it from `components/index.ts`.
3. **New theme** → add a `themes/<name>.ts` map + a `tokens.css` block; wire into
   `applyTheme`.
4. **New breakpoint/layout constant** → add to `breakpoints.ts` / `layout.ts` (and
   `tailwind.config` `screens` for breakpoints).

Keep tokens the single source of truth. If you find yourself typing a hex value or a
pixel literal inside a component, add a token instead.
