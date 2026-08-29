import { decimalToHex as decToHexString } from "./hex";
import type { Menu, Offsets, VarStores } from "./types";

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

function isPageMask(value: number) {
  return value === 0 || (value > 0 && (value & (value - 1)) === 0);
}

export function discoverSetupDataMenu(formSetRoots: Menu, setupData: string): Menu {
  const candidates: {
    entry: Menu[number];
    start: number;
    mask: number;
  }[] = [];

  for (const entry of formSetRoots) {
    if (!entry.formSetGuid) {
      continue;
    }
    const encodedGuid = guidToUefiHex(entry.formSetGuid);
    let guidIndex = setupData.indexOf(encodedGuid);
    while (guidIndex !== -1) {
      if (guidIndex >= 8) {
        const start = guidIndex - 8;
        const mask = littleEndianUint32(setupData.slice(start, guidIndex));
        if (isPageMask(mask)) {
          candidates.push({ entry, start, mask });
        }
      }
      guidIndex = setupData.indexOf(encodedGuid, guidIndex + 2);
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

  return pageList.map(({ entry, start, mask }) => ({
    ...entry,
    offset: null,
    source: "setupdata",
    pageMask: decToHexString(mask),
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
  hexSetupdataBin: string,
  isRef: boolean,
): {
  pageId: string | null;
  accessLevel: string | null;
  failsafe: string | null;
  optimal: string | null;
  offsets: Offsets | null;
} {
  const byteArray = bytes.split(" ");
  const regex = new RegExp(
    byteArray[6] +
      byteArray[7] +
      ".{20}(....).{4}(..).{6}" +
      byteArray[4] +
      byteArray[5] +
      ".{52}" +
      byteArray[2] +
      byteArray[3] +
      ".{4}(..)(..)",
    "g",
  );

  const matches = [...hexSetupdataBin.matchAll(regex)].filter(
    (element) => element.index % 2 === 0,
  );

  if (matches.length === 1) {
    const match = matches[0];
    const index = match.index;

    const offsets: Offsets = {
      accessLevel: decToHexString((index + 32) / 2),
      failsafe: decToHexString((index + 104) / 2),
      optimal: decToHexString((index + 106) / 2),
    };

    if (isRef) {
      offsets.pageId = decToHexString((index + 24) / 2);
    }

    return {
      pageId: match[1],
      accessLevel: match[2],
      failsafe: match[3],
      optimal: match[4],
      offsets,
    };
  }

  return {
    pageId: null,
    accessLevel: null,
    failsafe: null,
    optimal: null,
    offsets: null,
  };
}
