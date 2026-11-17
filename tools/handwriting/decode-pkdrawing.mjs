#!/usr/bin/env node
/**
 * Decode an EXISTING PencilKit .pkdrawing, without modifying iOS upload formats.
 * Local: node decode-pkdrawing.mjs input.pkdrawing [output.json]
 * Private GitHub: GITHUB_TOKEN=... node decode-pkdrawing.mjs --github plzsayyes3/mynotebook 00_inbox/FILE.pkdrawing [output.json]
 *
 * Never prints tokens or the raw payload. Decoded JSON remains local.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { decodePkDrawing, isPkDrawing } from 'libfreeform';

function usage() {
  throw new Error('Usage: node decode-pkdrawing.mjs FILE.pkdrawing [OUT.json] OR --github OWNER/REPO PATH.pkdrawing [OUT.json] (GITHUB_TOKEN required)');
}

function safeGitHubPath(path) {
  const parts = path.split('/');
  if (!parts.length || parts.some(p => !p || p === '.' || p === '..')) usage();
  return parts.map(encodeURIComponent).join('/');
}

async function githubBytes(repo, path) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) usage();
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('Set GITHUB_TOKEN locally; do not commit it to Git.');
  const url = `https://api.github.com/repos/${repo}/contents/${safeGitHubPath(path)}`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.raw+json',
      'X-GitHub-Api-Version': '2022-11-28'
    },
    redirect: 'error'
  });
  if (!response.ok) throw new Error(`GitHub returned HTTP ${response.status}`);
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('json')) {
    // Some GitHub intermediaries return JSON even when requesting raw data.
    const result = await response.json();
    if (result.encoding !== 'base64' || typeof result.content !== 'string') {
      throw new Error('GitHub returned metadata without base64 file data.');
    }
    return new Uint8Array(Buffer.from(result.content.replace(/\s/g, ''), 'base64'));
  }
  return new Uint8Array(await response.arrayBuffer());
}

export async function decodeBytes(bytes) {
  if (!isPkDrawing(bytes)) throw new Error('Not a PencilKit wrd drawing.');
  const drawing = decodePkDrawing(bytes);
  if (!drawing || !Array.isArray(drawing.strokes)) {
    throw new Error('Decoder did not return a drawing with strokes.');
  }
  return drawing;
}

async function main() {
  const args = process.argv.slice(2);
  const fromGitHub = args[0] === '--github';
  const source = fromGitHub ? args[2] : args[0];
  const output = fromGitHub ? args[3] : args[1];
  if (!source || (fromGitHub && !args[1]) || args.length > (fromGitHub ? 4 : 2)) usage();
  const bytes = fromGitHub
    ? await githubBytes(args[1], source)
    : new Uint8Array(await readFile(source));
  if (bytes.byteLength > 20_000_000) throw new Error('Drawing exceeds 20 MB size limit.');
  const drawing = await decodeBytes(bytes);
  const target = output || source.replace(/\.pkdrawing$/i, '') + '.decoded.json';
  await writeFile(target, JSON.stringify(drawing, null, 2), { mode: 0o600 });
  console.log(`Decoded ${drawing.strokes.length} strokes to ${target}`);
}

if (process.argv[1] && import.meta.url === new URL('file://' + process.argv[1]).href) {
  main().catch(e => { console.error(e.message); process.exitCode = 1; });
}
