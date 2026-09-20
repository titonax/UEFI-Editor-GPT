// The byte at offset +16 in a matched AMI SetupData question record is a
// control flag field. Its individual bits have no proven visibility meaning.
export function decodeSetupDataFlags(raw: string | null): number[] | null {
  if (raw === null || !/^[0-9a-f]{1,2}$/i.test(raw)) return null;
  const value = Number.parseInt(raw, 16);
  return Array.from({ length: 8 }, (_, bit) => bit).filter(
    (bit) => (value & (1 << bit)) !== 0,
  );
}

export function describeSetupDataFlags(raw: string | null): string {
  const bits = decodeSetupDataFlags(raw);
  if (bits === null) return "No matching SetupData control record.";
  return `SetupData control flags 0x${String(raw)}: bits ${bits.join(", ") || "none"} set. Bit meanings are unverified; these flags do not prove that a page is hidden or visible.`;
}
