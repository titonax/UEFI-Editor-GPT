import { Group } from "@mantine/core";
import { IconFileDescription } from "@tabler/icons-react";
import type { PhoenixSetupMenu } from "../scripts/phoenixSetupTable";
import s from "../Header/Header.module.css";

interface PhoenixHeaderProps {
  fileName: string;
  menu: PhoenixSetupMenu;
  currentSectionIndex: number;
}

export default function PhoenixHeader({
  fileName,
  menu,
  currentSectionIndex,
}: PhoenixHeaderProps) {
  const sections = menu.sections.filter((section) => section.items.length > 0);
  const section = currentSectionIndex >= 0 ? sections[currentSectionIndex] : undefined;
  const normalizedSectionName = section?.name?.replace(/\r/g, " ").trim();
  const sectionName =
    normalizedSectionName && normalizedSectionName.length > 0
      ? normalizedSectionName
      : section
        ? `Group ${String(currentSectionIndex + 1)}`
        : undefined;
  return (
    <div className={s.root}>
      <div className={s.fileArea} title={fileName}>
        <IconFileDescription aria-hidden="true" size={18} stroke={1.6} />
        <div className={s.fileText}>
          <div className={s.fileLabel}>Loaded firmware</div>
          <div className={s.fileName}>{fileName}</div>
        </div>
      </div>
      {sectionName && (
        <Group className={s.breadcrumbs} gap="xs" wrap="nowrap">
          <div>Phoenix Setup</div>
          <div>{">"}</div>
          <div>{sectionName}</div>
        </Group>
      )}
    </div>
  );
}
