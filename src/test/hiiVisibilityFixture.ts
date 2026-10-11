import { firmwareData, form, prompt } from "./fixtures";
import { analyzeIfrBinary, IFR_OPCODE } from "../components/scripts/ifrBinary";
const formSetA = "00000001-0000-0000-0000-000000000000";
const end = [IFR_OPCODE.END, 2];

function formOpcode(formId: number) {
  return [IFR_OPCODE.FORM, 0x86, formId & 0xff, formId >>> 8, 0, 0];
}

function refOpcode(formId: number, questionId = 0x10) {
  return [
    IFR_OPCODE.REF,
    15,
    1,
    0,
    2,
    0,
    questionId & 0xff,
    questionId >>> 8,
    4,
    0,
    5,
    0,
    0,
    formId & 0xff,
    formId >>> 8,
  ];
}

function guidBytes(id: number) {
  return [id, 0, 0, 0, ...new Array<number>(12).fill(0)];
}

function formSetOpcode(id: number) {
  return [IFR_OPCODE.FORM_SET, 0x80 | 23, ...guidBytes(id), 0, 0, 0, 0, 0];
}

function formsPackage(opcodes: number[]) {
  const length = opcodes.length + 4;
  return [length & 0xff, (length >>> 8) & 0xff, (length >>> 16) & 0xff, 2, ...opcodes];
}

export function hiiVisibilityFixture(interveningOpcode = false) {
  const opcodes = [
    ...formSetOpcode(1),
    ...formOpcode(1),
    ...refOpcode(3, 0x10),
    ...(interveningOpcode ? [0x03, 2] : []),
    ...refOpcode(5, 0x11),
    ...end,
    ...formOpcode(2),
    IFR_OPCODE.SUPPRESS_IF,
    0x82,
    IFR_OPCODE.TRUE,
    2,
    ...refOpcode(4, 0x20),
    ...end,
    ...end,
    ...formOpcode(3),
    0x03,
    2,
    ...end,
    ...formOpcode(4),
    0x03,
    2,
    ...end,
    ...formOpcode(5),
    0x03,
    2,
    ...end,
    ...end,
  ];
  const bytes = new Uint8Array(formsPackage(opcodes));
  const model = analyzeIfrBinary(bytes);
  const spans = model.packages[0].opcodes;
  const formSpans = (formId: number) =>
    spans.find((span) => span.opcode === IFR_OPCODE.FORM && span.formId === formId);
  const refs = spans.filter((span) => span.opcode === IFR_OPCODE.REF);
  const suppression = spans.find((span) => span.opcode === IFR_OPCODE.SUPPRESS_IF);
  const hubSpan = formSpans(1);
  const hostSpan = formSpans(2);
  const targetSpan = formSpans(3);
  const seedSpan = formSpans(4);
  const bootSpan = formSpans(5);
  if (
    !hubSpan ||
    !hostSpan ||
    !targetSpan ||
    !seedSpan ||
    !bootSpan ||
    !suppression ||
    refs.length !== 3 ||
    suppression.matchingEndOffset === null
  ) {
    throw new Error("Expected the tab visibility fixture to parse.");
  }
  const offset = (value: number) => `0x${value.toString(16)}`;
  const data = firmwareData({
    menu: [
      {
        name: "Setup",
        formId: "0x1",
        formSetGuid: formSetA,
        offset: null,
        source: "ifr-hub",
      },
    ],
    formSetRoots: [
      {
        name: "Setup",
        formId: "0x1",
        formSetGuid: formSetA,
        offset: null,
        source: "formset",
      },
    ],
    forms: [
      form({
        name: "Setup",
        formId: "0x1",
        formSetGuid: formSetA,
        ifrOffset: offset(hubSpan.offset),
        children: [
          prompt({
            type: "Ref",
            name: "Main",
            questionId: "0x10",
            formId: "0x3",
            ifrOffset: offset(refs[0].offset),
            pageId: null,
          }),
          prompt({
            type: "Ref",
            name: "Boot",
            questionId: "0x11",
            formId: "0x5",
            ifrOffset: offset(refs[1].offset),
            pageId: null,
          }),
        ],
      }),
      form({
        name: "Hidden host",
        formId: "0x2",
        formSetGuid: formSetA,
        ifrOffset: offset(hostSpan.offset),
        children: [
          prompt({
            type: "Ref",
            name: "Seed hidden page",
            questionId: "0x20",
            formId: "0x4",
            ifrOffset: offset(refs[2].offset),
            pageId: null,
            conditions: [offset(suppression.offset)],
            suppressIf: [offset(suppression.offset)],
          }),
        ],
      }),
      form({
        name: "Main",
        formId: "0x3",
        formSetGuid: formSetA,
        ifrOffset: offset(targetSpan.offset),
        referencedIn: ["0x1"],
      }),
      form({
        name: "Seed hidden page",
        formId: "0x4",
        formSetGuid: formSetA,
        ifrOffset: offset(seedSpan.offset),
        referencedIn: ["0x2"],
      }),
      form({
        name: "Boot",
        formId: "0x5",
        formSetGuid: formSetA,
        ifrOffset: offset(bootSpan.offset),
        referencedIn: ["0x1"],
      }),
    ],
    suppressions: [
      {
        offset: offset(suppression.offset),
        start: offset(suppression.end + 2),
        end: offset(suppression.matchingEndOffset),
        active: true,
        kind: "SuppressIf",
        expression: "True",
        constant: true,
        source: "constant",
        formSetGuid: formSetA,
      },
    ],
    ifrBinary: model,
    singleFormSetNavigation: {
      status: "detected",
      mechanism: "single-formset-ifr-hub",
      confidence: "corroborated",
      reason: "fixture",
      formSetGuid: formSetA,
      hubFormId: "0x1",
      hubName: "Setup",
      pages: [
        {
          name: "Setup",
          formId: "0x1",
          formSetGuid: formSetA,
          role: "hub",
          registeredInAmitse: true,
          registrationOffsets: ["0x100"],
          parentFormIds: [],
        },
        {
          name: "Main",
          formId: "0x3",
          formSetGuid: formSetA,
          role: "direct-tab",
          registeredInAmitse: true,
          registrationOffsets: ["0x120"],
          ifrReferenceOffset: offset(refs[0].offset),
          parentFormIds: ["0x1"],
        },
        {
          name: "Boot",
          formId: "0x5",
          formSetGuid: formSetA,
          role: "direct-tab",
          registeredInAmitse: true,
          registrationOffsets: ["0x140"],
          ifrReferenceOffset: offset(refs[1].offset),
          parentFormIds: ["0x1"],
        },
      ],
    },
  });
  return { bytes, data };
}
