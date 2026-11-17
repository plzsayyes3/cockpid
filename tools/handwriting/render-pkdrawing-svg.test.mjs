import test from 'node:test';
import assert from 'node:assert/strict';
import { renderDrawing, transformPoint } from './render-pkdrawing-svg.mjs';

test('affine transform is applied to stroke-local coordinates', () => {
  assert.deepEqual(transformPoint({x:2,y:3}, {a:2,b:0,c:0,d:2,tx:10,ty:20}), {x:14,y:26});
});
test('render sample strokes without writing private files', () => {
  const svg = renderDrawing({strokes:[{
    color:{red:0,green:0,blue:0},
    transform:{a:1,b:0,c:0,d:1,tx:100,ty:50},
    points:[{x:0,y:0,width:2},{x:10,y:20,width:2},{x:20,y:0,width:2}]
  }]});
  assert.match(svg, /<svg/);
  assert.match(svg, /<path/);
  assert.match(svg, /#000000/);
  assert.match(svg, /M100/);
});
test('rejects absent renderable strokes instead of claiming success', () => {
  assert.throws(() => renderDrawing({strokes:[]}), /No renderable/);
});
