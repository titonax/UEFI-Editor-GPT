import { AppShell, Group, ScrollArea, Text } from "@mantine/core";
import {
  IconFileDescription,
  IconFolder,
  IconListTree,
  IconSitemap,
} from "@tabler/icons-react";
import type { PhoenixSetupMenu } from "../scripts/phoenixSetupTable";
import s from "../Navigation/Navigation.module.css";

interface PhoenixNavigationProps {
  menu: PhoenixSetupMenu;
  currentSectionIndex: number;
  setCurrentSectionIndex: (index: number) => void;
}

function sectionLabel(name: string | null, index: number) {
  const normalized = name?.replace(/\r/g, " ").trim();
  return normalized && normalized.length > 0
    ? normalized
    : `Group ${String(index + 1)}`;
}

export default function PhoenixNavigation({
  menu,
  currentSectionIndex,
  setCurrentSectionIndex,
}: PhoenixNavigationProps) {
  const sections = menu.sections.filter((section) => section.items.length > 0);
  const rootSections = sections.filter((section) => section.parentOffset === null);
  const totalItems = sections.reduce((sum, section) => sum + section.items.length, 0);
  const verifiedDirectory = menu.source !== "contiguous-scan";
  return (
    <>
      <AppShell.Section className={s.treeHeader}>
        <Group gap="xs" wrap="nowrap">
          <IconListTree size={20} className={s.headerIcon} />
          <div>
            <Text size="sm" fw={600}>
              BIOS menu tree
            </Text>
            <Text size="xs" c="dimmed">
              {String(verifiedDirectory ? rootSections.length : sections.length)}{" "}
              {verifiedDirectory ? "tabs" : "groups"} · {String(totalItems)} items
            </Text>
          </div>
        </Group>
      </AppShell.Section>
      <AppShell.Section
        className={[s.navElement, s.menu, currentSectionIndex === -1 ? s.selected : ""]
          .filter(Boolean)
          .join(" ")}
        onClick={() => {
          setCurrentSectionIndex(-1);
        }}
      >
        <IconSitemap size={17} />
        <span>Top-level menu</span>
      </AppShell.Section>
      <AppShell.Section
        grow
        component={ScrollArea}
        type="always"
        className={s.treeScroll}
      >
        <div role="tree" aria-label="Phoenix Setup screens" className={s.tree}>
          <div className={s.profileLabel}>
            <span>PHOENIX SETUP TABLE</span>
            <span className={verifiedDirectory ? s.profileLive : s.profileFallback}>
              {verifiedDirectory ? "verified menu tree" : "inferred groups"}
            </span>
          </div>
          {sections.map((section, index) => {
            const hasChildren = sections.some(
              (candidate) => candidate.parentOffset === section.offset,
            );
            return (
              <div
                key={section.offset}
                role="treeitem"
                aria-level={section.depth + 1}
                className={[s.treeRow, currentSectionIndex === index ? s.selected : ""]
                  .filter(Boolean)
                  .join(" ")}
                style={{ paddingLeft: `${String(6 + section.depth * 18)}px` }}
              >
                <span className={s.expander}>{hasChildren ? "⌄" : ""}</span>
                {hasChildren ? (
                  <IconFolder
                    size={17}
                    className={`${s.folderIcon} ${s.statusConditional}`}
                  />
                ) : (
                  <IconFileDescription
                    size={16}
                    className={`${s.formIcon} ${s.statusVisible}`}
                  />
                )}
                <button
                  type="button"
                  className={s.nodeLabel}
                  onClick={() => {
                    setCurrentSectionIndex(index);
                  }}
                >
                  <span className={s.nodeName}>
                    {sectionLabel(section.name, index)}
                  </span>
                  <span className={s.formId}>
                    0x{section.offset.toString(16).toUpperCase()}
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      </AppShell.Section>
    </>
  );
}
