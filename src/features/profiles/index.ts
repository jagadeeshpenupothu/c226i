// Smart Print Profiles — public API.
export { profileManager, type CreateProfileInput, type ImportResult } from "./profileManager";
export { profileStore } from "./profileStore";
export { useProfiles, useUserProfiles } from "./hooks/useProfiles";
export { DEFAULT_PROFILES } from "./defaultProfiles";
export { resolveProfileApplication, type ProfileApplication, type CompatibilityWarning } from "./profileCompatibility";
export { evaluateWorkflow, type WorkflowSuggestion, type WorkflowContext } from "./workflowRules";
export { profileIcon, PROFILE_ICONS, PROFILE_ICON_KEYS } from "./profileIcons";
export { describeProfile } from "./profileTypes";
export type { PrintProfile, ProfileCategory, ProfileCapabilitySnapshot, ProfileExport } from "./profileTypes";

export { ProfileSelector } from "./components/ProfileSelector";
export { ProfileLibrary } from "./components/ProfileLibrary";
export { ProfileCard } from "./components/ProfileCard";
export { CompatibilityWarningsDialog } from "./components/CompatibilityWarningsDialog";
