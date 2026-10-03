# Reviewed case intake

The **Add case · download draft** button in each CorpusRunner result creates a
local `case.json`. It is available for a hashed image that does not already
have an exact catalogue identity. The file contains SHA-256, size, measured
structure, and separate observations for each Setup context. It does not
contain firmware bytes or automatically change the application. A failed read
has no image hash and cannot produce a draft.

## Review before inclusion

The downloaded file is a proposal with empty `id`, `label`, `source`,
`regressionTests` and `limitations`. Reviewers must:

1. Verify that the hash and size describe the **exact analyzed input**. Do not
   substitute the hash of a decoded Setup module or a repackaged image.
2. Check each observed structural field against the linked research record.
   Keep unknown measurements absent. Multiple Setup contexts stay separate;
   never add their Form counts together or attribute the complete image hash
   to an individual slot. A reviewed record needs at least one independently
   checked structural observation.
3. Write a `docs/**/*.md` source record containing the exact SHA-256 and the
   scope of the evidence. Add at least one relevant `src/**/*.test.ts`
   regression path and state explicit limitations. A matcher lead does not
   authorize a parser rule, an edit or full-image output.
4. Fill in a stable slug `id` and `label`. Optional `brand` and `generation`
   should be included only when independently substantiated. Filename aliases
   must be base names without local paths.

Maintainers can run `npm run case:add -- path/to/case.json`. The command checks
the required evidence, prevents duplicate IDs and hashes, and writes only the
reviewed `case` object to `src/knowledge/cases/reviewed/<id>.json`. Its draft
observations are deliberately excluded. If a draft is incomplete, the command
fails without adding a record.

The submitted PR must contain the research record, regression test and reviewed
JSON. `npm run case:check` runs in CI and validates required fields, safe paths,
the source hash, existing regression paths and catalogue uniqueness. The
catalogue test checks the resulting TypeScript fingerprint shape and all
identity links; normal build and test checks still apply. No new BIOS image is
shipped or ingested from the browser. The UI reads only committed, reviewed
records after the PR has been merged and deployed.
