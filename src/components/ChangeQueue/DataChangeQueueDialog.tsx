import ChangeQueueDialog from "./ChangeQueueDialog";
import type { DataChangeQueueController } from "./useDataChangeQueue";
import type { QueueSessionAdapter } from "./QueueSessionControls";

export default function DataChangeQueueDialog({
  opened,
  queue,
  onClose,
  session,
}: {
  opened: boolean;
  queue: DataChangeQueueController;
  onClose: () => void;
  session?: QueueSessionAdapter;
}) {
  return (
    <ChangeQueueDialog
      opened={opened}
      session={session}
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
