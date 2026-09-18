# AMI single-FormSet IFR navigation

## Scope

Some later AMI Setup layouts place the visible navigation pages inside one HII
FormSet. They do not use the per-FormSet `00`/`01` root vector described in
[`root-visibility-vector.md`](root-visibility-vector.md). In this layout, the
FormSet entry Form is a navigation hub and its direct IFR `Ref` opcodes declare
the current top-level tabs.

Three concepts must remain separate:

1. an AMITSE-registered page;
2. a Form reachable in the IFR graph;
3. a direct child of the IFR navigation hub.

Only the third relationship is structural evidence that a page is a current
top-level IFR tab. Registration is useful corroboration, but does not promote a
descendant or detached page automatically.

## PRIME Z370-P 3004 regression sample

The supplied firmware is not committed. Its identity and locally reproduced
results are:

| Property       | Result                                                             |
| -------------- | ------------------------------------------------------------------ |
| File           | `PRIME-Z370-P-ASUS-3004.CAP`                                       |
| Bytes          | 16,779,264                                                         |
| SHA-256        | `e862e5b0fdce10e44764be6072dd5b8017544264353dbfa02c8074e0ccc15190` |
| Outer layout   | `0x800` vendor capsule header plus a 16 MiB firmware image         |
| HII FormSets   | 1                                                                  |
| FormSet GUID   | `7B59104A-C00D-4158-87FF-F04D6396A915`                             |
| Parsed Forms   | 205                                                                |
| Navigation hub | `Setup`, FormId `0x2711`                                           |

The hub contains these direct Refs, in IFR order:

| Index | Tab          | FormId   | IFR Ref offset |
| ----: | ------------ | -------- | -------------- |
|     0 | My Favorites | `0x2713` | `0x44944`      |
|     1 | Main         | `0x2714` | `0x44953`      |
|     2 | Ai Tweaker   | `0x2719` | `0x44962`      |
|     3 | Advanced     | `0x271A` | `0x44971`      |
|     4 | Monitor      | `0x271D` | `0x44980`      |
|     5 | Boot         | `0x271F` | `0x4498F`      |
|     6 | Tool         | `0x2721` | `0x4499E`      |
|     7 | Exit         | `0x2722` | `0x449AD`      |

AMITSE contains 15 matching registration occurrences, including duplicates and
three registered pages that are not direct hub tabs. In particular, `Security`
(`0x2716`) is registered but is an IFR descendant of `Main` (`0x2714`). Treating
every AMITSE GUID/FormId match as a root incorrectly promotes it.

## ROG STRIX Z390-E GAMING regression sample

A second supplied capsule identifies itself internally as
`ROG-STRIX-Z390-E-GAMING` and `SZ390E.CAP`. It exercises the same navigation
architecture with different FormIds and one additional direct tab:

| Property       | Result                                                             |
| -------------- | ------------------------------------------------------------------ |
| Bytes          | 16,781,312                                                         |
| SHA-256        | `9344b904cd319b3d385ffdf74d232a5e3999a2963cc74937af95a631a87f1454` |
| Outer layout   | `0x1000` vendor capsule header plus a 16 MiB firmware image        |
| HII FormSets   | 1                                                                  |
| FormSet GUID   | `7B59104A-C00D-4158-87FF-F04D6396A915`                             |
| Parsed Forms   | 229                                                                |
| Parsed Refs    | 294                                                                |
| Navigation hub | `Setup`, FormId `0x2710`                                           |

The hub's nine direct Refs are `My Favorites` (`0x2712`), `Main` (`0x2713`),
`Ai Tweaker` (`0x2714`), `Advanced` (`0x2715`), `Monitor` (`0x2716`), `Chipset`
(`0x2717`), `Boot` (`0x2718`), `Tool` (`0x2719`) and `Exit` (`0x271A`). AMITSE
corroborates every direct tab. It also registers `Security` (`0x27E5`), which is
an IFR descendant of `Main`, and a detached `Exit` (`0x271B`); neither is
promoted to a top-level tab. This independently reproduces the detector's key
rule: IFR hub parentage defines navigation while AMITSE registration only
corroborates it.

## Detector invariants

The application reports this layout only when:

1. IFR contains exactly one unambiguous FormSet entry;
2. that entry resolves to exactly one Form;
3. the entry has at least two direct, same-FormSet Refs on initial detection;
4. every direct Ref resolves to exactly one Form;
5. direct target identities are unique;
6. tab order comes from Ref order, never from AMITSE occurrence order.

AMITSE matches are collapsed by FormSet GUID and FormId while retaining every
registration offset. Registered pages are then labelled as the hub, a direct
tab, a page referenced inside a constant-true `SuppressIf`, a reachable
descendant, or registered-only. Missing or duplicate direct targets make the
result ambiguous and disable the stronger classification.

## Editing boundary

This layout needs no new FormSet and no guessed visibility byte. Three distinct
operations are exposed:

- **Hide** moves the existing hub `Ref` into an existing, constant-true
  `SuppressIf` scope that already contains hidden `Ref` statements. The
  destination expression, scope boundaries, owner Form and original bytes must
  all be proven before the button is enabled.
- **Show** returns that same suppressed `Ref` directly to the proven hub, before
  its original next tab when that ordering anchor still exists.
- **Move** relocates the `Ref` under another existing Form and keeps the page
  reachable there.

All three are fixed-size structural moves. They neither add opcodes nor change
the HII byte length. The inventory also preserves the prior page order while a
tab is hidden, so only its state and action change in the UI. The move planner remains responsible for scope,
duplicate, package-boundary and byte-precondition checks.

After every pending move the application rebuilds graph parentage and
recomputes the tab inventory. AMITSE registration is preserved as evidence and
is not rewritten merely because IFR parentage changed. Full-image reinsertion
remains blocked until the enclosing PE/FFS/compression path can be rebuilt and
independently re-extracted.

The inventory exposes this distinction directly: a current direct tab has
separate **Hide** and **Move…** buttons; a proven suppressed page has a
**Show** button; and a uniquely referenced descendant can be promoted or moved.
An AMITSE-only registration stays disabled when no unique IFR Ref exists; the
application will not invent an opcode merely to make that page editable.

The PRIME Z370-P sample was exercised end-to-end by hiding its final `Exit`
tab and showing it again. Both intermediate streams reparsed without
diagnostics, remained exactly 1,457,088 bytes, and the final HII byte stream
matched the original byte-for-byte.
