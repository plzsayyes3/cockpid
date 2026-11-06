const {test}=require('node:test');
const assert=require('node:assert/strict');
const O=require('./scrap-ocr.js');
const card={id:'a',title:'画像メモ',memo:'自分のメモ',handled:false,image_path:'03_scrap/assets/a.png'};
test('unprocessed images need transcription independently of the handled checkbox',()=>{
 assert.equal(O.needsTranscription(card,'sha1'),true);
 assert.equal(O.needsTranscription({...card,handled:true},'sha1'),false);
});
test('unchanged successful and no-text images are skipped, failures and changed images retry',()=>{
 for(const status of ['completed','no_text']) {
   const c={...card,ocr:{status,source_image_sha:'sha1'}};
   assert.equal(O.needsTranscription(c,'sha1'),false);assert.equal(O.needsTranscription(c,'sha2'),true);
 }
 assert.equal(O.needsTranscription({...card,ocr:{status:'failed',source_image_sha:'sha1'}},'sha1'),true);
 assert.equal(O.needsTranscription(card,''),false);
});
test('transcription result and text export retain image identity and readable Japanese',()=>{
 const result=O.buildResult(card,'あつまれ！\n3Dプリンター','abc123','2026-11-06T03:00:00Z');
 assert.equal(result.status,'completed');assert.equal(result.source_image_sha,'abc123');assert.equal(result.transcript_path,'03_scrap/text/a.md');
 const md=O.transcriptMarkdown(card,result);
 assert.match(md,/!\[元画像\]\(\.\.\/assets\/a.png\)/);assert.match(md,/あつまれ！\n3Dプリンター/);
 assert.equal(card.memo,'自分のメモ');assert.equal(card.ocr,undefined);
});
test('no text is completed without fabricating content',()=>{
 const result=O.buildResult(card,'  ','abc123','2026-11-06T03:00:00Z');
 assert.equal(result.status,'no_text');assert.equal(result.text,'');assert.match(O.displayText({ocr:result}),/読み取れる文字はありません/);
});
test('preview keeps manual memo first and adds OCR within a shared three-line text area',()=>{
 assert.equal(O.previewText({...card,ocr:{status:'completed',text:'画像の文字'}}),'自分のメモ\n画像の文字');
 assert.equal(O.previewText(card),'自分のメモ');
 assert.equal(O.displayText({ocr:{status:'failed',text:'未確認の文字'}}),'');
});
test('unsafe pairing paths and missing image SHA cannot be marked completed',()=>{
 assert.throws(()=>O.buildResult({...card,image_path:'../secret'},'text','sha','2026-11-06T00:00:00Z'),/画像/);
 assert.throws(()=>O.buildResult(card,'text','','2026-11-06T00:00:00Z'),/SHA/);
});
