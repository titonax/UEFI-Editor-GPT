# Contributing

Work from a focused branch and keep behavioural changes separate from mechanical
formatting. Before opening a pull request, run:

```bash
npm ci
npm run check
```

Pull requests should state:

- which firmware family and sample exercises the change;
- whether offsets, checksums or binary output can change;
- the evidence used for any HII/AMI semantic classification;
- the regression test added for the changed behaviour;
- any remaining inference or unsupported path.

Do not weaken a binary precondition to make a sample pass. Add the missing
format knowledge, preserve the original evidence and fail explicitly when the
structure cannot be proven safe.
