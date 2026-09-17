import { decimalToHex as decToHexString } from "./hex";
import { discoverSetupDataMenu } from "./setupData";
import {
  inspectSingleFormSetNavigation,
  singleFormSetHubMenu,
} from "./singleFormSetNavigation";
import type { AmiSingleFormSetNavigationReport, Forms, Menu } from "./types";

export interface FormSetMetadata {
  guid: string;
  title: string;
}

export interface MenuDiscoveryInput {
  amitseSct: string;
  setupData: string;
  formSetIds: Set<string>;
  formSetMetadata: Map<string, FormSetMetadata>;
  formSetRoots: Menu;
  forms: Forms;
}

export interface MenuDiscoveryResult {
  menu: Menu;
  singleFormSetNavigation: AmiSingleFormSetNavigationReport;
}

export function discoverAmitseRegistrations({
  amitseSct,
  formSetIds,
  formSetMetadata,
  forms,
}: Pick<
  MenuDiscoveryInput,
  "amitseSct" | "formSetIds" | "formSetMetadata" | "forms"
>): Menu {
  const matches = [...formSetIds].flatMap((formSetId) =>
    [...amitseSct.matchAll(new RegExp(formSetId + "(.{4})", "gi"))].map((match) => ({
      match,
      formSetId,
    })),
  );
  return matches.flatMap(({ match, formSetId }) => {
    const hexEntry = decToHexString(
      parseInt(match[1].slice(2) + match[1].slice(0, 2), 16),
    );
    const formSet = formSetMetadata.get(formSetId);
    const matchedForm = forms.find(
      (form) =>
        form.formSetGuid?.toLowerCase() === formSet?.guid.toLowerCase() &&
        parseInt(form.formId) === parseInt(hexEntry),
    );
    if (!formSet || !matchedForm) {
      return [];
    }
    return [
      {
        name: matchedForm.name,
        formId: hexEntry,
        offset: decToHexString((match.index + formSetId.length) / 2),
        formSetGuid: formSet.guid,
        source: "amitse" as const,
      },
    ];
  });
}

export function analyzeMenuDiscovery(input: MenuDiscoveryInput): MenuDiscoveryResult {
  const { setupData, formSetRoots } = input;
  const discoveredMenu = discoverAmitseRegistrations(input);
  const singleFormSetNavigation = inspectSingleFormSetNavigation(
    formSetRoots,
    input.forms,
    discoveredMenu,
  );
  const hubMenu = singleFormSetHubMenu(singleFormSetNavigation);
  if (hubMenu.length > 0) {
    return { menu: hubMenu, singleFormSetNavigation };
  }

  const setupDataMenu = discoverSetupDataMenu(formSetRoots, setupData).map((entry) => {
    const executableEntry = discoveredMenu.find(
      (candidate) =>
        candidate.formSetGuid?.toLowerCase() === entry.formSetGuid?.toLowerCase(),
    );
    return {
      ...entry,
      offset: executableEntry?.offset ?? null,
    };
  });

  return {
    menu:
      setupDataMenu.length > 0
        ? setupDataMenu
        : discoveredMenu.length > 0
          ? discoveredMenu
          : formSetRoots,
    singleFormSetNavigation,
  };
}

export function discoverMenu(input: MenuDiscoveryInput): Menu {
  return analyzeMenuDiscovery(input).menu;
}
