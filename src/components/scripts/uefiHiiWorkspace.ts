import { extractIfrTextFromHii } from "./aptioIvExtractor";
import { parseIfrText, type ParsedIfrText } from "./ifrTextParser";
import type { Data, Form, Menu, Suppression } from "./types";
import type { UefiHiiInventory, UefiHiiModule } from "./uefiHiiDiscovery";

export interface UefiHiiWorkspaceModule {
  id: string;
  name: string;
  fileGuid: string;
  formSetGuids: string[];
  formCount: number;
  referenceCount: number;
  mirroredBufferIds: number[];
}

export interface UefiHiiWorkspace {
  data: Data;
  modules: UefiHiiWorkspaceModule[];
  warnings: string[];
}

export type UefiIfrTextExtractor = (bytes: Uint8Array) => Promise<string>;

function isSetupModule(module: UefiHiiModule) {
  return module.name.toLowerCase().includes("setup");
}

function selectWorkspaceModules(inventory: UefiHiiInventory) {
  const setupModules = inventory.modules.filter(isSetupModule);
  const candidates =
    setupModules.length > 0 ? setupModules : inventory.modules.slice(0, 1);
  const selected: UefiHiiModule[] = [];
  const skippedVariants: UefiHiiModule[] = [];
  const loadedFormSets = new Set<string>();
  for (const module of candidates) {
    const identities = module.formSetGuids.map((guid) => guid.toLowerCase());
    if (
      identities.length > 0 &&
      identities.every((identity) => loadedFormSets.has(identity))
    ) {
      skippedVariants.push(module);
      continue;
    }
    selected.push(module);
    for (const identity of identities) loadedFormSets.add(identity);
  }
  return { selected, skippedVariants };
}

function namespacedOffset(moduleId: string, offset?: string) {
  return offset ? `${moduleId}@${offset}` : offset;
}

function namespaceParsedModule(
  parsed: ParsedIfrText,
  module: UefiHiiModule,
): ParsedIfrText {
  const remapSuppression = (suppression: Suppression): Suppression => ({
    ...suppression,
    offset: namespacedOffset(module.id, suppression.offset) ?? suppression.offset,
    start: namespacedOffset(module.id, suppression.start) ?? suppression.start,
    end: namespacedOffset(module.id, suppression.end) ?? suppression.end,
  });
  const forms = parsed.forms.map<Form>((form) => ({
    ...form,
    ifrOffset: namespacedOffset(module.id, form.ifrOffset),
    sourceModuleId: module.id,
    sourceModuleName: module.name,
    children: form.children.map((child) => ({
      ...child,
      ...(child.type === "Ref"
        ? { ifrOffset: namespacedOffset(module.id, child.ifrOffset) }
        : {}),
      suppressIf: child.suppressIf?.map(
        (offset) => namespacedOffset(module.id, offset) ?? offset,
      ),
      conditions: child.conditions?.map(
        (offset) => namespacedOffset(module.id, offset) ?? offset,
      ),
    })),
  }));
  return {
    ...parsed,
    forms,
    formSetRoots: parsed.formSetRoots.map((root) => ({
      ...root,
      source: "uefi-hii" as const,
    })),
    suppressions: parsed.suppressions.map(remapSuppression),
  };
}

function formKey(formId: string, formSetGuid?: string) {
  return `${(formSetGuid ?? "").toLowerCase()}:${String(Number.parseInt(formId))}`;
}

function rebuildCrossModuleReferences(forms: Form[]) {
  const byIdentity = new Map<string, Form[]>();
  for (const form of forms) {
    form.referencedIn = [];
    const key = formKey(form.formId, form.formSetGuid);
    byIdentity.set(key, [...(byIdentity.get(key) ?? []), form]);
  }
  for (const source of forms) {
    for (const child of source.children) {
      if (child.type !== "Ref") continue;
      const key = formKey(child.formId, child.targetFormSetGuid ?? source.formSetGuid);
      const targets = byIdentity.get(key) ?? [];
      if (targets.length !== 1) continue;
      if (!targets[0].referencedIn.includes(source.formId)) {
        targets[0].referencedIn.push(source.formId);
      }
    }
  }
}

function workspaceRoots(roots: Menu, forms: Form[]) {
  const seen = new Set<string>();
  return roots.filter((root) => {
    const key = formKey(root.formId, root.formSetGuid);
    if (seen.has(key)) return false;
    seen.add(key);
    const matching = forms.filter(
      (form) => formKey(form.formId, form.formSetGuid) === key,
    );
    return matching.length !== 1 || matching[0].referencedIn.length === 0;
  });
}

function moduleSummary(module: UefiHiiModule): UefiHiiWorkspaceModule {
  return {
    id: module.id,
    name: module.name,
    fileGuid: module.file.guid,
    formSetGuids: [...module.formSetGuids],
    formCount: module.formCount,
    referenceCount: module.referenceCount,
    mirroredBufferIds: [...module.duplicateBufferIds],
  };
}

/** Builds one read-only navigation graph from independently owned HII drivers. */
export async function buildUefiHiiWorkspace(
  inventory: UefiHiiInventory,
  extractText: UefiIfrTextExtractor = extractIfrTextFromHii,
): Promise<UefiHiiWorkspace> {
  const { selected: modules, skippedVariants } = selectWorkspaceModules(inventory);
  const parsedModules: ParsedIfrText[] = [];
  const accepted: UefiHiiModule[] = [];
  const warnings = [...inventory.decodeFailures];
  for (const variant of skippedVariants) {
    warnings.push(
      `${variant.name} was retained as an alternate module but not merged because its FormSet identity is already provided by a higher-ranked module.`,
    );
  }

  for (const module of modules) {
    try {
      parsedModules.push(
        namespaceParsedModule(
          parseIfrText(await extractText(module.bytes), ""),
          module,
        ),
      );
      accepted.push(module);
    } catch (reason) {
      warnings.push(
        `${module.name}: ${reason instanceof Error ? reason.message : String(reason)}`,
      );
    }
  }

  const forms = parsedModules.flatMap((parsed) => parsed.forms);
  rebuildCrossModuleReferences(forms);
  const roots = workspaceRoots(
    parsedModules.flatMap((parsed) => parsed.formSetRoots),
    forms,
  );

  return {
    data: {
      firmwareFamily: "uefi-hii",
      menu: roots,
      formSetRoots: roots,
      forms,
      varStores: parsedModules.flatMap((parsed) => parsed.varStores),
      suppressions: parsedModules.flatMap((parsed) => parsed.suppressions),
      version: "0.7.0",
      hashes: {
        setupTxt: "",
        setupSct: "",
        amitseSct: "",
        setupdataBin: "",
        offsetChecksum: "",
      },
    },
    modules: accepted.map(moduleSummary),
    warnings,
  };
}
