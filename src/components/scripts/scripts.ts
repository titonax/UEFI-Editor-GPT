import type { PopulatedFiles } from "../FileUploads/fileModel";
import { calculateJsonChecksum, hashFile } from "./checksum";
import { FirmwareError } from "./errors";
import { hexToBytes } from "./hex";
import { analyzeIfrBinary } from "./ifrBinary";
import { parseIfrText } from "./ifrTextParser";
import { discoverMenu } from "./menuDiscovery";
import type { Data } from "./types";

export const dataSchemaVersion = "0.4.0";
/** @deprecated Use dataSchemaVersion when referring to the data.json format. */
export const version = dataSchemaVersion;

export { calculateJsonChecksum } from "./checksum";
export { validateByteInput } from "./hex";
export { analyzeIfrBinary, parseIfrOpcodeStream } from "./ifrBinary";
export { applyIfrBytePatches, planIfrReferenceRetarget } from "./ifrEditing";
export { downloadModifiedFiles } from "./patcher";

const wantedIFRExtractorVersions = ["1.6.1"];

function validateIfrExtractorOutput(setupTxt: string, setupSctHash: string) {
  if (
    !wantedIFRExtractorVersions.some((extractorVersion) =>
      setupTxt.includes(`Program version: ${extractorVersion}`),
    )
  ) {
    throw new FirmwareError(
      "INCOMPATIBLE_IFR",
      `Wrong IFRExtractor-RS version. Compatible versions: ${wantedIFRExtractorVersions.join(
        ", ",
      )}.`,
    );
  }

  if (!setupTxt.includes("Extraction mode: UEFI")) {
    throw new FirmwareError(
      "INCOMPATIBLE_IFR",
      "Only UEFI extraction mode is supported.",
    );
  }

  if (!/\{ .* \}/.test(setupTxt)) {
    throw new FirmwareError(
      "INCOMPATIBLE_IFR",
      'Use the "verbose" option of IFRExtractor.',
    );
  }

  if (!setupTxt.includes(`SHA256: ${setupSctHash}`)) {
    throw new FirmwareError(
      "INTEGRITY_MISMATCH",
      "Setup SCT and IFR Extractor output TXT SHA256 mismatch.",
    );
  }
}

export async function parseData(files: PopulatedFiles): Promise<Data> {
  const [setupTxtHash, setupSctHash, amitseSctHash, setupdataBinHash] =
    await Promise.all([
      hashFile(files.setupTxtContainer.file),
      hashFile(files.setupSctContainer.file),
      hashFile(files.amitseSctContainer.file),
      hashFile(files.setupdataBinContainer.file),
    ]);

  let setupTxt = files.setupTxtContainer.textContent;
  const amitseSct = files.amitseSctContainer.textContent;
  const setupData = files.setupdataBinContainer.textContent;

  validateIfrExtractorOutput(setupTxt, setupSctHash);
  setupTxt = setupTxt.replace(/[\r\n|\n|\r](?!0x[0-9A-F]{3})/g, "<br>");

  const parsedIfr = parseIfrText(setupTxt, setupData);
  const menu = discoverMenu({
    amitseSct,
    setupData,
    formSetIds: parsedIfr.formSetIds,
    formSetMetadata: parsedIfr.formSetMetadata,
    formSetRoots: parsedIfr.formSetRoots,
    forms: parsedIfr.forms,
  });

  return {
    firmwareFamily: setupData.startsWith("24535046") ? "aptio-iv" : "aptio-v",
    menu,
    formSetRoots: parsedIfr.formSetRoots,
    forms: parsedIfr.forms,
    varStores: parsedIfr.varStores,
    suppressions: parsedIfr.suppressions,
    ifrBinary: analyzeIfrBinary(hexToBytes(files.setupSctContainer.textContent)),
    version: dataSchemaVersion,
    hashes: {
      setupTxt: setupTxtHash,
      setupSct: setupSctHash,
      amitseSct: amitseSctHash,
      setupdataBin: setupdataBinHash,
      offsetChecksum: await calculateJsonChecksum(
        menu,
        parsedIfr.forms,
        parsedIfr.suppressions,
      ),
    },
  };
}
