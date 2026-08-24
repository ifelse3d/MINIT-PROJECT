# R1 Prohibited-Phrase Check

## Scope, reviewer and exit rule

**Final local review date:** 9 August 2026.  
**Second contextual reviewer:** independent R1 truth-pack review pass.  
**Scope:** all eight numbered truth-pack files; final PPTX visible text; all ten speaker-note bodies; slide, relationship and presentation OOXML; core/app/custom properties; final PDF metadata and extractable text; the generated PPTX inspection record; and rendered-slide/PDF equivalence. No video, public page or owner-controlled portal payload exists in this local scope.

Questions, explicit denials, limitations, format gates, pattern definitions and marked instructions can match a pattern. Every match was reviewed in context. The local exit condition is zero **affirmative prohibited present-tense claims**. Publication and submission remain separate owner gates.

## Final artifact identity

| Artifact | Bytes | SHA-256 |
|---|---:|---|
| `01_PROJECT_SUMMARY.txt` | 2,361 | `C0A24E30F793F4CCA27AA4350AD1B289CA1FF63D0A8E96FC232573A7452C7D56` |
| `02_AI_DISCLOSURE.txt` | 3,683 | `6F64559AE9B86DADE185041369CCEE03D7D2C88D09263DD78344B9B967C11D39` |
| `03_CLAIM_LEDGER.md` | 15,770 | `050DADF31A2D1910BF86DF41711F991DB6978F2C7C8B9784538D3B1A9277CC1D` |
| `05_DECK_10_SLIDE_CONTENT.md` | 11,252 | `2668A0BB8C2F6C91D2A6468A196CA3F0DB548F50CD872F215BDA76CFD159DD10` |
| `06_DEMO_SCRIPT_3_MINUTES.md` | 8,016 | `C85E07B6C03729584E91C9EC60F1FF60E16DD82B0FB82F0C5462092948FB2A4A` |
| `07_JUDGE_QA.md` | 12,643 | `CDC40489C2B7A1166C23FCD5CC0FB0EC5A077CDD3AAE21E1B00C744AE3E331D3` |
| `08_SUBMISSION_CHECKLIST.md` | 14,293 | `352CC4B194C14E90B47F82DE589E03F75193C79A8BA75FED84CB767AF8782000` |
| `Minit-R1-Competition-Deck.pptx` | 52,152 | `5681248D51797E37A3756AF74C72CCCA723454C989FEA0992810C8272BDF20AF` |
| `Minit-R1-Competition-Deck.pdf` | 712,717 | `53EC36A310B990B369CB9C0F7AC6E1692E7891DB2CB495DF7CDF9E433CB1C1F3` |
| `Minit-R1-Competition-Deck.pptx.inspect.ndjson` | 35,658 | `E3F474940400BB21B3337FA8CEE36508EDCE5D2649E0D42137A845A0D50EDDDC` |

This report does not embed its own hash because doing so would be recursively unstable. The final review-bundle manifest must hash it after the last edit.

## Exact final commands

All commands below were run from `C:\dev\minit`. They are read-only; no extraction directory or scan-output file is created.

```powershell
Get-FileHash competition/r1-draft/01_PROJECT_SUMMARY.txt,
  competition/r1-draft/02_AI_DISCLOSURE.txt,
  competition/r1-draft/03_CLAIM_LEDGER.md,
  competition/r1-draft/05_DECK_10_SLIDE_CONTENT.md,
  competition/r1-draft/06_DEMO_SCRIPT_3_MINUTES.md,
  competition/r1-draft/07_JUDGE_QA.md,
  competition/r1-draft/08_SUBMISSION_CHECKLIST.md,
  competition/r1-draft/Minit-R1-Competition-Deck.pptx,
  competition/r1-draft/Minit-R1-Competition-Deck.pdf,
  competition/r1-draft/Minit-R1-Competition-Deck.pptx.inspect.ndjson -Algorithm SHA256
```

### Exact prohibited patterns and eight-file scan

