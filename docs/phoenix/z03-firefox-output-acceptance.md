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
