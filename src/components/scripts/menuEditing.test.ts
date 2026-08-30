import { describe, expect, it } from "vitest";
import { firmwareData, form, prompt } from "../../test/fixtures";
import { bytesToHex } from "./hex";
import { analyzeIfrBinary, IFR_OPCODE } from "./ifrBinary";
import {
  analyzeMenuMoveDestinations,
  hydrateIfrBinary,
  moveMenuReference,
  replayIfrEdits,
} from "./menuEditing";

const guid = "AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE";
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

function ref3Opcode(formId: number, targetFormSetId: number) {
  return [
    IFR_OPCODE.REF,
    33,
    1,
    0,
    2,
    0,
    0x10,
    0,
    4,
    0,
    5,
    0,
    0,
    formId & 0xff,
    formId >>> 8,
    0,
    0,
    ...guidBytes(targetFormSetId),
  ];
}

function formsPackage(opcodes: number[]) {
  const length = opcodes.length + 4;
  return [length & 0xff, (length >>> 8) & 0xff, (length >>> 16) & 0xff, 2, ...opcodes];
}

function packageList(packages: number[][]) {
  const endPackage = [4, 0, 0, 0xdf];
  const length = 20 + packages.reduce((total, pkg) => total + pkg.length, 0) + 4;
  return new Uint8Array([
    ...new Array<number>(16).fill(0),
    length & 0xff,
    (length >>> 8) & 0xff,
    (length >>> 16) & 0xff,
    (length >>> 24) & 0xff,
    ...packages.flat(),
    ...endPackage,
  ]);
}

const formSetA = "00000001-0000-0000-0000-000000000000";
const formSetB = "00000002-0000-0000-0000-000000000000";

function crossPackageFixture(
  explicitFormSet = true,
  separateLists = false,
  sourceAfterDestination = false,
) {
  const reference = explicitFormSet ? ref3Opcode(3, 1) : refOpcode(3);
  const sourcePackage = formsPackage([
    ...formSetOpcode(1),
    ...formOpcode(1),
    ...reference,
    ...end,
    ...formOpcode(3),
    0x03,
    2,
    ...end,
    ...end,
  ]);
  const destinationPackage = formsPackage([
    ...formSetOpcode(2),
    ...formOpcode(2),
    0x03,
    2,
    ...end,
    ...end,
  ]);
  const orderedPackages = sourceAfterDestination
    ? [destinationPackage, sourcePackage]
    : [sourcePackage, destinationPackage];
  const bytes = separateLists
    ? new Uint8Array(orderedPackages.flatMap((pkg) => [...packageList([pkg])]))
    : packageList(orderedPackages);
  const model = analyzeIfrBinary(bytes);
  const spans = model.packages.flatMap((pkg) => pkg.opcodes);
  const sourceSpan = spans.find(
    (span) => span.formId === 1 && span.ownerFormSetGuid === formSetA,
  );
  const destinationSpan = spans.find(
    (span) => span.formId === 2 && span.ownerFormSetGuid === formSetB,
  );
  const targetSpan = spans.find(
    (span) => span.formId === 3 && span.ownerFormSetGuid === formSetA,
  );
  const referenceSpan = spans.find((span) => span.opcode === IFR_OPCODE.REF);
  if (!sourceSpan || !destinationSpan || !targetSpan || !referenceSpan) {
    throw new Error("Expected the cross-package fixture to parse.");
  }
  const offset = (value: number) => `0x${value.toString(16)}`;
  return {
    bytes,
    data: firmwareData({
      forms: [
        form({
          name: "Source A",
          formId: "0x1",
          formSetGuid: formSetA,
          formSetTitle: "FormSet A",
          ifrOffset: offset(sourceSpan.offset),
          children: [
            prompt({
              type: "Ref",
              name: "Hidden target",
              questionId: "0x10",
              formId: "0x3",
              targetFormSetGuid: explicitFormSet ? formSetA : undefined,
              ifrOffset: offset(referenceSpan.offset),
              pageId: null,
            }),
          ],
        }),
        form({
          name: "Destination B",
          formId: "0x2",
          formSetGuid: formSetB,
          formSetTitle: "FormSet B",
          ifrOffset: offset(destinationSpan.offset),
        }),
        form({
          name: "Target A",
          formId: "0x3",
          formSetGuid: formSetA,
          formSetTitle: "FormSet A",
          ifrOffset: offset(targetSpan.offset),
          referencedIn: ["0x1"],
        }),
      ],
    }),
  };
}

