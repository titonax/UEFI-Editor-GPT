import type {
  AmiSingleFormSetNavigationReport,
  AmiSingleFormSetPage,
  Data,
  Form,
  Forms,
  Menu,
  RefPrompt,
  Suppression,
} from "./types";

function sameGuid(left?: string, right?: string) {
  return (
    (left ?? "").replace(/[{}\s]/g, "").toLowerCase() ===
    (right ?? "").replace(/[{}\s]/g, "").toLowerCase()
  );
}

function normalizedFormId(value: string) {
  const parsed = Number.parseInt(value);
  return Number.isNaN(parsed) ? value.toLowerCase() : String(parsed);
}

function formKey(formId: string, formSetGuid?: string) {
  return `${(formSetGuid ?? "").toLowerCase()}:${normalizedFormId(formId)}`;
}

function formMatches(form: Form, formId: string, formSetGuid?: string) {
  return (
    sameGuid(form.formSetGuid, formSetGuid) &&
    normalizedFormId(form.formId) === normalizedFormId(formId)
  );
}

function references(form: Form): RefPrompt[] {
  return form.children.filter((child): child is RefPrompt => child.type === "Ref");
}

function constantTrueSuppressionOffsets(suppressions: Suppression[]) {
  return new Set(
    suppressions
      .filter(
        (condition) =>
          (condition.kind ?? "SuppressIf") === "SuppressIf" &&
          condition.active &&
          condition.constant === true,
      )
      .map((condition) => condition.offset),
  );
}

function isConstantlySuppressed(reference: RefPrompt, hiddenOffsets: Set<string>) {
  return (reference.suppressIf ?? []).some((offset) => hiddenOffsets.has(offset));
}

function liveReferences(form: Form, hiddenOffsets: Set<string>) {
  return references(form).filter(
    (reference) => !isConstantlySuppressed(reference, hiddenOffsets),
  );
}

function matchingForms(forms: Forms, formId: string, formSetGuid?: string) {
  return forms.filter((form) => formMatches(form, formId, formSetGuid));
}

function uniqueOffsets(offsets: string[]) {
  return [...new Set(offsets)];
}

function registrationMap(registrations: Menu) {
  const mapped = new Map<string, { name: string; formId: string; offsets: string[] }>();
  for (const registration of registrations) {
    if (!registration.formSetGuid || registration.offset === null) continue;
    const key = formKey(registration.formId, registration.formSetGuid);
    const existing = mapped.get(key);
    if (existing) {
      existing.offsets.push(registration.offset);
    } else {
      mapped.set(key, {
        name: registration.name,
        formId: registration.formId,
        offsets: [registration.offset],
      });
    }
  }
  for (const registration of mapped.values()) {
    registration.offsets = uniqueOffsets(registration.offsets);
  }
  return mapped;
}

function parentMap(forms: Forms, formSetGuid: string, hiddenOffsets: Set<string>) {
  const parents = new Map<string, Set<string>>();
  for (const owner of forms.filter((form) => sameGuid(form.formSetGuid, formSetGuid))) {
    for (const reference of liveReferences(owner, hiddenOffsets)) {
      const targetGuid = reference.targetFormSetGuid ?? owner.formSetGuid;
      if (!sameGuid(targetGuid, formSetGuid)) continue;
      const key = formKey(reference.formId, formSetGuid);
      const entries = parents.get(key) ?? new Set<string>();
      entries.add(owner.formId);
      parents.set(key, entries);
    }
  }
  return parents;
}

