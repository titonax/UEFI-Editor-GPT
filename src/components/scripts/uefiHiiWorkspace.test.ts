import { describe, expect, it } from "vitest";
import type { UefiHiiInventory, UefiHiiModule } from "./uefiHiiDiscovery";
import { buildUefiHiiWorkspace } from "./uefiHiiWorkspace";

const firstGuid = "11111111-1111-1111-1111-111111111111";
const secondGuid = "22222222-2222-2222-2222-222222222222";

function module(
  id: string,
  name: string,
  marker: number,
  formSetGuid: string,
): UefiHiiModule {
  return {
    id,
    bufferId: marker,
    duplicateBufferIds: [],
    depth: 1,
    file: {
      bufferId: marker,
      guid: `${marker.toString().padStart(8, "0")}-0000-0000-0000-000000000000`,
      volumeStart: 0,
      volumeEnd: 1,
      fileStart: 0,
      bodyStart: 0,
      end: 1,
      headerSize: 24,
      depth: 1,
      fileType: 7,
      sectionTypes: [0x10, 0x15],
      uiNames: [name],
    },
    name,
    bytes: new Uint8Array([marker]),
    packages: [],
    formSetGuids: [formSetGuid],
    formCount: 1,
    referenceCount: marker === 1 ? 1 : 0,
  };
}

function ifrText(
  guid: string,
  formId: string,
  title: string,
  reference?: { guid: string; formId: string; name: string },
) {
  return [
    `0x0: FormSet Guid: ${guid}, Title: "${title}", Help: "" { 0E 97 }`,
    `0x10: Form FormId: ${formId}, Title: "${title}" { 01 86 01 00 01 00 }`,
    reference
      ? `0x20:\tRef Prompt: "${reference.name}", Help: "", QuestionFlags: 0x0, QuestionId: 0x1, VarStoreId: 0x0, VarStoreInfo: 0xFFFF, FormId: ${reference.formId}, FormSetGuid: ${reference.guid} { 0F 0F 01 00 00 00 01 00 00 00 FF FF 00 02 00 }`
      : "",
    "0x30: End { 29 02 }",
  ]
    .filter(Boolean)
    .join("\n");
}

describe("multi-module UEFI HII workspace", () => {
  it("joins cross-FormSet references and keeps module provenance", async () => {
    const inventory: UefiHiiInventory = {
      modules: [
        module("main", "LenovoSetupMainDxe", 1, firstGuid),
        module("security", "LenovoSetupSecurityDxe", 2, secondGuid),
        module("security-gui", "LenovoSetupSecurityGui", 4, secondGuid),
        module("network", "NetworkDxe", 3, secondGuid),
      ],
      decodedBufferCount: 3,
      uniqueBufferCount: 3,
      decodeFailures: [],
    };
    const texts = new Map([
      [
        1,
        ifrText(firstGuid, "0x1", "Main", {
          guid: secondGuid,
          formId: "0x2",
          name: "Security",
        }),
      ],
      [2, ifrText(secondGuid, "0x2", "Security")],
    ]);

    const workspace = await buildUefiHiiWorkspace(inventory, (bytes) => {
      const text = texts.get(bytes[0]);
      return text
        ? Promise.resolve(text)
        : Promise.reject(new Error("unexpected module"));
    });

    expect(workspace.modules.map(({ name }) => name)).toEqual([
      "LenovoSetupMainDxe",
      "LenovoSetupSecurityDxe",
    ]);
    expect(workspace.data.forms).toHaveLength(2);
    expect(workspace.data.forms[0].sourceModuleName).toBe("LenovoSetupMainDxe");
    expect(workspace.data.forms[1].referencedIn).toEqual(["0x1"]);
    expect(workspace.warnings).toEqual([
      expect.stringContaining("LenovoSetupSecurityGui"),
    ]);
    expect(workspace.data.menu).toMatchObject([
      { name: "Main", formId: "0x1", source: "uefi-hii" },
    ]);
  });

  it("falls back to the highest-ranked HII module when none is Setup-related", async () => {
    const inventory: UefiHiiInventory = {
      modules: [module("network", "NetworkDxe", 3, firstGuid)],
      decodedBufferCount: 1,
      uniqueBufferCount: 1,
      decodeFailures: [],
    };

    const workspace = await buildUefiHiiWorkspace(inventory, () =>
      Promise.resolve(ifrText(firstGuid, "0x1", "Network")),
    );

    expect(workspace.modules).toHaveLength(1);
    expect(workspace.data.forms[0].name).toBe("Network");
  });
});
