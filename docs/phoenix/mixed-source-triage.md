# Existing-source mixed ownership triage

At 2026-10-11, the read-only inventory completed for 31 unique, already supplied
local firmware images. It reported **zero `mixed-direct-nested` carriers**.
This supplies no qualifying source for real mixed parent/child output acceptance;
that gate remains open. It is a bounded parser-run result, not proof that mixed
firmware does not exist or that every byte in these inputs was understood.

The inventory found HII modules in 22 inputs and no HII modules in nine inputs.
Three inputs reported decode failures. Those three runs cannot support an absence
claim. Zero reported failures in other runs is also not a compatibility or output
acceptance claim: this scenario performs no family promotion, edits, reconstruction,
recompression or browser flow. No new case records or writer permissions are added.

## Local source preparation and scope

Two already available ZIP prefixes lacked central/end directories and could not
be opened as complete archives. Only complete local-header members with supported
stored/deflate compression, matching declared unpacked size and matching CRC-32
were retained. The prefixes yielded 13 and 17 complete firmware members; the
incomplete trailing members were excluded. Adding available standalone binaries
and deduplicating the image payloads by SHA-256 produced the 31 inputs below.
Archive hashes are not substituted for image hashes. Original prefixes and
firmware bodies stay private; no paths or storage contents are committed.

The scan uses `decodeFirmwareBuffers` and `inventoryUefiHiiModules`, including the
existing owned-package filtering for identity nested payloads. A candidate must
actually be classified `mixed-direct-nested`; multiple separate HII modules or
ordinary compressed ancestry alone do not meet that definition. Reported module
counts retain the inventory's physical-copy deduplication and are not menu-root
or runtime-visibility counts.

## Metadata results

