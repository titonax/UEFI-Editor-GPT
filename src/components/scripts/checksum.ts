import type { Forms, Menu, Suppression } from "./types";

export async function sha256Hex(data: BufferSource): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export async function hashFile(file: File): Promise<string> {
  return sha256Hex(new Uint8Array(await file.arrayBuffer()));
}

export async function calculateJsonChecksum(
  menu: Menu,
  forms: Forms,
  suppressions: Suppression[],
): Promise<string> {
  const offsets = [
    ...menu.map((item) => item.offset ?? ""),
    ...forms.flatMap((form) =>
      form.children.map((child) => JSON.stringify(child.offsets)),
    ),
    ...suppressions.map(
      (suppression) => suppression.offset + suppression.start + suppression.end,
    ),
  ].join("");

  return sha256Hex(new TextEncoder().encode(offsets));
}
