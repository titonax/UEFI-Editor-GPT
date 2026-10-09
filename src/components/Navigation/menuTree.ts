import type {
  Data,
  RefPrompt,
  UefiHiiReferenceIdentity,
  VisibilityStatus,
} from "../scripts/types";
import {
  childVisibility,
  combineVisibility,
  visibilityLabel,
} from "../scripts/visibility";
import { desiredAmiRootVisibility } from "../scripts/amiRootVisibilityEditing";

export type ReachabilityStatus =
  "root" | "reachable" | "detached" | "external" | "unresolved" | "broken";

export type RootSource =
  "amitse" | "setupdata" | "hii-formset" | "ifr-navigation" | "inferred";

export interface MenuProfile {
  id: string;
  label: string;
  assessment: "probable-live" | "probable-fallback" | "unresolved";
  confidence: "high" | "medium" | "low";
  evidence: string[];
  roots: MenuTreeNode[];
}

export interface MenuTreeNode {
  key: string;
  label: string;
  formName: string;
  formId: string;
  formIndex: number | null;
  children: MenuTreeNode[];
  cycle?: boolean;
  missing?: boolean;
  external?: boolean;
  status: VisibilityStatus;
  statusLabel: string;
  reachability: ReachabilityStatus;
  reachabilityLabel: string;
  rootSource?: RootSource;
  hardwareDependent: boolean;
  accessDependent: boolean;
  uiStateDependent: boolean;
  pageMask?: string;
  profileId?: string;
  profileLabel?: string;
  profileAssessment?: MenuProfile["assessment"];
  incomingReferenceCount: number;
  outgoingReferenceCount: number;
  parentageLabel: string;
  conditionSummary?: string;
  rootVisibilityOriginal?: 0 | 1;
  rootVisibilityDesired?: 0 | 1;
  rootVisibilityPending?: boolean;
  visibilityPending?: "hide";
  parentFormIndex?: number;
  referenceChildIndex?: number;
}

export interface MenuTree {
  roots: MenuTreeNode[];
  profiles: MenuProfile[];
  orphans: MenuTreeNode[];
  expandableKeys: string[];
  firstKeyByFormIndex: Map<number, string>;
  signature: string;
}

function normalizedFormId(formId: string) {
  const parsed = parseInt(formId);
  return Number.isNaN(parsed) ? formId : String(parsed);
}

function sameGuid(left?: string, right?: string) {
  return (left ?? "").toLowerCase() === (right ?? "").toLowerCase();
}

interface ProjectedReference {
  reference: RefPrompt;
  ownerFormIndex: number;
  referenceChildIndex: number;
  visibilityPending?: "hide";
}

function referenceIdentityKey(identity: UefiHiiReferenceIdentity) {
  return [
    identity.sourceModuleId ?? "",
    normalizedFormId(identity.questionId),
    normalizedFormId(identity.targetFormId),
    (identity.targetFormSetGuid ?? "").toLowerCase(),
  ].join("|");
}

function referenceIdentity(
  data: Data,
  ownerFormIndex: number,
  reference: RefPrompt,
): UefiHiiReferenceIdentity {
  const owner = data.forms[ownerFormIndex];
  const targetGuid = reference.targetFormSetGuid ?? owner?.formSetGuid;
  const target = data.forms.find(
    (form) =>
      normalizedFormId(form.formId) === normalizedFormId(reference.formId) &&
      sameGuid(form.formSetGuid, targetGuid),
  );
  return {
    sourceModuleId: target?.sourceModuleId,
    questionId: reference.questionId,
    targetFormId: reference.formId,
    targetFormSetGuid: targetGuid,
  };
}

