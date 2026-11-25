
export function createStore(token, sources=()=>globalThis.COCKPID_SOURCES) {
  const encode=s=>btoa(Array.from(new TextEncoder().encode(s),x=>String.fromCharCode(x)).join(""));
  const decode=s=>new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\s/g,"")),x=>x.charCodeAt(0)));
  const defaults={inbox:{repo:"mynotebook",dir:"00_inbox"},daily:{repo:"mynotebook",dir:"01_Daily"},images:{repo:"mynotebook",dir:"99_assets"}};
  let config;
  function configure(){
    const api=sources();
    config=Object.fromEntries(Object.entries(defaults).map(([k,v])=>[k,api?.get(k)||v]));
    const {inbox,daily,images}=config;
    if(inbox.repo!==daily.repo||images.repo!==daily.repo)throw Error("画像とDailyは相対リンク維持のため同じRepositoryを指定してください");
    const overlaps=(a,b)=>a===b||a.startsWith(b+"/")||b.startsWith(a+"/");
    if(overlaps(inbox.dir,daily.dir)||overlaps(inbox.dir,images.dir))throw Error("Inboxと転送先は別フォルダを指定してください");
    return config;
  }
  async function request(path,method="GET",body,accept="application/vnd.github+json",raw=false){
    const c=config||configure();
    const root="https://api.github.com/repos/plzsayyes3/"+encodeURIComponent(c.daily.repo)+"/contents/";
    const res=await fetch(root+path.split("/").map(encodeURIComponent).join("/")+(method==="GET"?"?ref=main":""),{method,cache:"no-store",headers:{Authorization:"Bearer "+token(),Accept:accept,"Content-Type":"application/json"},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(30000)});
    if(res.status===404&&method==="GET")return null;
    if(!res.ok)throw Error(method+" "+path+" HTTP "+res.status);
    return raw?res.arrayBuffer():res.json();
  }
  async function readBinary(p){
    const r=await request(p);if(!r)return null;
    if(!r.sha||r.type!=="file")throw Error("ファイル情報を取得できません: "+p);
    if(r.encoding==="base64"&&typeof r.content==="string")return {sha:r.sha,content:r.content.replace(/\s/g,"")};
    if(r.size>100*1024*1024)throw Error("GitHubの100MiB上限超過: "+p);
    const buf=await request(p,"GET",undefined,"application/vnd.github.raw+json",true);
    if(!buf||buf.byteLength!==r.size)throw Error("バイナリ取得サイズ不一致: "+p);
    const bytes=new Uint8Array(buf), header=new TextEncoder().encode("blob "+bytes.length+"\0");
    const git=new Uint8Array(header.length+bytes.length);git.set(header);git.set(bytes,header.length);
    const digest=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-1",git)),b=>b.toString(16).padStart(2,"0")).join("");
    if(digest!==r.sha)throw Error("バイナリSHA不一致: "+p);
    let binary="";for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
    return {sha:r.sha,content:btoa(binary)};
  }
  const writeBinary=(p,content,sha)=>request(p,"PUT",{message:"inbox manager: "+p,branch:"main",content,...(sha?{sha}:{})});
  return {configure,get inbox(){return (config||configure()).inbox.dir},get daily(){return (config||configure()).daily.dir},get images(){return (config||configure()).images.dir},list:async()=>{const c=config||configure();const rows=await request(c.inbox.dir);if(!Array.isArray(rows))throw Error("Inbox一覧を取得できません");if(rows.length>=1000)throw Error("Inbox一覧上限に達しました");return rows.filter(x=>x.type==="file").map(x=>x.name);},readBinary,writeBinary,read:async p=>{const r=await readBinary(p);return r?{sha:r.sha,text:decode(r.content)}:null;},write:(p,text,sha)=>writeBinary(p,encode(text),sha),remove:(p,sha)=>request(p,"DELETE",{message:"inbox manager: archive "+p,branch:"main",sha})};
}
