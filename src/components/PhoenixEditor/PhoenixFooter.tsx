import { Button, Group, Text } from "@mantine/core";
import { IconArrowBackUp } from "@tabler/icons-react";
import s from "../Footer/Footer.module.css";

export default function PhoenixFooter({ onClose }: { onClose: () => void }) {
  return (
    <Group className={s.root} justify="space-between" w="100%">
      <Text size="xs" c="dimmed">
        Phoenix Setup view · read-only
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
