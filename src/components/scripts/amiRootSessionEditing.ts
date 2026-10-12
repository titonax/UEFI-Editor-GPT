import { inspectAmiRootVisibility } from "./amiRootVisibility";
import {
  desiredAmiRootVisibility,
  toggleAmiRootVisibility,
} from "./amiRootVisibilityEditing";
import { planAmiRootVisibilityPatches } from "./amiRootVisibilityPatcher";
import type { FirmwareProvenanceGraph } from "./firmwareProvenance";
import type { Data } from "./types";

export interface AmiRootSessionChange {
  rootIndex: number;
  visible: boolean;
}
function invalid(message: string): never {
  throw new Error(`Queue session ${message}.`);
}
export function regenerateSessionAmiRoots(
  before: Data,
  base: Data,
  sourceBytes: Uint8Array,
  graph: FirmwareProvenanceGraph | undefined,
  changes: AmiRootSessionChange[],
) {
  if (!["aptio-v", "aptio-iv", "ami-aptio"].includes(before.firmwareFamily) || !graph)
    invalid("requires an opened AMI root provenance context");
  const roots = graph.buffers.filter((node) => node.id === graph.rootBufferId);
  if (
    roots.length !== 1 ||
    graph.sourceSize !== sourceBytes.length ||
    roots[0].bytes.length !== sourceBytes.length ||
    !roots[0].bytes.every((byte, index) => byte === sourceBytes[index]) ||
    graph.artifacts.filter((artifact) => artifact.kind === "setup-hii").length !== 1 ||
    new Set(graph.buffers.map((node) => node.id)).size !== graph.buffers.length
  )
    invalid("has missing, ambiguous or changed opened root provenance");
  const fresh = inspectAmiRootVisibility(base.formSetRoots ?? base.menu, graph);
  if (
    fresh.status !== "detected" ||
    JSON.stringify(fresh) !== JSON.stringify(base.rootVisibility) ||
    JSON.stringify(before.rootVisibility) !== JSON.stringify(fresh)
  )
    invalid("does not match freshly corroborated root visibility evidence");
  const next = structuredClone(before);
  for (const change of changes) {
    const matches = fresh.entries.filter(
      (entry) => entry.rootIndex === change.rootIndex,
    );
    if (matches.length !== 1) invalid("targets a missing or ambiguous root");
    if (desiredAmiRootVisibility(next, matches[0]) !== (change.visible ? 1 : 0))
      next.rootVisibilityEdits = toggleAmiRootVisibility(next, change.rootIndex);
  }
  // Check original bytes, edit ownership and the last-enabled-root guard. This
  // is planning only; acceptance, allocation and full-image verification gates
  // remain in the normal writer and cannot be restored from a session.
  planAmiRootVisibilityPatches(next.rootVisibilityEdits ?? [], fresh, graph);
  return next;
}
