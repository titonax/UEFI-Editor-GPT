# Format rule registry

`src/knowledge/rules.ts` records four bounded behaviors with their exported
implementation, regression tests, reviewed case references, prerequisites,
scope and limitations. The registry is versioned independently from the case
catalogue. A rule refers to the actual parser or writer code; its presence
does not activate that code.

| Rule                                                | Evidence                         | Boundaries                                                                                                 |
| --------------------------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| AMI single-FormSet IFR hub navigation               | NUC 0067, ASUS Z370-P and Z390-E | Requires a coherent parsed context and IFR references proving the hub.                                     |
| Award legacy LHA inventory                          | eMachines EL1200                 | Read-only bounded, checksummed module inventory.                                                           |
| Phoenix fixed-allocation TEMPLAT LH5 reconstruction | Acer Z03                         | Verified visibility edit, bounded codec round-trip, unchanged outer bytes and independent re-open.         |
| UEFI fixed-size uncompressed image reconstruction   | Synthetic regressions only       | Complete provenance, uncompressed ancestors and same-size replacements. LZMA and EFI/Tiano remain blocked. |

The CorpusRunner case detail shows related rule references only for an exact,
uncontradicted case identity. It does not use structural similarity or a brand
guess to associate a rule with an input. A reference still needs all runtime
preconditions checked by its implementation. The runner continues to show its
own stage failures, editing capabilities and reconstruction blockers; rule
references cannot override them.

`rules.test.ts` checks that each implementation exports the named function,
every regression path exists, each referenced case is reviewed and links to a
related test, and synthetic-only rules do not claim reviewed sample evidence.
When a parser or writer changes, update its registry scope and limitations
alongside the code and acceptance records. Completing the compressed UEFI
writer requires deterministic encoders, allocation/checksum work, independent
re-extraction and a real-image acceptance record in the roadmap.
