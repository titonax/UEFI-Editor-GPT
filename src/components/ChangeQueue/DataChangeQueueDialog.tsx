import ChangeQueueDialog from "./ChangeQueueDialog";
import type { DataChangeQueueController } from "./useDataChangeQueue";

export default function DataChangeQueueDialog({
  opened,
  queue,
  onClose,
}: {
  opened: boolean;
  queue: DataChangeQueueController;
  onClose: () => void;
}) {
  return (
    <ChangeQueueDialog
      opened={opened}
      entries={queue.entries}
      comparison={queue.comparison}
      analysis={queue.analysis}
      appliedFingerprint={queue.appliedFingerprint}
      onClose={onClose}
      onToggleEnabled={queue.toggleEnabled}
      onRemove={queue.remove}
      onMove={queue.move}
      onClear={queue.clear}
      onApply={queue.apply}
      canUndo={queue.canUndo}
      canRedo={queue.canRedo}
      onUndo={queue.undo}
      onRedo={queue.redo}
      metricLabels={{
        units: "net logical field(s)",
        spans: "optimized logical edit(s)",
      }}
    />
  );
}
