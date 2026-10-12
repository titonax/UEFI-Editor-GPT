import { compareFirmwareImages } from "../scripts/firmwareImageComparison";
import React from "react";
import type { PopulatedFiles } from "../firmwareFiles";
import type { Data } from "../scripts/types";
import { buildAmiFirmwareImage } from "../scripts/amiFirmwareRebuilder";
import { useVerifiedFirmwareBuild } from "./useVerifiedFirmwareBuild";

async function build(input: { data: Data; files: PopulatedFiles }) {
  const graph = input.files.firmwareSource?.artifacts.provenance;
  const original = graph?.buffers
    .find((node) => node.id === graph.rootBufferId)
    ?.bytes.slice();
  if (!original)
    throw new Error("Complete-image comparison requires the opened source image.");
  const result = await buildAmiFirmwareImage(input.data, input.files);
  return { ...result, binaryComparison: compareFirmwareImages(original, result.image) };
}

export function useFirmwareImagePreflight(
  data: Data,
  files: PopulatedFiles,
  enabled: boolean,
  queueRevision = 0,
) {
  const input = React.useMemo(
    () => ({ data, files, queueRevision }),
    [data, files, queueRevision],
  );
  return useVerifiedFirmwareBuild(input, enabled, build);
}
