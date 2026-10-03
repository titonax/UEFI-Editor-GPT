import type { FirmwareCase } from "../schema";

// Metadata transcribed from each linked research record; never firmware bytes.
export const legacyCases = [
  {
    id: "emachines-el1200-r01a2",
    label: "eMachines EL1200 R01A2",
    sha256: "d7ec1c70607c9186fbdd9d30e657b32e139fee2cf144c2f59b36fb48bec42c71",
    size: 1048576,
    fileNames: ["R01A2(1).BIN", "R01A2.BIN"],
    brand: "eMachines",
    source: "docs/award/emachines-el1200-r01a2.md",
    structure: {
      family: "award",
      firmwareVolumeCount: 0,
      legacyModuleCount: 23,
      container: "award-rom",
    },
    regressionTests: ["src/components/scripts/awardFirmware.test.ts"],
    limitations: [
      "Award module editing and full-image reconstruction remain unsupported.",
    ],
  },
  {
    id: "asus-n10j-amibios8",
    label: "ASUS N10J AMIBIOS8",
    sha256: "78575954ba80c09b40b0283a0dc6b918ffeb4b9623a58613225cd85dd544ca4b",
    size: 1048576,
    fileNames: ["ASUS N10J BIOS.BIN"],
    brand: "ASUS",
    source: "docs/ami/asus-n10j-amibios8.md",
    structure: {
      family: "ami-legacy",
      firmwareVolumeCount: 0,
      container: "ami-legacy-rom",
    },
    regressionTests: ["src/components/scripts/amiLegacyFirmware.test.ts"],
    limitations: [
      "AMIBIOS8 is not Aptio; Setup module editing and reconstruction remain unsupported.",
    ],
  },
  {
    id: "phoenix-acer-z03-20140701",
    label: "Acer Z03 PhoenixBIOS 4.0 Release 6.1",
    sha256: "d34c9695d6d54595836212021797dd7557cabae0d25fd33cd0faa87c25640194",
    size: 1048576,
    fileNames: ["ACER-Z03-20140701.bin"],
    source: "docs/phoenix/setup-menu.md",
    structure: {
      family: "phoenix",
      container: "phoenix-rom",
      firmwareVolumeCount: 0,
      legacyModuleCount: 34,
    },
    regressionTests: ["src/components/scripts/phoenixFirmwareRebuilder.test.ts"],
    limitations: [
      "Fixed-allocation TEMPLAT reconstruction was accepted on this exact image; allocation growth remains blocked.",
      "Re-open and byte preservation acceptance is not evidence of physical flashing or support for every Phoenix BIOS.",
    ],
  },
] as const satisfies readonly FirmwareCase[];
