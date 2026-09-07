# Signature acceptance and capacity investigation

The reported errors were reproducible implementation problems. “Invalid signature contour” did not mean that the applicant's handwriting was legally or personally invalid. The old parser used that message when a single generated path exceeded 18,000 characters, even if its complete JSON still fitted the 28,000-character application budget. A smooth eight-loop test with 400 pointer events produced 18,406 JSON characters and hit that guard. The same curve at 450–600 events also failed.

The capture module also rejected deliberate dots, short marks, horizontal lines and vertical lines through distance, point-count and bounding-box rules. It limited the pad to 24 strokes and silently stopped collecting a stroke after 1,200 retained samples. In the previous implementation, some apparently successful submissions therefore omitted the end of the signature or a disconnected dot.

## What the revised capture permits

- A short stroke, initials, underline or arbitrary squiggle is accepted. Following the user's later clarification, the combined mark must span at least **12 logical pixels in either width or height**, so an accidental dot gets a friendly request for a slightly larger mark. A narrow vertical mark or flat horizontal mark can qualify. There is no attempt to infer whether it looks like a name or a “real signature.”
- There is no fixed stroke-count or pointer-sample-count cap. Tests retain complete signatures with 64 strokes, hundreds of dots and 60,000 pointer events.
- Pointer interruption keeps ink already entered. Undo, redo and clear continue to work. An unrelated pointer cannot cancel an active stroke, and releasing a pen preserves its final pressure.
- The stored vector is the exact finalized contour used to display and rasterize the mark. Default contour compaction uses a bounded subpixel approximation. If ordinary contours cannot fit, a second pass can reduce local micro-jitter: a centered window of up to seven samples is considered only when every neighbor is within two logical pixels, and movement is clamped to one pixel. The original samples, pressures and endpoints remain unchanged in the pad. Raw browser events are not promised as the permanent master.
- The version remains `1`, with a 600 × 180 coordinate system. Existing `M/Q/L/Z` contours remain readable. Newly generated compact contours use `M/L/Z`.
- Remaining format checks validate controlled numeric geometry and the declared schema. They reject malformed or executable payloads, not handwriting style.

## Why a finite limit remains

`Signature_Vector__c` and `Signature_PNG_Base64__c` are each configured for **131,072 characters**, increased from 32,768. The previous application budget was only 28,000 characters per value. These are text fields used to transport the data through Web-to-Lead; available Salesforce File storage does not remove a text field's character limit.

The vector limit applies to the **complete JSON**, including property names, punctuation and all strokes. Base64 also expands the PNG bytes: a 131,072-character Base64 value can represent up to 98,304 bytes. These two limits are independent.

**The full Web-to-Lead request is the tighter live-form constraint.** The Megistos endpoint accepted an exactly **102,400-byte URL-encoded POST** and returned HTTP 400 at **102,401 bytes** during the live investigation. The form therefore uses a **92,160-byte complete POST budget**, retaining 10% headroom, and a 117,964-character per-signature-field budget. The request budget includes the applicant's other details, Salesforce field IDs, return URL, UTF-8 and Base64 escaping, grouped values and normalized line endings. It is computed from the same entry list used to build the real native submission. Two text fields being large enough individually does not mean their combined request fits.

The PNG starts at 1200 × 360. If its actual encoded size or complete POST is too large, the same finalized paths are tried at 900 × 270, 600 × 180, 450 × 135, then 300 × 90. The largest attempted size that fits is used; the stored vector is unchanged by raster size fallback. Only after trying those raster sizes does export consider a coarser contour or the bounded micro-jitter pass. The form stops before submission if no candidate can fit; it does not rely on a server HTTP 400 to inform the applicant.

Some extremely dense input can still exceed the available request or contour budget even when it does not look visually large. Repeated subpixel reversals can make the perfect-freehand outline much more complex than its appearance suggests. The new bounded micro-jitter pass resolves the reproduced 12,000-event shaky signature: its compacted contour fell from over 1.2 million characters to 6,390. The pad keeps over-capacity ink available for editing rather than silently truncating it. No finite request can promise unlimited input.

## Measured baseline

The baseline uses commit `9223b3d` and the actual bundled perfect-freehand implementation. Results are saved in [the before fixture](../tests/fixtures/signature-stress-before.json).

Of the original 28 named stress cases, only five exports succeeded. Three of those five had lost input: the initials lost their dot, and the two very high sample-count signatures had stopped at the 1,200-sample cap. These are deliberately varied synthetic cases, not a statistical claim about the proportion of real applicants affected.

The following measurements isolate the reusable capture's full 131,072-character field capacity. They explicitly request that field ceiling; they are **not** claims that the same output could bypass the live form's smaller complete POST budget. The separate full-form tests below use the actual request-size calculator and live budgets.

