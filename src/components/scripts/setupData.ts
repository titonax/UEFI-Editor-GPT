import { decimalToHex as decToHexString } from "./hex";
import type { Menu, Offsets, VarStores } from "./types";

const SETUP_DATA_RECORD_BYTES = 54;

export interface SetupDataIndex {
  bytes: Uint8Array;
  offsetsByPrefix: Map<number, number[]>;
}

function reversedHexBytes(value: string) {
  return value.match(/../g)?.reverse().join("") ?? "";
}

function guidToUefiHex(value: string) {
  const parts = value.split("-");
  if (parts.length !== 5) {
    return "";
  }

  return (
    reversedHexBytes(parts[0]) +
    reversedHexBytes(parts[1]) +
    reversedHexBytes(parts[2]) +
    parts[3] +
    parts[4]
  ).toUpperCase();
}

function littleEndianUint32(value: string) {
  const normalized = reversedHexBytes(value);
  return normalized.length === 8 ? parseInt(normalized, 16) : Number.NaN;
}

function hexBytes(value: string) {
  if (value.length % 2 !== 0 || !/^[0-9a-f]*$/i.test(value)) {
    return new Uint8Array();
  }
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < value.length; index += 2) {
    bytes[index / 2] = Number.parseInt(value.slice(index, index + 2), 16);
  }
  return bytes;
}

function prefixKey(first: number, second: number) {
  return (first << 8) | second;
}

export function indexSetupData(hexSetupData: string): SetupDataIndex {
  const bytes = hexBytes(hexSetupData);
  const offsetsByPrefix = new Map<number, number[]>();
  for (let offset = 0; offset + SETUP_DATA_RECORD_BYTES <= bytes.length; offset += 1) {
    const first = bytes[offset];
    const second = bytes[offset + 1];
    if (first === undefined || second === undefined) continue;
    const key = prefixKey(first, second);
    const offsets = offsetsByPrefix.get(key) ?? [];
    offsets.push(offset);
    offsetsByPrefix.set(key, offsets);
  }
  return { bytes, offsetsByPrefix };
}

export function discoverSetupDataMenu(formSetRoots: Menu, setupData: string): Menu {
  const normalizedSetupData = setupData.toUpperCase();
  const candidates: {
    entry: Menu[number];
    start: number;
    pageValue: number;
  }[] = [];

  for (const entry of formSetRoots) {
    if (!entry.formSetGuid) {
      continue;
    }
    const encodedGuid = guidToUefiHex(entry.formSetGuid);
    let guidIndex = normalizedSetupData.indexOf(encodedGuid);
    while (guidIndex !== -1) {
      if (guidIndex >= 8) {
        const start = guidIndex - 8;
        const pageValue = littleEndianUint32(
          normalizedSetupData.slice(start, guidIndex),
        );
        if (Number.isSafeInteger(pageValue)) {
          candidates.push({ entry, start, pageValue });
        }
      }
      guidIndex = normalizedSetupData.indexOf(encodedGuid, guidIndex + 2);
    }
  }

  candidates.sort((left, right) => left.start - right.start);
  const runs: (typeof candidates)[] = [];
  for (const candidate of candidates) {
    if (runs.length === 0) {
      runs.push([candidate]);
      continue;
    }
    const current = runs[runs.length - 1];
    const previous = current[current.length - 1];
    if (candidate.start === previous.start + 40) {
      current.push(candidate);
    } else {
      runs.push([candidate]);
    }
  }

  if (runs.length === 0) {
    return [];
  }
  const pageList = runs.sort((left, right) => right.length - left.length)[0];
  if (pageList.length < 3) {
    return [];
  }

  return pageList.map(({ entry, start, pageValue }) => ({
    ...entry,
    offset: null,
    source: "setupdata",
    pageMask: decToHexString(pageValue),
    pageInfoOffset: decToHexString(start / 2),
  }));
}

export function findVarStoreName(
  varStores: VarStores,
  varStoreId: string,
  formSetGuid?: string,
) {
  return (
    varStores.find(
      (varStore) =>
        varStore.formSetGuid === formSetGuid &&
        parseInt(varStore.varStoreId) === parseInt(varStoreId),
    ) ??
    varStores.find((varStore) => parseInt(varStore.varStoreId) === parseInt(varStoreId))
  )?.name;
}

export function getAdditionalData(
  bytes: string,
  setupData: SetupDataIndex,
  isRef: boolean,
): {
  pageId: string | null;
  accessLevel: string | null;
  failsafe: string | null;
  optimal: string | null;
  offsets: Offsets | null;
} {
  const opcode = bytes.split(" ").map((value) => Number.parseInt(value, 16));
  const required = [opcode[2], opcode[3], opcode[4], opcode[5], opcode[6], opcode[7]];
  if (required.some((value) => !Number.isInteger(value))) {
    return emptyAdditionalData();
  }

  const first = opcode[6];
  const second = opcode[7];
  if (first === undefined || second === undefined) return emptyAdditionalData();
  const candidates = setupData.offsetsByPrefix.get(prefixKey(first, second)) ?? [];
  const matches: number[] = [];
  let nextAllowedOffset = 0;
  for (const offset of candidates) {
    if (offset < nextAllowedOffset) continue;
    if (
      setupData.bytes[offset + 20] === opcode[4] &&
      setupData.bytes[offset + 21] === opcode[5] &&
      setupData.bytes[offset + 48] === opcode[2] &&
      setupData.bytes[offset + 49] === opcode[3]
    ) {
      matches.push(offset);
      nextAllowedOffset = offset + SETUP_DATA_RECORD_BYTES;
    }
  }

  if (matches.length === 1) {
    const index = matches[0];
    if (index === undefined) return emptyAdditionalData();

    const offsets: Offsets = {
      accessLevel: decToHexString(index + 16),
      failsafe: decToHexString(index + 52),
      optimal: decToHexString(index + 53),
    };

    if (isRef) {
      offsets.pageId = decToHexString(index + 12);
    }

    return {
      pageId: `${byteHex(setupData.bytes[index + 12])}${byteHex(
        setupData.bytes[index + 13],
      )}`,
      accessLevel: byteHex(setupData.bytes[index + 16]),
      failsafe: byteHex(setupData.bytes[index + 52]),
      optimal: byteHex(setupData.bytes[index + 53]),
      offsets,
    };
  }

  return emptyAdditionalData();
}

function byteHex(value?: number) {
  return value?.toString(16).toUpperCase().padStart(2, "0") ?? "";
}

function emptyAdditionalData() {
  return {
    pageId: null,
    accessLevel: null,
    failsafe: null,
    optimal: null,
    offsets: null,
  };
}
