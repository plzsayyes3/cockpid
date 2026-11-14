(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.TaskLinerTechoImport=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  function dateParts(value){
    const m=String(value||'').match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    return m?{year:Number(m[1]),month:Number(m[2]),day:Number(m[3])}:null;
  }
  function sectionFor(hour){
    if(hour<9)return'7-9';
    if(hour<19)return'9-19';
    return'19-24';
  }
  function duration(start,end){
    const [sh,sm]=start.split(':').map(Number),[eh,em]=end.split(':').map(Number);
    if(!Number.isFinite(sh)||!Number.isFinite(sm)||!Number.isFinite(eh)||!Number.isFinite(em))return 0;
    let value=(eh*60+em)-(sh*60+sm);if(value<0)value+=24*60;return value;
  }
  function dedupeTasks(items){
    const seen=new Set();return(Array.isArray(items)?items:[]).filter(item=>{
      const key=[item.title,item.section,item.planned_at].map(x=>String(x||'').trim().toLocaleLowerCase('ja-JP')).join('|');
      if(seen.has(key))return false;seen.add(key);return true;
    });
  }
  function extractDateTasks(markdown,date){
    const parts=dateParts(date);if(!parts)return[];
    const wanted=new RegExp(`^##\\s+${parts.month}月${parts.day}日(?:[（(]|\\s|$)`);
    let active=false;const out=[];
    for(const raw of String(markdown||'').replace(/\r\n?/g,'\n').split('\n')){
      if(/^##\s+/.test(raw)){
        active=wanted.test(raw.trim());
        continue;
      }
      if(!active||!/^\s*[-*+]\s+/.test(raw))continue;
      const m=raw.match(/^\s*[-*+]\s+(.*)$/);if(!m)continue;
      let body=m[1].trim(),completed=false;
      const mark=body.match(/^\[([ xX])\]\s*/);if(mark){completed=mark[1].toLowerCase()==='x';body=body.slice(mark[0].length).trim()}
      if(!body)continue;
      let planned_at='',estimate=0;
      const tm=body.match(/^(\d{1,2}:\d{2})\s*[-－ー〜~]\s*(\d{1,2}:\d{2})\s+(.*)$/);
      if(tm){planned_at=tm[1].padStart(5,'0');estimate=duration(planned_at,tm[2].padStart(5,'0'));body=tm[3].trim()}
      const hour=planned_at?Number(planned_at.slice(0,2)):12;
      out.push({title:body,estimate,completed,section:sectionFor(hour),planned_at});
    }
    return dedupeTasks(out);
  }
  return{extractDateTasks,sectionFor,duration,dedupeTasks};
});