function projectedReferences(data: Data) {
  const result = new Map<number, ProjectedReference[]>();
  const physical: ProjectedReference[] = [];
  for (const [ownerFormIndex, owner] of data.forms.entries()) {
    for (const [referenceChildIndex, child] of owner.children.entries()) {
      if (child.type !== "Ref") continue;
      physical.push({ reference: child, ownerFormIndex, referenceChildIndex });
    }
  }

  const pending = (data.uefiHiiVisibilityEdits ?? []).flatMap((edit) => {
    const key = referenceIdentityKey(edit.reference);
    const location = physical.find(
      (candidate) =>
        referenceIdentityKey(
          referenceIdentity(data, candidate.ownerFormIndex, candidate.reference),
        ) === key,
    );
    const originalParentIndex = findFormIndex(
      data,
      edit.originalParentFormId,
      edit.originalParentFormSetGuid,
    );
    return location && originalParentIndex >= 0
      ? [{ ...location, edit, originalParentIndex, key }]
      : [];
  });
  const pendingKeys = new Set(pending.map((item) => item.key));

  for (const location of physical) {
    const key = referenceIdentityKey(
      referenceIdentity(data, location.ownerFormIndex, location.reference),
    );
    if (pendingKeys.has(key)) continue;
    const list = result.get(location.ownerFormIndex) ?? [];
    list.push(location);
    result.set(location.ownerFormIndex, list);
  }

  const remaining = [...pending];
  while (remaining.length > 0) {
    let inserted = false;
    for (let index = remaining.length - 1; index >= 0; index -= 1) {
      const item = remaining[index];
      if (!item) continue;
      const list = result.get(item.originalParentIndex) ?? [];
      const nextKey = item.edit.nextSibling
        ? referenceIdentityKey(item.edit.nextSibling)
        : undefined;
      const nextIndex = nextKey
        ? list.findIndex(
            (candidate) =>
              referenceIdentityKey(
                referenceIdentity(data, candidate.ownerFormIndex, candidate.reference),
              ) === nextKey,
          )
        : list.length;
      if (nextKey && nextIndex < 0) continue;
      list.splice(nextIndex, 0, { ...item, visibilityPending: "hide" });
      result.set(item.originalParentIndex, list);
      remaining.splice(index, 1);
      inserted = true;
    }
    if (inserted) continue;
    for (const item of remaining.splice(0)) {
      const list = result.get(item.originalParentIndex) ?? [];
      list.push({ ...item, visibilityPending: "hide" });
      result.set(item.originalParentIndex, list);
    }
  }
  return result;
}

function formDisplayName(form: Data["forms"][number]) {
  if (form.name.trim().length > 0) return form.name;
  if (form.formSetTitle?.trim().length) return form.formSetTitle;
  return `Form ${form.formId}`;
}

function findFormIndex(data: Data, formId: string, formSetGuid?: string) {
  const normalized = normalizedFormId(formId);
  if (formSetGuid) {
    return data.forms.findIndex(
      (form) =>
        sameGuid(form.formSetGuid, formSetGuid) &&
        normalizedFormId(form.formId) === normalized,
    );
  }

  const candidates = data.forms
    .map((form, index) => ({ form, index }))
    .filter(({ form }) => normalizedFormId(form.formId) === normalized);
  return candidates.length === 1 ? (candidates[0]?.index ?? -1) : -1;
}

function rootVisibilityEntry(data: Data, root: Data["menu"][number]) {
  const report = data.rootVisibility;
  if (report?.status !== "detected") return undefined;
  if (root.formSetGuid) {
    return report.entries.find((entry) =>
      sameGuid(entry.formSetGuid, root.formSetGuid),
    );
  }
  const matches = report.entries.filter(
    (entry) =>
      normalizedFormId(entry.formId) === normalizedFormId(root.formId) &&
      entry.name === root.name,
  );
  return matches.length === 1 ? matches[0] : undefined;
}

function conditionDescriptions(visibility: ReturnType<typeof childVisibility>) {
  return visibility.conditions
    .filter((condition) => condition.active && condition.constant !== false)
    .map((condition) => {
      const kind = condition.kind ?? "SuppressIf";
      return `${kind}: ${condition.expression ?? `condition at ${condition.offset}`}`;
    });
}

function inheritedStatusLabel(
  status: VisibilityStatus,
  directStatus: VisibilityStatus,
  directLabel: string,
) {
  if (status === directStatus) {
    return directLabel;
  }

  if (status === "hidden") {
    return "Hidden by parent gate";
  }

  if (status === "conditional") {
    return "Unavailable by parent gate";
  }

  return visibilityLabel(status);
}

