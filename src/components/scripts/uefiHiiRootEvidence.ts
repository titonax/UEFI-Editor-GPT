import type { Data } from "./types";

export interface UefiHiiRootEvidence {
  name: string;
  formId: string;
  formSetGuid?: string;
  formIndex: number | null;
  moduleName?: string;
  staticEntry: "no-incoming-ref" | "referenced" | "missing" | "ambiguous";
  incomingReferenceCount: number;
  runtimeRegistration: "unproven";
  runtimeVisibility: "unproven";
}

function identity(formId: string, guid?: string) {
  return `${(guid ?? "").toLowerCase()}:${String(Number.parseInt(formId))}`;
}

/** Read-only evidence from the current IFR graph; never enables root edits. */
export function analyzeUefiHiiRoots(data: Data): UefiHiiRootEvidence[] {
  if (data.firmwareFamily !== "uefi-hii") return [];
  const byIdentity = new Map<string, number[]>();
  data.forms.forEach((form, index) => {
    const key = identity(form.formId, form.formSetGuid);
    byIdentity.set(key, [...(byIdentity.get(key) ?? []), index]);
  });
  const incoming = new Map<string, number>();
  for (const form of data.forms) {
    for (const child of form.children) {
      if (child.type !== "Ref") continue;
      const key = identity(child.formId, child.targetFormSetGuid ?? form.formSetGuid);
      incoming.set(key, (incoming.get(key) ?? 0) + 1);
    }
  }
  const seen = new Set<string>();
  return (data.formSetRoots ?? data.menu).flatMap((root) => {
    const key = identity(root.formId, root.formSetGuid);
    if (seen.has(key)) return [];
    seen.add(key);
    const matches = byIdentity.get(key) ?? [];
    const formIndex = matches.length === 1 ? matches[0] : null;
    const incomingReferenceCount = incoming.get(key) ?? 0;
    return [
      {
        name: root.name,
        formId: root.formId,
        formSetGuid: root.formSetGuid,
        formIndex,
        moduleName:
          formIndex === null ? undefined : data.forms[formIndex].sourceModuleName,
        staticEntry:
          matches.length === 0
            ? "missing"
            : matches.length > 1
              ? "ambiguous"
              : incomingReferenceCount > 0
                ? "referenced"
                : "no-incoming-ref",
        incomingReferenceCount,
        runtimeRegistration: "unproven",
        runtimeVisibility: "unproven",
      },
    ];
  });
}
