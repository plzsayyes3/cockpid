# PencilKit stroke JSON companion for native Inbox

Status: **exporter and renderer added; app-side send integration not yet wired** (2026-11-17).

## Why
The user's native handwriting app already writes three sibling files to
`plzsayyes3/mynotebook/00_inbox/`: a Markdown memo, a PNG preview, and a
PencilKit `.pkdrawing` archive. The connected GitHub reader retrieves Markdown
and PencilKit's base64 data, but cannot currently decode the PNG via the
connector. An additional UTF-8 JSON stroke file allows non-Apple clients to
reconstruct a useful preview without running OCR or invoking an external AI API.

## Added files
- `ios/HandwritingExport/StrokeJSONExporter.swift`: pure export helper that
  uses `PKDrawing.strokes` and preserves ink color, point coordinates, width,
  height, force, opacity, and time offset.
- `tools/handwriting/render_strokes.py`: simple Pillow renderer for JSON v1.

## Integrating into the actual handwriting app
The handwriting editor/uploader is **not present in this repository's current
iOS shell**. Copy the Swift helper to the native app target, then use the *same*
`PKDrawing` value currently used for its PNG and `.pkdrawing` export.

After generating the native memo identifier (example `20261117112000950`):

```swift
let jsonData = try StrokeJSONExporter.export(
    drawing, canvasSize: canvasView.bounds.size
)
// Upload jsonData as 00_inbox/<identifier>.strokes.json via the app's
// existing authenticated GitHub upload function, using Base64 content.
```

In the Markdown file, keep the existing image link and metadata, then append:

```markdown
- stroke_data: 20261117112000950.strokes.json
```

Upload the JSON **before** committing the Markdown reference so the memo
doesn't advertise an attachment that does not yet exist. Preserve existing
`.png` and `.pkdrawing` uploads unchanged. If JSON export/upload fails, retain
the current successful three-file behavior and show a non-blocking warning.

Do not add GitHub credentials to this repository or embed PAT in the JSON.
The coordinates are document-space points; `canvasWidth` and `canvasHeight`
are the visible canvas bounds in points. For zoomable/infinite canvases, record
the actual drawing/page coordinate extent and origin explicitly in a future
schema revision, rather than silently translating strokes.

## JSON format v1

```json
{
  "schema": "cockpid.pencilkit.strokes",
  "version": 1,
  "canvasWidth": 500,
  "canvasHeight": 800,
  "strokes": [
    {
      "inkType": "pen",
      "color": "#000000FF",
      "points": [
        {"x": 10, "y": 20, "width": 2, "height": 2,
         "force": 0.5, "opacity": 1, "timeOffset": 0}
      ]
    }
  ]
}
```

This is a **visual interchange**, not a lossless replacement for PencilKit
archives. Curves, tilt effects, Apple Pencil tool rendering, blend modes,
eraser masks and ink texture may not render identically using the Python
previewer. The original `.pkdrawing` remains the editing source of truth.

## Verification
1. Build the native app with the new Swift file added to its target.
2. Draw several Japanese characters, include light/heavy strokes and erasing.
3. Send Inbox and confirm four sibling files with matching identifiers.
4. Download the JSON as text and run:
   `python tools/handwriting/render_strokes.py <id>.strokes.json check.png`
5. Compare `check.png` to the original PNG, evaluate coordinate size/cropping.
6. Confirm an older three-file memo still loads and no external OCR API is called.

No on-device build or end-to-end upload has been executed from this environment.