function canonicalMenuRole(label: string) {
  const normalized = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  if (normalized.includes("advanced")) return "advanced";
  if (normalized.includes("security")) return "security";
  if (normalized.includes("boot")) return "boot";
  if (normalized.includes("chipset")) return "chipset";
  if (normalized.includes("sysinfo") || normalized.includes("system info")) {
    return "sysinfo";
  }
  if (normalized.includes("main")) return "main";
  if (normalized.includes("exit")) return "exit";
  return normalized;
}

function inferMenuProfiles(
  roots: MenuTreeNode[],
  vendorNeutral = false,
): MenuProfile[] {
  if (roots.length === 0) {
    return [];
  }

  if (vendorNeutral) {
    const profile: MenuProfile = {
      id: "uefi-hii-module-graph",
      label: "UEFI HII module graph",
      assessment: "unresolved",
      confidence: "high",
      evidence: [
        "Forms and Ref edges were decoded from standard HII packages across independently owned FFS modules.",
        "FormSet entries and static Ref reachability do not prove runtime registration or visibility.",
      ],
      roots,
    };
    function assignProfile(node: MenuTreeNode) {
      node.profileId = profile.id;
      node.profileLabel = profile.label;
      node.profileAssessment = profile.assessment;
      for (const child of node.children) assignProfile(child);
    }
    for (const root of roots) assignProfile(root);
    return [profile];
  }

  if (roots.length === 1 && roots[0].rootSource === "ifr-navigation") {
    const profile: MenuProfile = {
      id: "single-formset-ifr-navigation",
      label: "Single-FormSet IFR navigation",
      assessment: "unresolved",
      confidence: "high",
      evidence: [
        "The HII FormSet entry is the navigation hub. Its direct IFR Ref opcodes define the current top-level tabs; AMITSE registration is supporting evidence only.",
      ],
      roots,
    };
    function assignProfile(node: MenuTreeNode) {
      node.profileId = profile.id;
      node.profileLabel = profile.label;
      node.profileAssessment = profile.assessment;
      for (const child of node.children) assignProfile(child);
    }
    assignProfile(roots[0]);
    return [profile];
  }

  const groups: MenuTreeNode[][] = [];
  let current: MenuTreeNode[] = [];
  let seenRoles = new Set<string>();
  let previousRole = "";

  for (const root of roots) {
    const role = canonicalMenuRole(root.label);
    const startsAfterExit =
      previousRole === "exit" &&
      (role === "main" || role === "sysinfo") &&
      (seenRoles.has("main") || seenRoles.has("sysinfo"));
    const restartsKnownSequence =
      current.length >= 3 &&
      seenRoles.has(role) &&
      ["advanced", "security", "boot"].includes(role);
    if (current.length > 0 && (startsAfterExit || restartsKnownSequence)) {
      groups.push(current);
      current = [];
      seenRoles = new Set<string>();
    }
    current.push(root);
    seenRoles.add(role);
    previousRole = role;
  }
  groups.push(current);

  const hasGenericGroup = groups.some((group) => {
    const roles = new Set(group.map((root) => canonicalMenuRole(root.label)));
    return roles.has("main") && roles.has("chipset") && roles.has("exit");
  });
  const hasSetupDataEvidence = roots.every(
    (root) => root.rootSource === "setupdata" && root.pageMask !== undefined,
  );

  return groups.map((group, index) => {
    const roles = new Set(group.map((root) => canonicalMenuRole(root.label)));
    const rawLabels = group.map((root) => root.label.toLowerCase());
    const generic =
      roles.has("main") &&
      roles.has("chipset") &&
      rawLabels.some((label) => label.includes("save") && label.includes("exit"));
    const vendorLayout =
      roles.has("file") && roles.has("storage") && roles.has("power");
    const oem =
      (roles.has("sysinfo") || vendorLayout) && hasGenericGroup && groups.length > 1;
    const assessment: MenuProfile["assessment"] = oem
      ? "probable-live"
      : generic && groups.length > 1
        ? "probable-fallback"
        : "unresolved";
    const label = oem
      ? "OEM menu profile · probable live"
      : generic && groups.length > 1
        ? "AMI full profile · probable fallback"
        : groups.length > 1
          ? `Alternate menu profile ${String(index + 1)}`
          : "Menu profile";
    const evidence = [
      hasSetupDataEvidence
        ? `${String(group.length)} contiguous pages are registered in the AMITSE SetupData page list.`
        : `${String(group.length)} HII entry forms occur as a coherent menu sequence.`,
    ];
    if (generic) {
      evidence.push(
        "The Main/Advanced/Chipset/Boot/Security/Save & Exit sequence matches the standard full AMI layout.",
      );
    }
    if (oem) {
      evidence.push(
        vendorLayout
          ? "The File/Storage/Security/Power/Advanced sequence uses vendor-oriented pages, indicating an OEM layout."
          : "The SysInfo/Advanced/Security/Boot/Exit sequence restarts the major tabs and uses vendor-oriented pages, indicating an OEM layout.",
      );
    }
    if (assessment !== "unresolved") {
      evidence.push(
        "Profile membership is proven by SetupData; probable live/fallback status is inferred from the menu roles because runtime profile selection is not an IFR relationship.",
      );
    }
    const profile: MenuProfile = {
      id: `profile-${String(index + 1)}`,
      label,
      assessment,
      confidence:
        assessment === "unresolved" && hasSetupDataEvidence ? "high" : "medium",
      evidence,
      roots: group,
    };
    function assignProfile(node: MenuTreeNode) {
      node.profileId = profile.id;
      node.profileLabel = profile.label;
      node.profileAssessment = profile.assessment;
      for (const child of node.children) {
        assignProfile(child);
      }
    }
    for (const root of group) {
      assignProfile(root);
      if (root.rootSource === "setupdata") {
        root.reachabilityLabel =
          assessment === "probable-live"
            ? "Probable live SetupData root"
            : assessment === "probable-fallback"
              ? "Probable fallback SetupData root"
              : "AMITSE SetupData page";
      }
    }
    return profile;
  });
}

