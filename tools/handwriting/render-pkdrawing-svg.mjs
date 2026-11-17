#!/usr/bin/env node
/**
 * Approximate standalone SVG preview from decoded libfreeform PencilKit strokes.
 * The original .pkdrawing is always the editable source of truth.
 * Usage: node render-pkdrawing-svg.mjs input.decoded.json [output.svg]
 */
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const finite = (x) => typeof x === 'number' && Number.isFinite(x);
const number = (x, def = 0) => finite(x) ? x : def;
const fmt = x => Number(x.toFixed(3)).toString();

export function transformPoint(point, transform = {}) {
  const a = number(transform.a, 1), b = number(transform.b);
  const c = number(transform.c), d = number(transform.d, 1);
  const tx = number(transform.tx), ty = number(transform.ty);
  const x = Number(point.x), y = Number(point.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x: a * x + c * y + tx, y: b * x + d * y + ty };
}

export function strokeColor(stroke) {
  const c = stroke.color || {};
  if (typeof c === 'string' && /^#[a-f\d]{6}([a-f\d]{2})?$/i.test(c)) return c;
  const red = c.red ?? c.r, green = c.green ?? c.g, blue = c.blue ?? c.b;
  const rgb = [red, green, blue];
  if (rgb.every(x => finite(x) && x >= 0 && x <= 1))
    return '#' + rgb.map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
  return '#171717';
}

// B-spline controls are not a polyline. Cubic uniform B-spline sampling is an
// approximation, with end controls repeated to retain the visible endpoints.
export function sampleSpline(controls, steps = 6) {
  if (controls.length < 3) return controls;
  const p = [controls[0], controls[0], ...controls, controls.at(-1), controls.at(-1)];
  const output = [];
  for (let i = 0; i < p.length - 3; i++) {
    const [a,b,c,d] = p.slice(i, i + 4);
    for (let j = 0; j < steps; j++) {
      const t = j / steps, t2 = t*t, t3 = t2*t;
      const w0 = (1-3*t+3*t2-t3)/6;
      const w1 = (4-6*t2+3*t3)/6;
      const w2 = (1+3*t+3*t2-3*t3)/6;
      const w3 = t3/6;
      output.push({
        x: w0*a.x+w1*b.x+w2*c.x+w3*d.x,
        y: w0*a.y+w1*b.y+w2*c.y+w3*d.y
      });
    }
  }
  output.push(controls.at(-1));
  return output;
}

export function renderDrawing(drawing) {
  if (!Array.isArray(drawing?.strokes)) throw new Error('Expected decoded PencilKit drawing with strokes.');
  const segments = [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const stroke of drawing.strokes) {
    if (!Array.isArray(stroke.points) || !stroke.points.length) continue;
    const points = stroke.points.map(p => transformPoint(p, stroke.transform)).filter(Boolean);
    if (!points.length) continue;
    // Decoded controls are usually local B-spline control points (not pixels).
    const sampled = sampleSpline(points);
    const widths = stroke.points.map(p => p.width).filter(finite);
    const meanWidth = widths.length ? widths.reduce((a,b)=>a+b,0)/widths.length : 2;
    const t = stroke.transform || {};
    const det = number(t.a, 1)*number(t.d, 1)-number(t.b)*number(t.c);
    const width = Math.max(0.5, Math.min(80, meanWidth * Math.sqrt(Math.abs(det))));
    for (const p of sampled) {
      minX = Math.min(minX, p.x - width); maxX = Math.max(maxX, p.x + width);
      minY = Math.min(minY, p.y - width); maxY = Math.max(maxY, p.y + width);
    }
    const d = sampled.map((p,i) => `${i ? 'L' : 'M'}${fmt(p.x)} ${fmt(p.y)}`).join(' ');
    segments.push(`<path d="${d}" stroke="${strokeColor(stroke)}" stroke-width="${fmt(width)}" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`);
  }
  if (!segments.length) throw new Error('No renderable point coordinates were decoded (unsupported format?).');
  const padding = 12;
  const x = minX-padding, y = minY-padding;
  const width = Math.max(1, maxX-minX+padding*2), height = Math.max(1, maxY-minY+padding*2);
  if (![x,y,width,height].every(finite) || width>100000 || height>100000) throw new Error('Invalid drawing geometry');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${fmt(x)} ${fmt(y)} ${fmt(width)} ${fmt(height)}" width="${fmt(width)}" height="${fmt(height)}">
<rect x="${fmt(x)}" y="${fmt(y)}" width="${fmt(width)}" height="${fmt(height)}" fill="white"/>
${segments.join('\n')}
</svg>\n`;
}

async function main() {
  const [input, target] = process.argv.slice(2);
  if (!input) throw new Error('Usage: node render-pkdrawing-svg.mjs INPUT.decoded.json [OUTPUT.svg]');
  const decoded = JSON.parse(await readFile(input, 'utf8'));
  const dest = target || input.replace(/\.json$/i, '') + '.svg';
  const svg = renderDrawing(decoded);
  await writeFile(dest, svg, { mode: 0o600 });
  console.log(`Rendered ${decoded.strokes.length} decoded strokes to ${dest}`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(e => {console.error(e.message); process.exitCode=1});
}
