// Conflict resolution — architecture only.
//
// Per the phase spec, NO resolution logic is implemented yet. This file defines
// the strategy set, the conflict/outcome shapes, the resolver interface, and a
// skeleton resolver whose every branch is a defined extension point. Because
// local is always the source of truth (local-first), the default outcome is
// "deferred" — nothing is ever silently discarded.

export type ConflictStrategy =
  | "lastWriteWins" // keep the newer write (by timestamp)
  | "manualMerge" // field-level three-way merge
  | "userPrompt" // ask the user which version to keep
  | "versionComparison"; // compare version vectors; fast-forward if one dominates

export interface Conflict {
  entity: string;
  entityId: string;
  local: unknown;
  remote: unknown;
  localVersion: number | null;
  remoteVersion: number | null;
  detectedAt: string; // ISO
}

export type ConflictOutcome =
  | { resolution: "useLocal"; value: unknown }
  | { resolution: "useRemote"; value: unknown }
  | { resolution: "merged"; value: unknown }
  | { resolution: "deferred" }; // needs user input / not auto-resolvable

export interface ConflictResolver {
  readonly strategy: ConflictStrategy;
  resolve(conflict: Conflict): Promise<ConflictOutcome>;
}

// Routes by strategy but implements no merge logic yet. Each branch documents
// what the real implementation will do in a later phase.
export class DefaultConflictResolver implements ConflictResolver {
  readonly strategy: ConflictStrategy;

  constructor(strategy: ConflictStrategy = "lastWriteWins") {
    this.strategy = strategy;
  }

  async resolve(): Promise<ConflictOutcome> {
    switch (this.strategy) {
      case "lastWriteWins":
        // TODO(phase 10): compare updatedAt timestamps, keep the newer write.
        return { resolution: "deferred" };
      case "versionComparison":
        // TODO(phase 10): compare version vectors; fast-forward when one strictly dominates.
        return { resolution: "deferred" };
      case "manualMerge":
        // TODO(phase 10): field-level three-way merge against a common ancestor.
        return { resolution: "deferred" };
      case "userPrompt":
        // TODO(phase 10): surface a resolution dialog and await the user's choice.
        return { resolution: "deferred" };
      default:
        return { resolution: "deferred" };
    }
  }
}