export function buildMenuTree(data: Data): MenuTree {
  const reachable = new Set<number>();
  const expandableKeys: string[] = [];
  const firstKeyByFormIndex = new Map<number, string>();
  const loadedFormSetGuids = new Set(
    data.forms.flatMap((form) =>
      form.formSetGuid ? [form.formSetGuid.toLowerCase()] : [],
    ),
  );
  const referencesByForm = projectedReferences(data);

  function buildFormNode(
    formIndex: number,
    key: string,
    label: string,
    ancestors: Set<number>,
    inheritedStatus: VisibilityStatus,
    reachability: ReachabilityStatus,
    conditionPath: string[] = [],
    hardwareDependent = false,
    accessDependent = false,
    uiStateDependent = false,
    statusLabel = visibilityLabel(inheritedStatus),
    reachabilityLabel = reachability === "detached"
      ? "Detached descendant"
      : "Reachable from menu",
    rootSource?: RootSource,
    pageMask?: string,
    parentageLabel = "No incoming IFR reference was found.",
    parentFormIndex?: number,
    referenceChildIndex?: number,
  ): MenuTreeNode {
    const form = data.forms[formIndex];
    const cycle = ancestors.has(formIndex);
    reachable.add(formIndex);

    if (!firstKeyByFormIndex.has(formIndex)) {
      firstKeyByFormIndex.set(formIndex, key);
    }

    const nextAncestors = new Set(ancestors);
    nextAncestors.add(formIndex);

    const children = cycle
      ? []
      : (referencesByForm.get(formIndex) ?? []).map((projected): MenuTreeNode => {
          const reference = projected.reference;
          const childIndex = projected.referenceChildIndex;
          const targetFormSetGuid = reference.targetFormSetGuid ?? form.formSetGuid;
          const targetIndex = findFormIndex(data, reference.formId, targetFormSetGuid);
          const childKey = `${key}/ref-${String(projected.ownerFormIndex)}-${String(
            childIndex,
          )}-${normalizedFormId(reference.formId)}`;
          const visibility = childVisibility(data, reference);
          const descriptions = conditionDescriptions(visibility);
          const nextConditionPath = [...conditionPath, ...descriptions];
          const nextHardwareDependent =
            hardwareDependent || visibility.hardwareDependent;
          const nextAccessDependent = accessDependent || visibility.accessDependent;
          const nextUiStateDependent = uiStateDependent || visibility.uiStateDependent;

          if (targetIndex < 0) {
            const external = Boolean(
              reference.targetFormSetGuid &&
              !loadedFormSetGuids.has(reference.targetFormSetGuid.toLowerCase()),
            );
            return {
              key: childKey,
              label:
                reference.name.length > 0
                  ? reference.name
                  : `Missing form ${reference.formId}`,
              formName: external
                ? "Referenced FormSet is not loaded"
                : "Referenced form was not found",
              formId: reference.formId,
              formIndex: null,
              children: [],
              missing: true,
              external,
              status: "unknown",
              statusLabel: external
                ? "Requires an external HII package"
                : "Target absent from static Setup HII",
              reachability: external ? "external" : "unresolved",
              reachabilityLabel: external
                ? "External HII FormSet"
                : "Unresolved Ref target",
              hardwareDependent: nextHardwareDependent,
              accessDependent: nextAccessDependent,
              uiStateDependent: nextUiStateDependent,
              incomingReferenceCount: 1,
              outgoingReferenceCount: 0,
              parentageLabel: external
                ? `Referenced by ${form.name || form.formId}; target FormSet ${reference.targetFormSetGuid ?? ""} is not part of the extracted Setup HII and may be registered by another firmware driver.`
                : `Referenced by ${form.name || form.formId}, but the target is absent from the extracted Setup HII. It may be created at runtime, intentionally unreachable under this build, or invalid.`,
              conditionSummary:
                nextConditionPath.join("; ") ||
                (external
                  ? "The Ref names a different FormSet that is not present in the extracted Setup package."
                  : "The static package does not contain the Ref target; runtime firmware behavior is required to distinguish a dynamic target from a defect."),
              parentFormIndex: projected.ownerFormIndex,
              referenceChildIndex: childIndex,
            };
          }

          const target = data.forms[targetIndex];
          const directStatus = projected.visibilityPending
            ? "hidden"
            : visibility.status;
          const status = combineVisibility(inheritedStatus, directStatus);
          const node = buildFormNode(
            targetIndex,
            childKey,
            reference.name.length > 0 ? reference.name : target.name,
            nextAncestors,
            status,
            reachability === "detached" ? "detached" : "reachable",
            nextConditionPath,
            nextHardwareDependent,
            nextAccessDependent,
            nextUiStateDependent,
            projected.visibilityPending
              ? "Pending: menu will be hidden"
              : inheritedStatusLabel(status, visibility.status, visibility.label),
            reachability === "detached"
              ? "Detached descendant"
              : "Reachable through Ref",
            undefined,
            undefined,
            projected.visibilityPending
              ? `Hidden from ${form.name || form.formId} by a queued visibility operation; its Ref remains projected in the original menu position.`
              : `Referenced by ${form.name || form.formId} through an IFR Ref opcode.`,
            projected.ownerFormIndex,
            childIndex,
          );
          node.visibilityPending = projected.visibilityPending;
          return node;
        });

    if (children.length > 0) {
      expandableKeys.push(key);
    }

    return {
      key,
      label:
        label.length > 0
          ? label
          : form.name.length > 0
            ? form.name
            : `Form ${form.formId}`,
      formName: form.name,
      formId: form.formId,
      formIndex,
      children,
      cycle,
      status: inheritedStatus,
      statusLabel,
      reachability,
      reachabilityLabel,
      rootSource,
      hardwareDependent,
      accessDependent,
      uiStateDependent,
      pageMask,
      incomingReferenceCount: form.referencedIn.length,
      outgoingReferenceCount: form.children.filter((child) => child.type === "Ref")
        .length,
      parentageLabel,
      conditionSummary: conditionPath.length > 0 ? conditionPath.join("; ") : undefined,
      parentFormIndex,
      referenceChildIndex,
    };
  }

  const hasAmitseRoots = data.menu.some(
    (entry) =>
      entry.source === "setupdata" ||
      entry.source === "amitse" ||
      entry.offset !== null,
  );
  const rootEntries = hasAmitseRoots
    ? data.menu.filter(
        (entry) =>
          entry.source === "setupdata" ||
          entry.source === "amitse" ||
          entry.offset !== null,
      )
    : data.menu;

  const roots = rootEntries
    .map((entry, menuIndex): MenuTreeNode | null => {
      const formIndex = findFormIndex(data, entry.formId, entry.formSetGuid);
      const vectorEntry = rootVisibilityEntry(data, entry);
      const desiredRootState = vectorEntry
        ? desiredAmiRootVisibility(data, vectorEntry)
        : undefined;
      const rootStatePending =
        vectorEntry !== undefined && desiredRootState !== vectorEntry.value;
      const rootSource: RootSource =
        entry.source === "setupdata"
          ? "setupdata"
          : entry.source === "ifr-hub"
            ? "ifr-navigation"
            : entry.source === "amitse" || entry.offset !== null
              ? "amitse"
              : "hii-formset";
      const reachabilityLabel =
        rootSource === "setupdata"
          ? "AMITSE SetupData page"
          : rootSource === "ifr-navigation"
            ? "Single-FormSet IFR navigation hub"
            : rootSource === "amitse"
              ? "AMITSE executable root"
              : "HII FormSet entry";

      if (formIndex < 0) {
        return {
          key: `root-${String(menuIndex)}-${normalizedFormId(entry.formId)}`,
          label: entry.name || `Missing root ${entry.formId}`,
          formName: "Menu root target was not found",
          formId: entry.formId,
          formIndex: null,
          children: [],
          missing: true,
          status: "broken",
          statusLabel: visibilityLabel("broken"),
          reachability: "broken",
          reachabilityLabel: "Broken root target",
          rootSource,
          hardwareDependent: false,
          accessDependent: false,
          uiStateDependent: false,
          pageMask: entry.pageMask,
          incomingReferenceCount: 0,
          outgoingReferenceCount: 0,
          parentageLabel:
            rootSource === "hii-formset"
              ? "The structural FormSet entry target is missing."
              : "The registered menu root target is missing.",
          conditionSummary:
            "The menu entry points to a form that does not exist in the parsed HII graph.",
        };
      }

      const form = data.forms[formIndex];
      const node = buildFormNode(
        formIndex,
        `root-${String(menuIndex)}-${normalizedFormId(entry.formId)}`,
        entry.name.length > 0 ? entry.name : (form.formSetTitle ?? form.name),
        new Set(),
        desiredRootState === 0 ? "hidden" : "visible",
        "root",
        [],
        false,
        false,
        false,
        vectorEntry
          ? rootStatePending
            ? desiredRootState === 1
              ? "Pending: root will be visible"
              : "Pending: root will be hidden"
            : vectorEntry.value === 1
              ? "Visible in AMITSE root vector"
              : "Hidden by AMITSE root vector"
          : data.firmwareFamily === "uefi-hii"
            ? "No static IFR gate; runtime visibility unproven"
            : "No visibility gate",
        reachabilityLabel,
        rootSource,
        entry.pageMask,
        rootSource === "setupdata"
          ? `Registered as a top-level AMITSE SetupData page${entry.pageMask ? ` with selector ${entry.pageMask}` : ""}. It has ${String(form.referencedIn.length)} incoming and ${String(form.children.filter((child) => child.type === "Ref").length)} outgoing IFR Ref(s); its parent is the AMITSE menu profile, not another HII form.`
          : rootSource === "ifr-navigation"
            ? `Declared as the HII FormSet entry and proven as the navigation hub by ${String(form.children.filter((child) => child.type === "Ref").length)} direct IFR Ref(s). Those direct children, not every AMITSE registration, are the current top-level tabs.`
            : rootSource === "hii-formset"
              ? "First parsed form in its HII FormSet; runtime registration and visibility are unproven. No incoming static Ref is required for this structural graph entry."
              : "Registered as a top-level menu entry; it does not require an IFR Ref parent.",
      );
      if (vectorEntry) {
        node.rootVisibilityOriginal = vectorEntry.value;
        node.rootVisibilityDesired = desiredRootState;
        node.rootVisibilityPending = rootStatePending;
      }
      return node;
    })
    .filter((node): node is MenuTreeNode => node !== null);

  if (roots.length === 0) {
    for (const [formIndex, form] of data.forms.entries()) {
      if (form.referencedIn.length === 0 && !reachable.has(formIndex)) {
        roots.push(
          buildFormNode(
            formIndex,
            `root-fallback-${String(formIndex)}`,
            formDisplayName(form),
            new Set(),
            "visible",
            "root",
            [],
            false,
            false,
            false,
            "No visibility gate",
            "Inferred graph entry",
            "inferred",
            undefined,
            "Inferred as a root because no incoming IFR Ref was found.",
          ),
        );
      }
    }
  }

  const profiles = inferMenuProfiles(roots, data.firmwareFamily === "uefi-hii");

  const remaining = new Set(
    data.forms
      .map((_, formIndex) => formIndex)
      .filter((formIndex) => !reachable.has(formIndex)),
  );
  const incomingFromRemaining = new Map<number, number>();
  for (const formIndex of remaining) {
    incomingFromRemaining.set(formIndex, 0);
  }
  for (const formIndex of remaining) {
    const form = data.forms[formIndex];
    for (const child of form.children) {
      if (child.type !== "Ref") {
        continue;
      }
      const targetIndex = findFormIndex(
        data,
        child.formId,
        child.targetFormSetGuid ?? form.formSetGuid,
      );
      if (remaining.has(targetIndex)) {
        incomingFromRemaining.set(
          targetIndex,
          (incomingFromRemaining.get(targetIndex) ?? 0) + 1,
        );
      }
    }
  }

  const formSetRootIndices = new Set(
    (data.formSetRoots ?? data.menu.filter((entry) => entry.source === "formset"))
      .map((entry) => findFormIndex(data, entry.formId, entry.formSetGuid))
      .filter((formIndex) => formIndex >= 0),
  );
  const detachedCandidates = [
    ...[...remaining].filter((formIndex) => formSetRootIndices.has(formIndex)),
    ...[...remaining].filter(
      (formIndex) =>
        !formSetRootIndices.has(formIndex) &&
        (incomingFromRemaining.get(formIndex) ?? 0) === 0,
    ),
  ];

  const orphans: MenuTreeNode[] = [];
  function addDetachedRoot(formIndex: number, reason: string) {
    if (reachable.has(formIndex)) {
      return;
    }
    const form = data.forms[formIndex];
    orphans.push(
      buildFormNode(
        formIndex,
        `detached-${String(formIndex)}`,
        formDisplayName(form),
        new Set(),
        "visible",
        "detached",
        [],
        false,
        false,
        false,
        "No visibility gate",
        reason,
        undefined,
        undefined,
        reason,
      ),
    );
  }

  for (const formIndex of detachedCandidates) {
    addDetachedRoot(
      formIndex,
      formSetRootIndices.has(formIndex)
        ? data.firmwareFamily === "uefi-hii"
          ? "HII FormSet entry without a static path; runtime registration is unproven"
          : "HII FormSet entry not registered by the detected menu profile"
        : "Unreferenced form; it may be intentionally hidden or linked dynamically at runtime",
    );
  }

  for (const formIndex of remaining) {
    addDetachedRoot(
      formIndex,
      "Isolated HII subgraph; no static path from the detected menu roots was found",
    );
  }

  const signature = [
    ...roots.map((node) => node.key),
    ...orphans.map((node) => node.key),
    ...data.forms.map(
      (form) =>
        `${form.formSetGuid ?? ""}:${normalizedFormId(form.formId)}:${form.children
          .filter((child) => child.type === "Ref")
          .map(
            (child) =>
              `${child.targetFormSetGuid ?? form.formSetGuid ?? ""}:${normalizedFormId(child.formId)}`,
          )
          .join(",")}`,
    ),
  ].join("|");

  return {
    roots,
    profiles,
    orphans,
    expandableKeys,
    firstKeyByFormIndex,
    signature,
  };
}

export function findNodePath(nodes: MenuTreeNode[], formIndex: number): MenuTreeNode[] {
  for (const node of nodes) {
    if (node.formIndex === formIndex) {
      return [node];
    }

    const childPath = findNodePath(node.children, formIndex);
    if (childPath.length > 0) {
      return [node, ...childPath];
    }
  }

  return [];
}
