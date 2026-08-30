import { describe, expect, it } from "vitest";
import { firmwareData, form, prompt } from "../../test/fixtures";
import { bytesToHex } from "./hex";
import { IFR_OPCODE } from "./ifrBinary";
import { hydrateIfrBinary, moveMenuReference, replayIfrEdits } from "./menuEditing";

const guid = "00000000-0000-0000-0000-000000000000";
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
        formSetGuid: guid,
        children: [
          prompt({
            type: "Ref",
            name: "Target menu",
            questionId: "0x10",
            formId: "0x3",
            pageId: null,
          }),
        ],
      }),
      form({ name: "Destination", formId: "0x2", formSetGuid: guid }),
      form({
        name: "Target",
        formId: "0x3",
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
});
