(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.TaskLinerTemplates=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  function norm(value){
    return String(value||'').normalize('NFKC').trim().replace(/[\s　]+/g,' ').toLocaleLowerCase('ja');
  }
  function displayTitle(value){
    let text=String(value||'');
    text=text.replace(/\[\[([^\]]+)\]\]/g,(_,raw)=>{
      const source=String(raw||'').trim();
      const pipe=source.indexOf('|');
      const targetWithHeading=(pipe>=0?source.slice(0,pipe):source).trim();
      const alias=(pipe>=0?source.slice(pipe+1):'').trim();
      const hash=targetWithHeading.indexOf('#');
      const target=(hash>=0?targetWithHeading.slice(0,hash):targetWithHeading).trim();
      return alias||target.split('/').pop()||targetWithHeading||source;
    });
    text=text.replace(/\[([^\]]+)\]\((?:\\.|[^()\\]|\([^()]*\))*\)/g,'$1');
    return text;
  }
  function activeMaster(master){return !master||master.status!=='archived'}
  function aliasesOf(master){return Array.isArray(master?.aliases)?master.aliases:[]}
  function findExactMaster(title,masters=[]){
    const key=norm(title);if(!key)return null;
    return masters.find(master=>activeMaster(master)&&(
      norm(master.title)===key||aliasesOf(master).some(alias=>norm(alias)===key)
    ))||null;
  }
  function suggestMasters(query,masters=[],limit=8){
    const key=norm(query);if(!key)return[];
    const scored=[];
    for(const master of masters){
      if(!activeMaster(master))continue;
      const title=norm(master.title),aliases=aliasesOf(master).map(norm);
      let score=0;
      if(title===key)score=100;
      else if(aliases.includes(key))score=95;
      else if(title.startsWith(key))score=80;
      else if(aliases.some(x=>x.startsWith(key)))score=70;
      else if(title.includes(key))score=60;
      else if(aliases.some(x=>x.includes(key)))score=50;
      if(score)scored.push({master,score});
    }
    scored.sort((a,b)=>b.score-a.score||String(a.master.title).length-String(b.master.title).length||String(a.master.title).localeCompare(String(b.master.title),'ja'));
    return scored.slice(0,limit).map(x=>x.master);
  }
  function dateParts(dateStr){
    const m=String(dateStr||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);if(!m)return null;
    const y=Number(m[1]),mo=Number(m[2]),d=Number(m[3]);
    const date=new Date(Date.UTC(y,mo-1,d));
    if(date.getUTCFullYear()!==y||date.getUTCMonth()!==mo-1||date.getUTCDate()!==d)return null;
    return{date,y,mo,d,weekday:date.getUTCDay()};
  }
  function daysBetween(a,b){return Math.round((b-a)/86400000)}
  function isRepeatDue(repeat,dateStr){
    if(!repeat||repeat.status==='archived'||repeat.status==='inactive')return false;
    const p=dateParts(dateStr);if(!p)return false;
    switch(repeat.rule){
      case'daily':return true;
      case'weekdays':return(Array.isArray(repeat.weekdays)?repeat.weekdays:[]).map(Number).includes(p.weekday);
      case'weekly':return Number(repeat.weekday)===p.weekday;
      case'biweekly':{
        if(Number(repeat.weekday)!==p.weekday)return false;
        const anchor=dateParts(repeat.anchor_date);if(!anchor)return false;
        const diff=daysBetween(anchor.date,p.date);return diff>=0&&diff%14===0;
      }
      case'nth_weekday':{
        if(Number(repeat.weekday)!==p.weekday)return false;
        const nth=Math.floor((p.d-1)/7)+1;return nth===Number(repeat.nth);
      }
      case'month_end':{
        const next=new Date(p.date.getTime()+86400000);return next.getUTCMonth()!==p.date.getUTCMonth();
      }
      default:return false;
    }
  }
  function repeatScheduleKey(repeat){
    const r=repeat||{},rule=String(r.rule||'daily'),parts=[String(r.master_id||''),rule,String(r.section||'').trim(),String(r.planned_at||'')];
    if(rule==='weekdays')parts.push([...new Set((Array.isArray(r.weekdays)?r.weekdays:[]).map(Number).filter(x=>Number.isInteger(x)&&x>=0&&x<=6))].sort((a,b)=>a-b).join(','));
    else if(rule==='weekly')parts.push(String(r.weekday??''));
    else if(rule==='biweekly')parts.push(String(r.anchor_date||''));
    else if(rule==='nth_weekday')parts.push(String(r.weekday??''),String(r.nth??''));
    return JSON.stringify(parts);
  }
  function cleanEstimate(value){
    if(value===null||value===undefined||value==='')return null;
    const n=Number(value);return Number.isFinite(n)&&n>=0?Math.round(n):null;
  }
  function generateDailyInstances(dateStr,masters=[],repeats=[],existingInstances=[]){
    const byId=new Map(masters.map(x=>[x.id,x]));
    const existingRepeatIds=new Set(existingInstances.map(x=>x?.repeat_id).filter(Boolean));
    const legacyByMaster=new Map();
    for(const instance of existingInstances){
      if(instance?.master_id&&!instance?.repeat_id)legacyByMaster.set(instance.master_id,(legacyByMaster.get(instance.master_id)||0)+1);
    }
    const result=[];
    const due=[...repeats].filter(repeat=>!existingRepeatIds.has(repeat.id)&&isRepeatDue(repeat,dateStr))
      .sort((a,b)=>String(a.planned_at||'99:99').localeCompare(String(b.planned_at||'99:99'))||String(a.id).localeCompare(String(b.id)));
    for(const repeat of due){
      const master=byId.get(repeat.master_id);if(!master||master.status==='archived')continue;
      const legacy=legacyByMaster.get(master.id)||0;
      if(legacy>0){legacyByMaster.set(master.id,legacy-1);continue}
      const override=cleanEstimate(repeat.estimate),base=cleanEstimate(master.estimate);
      result.push({
        id:'',date:dateStr,title:String(master.title||''),estimate:override===null?(base??0):override,
        completed:false,master_id:master.id,repeat_id:repeat.id,section:String(repeat.section||''),planned_at:String(repeat.planned_at||'')
      });
    }
    result.sort((a,b)=>String(a.planned_at||'99:99').localeCompare(String(b.planned_at||'99:99'))||String(a.title).localeCompare(String(b.title),'ja'));
    return result;
  }
  function escapeMeta(value){return encodeURIComponent(String(value||''))}
  function unescapeMeta(value){try{return decodeURIComponent(String(value||''))}catch{return String(value||'')}}
  function hiddenMetadata(instance){
    const parts=[];
    if(instance.master_id)parts.push(`master=${escapeMeta(instance.master_id)}`);
    if(instance.repeat_id)parts.push(`repeat=${escapeMeta(instance.repeat_id)}`);
    if(instance.planned_at)parts.push(`planned=${escapeMeta(instance.planned_at)}`);
    return parts.length?`<!-- tl:${parts.join(' ')} -->`:'';
  }
  function renderInstanceMarkdown(instance){
    const check=instance.completed?'x':' ';
    const estimate=cleanEstimate(instance.estimate);
    const visible=`- [${check}] ${String(instance.title||'').trim()}${estimate!==null?` (${estimate}m)`:''}`;
    const meta=hiddenMetadata(instance);return meta?`${visible} ${meta}`:visible;
  }
  function parseHiddenMetadata(line){
    const m=String(line||'').match(/<!--\s*tl:([^>]*)-->/i);if(!m)return{};
    const raw={};
    for(const token of m[1].trim().split(/\s+/)){
      const i=token.indexOf('=');if(i<1)continue;raw[token.slice(0,i)]=unescapeMeta(token.slice(i+1));
    }
    const out={};if(raw.master)out.master_id=raw.master;if(raw.repeat)out.repeat_id=raw.repeat;if(raw.planned)out.planned_at=raw.planned;return out;
  }
  function id(prefix='task'){
    const time=Date.now().toString(36);const rand=Math.random().toString(36).slice(2,9);return`${prefix}_${time}${rand}`;
  }
  function ensureMaster(title,estimate,masters=[]){
    const exact=findExactMaster(title,masters);if(exact)return{master:exact,created:false,masters};
    const master={id:id('task'),title:String(title||'').trim(),aliases:[],status:'active',estimate:cleanEstimate(estimate)??0};
    masters.push(master);return{master,created:true,masters};
  }
  function similarity(a,b){
    const x=norm(a),y=norm(b);if(!x||!y)return 0;if(x===y)return 1;if(x.includes(y)||y.includes(x))return Math.min(x.length,y.length)/Math.max(x.length,y.length)+0.2;
    const bigrams=s=>{const set=new Set();for(let i=0;i<s.length-1;i++)set.add(s.slice(i,i+2));return set};
    const A=bigrams(x),B=bigrams(y);if(!A.size||!B.size)return 0;let hit=0;for(const token of A)if(B.has(token))hit++;return(2*hit)/(A.size+B.size);
  }
  function findSimilarMasters(title,masters=[],threshold=.55){
    return masters.filter(activeMaster).map(master=>({master,score:Math.max(similarity(title,master.title),...aliasesOf(master).map(a=>similarity(title,a)),0)})).filter(x=>x.score>=threshold&&norm(x.master.title)!==norm(title)).sort((a,b)=>b.score-a.score);
  }
  function mergeMasterRecords(target,absorbed){
    if(!target?.id||!absorbed?.id||target.id===absorbed.id)throw new Error('Mergeには異なる2つのMasterが必要です');
    const aliases=[],seen=new Set([norm(target.title)]);
    for(const value of [...aliasesOf(target),absorbed.title,...aliasesOf(absorbed)]){
      const text=String(value||'').trim(),key=norm(text);if(!text||!key||seen.has(key))continue;seen.add(key);aliases.push(text);
    }
    return{...target,aliases,status:'active'};
  }
  function yamlQuote(value){return JSON.stringify(String(value??''))}
  function serializeMaster(master){
    const aliases=aliasesOf(master).map(x=>`  - ${yamlQuote(x)}`).join('\n');
    return`---\ntype: task-master\nid: ${yamlQuote(master.id)}\ntitle: ${yamlQuote(master.title)}\naliases:${aliases?`\n${aliases}`:' []'}\nstatus: ${yamlQuote(master.status||'active')}\nestimate: ${cleanEstimate(master.estimate)??0}\n---\n`;
  }
  function serializeRepeat(repeat){
    const weekdays=Array.isArray(repeat.weekdays)?repeat.weekdays.map(Number).filter(Number.isInteger):[];
    return`---\ntype: task-repeat\nid: ${yamlQuote(repeat.id)}\nmaster_id: ${yamlQuote(repeat.master_id)}\nstatus: ${yamlQuote(repeat.status||'active')}\nrule: ${yamlQuote(repeat.rule||'daily')}\nweekdays: [${weekdays.join(', ')}]\nweekday: ${repeat.weekday??''}\nnth: ${repeat.nth??''}\nanchor_date: ${yamlQuote(repeat.anchor_date||'')}\nsection: ${yamlQuote(repeat.section||'')}\nplanned_at: ${yamlQuote(repeat.planned_at||'')}\nestimate: ${repeat.estimate??''}\n---\n`;
  }

  function parseScalar(raw){
    const text=String(raw??'').trim();if(text==='')return'';
    if(text==='null'||text==='~')return null;
    if(/^[-+]?\d+(?:\.\d+)?$/.test(text))return Number(text);
    if(text==='true')return true;if(text==='false')return false;
    if(text.startsWith('"')||text.startsWith("'")){try{return JSON.parse(text)}catch{return text.slice(1,-1)}}
    return text;
  }
  function frontmatterObject(markdown){
    const source=String(markdown||'').replace(/\r\n?/g,'\n');
    if(!source.startsWith('---\n'))return{};
    const end=source.indexOf('\n---',4);if(end<0)return{};
    const lines=source.slice(4,end).split('\n'),out={};
    let listKey='';
    for(const line of lines){
      const list=line.match(/^\s*-\s+(.+)$/);
      if(list&&listKey){out[listKey].push(parseScalar(list[1]));continue}
      const m=line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);if(!m)continue;
      const key=m[1],raw=m[2];listKey='';
      if(raw===''){if(key==='aliases'){out[key]=[];listKey=key}else out[key]='';continue}
      if(/^\[.*\]$/.test(raw)){
        const body=raw.slice(1,-1).trim();out[key]=body?body.split(',').map(x=>parseScalar(x.trim())):[];continue;
      }
      out[key]=parseScalar(raw);
    }
    if(!Array.isArray(out.aliases))out.aliases=[];
    return out;
  }
  function parseMasterMarkdown(markdown){
    const x=frontmatterObject(markdown);
    return{id:String(x.id||''),title:String(x.title||''),aliases:Array.isArray(x.aliases)?x.aliases.map(String):[],status:String(x.status||'active'),estimate:cleanEstimate(x.estimate)??0};
  }
  function parseRepeatMarkdown(markdown){
    const x=frontmatterObject(markdown);
    return{id:String(x.id||''),master_id:String(x.master_id||''),status:String(x.status||'active'),rule:String(x.rule||'daily'),weekdays:Array.isArray(x.weekdays)?x.weekdays.map(Number).filter(Number.isInteger):[],weekday:x.weekday??'',nth:x.nth??'',anchor_date:String(x.anchor_date||''),section:String(x.section||''),planned_at:String(x.planned_at||''),estimate:x.estimate??''};
  }
  return{norm,displayTitle,findExactMaster,suggestMasters,isRepeatDue,repeatScheduleKey,generateDailyInstances,renderInstanceMarkdown,parseHiddenMetadata,ensureMaster,findSimilarMasters,mergeMasterRecords,serializeMaster,serializeRepeat,parseMasterMarkdown,parseRepeatMarkdown,id};
});
