import { sha256Hex } from "./checksum";
import { hexToBytes } from "./hex";
import type { Data } from "./types";

export interface AmiMenuSessionChange {
  menuIndex: number;
  targetFormIndex: number;
}
function invalid(message: string): never {
  throw new Error(`Queue session ${message}.`);
}
function formId(value: string): number {
  if (!/^0x[0-9a-f]{1,4}$/i.test(value)) invalid("has an invalid AMI FormId");
  return Number.parseInt(value, 16);
}
export async function regenerateSessionAmiMenu(
  before: Data,
  base: Data,
  originalAmitse: string | undefined,
  changes: AmiMenuSessionChange[],
): Promise<Data> {
  if (
    !["aptio-v", "aptio-iv", "ami-aptio"].includes(before.firmwareFamily ?? "") ||
    !originalAmitse
  )
    invalid("requires an AMI workspace with opened AMITSE");
  const source = hexToBytes(originalAmitse);
  if ((await sha256Hex(source)) !== base.hashes.amitseSct)
    invalid("does not match the opened AMITSE source hash");
  const next = structuredClone(before);
  for (const change of changes) {
    const original = base.menu[change.menuIndex];
    const menu = next.menu[change.menuIndex];
    const target = next.forms[change.targetFormIndex];
    if (
      !original ||
      !menu ||
      !target ||
      !(["amitse", "setupdata"] as const).some((kind) => kind === original.source) ||
      !original.formSetGuid ||
      !original.offset ||
      !/^0x[0-9a-f]+$/i.test(original.offset)
    )
      invalid("targets an unavailable AMITSE registration");
    if (
      menu.offset !== original.offset ||
      menu.formSetGuid !== original.formSetGuid ||
      menu.source !== original.source
    )
      invalid("targets stale AMITSE ownership");
    const offset = Number.parseInt(original.offset, 16);
    if (!Number.isSafeInteger(offset) || offset < 16 || offset + 2 > source.length)
      invalid("targets an AMITSE mapping outside its source");
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        original.formSetGuid,
      )
    )
      invalid("has an invalid AMITSE FormSet GUID");
    const parts = original.formSetGuid.split("-");
    const guidHex =
      parts
        .slice(0, 3)
        .map((part) => part.match(/../g)?.reverse().join("") ?? "")
        .join("") + parts.slice(3).join("");
    if (
      !hexToBytes(guidHex).every((byte, index) => source[offset - 16 + index] === byte)
    )
      invalid("targets stale AMITSE FormSet bytes");
    const owners = base.menu.filter(
      (entry) =>
        entry.offset !== null &&
        Math.abs(Number.parseInt(entry.offset, 16) - offset) < 2,
    );
    if (
      owners.length !== 1 ||
      (source[offset] | (source[offset + 1] << 8)) !== formId(original.formId)
    )
      invalid("targets an ambiguous or stale original AMITSE field");
    const destination = formId(target.formId);
    if (
      !target.name ||
      target.formSetGuid !== original.formSetGuid ||
      next.forms.filter(
        (form) =>
          form.formSetGuid === original.formSetGuid &&
          formId(form.formId) === destination,
      ).length !== 1
    )
      invalid("requires a unique existing destination in the same FormSet");
    menu.formId = target.formId;
    menu.name = target.name;
  }
  return next;
}
