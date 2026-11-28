import {test} from "node:test";import assert from "node:assert/strict";import {parse,plan,transfer} from "./transfer-core.js";test("timestamp",()=>{assert.equal(parse("20261125142546022.md").time,"14:25:46");assert.equal(parse("20260230010101.md"),null)});test("retry and collision",()=>{const x=plan("#### ショートメモ\n","02:00:00","abc");assert.equal(plan(x.text,"02:00:00","abc").state,"existing");assert.throws(()=>plan(x.text,"02:00:00","other"));assert.ok(!x.text.includes("inbox-source"))});
import {repairImageLinks} from "./transfer-core.js";
test("orphan image repairs exact existing timestamp and filename only",()=>{const old="#### ショートメモ\n- 18:35:39 # 手書きメモ\n  ![手書きメモ](20261124183539128.png)\n";const links={"20261124183539128.png":"../99_assets/20261124183539128.png"};const x=repairImageLinks(old,"18:35:39",links);assert.equal(x.state,"repair");assert.ok(x.text.includes("../99_assets/"));assert.equal(repairImageLinks(x.text,"18:35:39",links).state,"existing");assert.equal(repairImageLinks(old,"18:35:38",links),null);assert.equal(repairImageLinks(old,"18:35:39",{"different.png":"../99_assets/different.png"}),null)});


import {group} from "./transfer-core.js";
const image="20261124183539128.png",md=image.replace(".png",".md"),daily="01_Daily/2026-11-24.md";
function mock(text,body=null,collision=false){
  const files=new Map([["00_inbox/"+image,{sha:"image",content:"eA=="}]]);
  if(text!==null)files.set(daily,{sha:"daily",text});
  if(body!==null)files.set("00_inbox/"+md,{sha:"memo",text:body});
  if(collision)files.set("99_assets/"+image,{sha:"different",content:"eQ=="});
  return {files,store:{read:async p=>files.get(p),readBinary:async p=>files.get(p),write:async(p,text)=>files.set(p,{sha:"updated",text}),writeBinary:async(p,content)=>files.set(p,{sha:"image",content}),remove:async p=>files.delete(p)}};
}
test("UID conflict moves image but retains Markdown",async()=>{const original="#### ショートメモ\n- 18:35:39 another\n";const {files,store}=mock(original,"memo");const r=await transfer(store,group([md,image])[0]);assert.equal(r.state,"partial");assert.equal(r.body,"UID重複・保留");assert.equal(r.images[0].state,"移動完了");assert.equal(files.get(daily).text,original);assert.ok(files.has("00_inbox/"+md));assert.ok(!files.has("00_inbox/"+image));assert.ok(files.has("99_assets/"+image));assert.ok(files.has("00_inbox/archive/"+image));});
test("orphan exact image link is repaired",async()=>{const {files,store}=mock("#### ショートメモ\n- 18:35:39 note\n  ![x]("+image+")\n");const r=await transfer(store,group([image])[0]);assert.equal(r.state,"complete");assert.equal(r.link,"反映済み");assert.ok(files.get(daily).text.includes("../99_assets/"+image));});
test("orphan without match moves without new text",async()=>{const original="#### ショートメモ\n";const {files,store}=mock(original);const r=await transfer(store,group([image])[0]);assert.equal(r.state,"partial");assert.equal(files.get(daily).text,original);assert.ok(!files.has("00_inbox/"+image));});
test("missing Daily creates and transfers memo with image",async()=>{const {files,store}=mock(null,"memo");const write=store.write;store.write=async(p,text,sha)=>{if(p===daily)assert.equal(sha,undefined);return write(p,text)};const r=await transfer(store,group([md,image])[0]);assert.equal(r.state,"complete");assert.ok(!files.has("00_inbox/"+md));assert.ok(files.get(daily).text.includes("#### ショートメモ"));assert.ok(files.get(daily).text.includes("../99_assets/"+image));});
test("missing Daily creates text-only memo",async()=>{const {files,store}=mock(null,"memo");const r=await transfer(store,group([md])[0]);assert.equal(r.state,"complete");assert.ok(files.get(daily).text.includes("- 18:35:39 memo"));assert.ok(!files.has("00_inbox/"+md));});
test("missing Daily never created for orphan image",async()=>{const {files,store}=mock(null);const r=await transfer(store,group([image])[0]);assert.equal(r.state,"partial");assert.ok(!files.has(daily));assert.ok(files.has("99_assets/"+image));});
test("concurrent Daily creation retains source on write failure",async()=>{const {files,store}=mock(null,"memo");store.write=async(p)=>{if(p===daily){files.set(daily,{sha:"concurrent",text:"other"});throw Error("HTTP 422");}};const r=await transfer(store,group([md])[0]);assert.equal(r.state,"held");assert.equal(files.get(daily).text,"other");assert.ok(files.has("00_inbox/"+md));});
test("different destination image never overwritten or deleted",async()=>{const {files,store}=mock("#### ショートメモ\n","memo",true);const r=await transfer(store,group([md,image])[0]);assert.equal(r.state,"held");assert.equal(files.get("99_assets/"+image).sha,"different");assert.ok(files.has("00_inbox/"+image));assert.ok(files.has("00_inbox/"+md));});
test("new memo with image transfers both",async()=>{const {files,store}=mock("#### ショートメモ\n","memo");const r=await transfer(store,group([md,image])[0]);assert.equal(r.state,"complete");assert.ok(!files.has("00_inbox/"+md));assert.ok(files.get(daily).text.includes("../99_assets/"+image));});

test("handwriting originals stay in place when the memo transfers", async () => {
  const png = "../handwriting/assets/" + image;
  const drawing = png.replace(".png", ".pkdrawing");
  const { files, store } = mock(null, "手書きメモ\n\n![画像](" + png + ")\n[筆跡原本](" + drawing + ")\n\n文字起こし");
  files.delete("00_inbox/" + image);
  files.set(png.slice(3), { sha: "original-image" });
  files.set(drawing.slice(3), { sha: "original-drawing" });
  const result = await transfer(store, group([md])[0]);
  assert.equal(result.state, "complete");
  assert.ok(files.get(daily).text.includes("](" + png + ")"));
  assert.ok(files.get(daily).text.includes("](" + drawing + ")"));
  assert.equal(files.get(png.slice(3)).sha, "original-image");
  assert.equal(files.get(drawing.slice(3)).sha, "original-drawing");
  assert.ok(!files.has("99_assets/" + image));
  assert.ok(!files.has("00_inbox/" + md));
});

test("missing handwriting original leaves the memo in Inbox", async () => {
  const png = "../handwriting/assets/" + image;
  const { files, store } = mock(null, "手書きメモ\n\n![画像](" + png + ")\n[筆跡原本](" + png.replace(".png", ".pkdrawing") + ")");
  files.delete("00_inbox/" + image);
  files.set(png.slice(3), { sha: "original-image" });
  assert.equal((await transfer(store, group([md])[0])).state, "held");
  assert.ok(files.has("00_inbox/" + md));
  assert.ok(!files.has(daily));
});