function reachableFormKeys(
  forms: Forms,
  hub: Form,
  formSetGuid: string,
  hiddenOffsets: Set<string>,
) {
  const reachable = new Set<string>();
  const queue = [hub];
  while (queue.length > 0) {
    const owner = queue.shift();
    if (!owner) continue;
    const ownerKey = formKey(owner.formId, formSetGuid);
    if (reachable.has(ownerKey)) continue;
    reachable.add(ownerKey);
    for (const reference of liveReferences(owner, hiddenOffsets)) {
      const targetGuid = reference.targetFormSetGuid ?? owner.formSetGuid;
      if (!sameGuid(targetGuid, formSetGuid)) continue;
      const matches = matchingForms(forms, reference.formId, formSetGuid);
      if (matches.length === 1) queue.push(matches[0]);
    }
  }
  return reachable;
}

function unresolved(
  status: "not-applicable" | "unresolved" | "ambiguous",
  reason: string,
  formSetGuid?: string,
): AmiSingleFormSetNavigationReport {
  return {
    status,
    mechanism: "single-formset-ifr-hub",
    confidence: "unresolved",
    reason,
    formSetGuid,
    pages: [],
  };
}

export function inspectSingleFormSetNavigation(
  formSetRoots: Menu,
  forms: Forms,
  amitseRegistrations: Menu,
  knownHubFormId?: string,
  suppressions: Suppression[] = [],
): AmiSingleFormSetNavigationReport {
  const root = formSetRoots[0];
  if (formSetRoots.length !== 1 || !root?.formSetGuid) {
    return unresolved(
      "not-applicable",
      "This detector applies only when the extracted HII contains one unambiguous FormSet entry.",
    );
  }
  const formSetGuid = root.formSetGuid;
  const hubFormId = knownHubFormId ?? root.formId;
  const hubMatches = matchingForms(forms, hubFormId, formSetGuid);
  if (hubMatches.length !== 1) {
    return unresolved(
      hubMatches.length > 1 ? "ambiguous" : "unresolved",
      hubMatches.length > 1
        ? "The FormSet entry FormId resolves to more than one parsed Form."
        : "The FormSet entry Form could not be resolved in the IFR graph.",
      formSetGuid,
    );
  }

  const hub = hubMatches[0];
  const hiddenOffsets = constantTrueSuppressionOffsets(suppressions);
  const directReferences = liveReferences(hub, hiddenOffsets).filter((reference) =>
    sameGuid(reference.targetFormSetGuid ?? hub.formSetGuid, formSetGuid),
  );
  if (knownHubFormId === undefined && directReferences.length < 2) {
    return unresolved(
      "unresolved",
      "The single FormSet entry does not expose a multi-page direct Ref fan-out, so it is not classified as a tab hub.",
      formSetGuid,
    );
  }

  const directTargets = directReferences.map((reference) => ({
    reference,
    matches: matchingForms(forms, reference.formId, formSetGuid),
  }));
  const invalidTarget = directTargets.find(({ matches }) => matches.length !== 1);
  if (invalidTarget) {
    return unresolved(
      "ambiguous",
      invalidTarget.matches.length === 0
        ? `Direct hub Ref ${invalidTarget.reference.formId} has no target Form.`
        : `Direct hub Ref ${invalidTarget.reference.formId} has multiple target Forms.`,
      formSetGuid,
    );
  }
  const directKeys = directTargets.map(({ matches }) =>
    formKey(matches[0].formId, formSetGuid),
  );
  if (new Set(directKeys).size !== directKeys.length) {
    return unresolved(
      "ambiguous",
      "The FormSet entry contains duplicate direct Refs to the same Form, so tab identity is ambiguous.",
      formSetGuid,
    );
  }

  const registrations = registrationMap(
    amitseRegistrations.filter((entry) => sameGuid(entry.formSetGuid, formSetGuid)),
  );
  const parents = parentMap(forms, formSetGuid, hiddenOffsets);
  const reachable = reachableFormKeys(forms, hub, formSetGuid, hiddenOffsets);
  const suppressedReferences = new Map<
    string,
    { owner: Form; reference: RefPrompt; suppressionOffset: string }[]
  >();
  for (const owner of forms.filter((form) => sameGuid(form.formSetGuid, formSetGuid))) {
    for (const reference of references(owner)) {
      const suppressionOffset = (reference.suppressIf ?? []).find((offset) =>
        hiddenOffsets.has(offset),
      );
      if (!suppressionOffset) continue;
      const targetGuid = reference.targetFormSetGuid ?? owner.formSetGuid;
      if (!sameGuid(targetGuid, formSetGuid)) continue;
      const key = formKey(reference.formId, formSetGuid);
      const entries = suppressedReferences.get(key) ?? [];
      entries.push({ owner, reference, suppressionOffset });
      suppressedReferences.set(key, entries);
    }
  }
  const directKeySet = new Set(directKeys);
  const pages: AmiSingleFormSetPage[] = [];
  const appendPage = (
    page: Form,
    role: AmiSingleFormSetPage["role"],
    displayName = page.name,
    ifrReferenceOffset?: string,
    parentFormIds?: string[],
    suppressionOffset?: string,
  ) => {
    const key = formKey(page.formId, formSetGuid);
    const registration = registrations.get(key);
    pages.push({
      name: displayName || page.name || `Form ${page.formId}`,
      formId: page.formId,
      formSetGuid,
      role,
      registeredInAmitse: registration !== undefined,
      registrationOffsets: registration?.offsets ?? [],
      ifrReferenceOffset,
      suppressionOffset,
      parentFormIds: parentFormIds ?? [...(parents.get(key) ?? [])],
    });
  };

  appendPage(hub, "hub", hub.name || root.name);
  for (const reference of references(hub)) {
    const targetGuid = reference.targetFormSetGuid ?? hub.formSetGuid;
    if (!sameGuid(targetGuid, formSetGuid)) continue;
    const direct = directTargets.find((target) => target.reference === reference);
    if (direct) {
      appendPage(
        direct.matches[0],
        "direct-tab",
        reference.name || direct.matches[0].name,
        reference.ifrOffset,
      );
      continue;
    }

    const matches = matchingForms(forms, reference.formId, formSetGuid);
    if (matches.length !== 1) continue;
    const key = formKey(matches[0].formId, formSetGuid);
    if (directKeySet.has(key)) continue;
    const suppressed = (suppressedReferences.get(key) ?? []).filter(({ owner }) =>
      formMatches(owner, hub.formId, formSetGuid),
    );
    const current = suppressed.find((entry) => entry.reference === reference);
    if (!current || suppressed.length !== 1) continue;
    appendPage(
      matches[0],
      "suppressed-tab",
      reference.name || matches[0].name,
      reference.ifrOffset,
      [hub.formId],
      current.suppressionOffset,
    );
  }

  const represented = new Set(pages.map((page) => formKey(page.formId, formSetGuid)));
  for (const [key, registration] of registrations) {
    if (represented.has(key)) continue;
    const matches = matchingForms(forms, registration.formId, formSetGuid);
    if (matches.length !== 1) continue;
    const suppressed = (suppressedReferences.get(key) ?? []).filter(
      ({ owner }) => !formMatches(owner, matches[0].formId, formSetGuid),
    );
    if (!reachable.has(key) && suppressed.length === 1) {
      const [{ owner, reference, suppressionOffset }] = suppressed;
      appendPage(
        matches[0],
        "suppressed-tab",
        registration.name || reference.name || matches[0].name,
        reference.ifrOffset,
        [owner.formId],
        suppressionOffset,
      );
      continue;
    }
    appendPage(
      matches[0],
      reachable.has(key) && !directKeySet.has(key) ? "descendant" : "registered-only",
      registration.name || matches[0].name,
    );
  }

  const tabs = pages.filter((page) => page.role === "direct-tab");
  const corroboratedTabs = tabs.filter((page) => page.registeredInAmitse).length;
  const registeredNonTabs = pages.filter(
    (page) => page.registeredInAmitse && page.role !== "direct-tab",
  ).length;
  const suppressedTabs = pages.filter((page) => page.role === "suppressed-tab").length;
  const confidence =
    tabs.length > 0 && corroboratedTabs === tabs.length ? "corroborated" : "ifr-only";
  return {
    status: "detected",
    mechanism: "single-formset-ifr-hub",
    confidence,
    reason: `The FormSet entry ${hub.name || hub.formId} (${hub.formId}) is the IFR navigation hub: ${String(tabs.length)} direct Ref${tabs.length === 1 ? "" : "s"} define the current top-level tabs${suppressedTabs > 0 ? `, and ${String(suppressedTabs)} hub Ref${suppressedTabs === 1 ? " is" : "s are"} inside constant-true SuppressIf scopes` : ""}. AMITSE corroborates ${String(corroboratedTabs)} current tab${corroboratedTabs === 1 ? "" : "s"}; ${String(registeredNonTabs)} registered page${registeredNonTabs === 1 ? " is" : "s are"} not a current tab, and registration alone is not treated as tab visibility.`,
    formSetGuid,
    hubFormId: hub.formId,
    hubName: hub.name || root.name,
    pages,
  };
}

