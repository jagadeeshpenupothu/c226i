import {
  Award,
  BookOpen,
  Briefcase,
  FileText,
  Grid3x3,
  Image,
  Layers,
  Palette,
  Sparkles,
  Tag,
  Zap,
  type LucideIcon
} from "lucide-react";

// Curated icon set for profiles. Profiles store the KEY (a string); the UI maps
// it to a component here so the model stays serializable.
export const PROFILE_ICONS: Record<string, LucideIcon> = {
  briefcase: Briefcase,
  zap: Zap,
  sparkles: Sparkles,
  image: Image,
  book: BookOpen,
  grid: Grid3x3,
  tag: Tag,
  award: Award,
  file: FileText,
  layers: Layers,
  palette: Palette
};

export const PROFILE_ICON_KEYS = Object.keys(PROFILE_ICONS);

export function profileIcon(key: string): LucideIcon {
  return PROFILE_ICONS[key] || FileText;
}
