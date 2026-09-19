# Manufacturer evidence catalogue

The manufacturer can help choose which firmware structures to investigate,
including when the exact model is unknown. It is an observation about our
documented corpus, never proof that another image has the same architecture.
The complete structural analysis still runs for every input. Editing and
full-image writing remain subject to their own checks.

## Evidence and precedence

The application records _why_ it associated an input with a manufacturer:

| Evidence        | Meaning                                                                  |
| --------------- | ------------------------------------------------------------------------ |
| Exact SHA-256   | Same supplied image or extracted payload as a documented sample          |
| User selection  | Manufacturer supplied for this particular file; the model can be unknown |
| Firmware marker | A recognizable vendor string in the input bytes, with its offset         |
| Filename        | A manufacturer token in the selected file's name                         |

This is the precedence order. All signals are exported, including disagreeing
lower-priority signals. Multiple different brands at the strongest available
level leave the manufacturer unresolved. An explicit selection takes priority
over weaker automatic clues, while disagreement remains visible in the report.
No marker on its own establishes a firmware generation or navigation mechanism.

## Current observations

The catalogue contains **13 identified image or payload hashes** drawn from
the repository's existing metadata-only sample records:

| Manufacturer   | Samples | Aptio generation documented  | Observed input containers                                                       | Proven top-level navigation         |
| -------------- | ------: | ---------------------------- | ------------------------------------------------------------------------------- | ----------------------------------- |
| ASUS           |       5 | IV in 3 samples              | Vendor images, including capsules                                               | Single-FormSet IFR hub in 2 samples |
| HP             |       3 | IV in 3 samples              | 2 Intel flash images, 1 firmware-volume image                                   | Not yet catalogued                  |
| Intel (NUC)    |       1 | Probable V in browser report | Firmware-volume image, despite `.CAP` extension                                 | Single-FormSet IFR hub in 1 sample  |
| MSI            |       2 | IV in 2 samples              | 1 Intel flash image, 1 vendor image                                             | Not yet catalogued                  |
| ASRock         |       1 | Candidate, not confirmed     | Intel flash image                                                               | Not yet catalogued                  |
| Supermicro     |       1 | IV in 1 sample               | Intel flash image                                                               | Not yet catalogued                  |
| Dell, Gigabyte |       0 | Not yet catalogued           | Updater containers noted in intake; no extracted payload hash in this catalogue | Not yet catalogued                  |

The [Intel NUC case](samples/intel-nuc10i5fnh-0067.md) documents why its
support page on ASUS does not make it an ASUS motherboard sample. Its browser
report identifies probable Aptio V, while the catalogue only counts confirmed
generations. A validated outer firmware volume with the AMI FID GUID, `$FID`
record and `INTEL` vendor field supplies an internal manufacturer clue even
when a future revision changes the image hash.

The per-sample source paths and hashes are in
[`brandKnowledge.ts`](../../src/components/scripts/brandKnowledge.ts). The
ASUS hub evidence comes from
[`single-formset-ifr-navigation.md`](single-formset-ifr-navigation.md). The
other samples are in the HP, Supermicro and cross-vendor records under
[`docs/aptio-iv/samples`](../aptio-iv/samples). Samples without a verified
navigation observation contribute to manufacturer/container counts, not to a
navigation prediction. For example, five ASUS images do **not** mean five
confirmed single-FormSet hubs.

## How a new image is treated

1. Identify manufacturer clues and record their provenance, with or without a
   model name. If the clues are absent or ambiguous, keep the manufacturer
   unknown; the user can select it explicitly.
2. Show the catalogue's measured Aptio generations, containers, layouts and
   navigation mechanisms for that brand as leads, with sample counts.
3. Run the existing container, firmware-volume, HII and navigation detectors on
   the **actual image**. Compare structurally proven navigation with the lead;
   report a matching or new pattern when both sides have evidence.
4. Keep editing and reconstruction decisions tied to the actual image's
   structural proof and provenance. A brand match never unlocks a write path.

The initial implementation surfaces the leads in the single-image preflight
and local corpus report; it does not reorder detectors or learn new patterns
automatically. Corpus JSON schema `0.5.0` exports the evidence, counts and
comparison outcome. The CSV includes manufacturer, source, prior navigation
and outcome for grouping new observations. Firmware bytes stay in the browser.

## Growing the catalogue

Add a new case only after recording the exact analyzed payload hash, source
record, container evidence, and separately verified layout/navigation results.
An unexpected pattern is valuable evidence for another architecture, rather
than a reason to force the existing rule onto that image. Keep the source
metadata and regression sample descriptions reviewable without committing
firmware binaries or user-specific data.

An **Add case** flow would require an explicit ingestion and review process for
new evidence before it could amend the shipped catalogue. It is not part of
this version.
