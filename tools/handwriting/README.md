# Read existing PencilKit handwriting without changing the native app

The existing native Inbox format is unchanged:
`plzsayyes3/mynotebook/00_inbox/<timestamp>.md`,
`<timestamp>.png` and `<timestamp>.pkdrawing`.

This toolset is in `plzsayyes3/cockpid/tools/handwriting`. It uses the
external [libfreeform](https://github.com/can1357/libfreeform) decoder to
read the native `wrd` format, then approximates the ink as SVG for visual
inspection. It does **not** run OCR or use an external AI API.

## Run locally (Node 20+)

```sh
cd tools/handwriting
npm install
npm test
node decode-pkdrawing.mjs /path/to/20261117112000950.pkdrawing /tmp/handwriting.decoded.json
node render-pkdrawing-svg.mjs /tmp/handwriting.decoded.json /tmp/handwriting.svg
```

Alternatively, retrieve the existing private file using the GitHub Contents
API. Set a suitable fine-grained token **only in the local environment** with
read-only Contents permission for `mynotebook` (do not paste the token into
source files or ChatGPT messages).

```sh
cd tools/handwriting
npm install
GITHUB_TOKEN="$YOUR_LOCAL_TOKEN" node decode-pkdrawing.mjs \
  --github plzsayyes3/mynotebook \
  00_inbox/20261117112000950.pkdrawing \
  /tmp/handwriting.decoded.json
node render-pkdrawing-svg.mjs /tmp/handwriting.decoded.json /tmp/handwriting.svg
```

Open `/tmp/handwriting.svg` in a browser. Keep decoded JSON and SVG local
because they contain personal handwriting. If you want ChatGPT to read it,
attach the SVG or PNG preview to the conversation. The available GitHub
connector currently handles the original `.pkdrawing` as Base64, but not
renderable private PNG bytes, so an external rendering step is still required.

## Limitations

- `libfreeform` reverses engineered PencilKit `wrd` data. The installed
  package may not decode all OS versions or unknown strokes.
- SVG rendering is an approximation: cubic B-spline sampling, averaged width,
  affine transform application. It does not reproduce Apple pencil texture,
  alpha blending, eraser masks, and variable pressure perfectly.
- If the decoded stroke has no recovered coordinates, the renderer reports
  an error instead of generating a misleading blank preview.
- Original `.pkdrawing` is never changed; this tool does not write to
  `mynotebook` or trigger GitHub Actions automatically.
- The app code does **not** yet have a browser-visible handwriting preview
  button; this is the conversion pipeline, intentionally isolated to avoid
  disrupting the Workbench Inbox.
- End-to-end verification against the user's 11:20 `.pkdrawing` is pending:
  package installation and the binary decoder are not executable within this
  connector session. Test against the existing file before calling it working.
