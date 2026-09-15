import type { AmiFirmwareArtifacts } from "../scripts/amiFirmwareExtractor";

export interface FileContainer {
  file?: File;
  textContent?: string;
  isWrongFile: boolean;
}

export interface FirmwareSourceSession {
  fileName: string;
  artifacts: AmiFirmwareArtifacts;
}

export interface Files {
  setupSctContainer: FileContainer;
  setupTxtContainer: FileContainer;
  amitseSctContainer: FileContainer;
  setupdataBinContainer: FileContainer;
  firmwareSource?: FirmwareSourceSession;
}

export interface PopulatedFiles {
  setupSctContainer: Required<FileContainer>;
  setupTxtContainer: Required<FileContainer>;
  amitseSctContainer: Required<FileContainer>;
  setupdataBinContainer: Required<FileContainer>;
  firmwareSource?: FirmwareSourceSession;
}

export function isPopulatedFiles(files: Files): files is PopulatedFiles {
  return fileContainers(files).every(
    (container) => container.file !== undefined && !container.isWrongFile,
  );
}

export function fileContainers(files: Files): FileContainer[] {
  return [
    files.setupSctContainer,
    files.setupTxtContainer,
    files.amitseSctContainer,
    files.setupdataBinContainer,
  ];
}