| Image SHA-256                                                      |    Bytes | Decoded buffers | Unique buffers | HII modules | Mixed carriers | Decode failures |
| ------------------------------------------------------------------ | -------: | --------------: | -------------: | ----------: | -------------: | --------------: |
| `56ebb492202330c78189705339161762dbe8b8b56e8244d10ab026319400ccf9` | 16777216 |              51 |             51 |          12 |              0 |               1 |
| `e46b871c283b125098b7a17ddcc63b283222ba535329a9dfebb15ed2eb601cd4` | 16777216 |              10 |              9 |          17 |              0 |               1 |
| `f4403ae442f491382afae2921cae4ddab4b48b20c569a3c902d8c3a616061d46` |  8388608 |             153 |            147 |           4 |              0 |               0 |
| `72977b10edfc07c15bd3338618cfa97c1f0a20049becc8de4e042808db142451` |  2961408 |               1 |              1 |           0 |              0 |               0 |
| `77f9597136a5fdd9d1a8a28c6be4dab2205a39ab6c80bdb93855d454c60f89f4` |  3360756 |               1 |              1 |           0 |              0 |               0 |
| `0167fad7ed9ba2f053e622370308c38eeb7fadf9a8e97cb256bb09ecda2d7150` |  3780608 |               1 |              1 |           0 |              0 |               0 |
| `9ce88a49261216d80ed143ed9ca9b0f6cd885a3757e87d0b8328023a33a76a07` |  3385332 |               1 |              1 |           0 |              0 |               0 |
| `fcd0a7d9f42934b92783bc569ad3f48dea8e6b9775d0fafdd7b2dee9af587b03` | 16777216 |              32 |             32 |           5 |              0 |               0 |
| `74c196cc4a78b7b34ee237951c6a5e149574c660b706961a501b780381ab6045` | 16777216 |               1 |              1 |           0 |              0 |               0 |
| `d80d22d0f974377b0d2cee4346c92ab67175b1be7e315054c3094f38c0582868` | 16777216 |              71 |             37 |          12 |              0 |               0 |
| `4b6d321829b87da66fd01c248e39ce98d4db9f92496ccd18f3eb1cc1c3641a58` | 16777216 |              29 |             29 |          13 |              0 |               0 |
| `df8ea206f520421f1ea08cc6b1e3e95aa0c656700a501307610fe28a68bb79c9` | 16777216 |               3 |              2 |          16 |              0 |               2 |
| `f48b929b627333e23b418de2c9281a510d605ebf8cdf6b91ea40f67531d656f4` | 16777216 |             120 |            120 |           8 |              0 |               0 |
| `fed961867d190cc997289aff4b8040ff6b4a53d7860bb1f4f5a90cab501687ed` | 33554432 |              26 |             21 |          24 |              0 |               0 |
| `eaef255e10d7ee744785d550224827b8f677357a70fa126a1952a8a21cf73087` | 16777216 |               4 |              3 |           8 |              0 |               0 |
| `ba9b9c5774670527ef4e5fef4a5b3502eeb14a297224c177c49e422eff6316f5` |  8388608 |               3 |              3 |           8 |              0 |               0 |
| `5be53ad467bd2da007cc19c65fa5bacec35f33b2beba1f3e33985b4fae20002c` | 16777216 |              42 |             38 |           4 |              0 |               0 |
| `1a3d35d05025453ceeadd6c5a5c9087997726d903ad7a086c9f73bde52125b10` | 16777216 |              31 |             31 |          11 |              0 |               0 |
| `d34c9695d6d54595836212021797dd7557cabae0d25fd33cd0faa87c25640194` |  1048576 |               1 |              1 |           0 |              0 |               0 |
| `cd22f87daee0d50bf82520aaa6669a6731bdaaf3692690649533790c8e027f9a` |  4194304 |             181 |            181 |           2 |              0 |               0 |
| `78575954ba80c09b40b0283a0dc6b918ffeb4b9623a58613225cd85dd544ca4b` |  1048576 |               1 |              1 |           0 |              0 |               0 |
| `297390ca838c455791a5bf3a3f0001fbf36a8cb31be362ea2123b8df84dfffe8` |  8388608 |             195 |            186 |           0 |              0 |               0 |
| `6c640122fc2a7685c1dd9fc7aa818cf6df84ca16be512f5598c8338413e3ebbf` |  8388608 |              31 |             31 |           5 |              0 |               0 |
| `bb2c64b88ee99f1fcff4783cef5574d233e8a7ec7e81030dbfdda7ee31d6c84b` |   131072 |               1 |              1 |           0 |              0 |               0 |
| `894255a3c04ce75a720ee0c957745da0e0eb5aaaab16415c053cb77abdb8898c` |  8388608 |              19 |             19 |           5 |              0 |               0 |
| `795db1cf662d6276932de798366e039cab0df14dcba443187344116bec73f256` |  8388608 |              21 |             21 |           5 |              0 |               0 |
| `a0672250226d0dbc3b1cf59cb571984a4fc81e04084bc0de4ab236866c83899b` | 16777216 |              21 |             21 |          21 |              0 |               0 |
| `61f2f3402873e52752ad9260c9277636c0ce3693335ac75d685dba567ca6af33` |  8388608 |             251 |            251 |          11 |              0 |               0 |
| `6f51ecadda584829434aaa6b3338a626c9391bbeb4eeaf647b1b304d969687cd` |  9437184 |               2 |              2 |           7 |              0 |               0 |
| `66dc7cefac62283510bf22ebb27d1fdac8885ccaa29173b61880e9c223e962af` |  4194304 |             142 |            142 |           3 |              0 |               0 |
| `68eba5b369baf36c879551c0482a6feea31d68082bc4dd0631bf9e4427a88a64` | 33554432 |               9 |              6 |          25 |              0 |               0 |

## Reproduction

Create a private JSON manifest array containing `sha256`, `size` and `path` for
each local source. Only those fields are required; `path` is never emitted in the
report. Set `FIRMWARE_TRIAGE_MANIFEST` to that manifest and
`FIRMWARE_ACCEPTANCE_WASM_DIR` to the existing local production codec assets.
Then run:

```bash
FIRMWARE_ACCEPTANCE_SCENARIO=mixed-triage npm run firmware:acceptance
```

`scripts/firmware-mixed-triage.test.mjs` accepts 1–64 manifest entries, checks each
expected size/hash before discovery and the unchanged image hash afterward, and
prints only identities/counts. The measured run passed 31 source checks in 113.83
seconds. Those are private real-source inventory checks, separate from routine
synthetic regressions and from actual mixed output acceptance.

## Consequence for the roadmap

No qualifying mixed source was produced by this scan. Preserve the real-source
acceptance blocker and keep compressed mixed paths/package rebalancing blocked.
Further source acquisition belongs to the separately deferred corpus work; this
result does not authorize expanding that corpus or resuming OEM reverse
engineering. Firefox verification also remains open because Firefox is unavailable
in this environment. The supported P53 static Ref reconstruction acceptance is
unchanged. Shared comparison/history/session work can proceed while those explicit
validation gates remain visible; supported-circuit closure is not falsely claimed.
