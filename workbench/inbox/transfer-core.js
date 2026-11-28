export function parse(name){const m=/^(\d{4})(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)(\d{3})?\.md$/.exec(name);if(!m)return null;const date=m[1]+"-"+m[2]+"-"+m[3],time=m[4]+":"+m[5]+":"+m[6];const d=new Date(date+"T"+time+"Z");if(!Number.isFinite(+d)||d.toISOString().slice(0,19)!==date+"T"+time)return null;return {date,time,name};}
export function plan(text,time,raw){const body=raw.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/,"").trim();if(!body)throw Error("空のメモ");const line="- "+time+" "+body.replace(/\r\n/g,"\n").replace(/\n/g,"\n  ");const lines=text.replace(/\r\n/g,"\n").split("\n");const heading="#### ショートメモ";const heads=lines.map((v,i)=>v.trim()===heading?i:-1).filter(i=>i>=0);if(heads.length>1)throw Error("ショートメモ見出しが複数あります");let start=heads[0],end=lines.length;if(start!==undefined){for(let i=start+1;i<lines.length;i++){if(/^#{1,6}\s/.test(lines[i])){end=i;break;}}const matches=[];for(let i=start+1;i<end;i++){if(lines[i].startsWith("- "+time+" ")||lines[i]==="- "+time){let j=i+1;while(j<end&&!/^\S/.test(lines[j]))j++;matches.push(lines.slice(i,j).filter(v=>!/^\s*<!-- (?:inbox-source|workbench-memo):.* -->\s*$/.test(v)).join("\n").trimEnd());}}if(matches.length){if(matches.length===1&&matches[0]===line.trimEnd())return {state:"existing",text};throw Object.assign(Error("同時刻UIDの別内容または複数記録"),{code:"UID_CONFLICT"});}lines.splice(end,0,line);return {state:"new",text:lines.join("\n")};}return {state:"new",text:text.trimEnd()+"\n\n"+heading+"\n"+line+"\n"};}

export const imageName = n => /^\d{14}(?:\d{3})?\.(?:png|jpe?g|gif|webp|heic|heif|bmp|tiff?)$/i.test(n) && !!parse(n.replace(/\.[^.]+$/, ".md"));
export function group(names) {
  const groups = new Map();
  for (const n of names) {
    const p = parse(n.replace(/\.[^.]+$/, ".md"));
    if (!p) continue;
    const stem = p.name.slice(0,-3);
    if (!groups.has(stem)) groups.set(stem,{...p,md:null,images:[],other:[]});
    const g=groups.get(stem);
    if (n===p.name) g.md=n;
    else if(imageName(n)) g.images.push(n);
    else g.other.push(n);
  }
  return [...groups.values()].filter(g=>g.md||g.images.length).sort((a,b)=>a.name.localeCompare(b.name));
}
export function relativeLink(from,to) {
  const a=from.split("/").slice(0,-1), b=to.split("/");
  while(a.length&&b.length&&a[0]===b[0]){a.shift();b.shift();}
  return "../".repeat(a.length)+b.map(encodeURIComponent).join("/");
}
export function rewriteImages(raw, links) {
  let result=raw;
  for(const [name,link] of Object.entries(links)){
    const variants=[name,"./"+name,encodeURIComponent(name)];
    let found=false;
    for(const v of new Set(variants)){
      for(const prefix of ["(", "![[", "[["]){
        const suffix=prefix==="(" ? ")" : "]]";
        const needle=prefix+v+suffix;
        if(result.includes(needle)){found=true;result=result.split(needle).join(prefix==="("? "("+link+")" : prefix==="![["?"![画像]("+link+")":"[画像]("+link+")");}
      }
    }
    if(!found)result=result.trimEnd()+"\n\n![画像]("+link+")";
  }
  return result;
}

export function repairImageLinks(text,time,links) {
  const lines=text.split(/\r?\n/), heading=lines.map((l,i)=>l.trim()==="#### ショートメモ"?i:-1).filter(i=>i>=0);
  if(heading.length!==1)return null;
  const start=heading[0]+1;
  let end=lines.length;
  for(let i=start;i<lines.length;i++)if(/^#{1,6}\s/.test(lines[i])){end=i;break;}
  const matches=[];
  for(let i=start;i<end;i++)if(lines[i].startsWith("- "+time+" ")||lines[i]==="- "+time)matches.push(i);
  if(matches.length!==1)return null;
  const first=matches[0];let last=first+1;
  while(last<end&&!/^\S/.test(lines[last]))last++;
  let block=lines.slice(first,last).join("\n"), next=block;
  for(const [name,link] of Object.entries(links)){
    let found=false;
    for(const variant of new Set([name,"./"+name,encodeURIComponent(name),link])){
      for(const [prefix,suffix] of [["(",")"],["![[","]]"],["[[","]]"]]){
        const needle=prefix+variant+suffix;
        if(next.includes(needle)){found=true;next=next.split(needle).join(prefix==="("?"("+link+")":prefix==="![["?"![画像]("+link+")":"[画像]("+link+")");}
      }
    }
    if(!found)return null;
  }
  if(!Object.keys(links).length)return null;
  if(next===block)return {state:"existing",text};
  lines.splice(first,last-first,...next.split("\n"));
  return {state:"repair",text:lines.join(text.includes("\r\n")?"\r\n":"\n")};
}

export async function transfer(store,entry,report=()=>{}) {
  const p=parse(entry.name);if(!p)throw Error("不正な日付");
  const images=entry.images||[], other=entry.other||[], md=entry.md===undefined?entry.name:entry.md;
  const inbox=store.inbox||"00_inbox", dailyDir=store.daily||"01_Daily", assets=store.images||"99_assets";
  const path=dailyDir+"/"+p.date+".md";
  const result={body:md?"未処理":"対象なし",images:[],link:"対象なし",warnings:[],state:"complete"};
  const warn=(msg)=>{result.warnings.push(msg);report(msg);};
  const links={}, binaries=[];
  let src=null, daily=null, next=null, raw="", verified=false;
  report("Inbox取得");
  if(md){try{src=await store.read(inbox+"/"+md);if(!src)throw Error("Inboxが存在しません");}catch(e){result.body="保留";warn("本文取得失敗: "+e.message);}}
  // Handwriting originals live outside Inbox and stay there during transfer.
  const handwritingLinks = {};
  let handwritingImage = null;
  if (src) {
    const stem = p.name.slice(0, -3);
    const originals = [stem + ".png", stem + ".pkdrawing", stem + ".strokes.json"];
    const linked = originals.filter(name =>
      src.text.includes("(" + relativeLink(inbox + "/" + md, "handwriting/assets/" + name) + ")")
    );
    if (linked.length) {
      try {
        if (!linked.includes(originals[0]) || !linked.includes(originals[1])) {
          throw Error("画像と筆跡原本のリンクが必要です");
        }
        if (images.includes(originals[0])) throw Error("同じIDの画像がInboxにもあります");
        for (const name of linked) {
          const target = "handwriting/assets/" + name;
          if (!(await store.readBinary(target))?.sha) throw Error("原本が見つかりません: " + name);
          handwritingLinks[relativeLink(inbox + "/" + md, target)] = relativeLink(path, target);
        }
        handwritingImage = originals[0];
      } catch (e) {
        warn("手書き原本の確認失敗: " + e.message);
        return { ...result, body: "保留", state: "held" };
      }
    }
  }

  // Image movement is independent of the Daily UID decision.
  for(const name of images){
    const item={name,state:"未処理"};result.images.push(item);
    try{
      report("画像取得: "+name);
      const bin=await store.readBinary(inbox+"/"+name);if(!bin)throw Error("画像が存在しません");
      const dest=assets+"/"+name;
      report("画像保存: "+name);
      let old=await store.readBinary(dest);
      if(old&&old.sha!==bin.sha)throw Error("画像同名衝突");
      if(!old)await store.writeBinary(dest,bin.content);
      old=await store.readBinary(dest);
      if(!old||old.sha!==bin.sha)throw Error("画像確認失敗");
      links[name]=relativeLink(path,dest);
      binaries.push({name,bin,dest,item});
      item.state="保存確認済み";
    }catch(e){item.state="失敗";warn("画像保留: "+name+" / "+e.message);}
  }
  // On retry, recover previously moved same-UID images referenced by a retained Markdown.
  if(src){
    const stem=p.name.slice(0,-3);
    const refs=src.text.match(/\d{14}(?:\d{3})?\.(?:png|jpe?g|gif|webp|heic|heif|bmp|tiff?)/gi)||[];
    for(const name of new Set(refs)){
      if(!imageName(name)||name.replace(/\.[^.]+$/,"")!==stem||images.includes(name)||name===handwritingImage)continue;
      try{
        const archived=await store.readBinary(inbox+"/archive/"+name), saved=await store.readBinary(assets+"/"+name);
        if(archived&&saved&&archived.sha===saved.sha)links[name]=relativeLink(path,assets+"/"+name);
        else warn("移動済み画像を確認できません: "+name);
      }catch(e){warn("画像再確認失敗: "+name+" / "+e.message);}
    }
  }
  const hasLinks=Object.keys(links).length>0;
  const imageFailure=result.images.some(x=>x.state==="失敗");
  if(other.some(n=>!/\.(pkdrawing|json)$/i.test(n)))warn("未対応の付随ファイルはInboxに保留");
  if(src||hasLinks){
    try{
      report("Daily取得");daily=await store.read(path);
      if(!daily){
        if(!src||imageFailure||result.warnings.length)throw Error("Dailyが存在しません（本文を安全に転送できる場合のみ自動作成）");
        daily={text:"#### ショートメモ\n",sha:undefined};
      }
      report("重複確認");
      const repair=hasLinks?repairImageLinks(daily.text,p.time,links):null;
      if(src&&!imageFailure&&!result.warnings.length){
        raw=rewriteImages(src.text,links);
        for (const [from, to] of Object.entries(handwritingLinks)) {
          raw = raw.replaceAll("(" + from + ")", "(" + to + ")");
        }
        try{next=plan(daily.text,p.time,raw);}
        catch(e){
          if(e.code!=="UID_CONFLICT")throw e;
          // Repair an exact old image reference without replacing the existing body.
          if(repair){try{next=plan(repair.text,p.time,raw);if(next.state==="existing")next=repair;}catch(err){if(err.code!=="UID_CONFLICT")throw err;}}
          if(!next){result.body="UID重複・保留";warn(e.message);next=repair;}
        }
      }else if(!src&&hasLinks){
        // Image-only entries never create a new text entry.
        next=repair;
        result.body=md?"保留":"対象なし";
      }else if(src){result.body="保留";next=repair;}
      if(next&&(next.state==="new"||next.state==="repair")){
        report(next.state==="repair"?"既存Daily画像リンク修復":daily.sha?"Daily書込":"Daily新規作成");
        await store.write(path,next.text,daily.sha);
      }
      if(next){
        report("反映確認");const check=await store.read(path);
        if(!check)throw Error("Daily反映を確認できません");
        if(hasLinks){
          result.link=repairImageLinks(check.text,p.time,links)?.state==="existing"?"反映済み":"未確認";
        }
        if(src&&result.body==="未処理"){
          verified=plan(check.text,p.time,raw).state==="existing";
          if(!verified)throw Error("本文反映を確認できません");
          result.body=next.state==="new"?"転送済み":"既存・一致";
        }
      }
    }catch(e){if(src&&!verified)result.body=e.code==="UID_CONFLICT"?"UID重複・保留":"保留";warn("Daily保留: "+e.message);}
  }
  if(hasLinks&&result.link!=="反映済み"){result.link="未反映・要確認";warn("画像リンク未反映: Dailyは上書きしません");}
  // Archive verified binaries before removing their original files, regardless of UID.
  for(const {name,bin,dest,item} of binaries){
    try{
      report("画像移動確認: "+name);
      const latest=await store.readBinary(inbox+"/"+name), saved=await store.readBinary(dest);
      if(!latest||latest.sha!==bin.sha||!saved||saved.sha!==bin.sha)throw Error("画像が処理中に変化しました");
      const archive=inbox+"/archive/"+name;
      let old=await store.readBinary(archive);
      if(old&&old.sha!==bin.sha)throw Error("画像archive同名衝突");
      if(!old)await store.writeBinary(archive,bin.content);
      old=await store.readBinary(archive);if(!old||old.sha!==bin.sha)throw Error("画像archive確認失敗");
      report("画像Inbox削除: "+name);await store.remove(inbox+"/"+name,bin.sha);
      item.state="移動完了";
    }catch(e){item.state="失敗";warn("画像移動保留: "+name+" / "+e.message);}
  }
  // Retain unresolved Markdown; do not remove it if any associated image remains unresolved.
  if(src&&verified&&result.images.every(x=>x.state==="移動完了")&&(!hasLinks||result.link==="反映済み")&&!result.warnings.length){
    try{
      report("Inbox再確認");const latest=await store.read(inbox+"/"+md);
      if(!latest||latest.sha!==src.sha)throw Error("Inboxが処理中に変化しました");
      const archive=inbox+"/archive/"+md;report("archive保存");
      let old=await store.read(archive);if(old&&old.text!==src.text)throw Error("archive同名衝突");
      if(!old)await store.write(archive,src.text);
      old=await store.read(archive);if(!old||old.text!==src.text)throw Error("archive確認失敗");
      report("Inbox削除");await store.remove(inbox+"/"+md,src.sha);
    }catch(e){result.body="転送済み・元ファイル保留";warn(e.message);}
  }else if(src&&verified){result.body="転送済み・元ファイル保留";}
  if(other.length)report("編集用付随ファイルはInboxに保全: "+other.join(", "));
  if(result.warnings.length||result.body.includes("保留")||result.images.some(x=>x.state!=="移動完了")){
    result.state=(verified||result.images.some(x=>x.state==="移動完了"))?"partial":"held";
  }
  return result;
}
