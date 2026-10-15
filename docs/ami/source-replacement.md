# AMI same-page source replacement

Implemented on 2026-10-15 as a bounded phase-10 UI lifecycle change.

The AMI footer now offers **Load another firmware**, as the HII and Phoenix
footers already did. It returns to image selection without reloading the page.
App drops the opened extracted files/provenance, replaces the editor base with
empty data, resets the selected Form and clears the previous error. The normal
queue source reset discards entries, Apply and both histories. Unmounting the
footer drops its verified output/report and cancels pending queue-session and
build completions through their existing guards. Reopening identical bytes is
a fresh workspace, not restoration of a checked output.

The legacy AMI `data.json` import now also has a source/lifetime request guard.
Closing invalidates it synchronously; file-context replacement and unmount
invalidate it in layout cleanup. After each asynchronous file-read/checksum
boundary, stale success, validation failure and rejection cannot enqueue data,
overwrite the new workspace's error or reset its file input. A newer JSON import
also supersedes a pending older import. Version, source-hash, offset-checksum,
binary hydration, root-plan and navigation checks are unchanged.

## Reproducible synthetic validation

```bash
npm ci
npx vitest run src/App.test.tsx src/components/Footer/Footer.test.tsx
npm run check
```

`App.test.tsx` exercises App and the actual queue with synthetic extraction and
layout boundaries: select source, select Form, stage/apply, close, return to
upload and reopen with no entries, Apply, history, selection or previous error.
`Footer.test.tsx` exercises the real footer/queue with a mocked binary builder:

- Close verified output and reopen with download/check/history disabled.
- Complete or reject an old build only after a newly opened source is verified;
  retain the new output and download filename, without rebuilding on download.
- Complete or reject an old file read after close/reopen; discard it silently.
- Finish a pending checksum after replacing files; discard the stale diagnostic
  while still reporting the same invalid checksum for a current import.

These are React/jsdom lifecycle tests with synthetic data and controlled
Promises, not a real-source engine rerun, Firefox or hardware acceptance. No
firmware was required or recovered for this implementation block. Existing
Tiano Firefox records remain scoped to their recorded revisions and flows.
Same-document replacement with an accepted complete SPI in real Firefox,
including fresh output/re-extraction after reopening, remains the next gate.
Real-browser stale failures and other asynchronous boundaries remain pending.

No parser, codec, checksum algorithm, allocation capacity, source acceptance,
writer or independent reader changed. Full-SPI preservation requirements and
unsupported compression/growth/capsule/root gates remain unchanged. Missing
qualifying uncompressed AMI/mixed-HII sources and hardware acceptance remain open;
new BIOS intake and P53 dynamic-root research remain parked.
