# Exact Z03 LH5 output in deployed Firefox

## Deployment and source

Recorded on 2026-10-13 at <https://titonax.github.io/UEFI-Editor-GPT/> against
revision `2073432d9298482bb7ccf956746fdaa8dac033de` (PR #152), production bundle
`assets/index-ChSfR2sA.js`.
[Pages deployment](https://github.com/titonax/UEFI-Editor-GPT/actions/runs/38419545679)
and Code quality completed successfully for that revision.

The browser was Firefox 153.0, Playwright 1.62.1 build 1538, headless Linux,
viewport 1600 by 1000. Content sandbox level zero was required by the test
container; the application was unchanged. The complete image input, Phoenix
analysis, tree navigation, Show control, queue, LH5 encoder/decoder, output
report and browser download were real production controls and modules. No
editor, codec, layout API, network response or download adapter was mocked.

The input was the existing accepted Z03 image from `BIOS2(1).zip`, size
1,048,576 bytes, SHA-256
`d34c9695d6d54595836212021797dd7557cabae0d25fd33cd0faa87c25640194`.
The identity matches the existing reviewed case; no new source or catalogue
case was added. Firmware and downloaded bytes remained local and private.

## Observed flow

1. Select the complete image and choose **Start Phoenix Setup analysis**. The
   Phoenix tree contains 24 Setup screens, including the unlinked **Cache Ram**
   screen. This does not register an unlinked screen as a BIOS tab.
2. Select Cache Ram and choose **Queue Show for Cache Ram Phoenix item** for
   the Information item at template offset `0xEC9`. The queue has one operation;
   Check remains disabled before Apply. Other items without a verified callback
   retain unavailable controls.
3. Open **Change queue (1)**, choose **Apply selected**, close the dialog and run
   **Check firmware output**. Open **Output details** after verification:

| Observed field            | Value                                            |
| ------------------------- | ------------------------------------------------ |
| Complete ROM output       | 1,048,576 bytes                                  |
| Changed / unchanged bytes | 13,032 / 1,035,544                               |
| Changed ranges            | 70; first 64 displayed with bounded byte samples |
| LH5 packed / allocation   | 13,074 / 13,112 bytes                            |
| Remaining bytes           | 38 within that existing allocation               |
| Requested items verified  | 1 after reopening the complete image             |
| Only changed allocation   | `[0x6ED30, 0x72068)`                             |
| Preserved outside it      | 1,035,464 bytes                                  |

4. Close the report and navigate to Main. Download remains enabled: unrelated
   navigation does not invalidate the checked result. Explicitly choose
   **Modified firmware image**. Firefox downloads the checked complete image
   with the original basename and `-modified.bin` suffix.
5. Independent local comparison verifies complete size, 13,032 changed bytes and
   every byte outside `[0x6ED30, 0x72068)` unchanged. The downloaded SHA-256 is
   `bbc4671779479575ec3fcb104e83e54242b09cb2e2da46655bc9d7d81b780134`.
   Headers, FFV boundaries and all bytes outside the packed allocation are
   included in that preservation check.
6. Remove Cache Ram through the queue dialog. Download and output details both
   become disabled.
7. Choose **Load another firmware**, select the downloaded file and start Phoenix
   analysis again. The empty queue requires new verification. Cache Ram's item
   now reports **Ungated callback**, and Queue Show is disabled because its
   original decoded callback already returns the visible state. Fresh browser
   discovery still reports 34 modules and the tree still contains 24 screens.

## Scope and reproduction

Repeat the flow above with the exact source identity. The separate
[engine acceptance](README.md#z03-reconstruction-acceptance) documents bounded
LH5 reconstruction and independent complete-image reopening. This browser run
matches its packed size, allocation, margin and requested callback result.

This establishes deployed Firefox interaction for this exact fixed-allocation
Show callback. It does not establish human desktop file-picker behavior, other
Firefox versions, portable sessions, root registration, structural menu moves,
allocation/directory growth, other ROMs or physical flashing/recovery. The Cache
Ram screen remains structurally unlinked; changing its item callback is a
separate operation from registering a new root. The other release scopes keep
their own evidence gates.

## Complete-ROM byte report against actual downloads

Reproduced on 2026-10-18 (Europe/Madrid) against deployed main
`7c84f509f4b34e300e1730e3e67fe1581454f029` (PR #200), after fresh exact-SHA
[Quality](https://github.com/titonax/UEFI-Editor-GPT/actions/runs/39097324616)
and automatic [Pages build/deployment](https://github.com/titonax/UEFI-Editor-GPT/actions/runs/39097324631)
success. Pages returned HTTP 200. Firefox 153.0 / Playwright 1.62.1, headless
Linux, 1600 × 1000 used the documented container/certificate settings and
`index-LM6CCH_b.js`, `index-D4JOsfQ5.css`. The normal Phoenix LH5 implementation
was used; no UEFI WASM decoder loaded. No browser API, queue, codec or writer
was mocked, delayed or fault-injected.

The exact existing Z03 member was recovered from the authorized ChatGPT archive
and size/SHA-256 checked afresh. Only that member was extracted; the completed
source inventory was not repeated and no new firmware was acquired. Firefox
installation recovered through its normal fallback mirror after invalid primary
archives, before application testing.

The extended `firmware-phoenix-history-firefox-acceptance.mjs` retains its
staging Undo/Redo, Clear/Undo, ready-output Redo/Undo, new-mutation Redo discard
and page-reload reset sequence. After each of its two Apply/Check/downloads:

1. Scan the original and actual downloaded complete ROM locally, independently
   of the production comparison helper or rendered values. Compute every
   contiguous changed interval and the exact changed/unchanged totals.
2. Open Verified Phoenix output. Require 13,032 changed and 1,035,544 unchanged
   bytes in 1,048,576 bytes, 70 total changed ranges and exactly 64 displayed rows.
   Every row must match its physical start/exclusive end, full interval length
   and original/rebuilt first `min(length, 16)` bytes. Omitted ranges and truncated
   samples are both exercised. Sampling/physical-offset labels must be present.
   Raw samples are not logged or committed, including mismatch diagnostics.
3. Require LH5 payload/allocation 13,074/13,112, 38 remaining bytes, one verified
   requested item, changed allocation `[0x6ED30, 0x72068)` and 1,035,464 bytes
   preserved outside it. These UI fields match the existing bounded writer
   evidence and the actual byte-preservation check.
4. Close the report; Check/download/details remain enabled. Clear/Undo still
   invalidates Apply/output/details and requires fresh reconstruction before
   checking the second report. No old verified output is revived by history.

Both downloads are complete 1 MiB ROMs with the unchanged known SHA-256
`bbc4671779479575ec3fcb104e83e54242b09cb2e2da46655bc9d7d81b780134`;
they are byte-identical to each other. Every changed byte is inside the original
TEMPLAT packed allocation; all other bytes, including FFV/header boundaries,
are intact. This is a legacy complete-ROM source, not a descriptor-bearing SPI.
After fresh page reloads, both actual files independently reopen with an empty
queue and Cache Ram's Show disabled because its callback already returns visible.
Neither reopening inherits a verified result. No application page errors occurred;
the complete checker passed first attempt. The five-minute Check limit, expected
hash/count, allocation, deterministic LH5 round trip and independent writer reread
guards remain unchanged. No production code changed.

Use the history checker's opt-in command in
[the history record](z03-history-firefox-acceptance.md#reproduce-and-limits).
Private firmware and temporary downloads stay local; the checker removes its
private intermediates on exit and CI has no private input. This is exact-source
real-Firefox report acceptance, not a new standalone engine rerun, synthetic or
hardware result. Other sources/families, zero-change reports, pending-build races,
root registration, structural edits, growth and broader codecs remain separate;
P53 dynamic roots and new BIOS remain parked. Missing uncompressed AMI/mixed
real-source gates and physical flashing/recovery are not promoted by this run.