function setupPackage() {
  const opcodes = [
    IFR_OPCODE.FORM_SET,
    0x80 | 23,
    ...new Array<number>(16).fill(0),
    0,
    0,
    0,
    0,
    0,
    ...formOpcode(1),
    ...refOpcode(3),
    ...end,
    ...formOpcode(2),
    0x0a,
    0x82,
    0x46,
    2,
    ...end,
    0x03,
    2,
    ...end,
    ...formOpcode(3),
    0x03,
    2,
    ...end,
    ...end,
  ];
  const length = opcodes.length + 4;
  return new Uint8Array([
    length & 0xff,
    (length >>> 8) & 0xff,
    (length >>> 16) & 0xff,
    2,
    ...opcodes,
  ]);
}

function menuData() {
  const bytes = setupPackage();
  const suppressOffset = bytes.indexOf(0x0a, 45);
  return firmwareData({
    forms: [
      form({
        name: "Source",
        formId: "0x1",
        ifrOffset: "0x1B",
        formSetGuid: guid,
        children: [
          prompt({
            type: "Ref",
            name: "Target menu",
            questionId: "0x10",
            formId: "0x3",
            ifrOffset: "0x21",
            pageId: null,
          }),
        ],
      }),
      form({
        name: "Destination",
        formId: "0x2",
        ifrOffset: "0x32",
        formSetGuid: guid,
      }),
      form({
        name: "Target",
        formId: "0x3",
        ifrOffset: "0x42",
        formSetGuid: guid,
        referencedIn: ["0x1"],
      }),
    ],
    suppressions: [
      {
        offset: `0x${suppressOffset.toString(16)}`,
        start: `0x${(suppressOffset + 2).toString(16)}`,
        end: `0x${(suppressOffset + 4).toString(16)}`,
        active: true,
        kind: "SuppressIf",
      },
    ],
  });
}