```powershell
$patterns = [ordered]@{
  'AI_ABSOLUTES' = '(?i)\b(?:AI|Minit|model)\s+(?:never|cannot)\s+(?:invent|hallucinat|guess)|\bzero[- ]hallucination\b|\bhallucination[- ]free\b'
  'HANDWRITING_PERFORMANCE' = '(?i)\b(?:real[- ]?)?handwrit(?:ing|ten)\b.{0,60}\b(?:accuracy|accurate|reliable|reads?|support(?:s|ed)?)\b|\breads?\s+(?:real\s+)?handwrit'
  'GROUNDING_ABSOLUTES' = '(?i)\b(?:every|all)\s+(?:fact|field|answer|output)s?\b.{0,70}\b(?:verified source region|source region|grounded|source[- ]bound)\b'
  'UNIVERSAL_HUMAN_REVIEW' = '(?i)\b(?:every|all)\s+(?:AI\s+)?outputs?\b.{0,70}\b(?:named human|human[- ]confirmed|confirmed by a human)\b|\bhumans?\s+confirm(?:s|ed)?\s+everything\b'
  'LANGUAGE_OVERCLAIM' = '(?i)\bfully\s+trilingual\b|\bfull\s+(?:BM|Malay|Chinese|English).{0,40}(?:parity|support)\b|\bTraditional Chinese\s+(?:is\s+)?supported\b|\ball Chinese\b'
  'PRODUCTION_COMPLIANCE' = '(?i)\b(?:production[- ]ready|pilot[- ]ready|production[- ]safe|secure at scale|PDPA[- ]compliant|PDPA by design)\b'
  'OFFICIAL_OUTPUTS' = '(?i)\b(?:official|audit[- ]ready|auditable|regulator[- ]accepted|government[- ]accepted|upload[- ]ready|LHDN[- ]ready|MyInvois[- ]compatible)\b.{0,45}\b(?:receipt|filing|document|output|workbook|file|system)?\b'
  'DEPLOYMENT_TRACTION' = '(?i)\b(?:live|current|existing)\s+(?:pilot|customer|reseller|partner|deployment|revenue)\b|\bdeployed\s+(?:across|to|in)\b|\b20\+?[- ]branch\b|\b20[- ]branch\b'
  'CURRENT_ECONOMICS' = '(?i)\b(?:current|measured|actual)\s+(?:gross\s+)?margin\b|\bwe\s+(?:charge|earn|generate)\s+RM\s*\d'
  'DELETION_ABSOLUTES' = '(?i)\b(?:everything|all copies|every copy)\s+(?:is|are|was|were|gets?|will be)\s+(?:deleted|removed|erased)\b|\bno copy (?:is|was|will be) kept\b|\bcomplete deletion\b'
  'GOVERNMENT_RELATIONSHIP' = '(?i)\b(?:government|council|agency)\s+(?:accepted|approved|endorsed|integrated|partner(?:ed|ship)?)\b|\bintegrated with (?:government|MyInvois|eROSES)\b'
  'MEASURED_IMPACT' = '(?i)\b(?:measured|proven|demonstrated)\b.{0,60}\b(?:civic|national|public[- ]service|hours saved|service improvement|impact)\b'
  'HERO_AS_PRODUCT' = '(?i)\b(?:Minit|we)\s+(?:currently|already|today)\s+(?:operates?|runs?|provides?|deploys?|supports?)\b.{0,80}\b(?:request[- ]to[- ]resolution|community request|walkway light)\b'
  'REAL_DELIVERY' = '(?i)\b(?:message|response|notification)\s+(?:was|is|has been)\s+(?:sent|delivered)\b|\bsent successfully\b|\bdelivery confirmed\b'
  'OFFICIAL_SCORE' = '(?i)\b38\.2(?:/100|\s*percent|%)?\b|\bofficial MAIC score\b'
}

$scanTargets = Get-ChildItem -LiteralPath competition/r1-draft -File |
  Where-Object { $_.Name -match '^0[1-8]_' -and $_.Extension -in @('.txt','.md') } |
  Sort-Object Name |
  ForEach-Object { $_.FullName }

$results = foreach ($entry in $patterns.GetEnumerator()) {
  rg -n --pcre2 --no-heading --color never -- $entry.Value $scanTargets |
    ForEach-Object { "[$($entry.Key)] $_" }
}
$results

$inspectResults = foreach ($entry in $patterns.GetEnumerator()) {
  rg -n --pcre2 --no-heading --color never -- $entry.Value competition/r1-draft/Minit-R1-Competition-Deck.pptx.inspect.ndjson |
    ForEach-Object { "[$($entry.Key)] $_" }
}
$inspectResults
```

