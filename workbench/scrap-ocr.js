(function(root,factory) {
  const api=factory();
  if(typeof module==='object' && module.exports)module.exports=api;
  else root.COCKPID_SCRAP_OCR=api;
})(typeof window!=='undefined'?window:globalThis,()=>{
  'use strict';
  const successful=ocr=>ocr && ['completed','no_text'].includes(ocr.status);
  function needsTranscription(card,imageSha) {
    if(card.handled || !imageSha)return false;
    return !(successful(card.ocr) && card.ocr.source_image_sha===imageSha);
  }
  function buildResult(card,text,imageSha,processedAt=new Date().toISOString()) {
    if(!/^[a-zA-Z0-9_-]{1,100}$/.test(card.id) || !new RegExp(`^03_scrap/assets/${card.id}\\.(png|jpg|webp|gif)$`).test(card.image_path))throw Error('画像の保存先が不正です。');
    if(!imageSha)throw Error('画像SHAが必要です。');
    const transcription=String(text??'').trim();
    return {status:transcription?'completed':'no_text',source_image_sha:imageSha,processed_at:processedAt,engine:'chatgpt-vision',text:transcription,transcript_path:`03_scrap/text/${card.id}.md`};
  }
  function displayText(card) {
    if(!successful(card.ocr))return '';
    return card.ocr.status==='no_text'?'読み取れる文字はありません。':String(card.ocr.text||'');
  }
  function previewSections(card) {
    const sections=[];
    if(card.memo)sections.push({kind:'memo',label:'自分のメモ',text:card.memo});
    const transcript=displayText(card);
    if(transcript)sections.push({kind:'ocr',label:'画像の文字起こし',text:transcript});
    return sections;
  }
  function transcriptMarkdown(card,ocr) {
    // Validate the pairing even when invoked independently by a scheduled worker.
    buildResult(card,ocr.text,ocr.source_image_sha,ocr.processed_at);
    const basename=card.image_path.split('/').pop();
    const title=String(card.title||'画像メモ').replace(/[\r\n]/g,' ');
    const runs=String(ocr.text||'').match(/`+/g)||[];
    const fence='`'.repeat(Math.max(3,...runs.map(run=>run.length+1)));
    return `# ${title}\n\n![元画像](../assets/${basename})\n\n[元の画像メモ](../cards/${card.id}.json)\n\n## 画像の文字起こし\n\n${fence}text\n${displayText({ocr})}\n${fence}\n\n<!-- source_image_sha: ${ocr.source_image_sha}; processed_at: ${ocr.processed_at} -->\n`;
  }
  return Object.freeze({needsTranscription,buildResult,displayText,previewSections,transcriptMarkdown});
});
