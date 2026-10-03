import { firmwareCases } from "../../knowledge/cases";
import type {
  AmiFirmwareGeneration,
  AmiSetupLayout,
  FirmwareContainer,
} from "./amiFirmwareImage";

export const brandCatalogueVersion = "0.2.0";

export type FirmwareBrand =
  | "ASRock"
  | "ASUS"
  | "Dell"
  | "eMachines"
  | "Gigabyte"
  | "HP"
  | "Intel"
  | "MSI"
  | "Supermicro";
export type BrandSignalSource =
  "documented-hash" | "user-supplied" | "firmware-marker" | "filename";
export type BrandNavigation = "multi-formset-root-vector" | "single-formset-ifr-hub";

export const supportedBrands: FirmwareBrand[] = [
  "ASRock",
  "ASUS",
  "Dell",
  "eMachines",
  "Gigabyte",
  "HP",
  "Intel",
  "MSI",
  "Supermicro",
];

export interface BrandMarker {
  brand: FirmwareBrand;
  marker: string;
  offset: number;
}

export interface BrandSignal {
  brand: FirmwareBrand;
  source: BrandSignalSource;
  detail: string;
  offset?: number;
}

interface DocumentedSample {
  brand: FirmwareBrand;
  sha256: string;
  source: string;
  generation?: AmiFirmwareGeneration;
  container?: FirmwareContainer;
  layout?: AmiSetupLayout;
  navigation?: BrandNavigation;
}

export interface BrandPattern {
  mechanism: BrandNavigation;
  samples: number;
}

export interface BrandClassification {
  brand: FirmwareBrand | null;
  basis: BrandSignalSource | "conflict" | "unknown";
  signals: BrandSignal[];
  documentedSamples: number;
  observedGenerations: { generation: AmiFirmwareGeneration; samples: number }[];
  observedContainers: { container: FirmwareContainer; samples: number }[];
  observedLayouts: { layout: AmiSetupLayout; samples: number }[];
  navigationPrior: BrandPattern[];
  navigationOutcome: "unmeasured" | "matches-prior" | "new-pattern";
}

// Hashes identify the exact payloads documented in the repository. These
// observations describe the corpus; they do not grant edit or write support.
const documentedSamples: DocumentedSample[] = firmwareCases.flatMap((entry) =>
  entry.brand
    ? [
        {
          brand: entry.brand,
          sha256: entry.sha256,
          source: entry.source,
          generation:
            entry.generation?.confidence === "confirmed" && !entry.generation.conflict
              ? entry.generation.generation
              : undefined,
          container: entry.structure.container,
          layout: entry.structure.layout,
          navigation:
            entry.structure.navigation === "multi-formset-root-vector" ||
            entry.structure.navigation === "single-formset-ifr-hub"
              ? entry.structure.navigation
              : undefined,
        },
      ]
    : [],
);

const filenameBrands: { brand: FirmwareBrand; pattern: RegExp }[] = [
  { brand: "eMachines", pattern: /(?:^|[^a-z])emachines?(?:[^a-z]|$)/i },
  { brand: "Intel", pattern: /(?:^|[^a-z0-9])(?:intel|fncml357)(?:[^a-z0-9]|$)/i },
  { brand: "ASUS", pattern: /(?:^|[^a-z])(?:asus|asustek)(?:[^a-z]|$)/i },
  { brand: "HP", pattern: /(?:^|[^a-z])(?:hp|hewlett.packard)(?:[^a-z]|$)/i },
  { brand: "MSI", pattern: /(?:^|[^a-z])(?:msi|micro.star)(?:[^a-z]|$)/i },
  { brand: "ASRock", pattern: /(?:^|[^a-z])asrock(?:[^a-z]|$)/i },
  { brand: "Supermicro", pattern: /(?:^|[^a-z])supermicro(?:[^a-z]|$)/i },
  { brand: "Gigabyte", pattern: /(?:^|[^a-z])gigabyte(?:[^a-z]|$)/i },
  { brand: "Dell", pattern: /(?:^|[^a-z])dell(?:[^a-z]|$)/i },
];

function counts<T extends string>(values: T[]) {
  const counted = new Map<T, number>();
  for (const value of values) counted.set(value, (counted.get(value) ?? 0) + 1);
  return [...counted].sort(
    (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
  );
}

export function classifyBrand(
  fileName: string,
  sha256: string,
  markers: BrandMarker[],
  declaredBrand?: FirmwareBrand,
): BrandClassification {
  const documented = documentedSamples.find(
    (sample) => sample.sha256 === sha256.toLowerCase(),
  );
  const signals: BrandSignal[] = [
    ...(documented
      ? [
          {
            brand: documented.brand,
            source: "documented-hash" as const,
            detail: `Exact SHA-256 in ${documented.source}`,
          },
        ]
      : []),
    ...(declaredBrand
      ? [
          {
            brand: declaredBrand,
            source: "user-supplied" as const,
            detail: "Manufacturer selected for this input",
          },
        ]
      : []),
    ...markers.map((marker) => ({
      brand: marker.brand,
      source: "firmware-marker" as const,
      detail: marker.marker,
      offset: marker.offset,
    })),
    ...filenameBrands
      .filter((entry) => entry.pattern.test(fileName))
      .map((entry) => ({
        brand: entry.brand,
        source: "filename" as const,
        detail: `Brand token in filename ${fileName}`,
      })),
  ];
  const highest = documented
    ? "documented-hash"
    : declaredBrand
      ? "user-supplied"
      : markers.length > 0
        ? "firmware-marker"
        : signals.length > 0
          ? "filename"
          : "unknown";
  const candidates = [
    ...new Set(
      signals.filter((signal) => signal.source === highest).map((s) => s.brand),
    ),
  ];
  const brand = candidates.length === 1 ? candidates[0] : null;
  const basis = candidates.length > 1 ? "conflict" : highest;
  const observations = documentedSamples.filter((sample) => sample.brand === brand);
  return {
    brand,
    basis,
    signals,
    documentedSamples: observations.length,
    observedGenerations: counts(
      observations.flatMap((sample) => (sample.generation ? [sample.generation] : [])),
    ).map(([generation, samples]) => ({ generation, samples })),
    observedContainers: counts(
      observations.flatMap((sample) => (sample.container ? [sample.container] : [])),
    ).map(([container, samples]) => ({ container, samples })),
    observedLayouts: counts(
      observations.flatMap((sample) => (sample.layout ? [sample.layout] : [])),
    ).map(([layout, samples]) => ({ layout, samples })),
    navigationPrior: counts(
      observations.flatMap((sample) => (sample.navigation ? [sample.navigation] : [])),
    ).map(([mechanism, samples]) => ({ mechanism, samples })),
    navigationOutcome: "unmeasured",
  };
}

export function compareBrandNavigation(
  classification: BrandClassification,
  observed: (BrandNavigation | "unresolved")[],
): BrandClassification {
  const known = observed.filter(
    (mechanism): mechanism is BrandNavigation => mechanism !== "unresolved",
  );
  if (classification.navigationPrior.length === 0 || known.length === 0) {
    return classification;
  }
  const predicted = new Set(
    classification.navigationPrior.map((item) => item.mechanism),
  );
  return {
    ...classification,
    navigationOutcome: known.every((mechanism) => predicted.has(mechanism))
      ? "matches-prior"
      : "new-pattern",
  };
}
