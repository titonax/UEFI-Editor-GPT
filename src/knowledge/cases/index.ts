import type { FirmwareCase } from "../schema";
import { amiCases } from "./ami";
import { legacyCases } from "./legacy";

export const firmwareCases: readonly FirmwareCase[] = [...amiCases, ...legacyCases];
