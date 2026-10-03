import type { FirmwareCase } from "../schema";
import { amiCases } from "./ami";
import { legacyCases } from "./legacy";

// Reviewed JSON records are committed only after the case:check gate succeeds.
const reviewed = import.meta.glob("./reviewed/*.json", {
  eager: true,
  import: "default",
});

export const firmwareCases: readonly FirmwareCase[] = [
  ...amiCases,
  ...legacyCases,
  ...(Object.values(reviewed) as FirmwareCase[]),
];
