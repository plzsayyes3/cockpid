export function parse(name){const m=/^(\d{4})(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)(\d{3})?\.md$/.exec(name);if(!m)return null;const date=m[1]+"-"+m[2]+"-"+m[3],time=m[4]+":"+m[5]+":"+m[6];const d=new Date(date+"T"+time+"Z");if(!Number.isFinite(+d)||d.toISOString().slice(0,19)!==date+"T"+time)return null;return {date,time,name};}
export function plan(text,time,raw){const body=raw.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/,"").trim();if(!body)throw Error("空のメモ");const line="- "+time+" "+body.replace(/\r\n/g,"\n").replace(/\n/g,"\n  ");const lines=text.replace(/\r\n/g,"\n").split("\n");const heading="#### ショートメモ";const heads=lines.map((v,i)=>v.trim()===heading?i:-1).filter(i=>i>=0);if(heads.length>1)throw Error("ショートメモ見出しが複数あります");let start=heads[0],end=lines.length;if(start!==undefined){for(let i=start+1;i<lines.length;i++){if(/^#{1,6}\s/.test(lines[i])){end=i;break;}}const matches=[];for(let i=start+1;i<end;i++){if(lines[i].startsWith("- "+time+" ")||lines[i]==="- "+time){let j=i+1;while(j<end&&!/^\S/.test(lines[j]))j++;matches.push(lines.slice(i,j).filter(v=>!/^\s*<!-- (?:inbox-source|workbench-memo):.* -->\s*$/.test(v)).join("\n").trimEnd());}}if(matches.length){if(matches.length===1&&matches[0]===line.trimEnd())return {state:"existing",text};throw Error("同時刻UIDの別内容または複数記録");}lines.splice(end,0,line);return {state:"new",text:lines.join("\n")};}return {state:"new",text:text.trimEnd()+"\n\n"+heading+"\n"+line+"\n"};}

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
export async function transfer(store,entry,report=()=>{}) {
  const p=parse(entry.name);if(!p)throw Error("不正な日付");
  const images=entry.images||[], other=entry.other||[], md=entry.md===undefined?entry.name:entry.md;
  if(other.some(n=>!/\.(pkdrawing|json)$/i.test(n)))throw Error("未対応の付随ファイルがあります");
  const inbox=store.inbox||"00_inbox", dailyDir=store.daily||"01_Daily", assets=store.images||"99_assets";
  const path=dailyDir+"/"+p.date+".md";
  report("Inbox取得");
  const src=md?await store.read(inbox+"/"+md):null;
  if(md&&!src)throw Error("Inboxが存在しません");
  report("Daily取得");
  const daily=await store.read(path);if(!daily)throw Error("Dailyが存在しません");
  const links={}, binaries=[];
  for(const name of images){
    report("画像取得: "+name);
    const bin=await store.readBinary(inbox+"/"+name);if(!bin)throw Error("画像が存在しません: "+name);
    links[name]=relativeLink(path,assets+"/"+name);
    binaries.push({name,bin,dest:assets+"/"+name});
  }
  const raw=rewriteImages(src?.text||"",links);
  report("重複確認");
  const next=plan(daily.text,p.time,raw);
  for(const {name,bin,dest} of binaries){
    report("画像保存: "+name);
    let old=await store.readBinary(dest);
    if(old&&old.sha!==bin.sha)throw Error("画像同名衝突: "+name);
    if(!old)await store.writeBinary(dest,bin.content);
    old=await store.readBinary(dest);
    if(!old||old.sha!==bin.sha)throw Error("画像確認失敗: "+name);
  }
  if(next.state==="new"){report("Daily書込");await store.write(path,next.text,daily.sha);}
  report("反映確認");const check=await store.read(path);
  if(!check||plan(check.text,p.time,raw).state!=="existing")throw Error("反映を確認できません");
  // Preserve editable companions in Inbox; do not move them without updating their references.
  if(src){
    report("Inbox再確認");
    const latest=await store.read(inbox+"/"+md);if(!latest||latest.sha!==src.sha)throw Error("Inboxが処理中に変化しました");
    const archive=inbox+"/archive/"+md;report("archive保存");
    let old=await store.read(archive);if(old&&old.text!==src.text)throw Error("archive同名衝突");
    if(!old)await store.write(archive,src.text);
    old=await store.read(archive);if(!old||old.text!==src.text)throw Error("archive確認失敗");
  }
  // Delete image sources only after destination and Daily are verified; leave editable companions untouched.
  for(const {name,bin,dest} of binaries){
    report("画像移動確認: "+name);
    const latest=await store.readBinary(inbox+"/"+name), saved=await store.readBinary(dest);
    if(!latest||latest.sha!==bin.sha||!saved||saved.sha!==bin.sha)throw Error("画像が処理中に変化しました: "+name);
  }
  // Keep paired source images in archive for retry and legacy source references.
  for(const {name,bin} of binaries){
    const dest=inbox+"/archive/"+name;
    let old=await store.readBinary(dest);
    if(old&&old.sha!==bin.sha)throw Error("画像archive同名衝突: "+name);
    if(!old)await store.writeBinary(dest,bin.content);
    old=await store.readBinary(dest);if(!old||old.sha!==bin.sha)throw Error("画像archive確認失敗: "+name);
  }
  // Remove markdown first; remaining image-only entries are held on timestamp collision.
  if(src){report("Inbox削除");await store.remove(inbox+"/"+md,src.sha);}
  for(const {name,bin} of binaries){report("画像Inbox削除: "+name);await store.remove(inbox+"/"+name,bin.sha);}
  if(other.length)report("編集用付随ファイルはInboxに保全: "+other.join(", "));
  return next.state;
}