export function singleFormSetHubMenu(report: AmiSingleFormSetNavigationReport): Menu {
  if (report.status !== "detected" || !report.formSetGuid || !report.hubFormId) {
    return [];
  }
  return [
    {
      name: report.hubName ?? `Form ${report.hubFormId}`,
      formId: report.hubFormId,
      offset: null,
      formSetGuid: report.formSetGuid,
      source: "ifr-hub",
    },
  ];
}

function registrationsFromReport(
  report: AmiSingleFormSetNavigationReport | undefined,
): Menu {
  if (!report) return [];
  return report.pages.flatMap((page) =>
    page.registrationOffsets.map((offset) => ({
      name: page.name,
      formId: page.formId,
      offset,
      formSetGuid: page.formSetGuid,
      source: "amitse" as const,
    })),
  );
}

function preserveKnownPageOrder(
  report: AmiSingleFormSetNavigationReport,
  evidence: AmiSingleFormSetNavigationReport,
) {
  if (report.status !== "detected" || evidence.status !== "detected") return;
  const previousOrder = new Map(
    evidence.pages.map((page, index) => [
      formKey(page.formId, page.formSetGuid),
      index,
    ]),
  );
  report.pages = report.pages
    .map((page, naturalIndex) => ({ page, naturalIndex }))
    .sort((left, right) => {
      const leftOrder = previousOrder.get(
        formKey(left.page.formId, left.page.formSetGuid),
      );
      const rightOrder = previousOrder.get(
        formKey(right.page.formId, right.page.formSetGuid),
      );
      if (leftOrder !== undefined && rightOrder !== undefined) {
        return leftOrder - rightOrder;
      }
      if (leftOrder !== undefined) return -1;
      if (rightOrder !== undefined) return 1;
      return left.naturalIndex - right.naturalIndex;
    })
    .map(({ page }) => page);
}

export function refreshSingleFormSetNavigation(
  data: Data,
  evidence: AmiSingleFormSetNavigationReport | undefined = data.singleFormSetNavigation,
) {
  if (!evidence || evidence.status === "not-applicable") return;
  const formSetRoots =
    data.formSetRoots ??
    (evidence.formSetGuid && evidence.hubFormId
      ? [
          {
            name: evidence.hubName ?? "Setup",
            formId: evidence.hubFormId,
            offset: null,
            formSetGuid: evidence.formSetGuid,
            source: "formset" as const,
          },
        ]
      : []);
  const report = inspectSingleFormSetNavigation(
    formSetRoots,
    data.forms,
    registrationsFromReport(evidence),
    evidence.status === "detected" ? evidence.hubFormId : undefined,
    data.suppressions,
  );
  preserveKnownPageOrder(report, evidence);
  data.singleFormSetNavigation = report;
  const menu = singleFormSetHubMenu(report);
  if (menu.length > 0) data.menu = menu;
}