describe("HII menu reference moves", () => {
  it("moves a direct Ref, remaps IFR offsets and can replay the edit", async () => {
    const original = setupPackage();
    const data = menuData();
    const oldSuppressionOffset = Number.parseInt(data.suppressions[0].offset, 16);
    const result = await moveMenuReference(data, bytesToHex(original), {
      sourceFormIndex: 0,
      referenceChildIndex: 0,
      destinationFormIndex: 1,
    });

    expect(result.forms[0].children).toHaveLength(0);
    expect(result.forms[1].children[0]).toMatchObject({
      type: "Ref",
      formId: "0x3",
    });
    expect(result.forms[2].referencedIn).toEqual(["0x2"]);
    expect(result.forms[0].ifrOffset).toBe("0x1B");
    expect(result.forms[1].ifrOffset).toBe("0x23");
    expect(result.forms[1].children[0]).toMatchObject({ ifrOffset: "0x31" });
    expect(result.forms[2].ifrOffset).toBe("0x42");
    expect(Number.parseInt(result.suppressions[0].offset, 16)).toBe(
      oldSuppressionOffset - 15,
    );
    expect(result.ifrEdits).toHaveLength(1);
    expect(replayIfrEdits(result, bytesToHex(original))).toHaveLength(original.length);
    expect(
      result.ifrBinary?.packages[0].opcodes.find(
        (span) => span.opcode === IFR_OPCODE.REF,
      ),
    ).toMatchObject({ ownerFormId: 2, formId: 3 });
    expect(data.forms[0].children).toHaveLength(1);
  });

  it("falls back to a unique FormId when text GUIDs do not match the binary", async () => {
    const data = menuData();
    for (const form of data.forms) delete form.ifrOffset;
    const reference = data.forms[0].children[0];
    if (reference.type !== "Ref") throw new Error("Expected a Ref fixture.");
    delete reference.ifrOffset;

    const result = await moveMenuReference(data, bytesToHex(setupPackage()), {
      sourceFormIndex: 0,
      referenceChildIndex: 0,
      destinationFormIndex: 1,
    });

    expect(result.forms[0].children).toHaveLength(0);
    expect(result.forms[1].children[0]).toMatchObject({ formId: "0x3" });
  });

  it("rejects destinations that create cycles or duplicate the target", async () => {
    const original = bytesToHex(setupPackage());
    const cycleData = menuData();
    await expect(
      moveMenuReference(cycleData, original, {
        sourceFormIndex: 0,
        referenceChildIndex: 0,
        destinationFormIndex: 2,
      }),
    ).rejects.toThrow(/cycle/);

    const duplicateData = menuData();
    duplicateData.forms[1].children.push(
      prompt({
        type: "Ref",
        questionId: "0x20",
        formId: "0x3",
        pageId: null,
      }),
    );
    await expect(
      moveMenuReference(duplicateData, original, {
        sourceFormIndex: 0,
        referenceChildIndex: 0,
        destinationFormIndex: 1,
      }),
    ).rejects.toThrow(/already contains/);
  });

  it("rejects a stored edit when the opened SCT no longer matches", async () => {
    const original = setupPackage();
    const result = await moveMenuReference(menuData(), bytesToHex(original), {
      sourceFormIndex: 0,
      referenceChildIndex: 0,
      destinationFormIndex: 1,
    });
    const changed = original.slice();
    const edit = result.ifrEdits?.[0];
    if (!edit) throw new Error("Expected the move to create an IFR edit.");
    changed[edit.sourceOffset] = 0xff;

    expect(() => hydrateIfrBinary(result, bytesToHex(changed))).toThrow(
      /precondition failed/,
    );
  });

  it("moves an existing Ref3 across FormSets and Forms Packages", async () => {
    const { bytes, data } = crossPackageFixture();
    const originalModel = analyzeIfrBinary(bytes);
    const originalLengths = originalModel.packages.map((pkg) => pkg.length);

    const destinations = analyzeMenuMoveDestinations(data, bytesToHex(bytes), 0, 0);
    expect(destinations[1]).toMatchObject({
      compatibility: "safe-cross-package",
    });

    const result = await moveMenuReference(data, bytesToHex(bytes), {
      sourceFormIndex: 0,
      referenceChildIndex: 0,
      destinationFormIndex: 1,
    });
    const replayed = replayIfrEdits(result, bytesToHex(bytes));
    const movedModel = analyzeIfrBinary(replayed);
    const movedReference = movedModel.packages
      .flatMap((pkg) => pkg.opcodes)
      .find((span) => span.opcode === IFR_OPCODE.REF);

    expect(replayed).toHaveLength(bytes.length);
    expect(movedModel.diagnostics).toEqual([]);
    expect(movedModel.packages.map((pkg) => pkg.length)).toEqual([
      originalLengths[0] - 33,
      originalLengths[1] + 33,
    ]);
    expect(movedReference).toMatchObject({
      ownerFormId: 2,
      ownerFormSetGuid: formSetB,
      formId: 3,
      targetFormSetGuid: formSetA,
    });
    expect(result.ifrEdits?.[0].containerPatches).toHaveLength(2);
    expect(result.forms[2].referencedIn).toEqual(["0x2"]);
  });

  it("classifies an implicit cross-FormSet Ref as requiring REF3", () => {
    const { bytes, data } = crossPackageFixture(false);
    const destinations = analyzeMenuMoveDestinations(data, bytesToHex(bytes), 0, 0);

    expect(destinations[1]).toMatchObject({
      compatibility: "requires-ref3",
    });
    expect(destinations[1].reason).toContain("REF3");
  });

  it("rebalances two distinct embedded HII Package Lists", async () => {
    const { bytes, data } = crossPackageFixture(true, true);
    const result = await moveMenuReference(data, bytesToHex(bytes), {
      sourceFormIndex: 0,
      referenceChildIndex: 0,
      destinationFormIndex: 1,
    });
    const replayed = replayIfrEdits(result, bytesToHex(bytes));
    const model = analyzeIfrBinary(replayed);

    expect(replayed).toHaveLength(bytes.length);
    expect(model.diagnostics).toEqual([]);
    expect(model.packages).toHaveLength(2);
    expect(model.packages.every((pkg) => pkg.packageListOffset !== null)).toBe(true);
    expect(model.packages[0].packageListOffset).toBe(0);
    expect(model.packages[1].packageListOffset).toBeGreaterThan(0);
    expect(result.ifrEdits?.[0].containerPatches).toHaveLength(4);
  });

  it("moves a cross-package Ref backward and rejects stale container headers", async () => {
    const { bytes, data } = crossPackageFixture(true, false, true);
    const result = await moveMenuReference(data, bytesToHex(bytes), {
      sourceFormIndex: 0,
      referenceChildIndex: 0,
      destinationFormIndex: 1,
    });
    const replayed = replayIfrEdits(result, bytesToHex(bytes));
    const movedReference = analyzeIfrBinary(replayed)
      .packages.flatMap((pkg) => pkg.opcodes)
      .find((span) => span.opcode === IFR_OPCODE.REF);

    expect(movedReference).toMatchObject({
      ownerFormId: 2,
      ownerFormSetGuid: formSetB,
      targetFormSetGuid: formSetA,
    });

    const stale = bytes.slice();
    const headerPatch = result.ifrEdits?.[0].containerPatches?.[0];
    if (!headerPatch) throw new Error("Expected a Forms Package length patch.");
    stale[headerPatch.offset] ^= 0x01;
    expect(() => replayIfrEdits(result, bytesToHex(stale))).toThrow(
      /container precondition failed/,
    );
  });
});