| Input | Previous result | Revised field-capacity result |
| --- | --- | ---: |
| Deliberate dot | Dropped/rejected | Retained; asks for a slightly larger mark |
| One-pixel short mark | Rejected by handwriting minimum | Retained; asks for a slightly larger mark |
| Long horizontal underline | Rejected despite 8,811-character payload | 298 characters |
| Initials and disconnected dot | Accepted after dropping dot | 1,190 characters, all four strokes |
| Ordinary cursive, 800 events | 31,282 characters; rejected | 7,460 characters |
| Elaborate cursive, 2,400 events | Stopped at 1,200; then rejected | 13,064 characters, complete |
| 64 independent strokes | Stopped after 24 strokes | 15,132 characters, all 64 strokes |
| 20,000-event smooth signature | Accepted after stopping at 1,200 | 6,707 characters, all 20,000 events captured |
| Pen with varying pressure | Rejected | 8,600 characters |
| Eighty dense loops, 12,000 events | Stopped at 1,200; rejected | 39,155 characters, complete |
| 60,000-event signature | Accepted after stopping at 1,200 | 28,463 characters, all 60,000 events captured |
| 12,000-event shaky signature | Stopped at 1,200; rejected | 6,390 characters after bounded micro-jitter reduction |

## Reproducible test coverage

The additional stress suite is [signature-stress.test.mjs](../tests/signature-stress.test.mjs), with deterministic generators in [signature-stress-harness.mjs](../tests/helpers/signature-stress-harness.mjs).

The named matrix covers dots, tiny horizontal and vertical marks, disconnected initials, cursive loops, elaborate ornaments, many separate strokes, light/full/changing pen pressure, touch-compatible pointer events, coalesced packets, viewport borders, out-of-box excursions, mobile scaling, high event counts and actual field-capacity cases.

An additional **512 deterministic variants** exercise **1,541,881 input events**, with one to eight strokes, mouse/touch/pen modes, changing pressure, one to 3,200 samples per stroke, varied geometry, coalescing and mobile coordinate scaling. The field-capacity pass accepts all **505** variants meeting the visible-size minimum; the other **seven** receive the requested size prompt. None is rejected by a contour/style heuristic. A **32-case subset** additionally uses actual native Canvas PNG rendering at the full field ceiling. The full-form pass separately exercises all 512 variants and the 30 named cases against the actual POST calculator and live budgets.

The **542-case full-form pass** used actual native PNGs and the form's actual encoding helper: **531 accepted**, **nine below the requested visible-size minimum**, and **two beyond submission capacity**. The largest accepted POST was **92,106 encoded bytes**, below the 92,160-byte operating budget. All 505 sufficiently visible seeded variants fitted the complete POST. The two over-capacity cases were grids of 776 and 1,000 separate dots, retained for editing rather than truncated.

The field-only dot-grid boundary was 776 dots at 130,956 vector characters; the next dot produced 131,136. A bounded native-PNG binary search against the **actual full-form budget** found **470 dots fitting at 92,121 POST bytes**, while **471 dots required at least 92,312 bytes** across the available candidates and was refused. The 470-dot export used 77,737 vector characters and a 300 × 90 PNG. These are properties of this particular deterministic grid, coordinate format, renderer, synthetic application and compaction, **not fixed stroke-count limits**. Other application details or PNG encoders can change the boundary.

A realistic 64-stroke test used just 30,832 complete POST bytes. The 80-loop test used 70,459 POST bytes and a 300 × 90 PNG; its complete 39,155-character vector remained intact. The shaky 12,000-event test used 56,826 POST bytes and kept a 1200 × 360 PNG.

The captured metrics, exact source-file hashes and separate field/form results are in [the after fixture](../tests/fixtures/signature-stress-after.json). The full native stress suite passed all **41 test groups**, including both accepted cases and intentional, correctly explained boundary refusals. The smaller full-field native subset generated 31 PNGs; its remaining tiny input received the visible-size prompt.

Native raster checks also verify:

1. The output is a real PNG, its dimensions match its header, and it contains visible ink.
2. Drawing the exported vector again produces exactly the same PNG bytes under the same native renderer.
3. Ten representative compacted signatures stay close to the unsimplified perfect-freehand contours in both directions when their actual raster masks are compared, including the shaky input and three previously oversized seeded cases. The comparison allows bounded approximation and anti-aliasing differences.
4. Earlier images rejected by size fallback really exceed the Base64 ceiling, and the selected image fits.

The ordinary test command requires no extra dependencies:

```powershell
npm test
```

The pointer harness supplies minimal DOM/Canvas substitutes when the optional native renderer is absent. Those checks prove event handling and geometry/transport control flow; they do **not** prove real PNG pixels. To run the additional raster checks, provide an existing installation of `@napi-rs/canvas`:

```powershell
$env:NTE_CANVAS_MODULE = 'C:\path\to\node_modules\@napi-rs\canvas\index.js'
node scripts/test.mjs
node tests/helpers/signature-stress-report.mjs
node tests/helpers/signature-contact-sheet.mjs
```

The measured native renderer was `@napi-rs/canvas` 0.1.100. It is optional developer tooling and is not bundled with, loaded by, or required by the public form. The contact sheet is written to ignored `artifacts/signature-stress-contact-sheet.png` and contains synthetic marks only; it uses the live-form budget with a synthetic application profile.

Native Skia Canvas is not a substitute for actual browser/device acceptance testing. These automated pointer events do not establish physical stylus accuracy, uninterrupted frame rates on slow phones, every browser's PNG compression, or Web-to-Lead field survival. The separate deployment verification records the actual Megistos transport/PDF/email checks. The tests also do not authenticate the signer's identity or prove that independently supplied hostile PNG and vector payloads match.
