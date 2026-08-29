import type {
  Data,
  Form,
  FormChildren,
  Suppression,
} from "../components/scripts/types";

export function prompt(overrides: Partial<FormChildren> = {}): FormChildren {
  return {
    name: "Option",
    description: "",
    type: "CheckBox",
    questionId: "0x1",
    varStoreId: "0x1",
    varStoreName: "Setup",
    varOffset: "0x0",
    flags: "0x0",
    accessLevel: null,
    failsafe: null,
    optimal: null,
    offsets: null,
    ...overrides,
  } as FormChildren;
}

export function form(overrides: Partial<Form> = {}): Form {
  return {
    name: "Main",
    type: "Form",
    formId: "0x1",
    formSetGuid: "AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA",
    formSetTitle: "Setup",
    referencedIn: [],
    children: [],
    ...overrides,
  };
}

export function condition(overrides: Partial<Suppression> = {}): Suppression {
  return {
    offset: "0x0",
    active: true,
    start: "0x0",
    end: "0x2",
    kind: "SuppressIf",
    constant: null,
    source: "setup",
    ...overrides,
  };
}

export function firmwareData(overrides: Partial<Data> = {}): Data {
  return {
    firmwareFamily: "aptio-v",
    menu: [],
    forms: [form()],
    varStores: [],
    suppressions: [],
    version: "0.4.0",
    hashes: {
      setupTxt: "txt",
      setupSct: "sct",
      amitseSct: "amitse",
      setupdataBin: "setupdata",
      offsetChecksum: "offsets",
    },
    ...overrides,
  };
}
