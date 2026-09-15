# AMI multi-FormSet root visibility

## Scope

Some AMI Setup executables contain one Boolean byte for every HII FormSet. This
is a root-page registration mechanism, not an IFR `SuppressIf` condition.

The K01 hardware test established the observable polarity:

- `01`: keep the corresponding root page;
- `00`: remove the corresponding root page from the live Setup page list.

The bytes follow IFR FormSet order. They do **not** necessarily follow the
SetupData page-list order.

## Corpus result

The detector was checked locally against 26 supplied images:

| HII layout                                  | Samples | Result                               |
| ------------------------------------------- | ------: | ------------------------------------ |
| Multiple FormSets                           |      14 | 14 unique, code-corroborated vectors |
| Single FormSet in the Aptio IV-labelled set |       1 | Mechanism not applicable             |
| Single FormSet in the Aptio V-labelled set  |      11 | Mechanism not applicable             |

Observed multi-FormSet profiles included:

- five `00000011111` dual-profile images;
- one `111111000000` dual-profile image;
- six images with every declared root enabled;
- two images with individual vendor roots disabled.

All 26 SetupData bodies began with the same
`$SPF 00 02 00 00 10 02 00 00` prefix. Consequently, `$SPF` is useful AMI
SetupData evidence but is not an Aptio IV/V discriminator.

## Why the GUID is not the detector

The byte vector often appears near
`71202EEE-5F53-40D9-AB3D-9E0C26D96657`, commonly catalogued as the AMITSE
user-password-valid GUID. That relative placement is not invariant:

- several builds place the vector immediately before the GUID;
- another places the page-record array between them;
- a later build separates the vector and GUID with other data.

Searching around the GUID alone would therefore miss valid layouts and could
select unrelated zero/one data.

## Corroborated detector

The application reports a vector only when all of these checks pass:

1. IFR contains more than one FormSet.
2. The retained Setup provenance leads to a valid x86-64 PE32+ section.
3. Setup code loads a candidate byte vector and a companion page table with
   RIP-relative references.
4. The loop compares each vector byte with zero.
5. The loop advances the vector by one byte and the page table by `0x20`
   bytes per root.
6. The immediate or data-backed loop count equals the parsed FormSet count.
7. Every selected byte is `00` or `01`, and at least one root remains
   enabled.
8. Exactly one candidate satisfies the complete structure.

If any check fails, the result is unresolved or ambiguous and no state is
assigned.

## Editing boundary

The reported offsets belong to a retained decoded Setup buffer. They are not
assumed to be raw flash offsets. A future write operation must:

1. record the expected old byte;
2. change only one selected vector byte;
3. rebuild every enclosing section from the inside out;
4. repair section and FFS checksums;
5. reproduce the required compression format;
6. re-extract the complete result and verify the intended one-byte logical
   change and all unaffected regions.

Until that reconstruction path is implemented and independently verified, the
root-vector analysis remains read-only.
