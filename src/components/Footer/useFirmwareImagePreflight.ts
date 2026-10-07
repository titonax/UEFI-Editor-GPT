import React from "react";
import type { PopulatedFiles } from "../firmwareFiles";
import type { Data } from "../scripts/types";
import { buildAmiFirmwareImage } from "../scripts/amiFirmwareRebuilder";
import { useVerifiedFirmwareBuild } from "./useVerifiedFirmwareBuild";

function build(input: { data: Data; files: PopulatedFiles }) {
  return buildAmiFirmwareImage(input.data, input.files);
}

export function useFirmwareImagePreflight(
  data: Data,
  files: PopulatedFiles,
  enabled: boolean,
) {
  const input = React.useMemo(() => ({ data, files }), [data, files]);
  return useVerifiedFirmwareBuild(input, enabled, build);
}
