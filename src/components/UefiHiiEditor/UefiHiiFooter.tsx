import { Button, Group, Text } from "@mantine/core";
import { IconArrowBackUp } from "@tabler/icons-react";
import s from "../Footer/Footer.module.css";

export default function UefiHiiFooter({
  moduleCount,
  warningCount,
  onClose,
}: {
  moduleCount: number;
  warningCount: number;
  onClose: () => void;
}) {
  return (
    <Group className={s.root} justify="space-between" w="100%">
      <Text size="xs" c={warningCount > 0 ? "yellow" : "dimmed"}>
        Vendor-neutral UEFI HII · {String(moduleCount)} joined module(s) · read-only
        {warningCount > 0 ? ` · ${String(warningCount)} warning(s)` : ""}
      </Text>
      <Button
        size="xs"
        variant="default"
        leftSection={<IconArrowBackUp size={14} />}
        onClick={onClose}
      >
        Load another firmware
      </Button>
    </Group>
  );
}
