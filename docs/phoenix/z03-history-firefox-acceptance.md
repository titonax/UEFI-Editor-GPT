# Exact Z03 queue history in deployed Firefox

Reproduced on 2026-10-14 at <https://titonax.github.io/UEFI-Editor-GPT/>
against `28e789b7457ac01758a4b6bc0213ba2c47bce765` (merged PR #162).
[Code quality](https://github.com/titonax/UEFI-Editor-GPT/actions/runs/38616010386)
and [Pages](https://github.com/titonax/UEFI-Editor-GPT/actions/runs/38616010182)
were successful for that exact SHA before the run.

Firefox 153.0, Playwright 1.62.1 build 1538, headless Linux, viewport 1600 × 1000,
loaded `index-_Q4xhBY9.js` and `index-D4JOsfQ5.css`. Explicit container sandbox
and certificate-error settings did not change the app. No parser, queue,
codec, builder or download adapter was mocked. Phoenix uses the deployed local
LH5 implementation; this run did not load UEFI WASM decoders.

The existing accepted complete Z03 source is 1,048,576 bytes, SHA-256
`d34c9695d6d54595836212021797dd7557cabae0d25fd33cd0faa87c25640194`.
It was recovered from the authorized private files and hash-checked before use.
Firmware and downloads stayed private and local. See
[original output acceptance](z03-firefox-output-acceptance.md) for the proven
Cache Ram callback and fixed allocation.

## Actual history and output flow

1. Analyse the source, open Cache Ram and stage its supported Show operation.
   Undo is enabled and Redo disabled. Undo empties the queue, disables Apply
   and enables Redo. Redo restores Show as unapplied; output checking, download
   and output details remain disabled.
2. Apply, Check and explicitly download the verified complete image.
3. Clear the queue after that successful download. Output checking, download
   and details become disabled. Undo restores the identical Show queue, but
   does not restore Apply or verified output. Apply selected is enabled and a
   fresh Apply/Check is required.
4. Perform that new Apply/Check/download. Independently compare both files:
   they are byte-identical and each passes the exact source-relative hash,
   complete size, changed-byte count and untouched-allocation assertions.
5. With the second verified output ready, Redo restores the earlier Clear;
   Undo restores Show. Both transitions invalidate output. Removing Show is a
   new mutation and disables Redo. Undo restores Show without restoring a
   verified download.
6. Reload the page and analyse the same original source: queue and both history
   stacks are empty, with output disabled. This tests page reload, not in-place
   source replacement during an outstanding asynchronous action.
7. Reload the actual rebuilt image. Cache Ram's Show control is disabled because
   its original callback now returns the visible state; the new queue is empty
   and no verified download is inherited. No application page errors occurred.

| Reproduced field                   | Value                                                              |
| ---------------------------------- | ------------------------------------------------------------------ |
| Complete output                    | 1,048,576 bytes                                                    |
| SHA-256, both downloads            | `bbc4671779479575ec3fcb104e83e54242b09cb2e2da46655bc9d7d81b780134` |
| Changed bytes, each                | 13,032                                                             |
| Changes outside TEMPLAT allocation | 0                                                                  |
| Original allocation                | `[0x6ED30, 0x72068)`                                               |

Normal reconstruction retains fixed allocation, deterministic LH5 round trip
and independent full-image inventory/Setup reread before enabling download.
History does not change any writer precondition or firmware source bytes.

## Reproduce and limits

With Playwright and real Firefox installed, supply the private accepted source:

```bash
FIRMWARE_ACCEPTANCE_IMAGE=/path/to/source.bin \
node scripts/firmware-phoenix-history-firefox-acceptance.mjs
```

Optional browser settings match the existing Phoenix session checker. Each
output check remains bounded to five minutes. The checker removes private
temporary firmware/download files on success or failure. Public CI has no source.

This establishes the documented exact-source Phoenix history flow in Firefox,
including a fresh identical rebuild after history invalidation. AMI/HII history,
paused/reordered multi-operation plans, late build completion races, the 50-entry
limit and in-place source replacement remain separate synthetic/jsdom or pending
real-browser gates. It does not establish hardware, human desktop picker,
structural menus, root registration, another source or broader codec support.
Growth, unsupported callbacks, compression and capsules retain their existing
guards. P53 dynamic roots and new BIOS remain parked.
