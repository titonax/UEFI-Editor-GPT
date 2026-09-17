import React from "react";
import { Group } from "@mantine/core";
import { IconFileDescription } from "@tabler/icons-react";
import s from "./Header.module.css";
import type { Data } from "../scripts/types";
import { buildMenuTree, findNodePath } from "../Navigation/menuTree";

interface HeaderProps {
  data: Data;
  fileName: string;
  currentFormIndex: number;
  setCurrentFormIndex: React.Dispatch<React.SetStateAction<number>>;
}

export default function Header({
  data,
  fileName,
  currentFormIndex,
  setCurrentFormIndex,
}: HeaderProps) {
  const tree = React.useMemo(() => buildMenuTree(data), [data]);
  const activePath = React.useMemo(() => {
    if (currentFormIndex < 0) {
      return [];
    }
    const rootPath = findNodePath(tree.roots, currentFormIndex);
    return rootPath.length > 0
      ? rootPath
      : findNodePath(tree.orphans, currentFormIndex);
  }, [currentFormIndex, tree.orphans, tree.roots]);
  const currentNode =
    activePath.length > 0 ? activePath[activePath.length - 1] : undefined;
  const profile = currentNode
    ? tree.profiles.find((candidate) => candidate.id === currentNode.profileId)
    : undefined;

  function navigate(formIndex: number | null) {
    if (formIndex === null) {
      return;
    }
    setCurrentFormIndex(formIndex);
    document.getElementById(`nav-${String(formIndex)}`)?.scrollIntoView();
  }

  return (
    <div className={s.root}>
      <div className={s.fileArea} title={fileName}>
        <IconFileDescription aria-hidden="true" size={18} stroke={1.6} />
        <div className={s.fileText}>
          <div className={s.fileLabel}>Loaded firmware</div>
          <div className={s.fileName}>{fileName}</div>
        </div>
      </div>
      {activePath.length > 0 && (
        <Group className={s.breadcrumbs} gap="xs" wrap="nowrap">
          {profile && (
            <>
              <div>{profile.label}</div>
              <div>{">"}</div>
            </>
          )}
          {activePath.map((node, index) => {
            const last = index === activePath.length - 1;
            return (
              <React.Fragment key={node.key}>
                <div
                  className={last ? undefined : s.pointer}
                  onClick={() => {
                    if (!last) {
                      navigate(node.formIndex);
                    }
                  }}
                >
                  {node.label}
                </div>
                {!last && <div>{">"}</div>}
              </React.Fragment>
            );
          })}
        </Group>
      )}
    </div>
  );
}
