# R1-C claim-traceability overlay

This directory is an R1-C overlay. It does not modify or supersede the frozen files in `competition/r1-draft/`.

`00_CLAIM_TRACEABILITY_OVERLAY.json` supplies only deterministic mapping context that is not encoded next to every historical sentence, chiefly paragraph-to-ledger links for the summary/disclosure and scene-to-ledger links for the demo script. The generator still reads the existing R1 claim ledger for exact approved wording, evidence references, dates, and limitations.

The overlay deliberately does **not** record owner, team, native-language, accessibility, provider, external, publication, or submission approval as complete. Governance-source-only mappings prove that wording was inventoried; they do not independently validate the underlying assertion.

A searchable R1-C deck PDF is now present in this overlay directory and is treated as candidate submission copy. Its page text is mapped only when it exactly matches visible text on the corresponding historical PPTX slide; any new unmatched affirmative wording fails the machine gate. Any later TXT, Markdown, PDF, or PPTX copy in this directory is also scanned automatically. This explanatory overlay file is the sole configured exclusion.