### PPTX visible text, notes and OOXML/core metadata

```powershell
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead(
  (Resolve-Path 'competition/r1-draft/Minit-R1-Competition-Deck.pptx')
)
try {
  $records = @()
  $slides = @($zip.Entries | Where-Object FullName -match '^ppt/slides/slide\d+\.xml$')
  $notes = @($zip.Entries | Where-Object FullName -match '^ppt/notesSlides/notesSlide\d+\.xml$')
  foreach ($entry in @($slides + $notes)) {
    $reader = [IO.StreamReader]::new($entry.Open())
    try { $xml = [xml]$reader.ReadToEnd() } finally { $reader.Dispose() }
    $index = 0
    foreach ($node in $xml.SelectNodes("//*[local-name()='t']")) {
      $index++
      $records += [pscustomobject]@{
        Source = "$($entry.FullName):text[$index]"
        Text = $node.InnerText
      }
    }
    foreach ($node in $xml.SelectNodes("//*[local-name()='cNvPr']")) {
      $description = $node.GetAttribute('descr')
      if ($description) {
        $records += [pscustomobject]@{ Source = "$($entry.FullName):descr"; Text = $description }
      }
    }
  }
  foreach ($name in @('docProps/core.xml','docProps/app.xml','docProps/custom.xml','ppt/presentation.xml')) {
    $entry = $zip.Entries | Where-Object FullName -eq $name
    if ($entry) {
      $reader = [IO.StreamReader]::new($entry.Open())
      try { $raw = $reader.ReadToEnd() } finally { $reader.Dispose() }
      $records += [pscustomobject]@{ Source = $name; Text = $raw }
    }
  }
  $pptxHits = foreach ($pattern in $patterns.GetEnumerator()) {
    foreach ($record in $records) {
      if ([regex]::IsMatch($record.Text, $pattern.Value)) {
        "[$($pattern.Key)] $($record.Source) :: $($record.Text)"
      }
    }
  }
  $packageEntries = @($zip.Entries | Where-Object FullName -match '\.(xml|rels)$')
  $packageHits = foreach ($entry in $packageEntries) {
    $reader = [IO.StreamReader]::new($entry.Open())
    try { $raw = $reader.ReadToEnd() } finally { $reader.Dispose() }
    foreach ($pattern in $patterns.GetEnumerator()) {
      if ([regex]::IsMatch($raw, $pattern.Value)) {
        "[$($pattern.Key)] $($entry.FullName)"
      }
    }
  }
  $presentation = $records | Where-Object Source -eq 'ppt/presentation.xml'
  $presentationXml = [xml]$presentation.Text
  $slideIds = @($presentationXml.SelectNodes("//*[local-name()='sldId']"))
  $slideGroups = @($records | Where-Object Source -like 'ppt/slides/*' |
    Group-Object { ($_.Source -split ':text')[0] })
  $noteGroups = @($records | Where-Object Source -like 'ppt/notesSlides/*' |
    Group-Object { ($_.Source -split ':text')[0] })
  [pscustomobject]@{
    SlideXml = $slides.Count
    NoteXml = $notes.Count
    PresentationSlideIds = $slideIds.Count
    HiddenSlides = @($slideIds | Where-Object { $_.GetAttribute('show') -eq '0' }).Count
    BoundarySlides = @($slideGroups | Where-Object {
      ($_.Group.Text -join ' ').Contains('Fictional competition demo — proposed workflow, not production')
    }).Count
    BadgeSlides = @($slideGroups | Where-Object {
      ($_.Group.Text -join ' ').Contains('PROPOSED • FICTIONAL DATA')
    }).Count
    CorrectHallNameSlides = @($slideGroups | Where-Object {
      ($_.Group.Text -join ' ').Contains('Dewan Komuniti Seri Damai')
    }).Count
    NotesWithClaimIdsAndSources = @($noteGroups | Where-Object {
      $text = $_.Group.Text -join "`n"
      $text.Contains('Claim IDs:') -and $text.Contains('[Sources]')
    }).Count
    CandidateHits = @($pptxHits).Count
    XmlAndRelationshipEntries = $packageEntries.Count
    PackageEntryCategoryHits = @($packageHits).Count
  }
  $pptxHits
  $packageHits
} finally {
  $zip.Dispose()
}
```

### PDF metadata, text and page count

PyMuPDF was used because `pdftotext` was unavailable in this environment.

```powershell
$pdfJson = python -c "import fitz,json; d=fitz.open(r'competition/r1-draft/Minit-R1-Competition-Deck.pdf'); print(json.dumps({'page_count':d.page_count,'metadata':d.metadata,'pages':[p.get_text('text') for p in d]},ensure_ascii=False))"
$pdf = $pdfJson | ConvertFrom-Json
$pdfRecords = @()
foreach ($property in $pdf.metadata.psobject.Properties) {
  $pdfRecords += [pscustomobject]@{ Source = "pdf:metadata:$($property.Name)"; Text = [string]$property.Value }
}
for ($index = 0; $index -lt $pdf.pages.Count; $index++) {
  $pdfRecords += [pscustomobject]@{ Source = "pdf:page:$($index + 1):extractable-text"; Text = [string]$pdf.pages[$index] }
}
$pdfHits = foreach ($pattern in $patterns.GetEnumerator()) {
  foreach ($record in $pdfRecords) {
    if ([regex]::IsMatch($record.Text, $pattern.Value)) {
      "[$($pattern.Key)] $($record.Source) :: $($record.Text)"
    }
  }
}
[pscustomobject]@{
  Pages = $pdf.page_count
  ExtractableTextCharacters = (@($pdf.pages) | ForEach-Object { $_.Length } | Measure-Object -Sum).Sum
  CandidateHits = @($pdfHits).Count
}
$pdfHits
```

### Image-only PDF visible-content equivalence

The existing 1,920×1,080 PPTX and PDF renders were compared in memory, and the contact sheet was manually inspected:

```powershell
python -c "from PIL import Image,ImageChops,ImageStat; from pathlib import Path; a=Path(r'r1-output/_presentation_work/final-render'); b=Path(r'r1-output/_presentation_work/final-pdf-render'); [(lambda p,q: print(f'{i:02d} rms={(sum(x*x for x in ImageStat.Stat(ImageChops.difference(p,q)).rms)/3)**0.5:.3f}'))(Image.open(a/f'slide-{i:02d}.png').convert('RGB'),Image.open(b/f'page-{i:02d}.png').convert('RGB')) for i in range(1,11)]"
```

## Complete candidate register and second-review disposition

The eight numbered text files produced **36 pattern/file-line candidates across 10 categories**. Multiple categories can map to one line. Every candidate is accounted for below; no match is omitted by excluding governance files.

| Source | Candidate location/category | Count | Second-review disposition |
|---|---|---:|---|
| `01_PROJECT_SUMMARY.txt` | line 11: `OFFICIAL_OUTPUTS`, `MEASURED_IMPACT` | 2 | `EXPLICIT NEGATION` — the sentence disclaims those claims. |
| `02_AI_DISCLOSURE.txt` | line 13: `AI_ABSOLUTES` | 1 | `LIMITATION` — a scoped run result is expressly distinguished from an impossibility claim. |
| `03_CLAIM_LEDGER.md` | lines 8, 26, 36 and 40 across six categories | 9 | Two `LIMITATION`/negative-truth rows, one submission-format gate, and six entries in the explicit prohibited-claim register. |
| `04_PROHIBITED_PHRASE_CHECK.md` | pattern-map code block | 3 | `PATTERN DEFINITION` — regex source, not material copy. |
| `05_DECK_10_SLIDE_CONTENT.md` | lines 29, 88 and 162 | 3 | One scope exclusion, one `LIMITATION`, one `EXPLICIT NEGATION`. |
| `06_DEMO_SCRIPT_3_MINUTES.md` | lines 7, 8, 10, 14 and 16; one line matches twice | 6 | `DO NOT SAY` instructions only. None is narration or required visible copy. |
| `07_JUDGE_QA.md` | lines 20, 27 and 41 | 3 | `HOSTILE QUESTION` with an immediate bounded negative answer. |
| `08_SUBMISSION_CHECKLIST.md` | lines 5, 7, 11, 14, 20, 26, 96, 126 and 132 | 9 | Format/publication/claim-control checklist gates, not product assertions. |

The final PPTX package produced **5 candidates across 4 categories**:

| OOXML source | Category | Disposition |
|---|---|---|
| `ppt/slides/slide2.xml:text[10]` | `OFFICIAL_OUTPUTS` | Visible scope exclusion. |
| `ppt/slides/slide4.xml:text[11]` | `REAL_DELIVERY` | Visible explicit negation beside `Simulate send`. |
| `ppt/notesSlides/notesSlide2.xml:text[1]` | `MEASURED_IMPACT` | Speaker-note limitation. |
| `ppt/notesSlides/notesSlide5.xml:text[1]` | `PRODUCTION_COMPLIANCE` | Speaker-note limitation scoped to the isolated route. |
| `ppt/notesSlides/notesSlide9.xml:text[1]` | `MEASURED_IMPACT` | Speaker-note explicit negation. |

`Minit-R1-Competition-Deck.pptx.inspect.ndjson` contains duplicate representations of the same **5 candidates across 4 categories** listed above and no additional candidate context.

The final PDF produced **0 metadata/extractable-text candidates**. Its ten page text layers contain **0 extractable characters**; visible page content is image-based. The ten existing PDF renders match the ten PPTX renders at the same 1,920×1,080 dimensions, with per-page RGB RMS differences from **7.009 to 13.208 on a 0–255 scale**, consistent with renderer antialiasing. Manual contact-sheet review found no added or substituted PDF wording.

## Structural and metadata results

- PPTX slide XML entries: **10**.
- PPTX `presentation.xml` slide IDs: **10**.
- Hidden slide IDs: **0**.
- PPTX speaker-note XML entries: **10**; **10/10** contain claim IDs and `[Sources]` blocks.
- Exact truth-boundary footer present: **10/10 slides**.
- Exact `PROPOSED • FICTIONAL DATA` status present: **10/10 slides**.
- Slide 2 uses the source-consistent fictional location `Dewan Komuniti Seri Damai`; the shortened pre-final hall name is absent.
- PDF pages: **10**.
- PPTX custom-properties part: absent.
- Complete raw OOXML/relationship scan: **58 entries**; the same **5** slide/note category hits above and no additional hidden/package candidate.
- PPTX core properties: creator/last modifier `Walnut Exporter`, title `Presentation`; no prohibited claim, secret or personal data.
- PPTX app properties report exporter bookkeeping values `Slides=0` and `Notes=0`, inconsistent with the actual package counts above. This is a non-claim metadata anomaly, not a hidden slide or prohibited phrase.
- PDF metadata title: `Minit R1 Competition Deck — Private Review Draft`; author: `Minit — AI-assisted draft for owner review`; subject is the exact fictional/proposed boundary; creator `anonymous`; no prohibited claim, secret or personal data.
- Manual review of all visible slide text and all ten speaker-note bodies found no affirmative prohibited claim outside the automated candidates.

## Final result record

| Item | Actual result | Status |
|---|---|---|
| All eight numbered truth-pack files | 36 candidates / 10 categories; all second-reviewed as negation, limitation, hostile question, scope/gate, pattern definition or marked instruction | PASS |
| Final PPTX visible text and notes | 5 candidates / 4 categories; all bounded/exclusion contexts | PASS |
| Final generated inspection record | Same 5 candidates / 4 categories as the PPTX; no additional context | PASS |
| PPTX OOXML/core/app/custom metadata | 0 prohibited candidates; one disclosed exporter-count anomaly | PASS WITH NON-CLAIM NOTE |
| Final PDF metadata/text | 10 pages; 0 extractable characters; 0 candidates | PASS |
| Rendered PDF versus PPTX visible content | 10/10 page pairs reviewed; no added/substituted wording | PASS |
| Affirmative prohibited present-tense claims in scanned local final pack | **0** | PASS |
| Video title/description/subtitles/thumbnail | No final video artifact supplied | NOT VERIFIED |
| Public URL, access-page captions and hosting metadata | No publication authorised or performed | NOT VERIFIED |
| Owner-controlled portal paste/upload rehearsal | Not performed in this review | NOT VERIFIED |
| Owner publication/submission approval | Not granted by this review | NOT VERIFIED |

**Local claim-scan conclusion:** `PASS — ZERO AFFIRMATIVE PROHIBITED PRESENT-TENSE CLAIMS IN THE SCANNED R1 LOCAL PACK.`

This pass does not authorise publishing or submitting. If any text, binary, caption, video metadata, portal payload or public-access page changes, rerun the full scan and contextual review on the new hashes.
