/**
 * Generation-neutral entry point for the shared AMI FV/FFS/HII extractor.
 *
 * The implementation originated in the Aptio IV workflow, but the underlying
 * PI, HII, Setup and AMITSE structures are shared with supported Aptio V images.
 */
export {
  extractAptioIvArtifacts as extractAmiFirmwareArtifacts,
  extractAptioIvBytes as extractAmiFirmwareBytes,
  type AptioIvArtifacts as AmiFirmwareArtifacts,
} from "./aptioIvExtractor";
