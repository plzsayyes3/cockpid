(function(root,factory){
  const api=factory(root&&root.TaskLinerTemplates);
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./template-core.js'));
  if(root)root.TaskLinerDailyIntegration=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(TL){
  'use strict';
  if(!TL)throw new Error('TaskLinerTemplates is required');

  function sectionName(line){
    const m=String(line||'').match(/^\s*##\s+(.+?)\s*$/);
    return m?m[1].trim():'';
  }
  function sectionSortKey(value){
    const text=String(value||'').trim();
    const match=text.match(/^(\d{1,2})(?::(\d{2}))?\s*[-–—ー〜~]/);
    if(!match)return[1,0,text];
    return[0,Number(match[1])*60+Number(match[2]||0),text];
  }
  function compareSections(a,b){
    const left=sectionSortKey(a),right=sectionSortKey(b);
    return left[0]-right[0]||left[1]-right[1]||left[2].localeCompare(right[2],'ja');
  }
  function taskLine(line){return /^\s*-\s*\[[ xX/]\]\s+/.test(String(line||''))}
  function visibleTaskTitle(line){
    const m=String(line||'').match(/^\s*-\s*\[[ xX/]\]\s+(.*)$/);if(!m)return'';
    let body=m[1].trim()
      .replace(/\s*<!--\s*tl:[^>]*-->\s*$/i,'').trimEnd()
      .replace(/\s*\[SKIP(?:\s+[^\]]+)?\]\s*$/i,'').trimEnd()
      .replace(/\s*【[^】]*】\s*$/,'').trimEnd();
    const estimate=body.match(/\s*(?:⏳\s*)?\((\d+)m\)\s*$/);
    if(estimate)body=body.slice(0,estimate.index).trimEnd();
    return body.trim();
  }
  function existingInstances(markdown,masters=[]){
    const out=[];
    for(const line of String(markdown||'').replace(/\r\n?/g,'\n').split('\n')){
      if(!taskLine(line))continue;
      const meta=TL.parseHiddenMetadata(line);
      if(!meta.master_id){
        const title=visibleTaskTitle(line),master=title?TL.findExactMaster(title,masters):null;
        if(master)meta.master_id=master.id;
      }
      if(meta.master_id||meta.repeat_id||meta.planned_at)out.push(meta);
    }
    return out;
  }
  function insertOne(lines,instance){
    const target=String(instance.section||'').trim();
    if(!target){lines.push(TL.renderInstanceMarkdown(instance));return lines}
    let head=lines.findIndex(line=>sectionName(line)===target);
    if(head<0){
      if(lines.length&&lines[lines.length-1]!=='')lines.push('');
      lines.push(`## ${target}`);
      head=lines.length-1;
    }
    let end=lines.length;
    for(let i=head+1;i<lines.length;i++){if(sectionName(lines[i])){end=i;break}}
    const planned=String(instance.planned_at||'');
    let insertAt=end;
    if(planned){
      for(let i=head+1;i<end;i++){
        if(!taskLine(lines[i]))continue;
        const meta=TL.parseHiddenMetadata(lines[i]);
        const other=String(meta.planned_at||'');
        const inlineTime=(lines[i].match(/【\s*(\d{1,2}:\d{2})\s*[-－ー〜~]/)||[])[1]||'';
        const effective=other||inlineTime;
        if(effective&&effective>planned){insertAt=i;break}
      }
    }
    lines.splice(insertAt,0,TL.renderInstanceMarkdown(instance));
    return lines;
  }
  function sortClockSectionBlocks(lines){
    const heads=[];
    for(let i=0;i<lines.length;i++)if(sectionName(lines[i]))heads.push(i);
    const sortable=heads.map((start,index)=>{
      const end=heads[index+1]??lines.length;
      const name=sectionName(lines[start]);
      return{start,end,name,block:lines.slice(start,end),key:sectionSortKey(name)};
    });
    if(!sortable.length||sortable.some(item=>item.key[0]!==0))return lines;
    const sorted=[...sortable].sort((a,b)=>compareSections(a.name,b.name));
    if(sorted.every((item,index)=>item===sortable[index]))return lines;
    const before=lines.slice(0,sortable[0].start),after=lines.slice(sortable.at(-1).end);
    return[...before,...sorted.flatMap(item=>item.block),...after];
  }
  function lineIndent(line){
    const match=String(line||'').match(/^[\t ]*/);
    return(match?.[0]||'').replace(/\t/g,'    ').length;
  }
  function sortPlannedTasks(lines){
    const result=[...lines];
    for(let i=0;i<result.length;i++){
      if(!sectionName(result[i]))continue;
      let end=i+1;while(end<result.length&&!sectionName(result[end]))end++;
      const body=result.slice(i+1,end),items=[];
      for(let j=0;j<body.length;){
        const line=body[j];
        if(!taskLine(line)){items.push({type:'raw',lines:[line]});j++;continue}
        const indent=lineIndent(line),block=[line];
        j++;
        while(j<body.length&&String(body[j]).trim()&&lineIndent(body[j])>indent){block.push(body[j]);j++}
        const meta=TL.parseHiddenMetadata(line);
        const inlineTime=(line.match(/【\s*(\d{1,2}:\d{2})\s*[-－ー〜~]/)||[])[1]||'';
        items.push({type:'task',planned:String(meta.planned_at||inlineTime||''),lines:block});
      }
      const tasks=items.filter(item=>item.type==='task'),planned=tasks.filter(item=>item.planned);
      if(planned.length<2){i=end-1;continue}
      const ordered=[...planned].sort((a,b)=>a.planned.localeCompare(b.planned)).concat(tasks.filter(item=>!item.planned));
      let taskIndex=0;
      const sortedBody=items.flatMap(item=>item.type==='task'?ordered[taskIndex++].lines:item.lines);
      result.splice(i+1,end-i-1,...sortedBody);
      end=i+1+sortedBody.length;
      i=end-1;
    }
    return result;
  }
  function mergeGeneratedIntoMarkdown(markdown,instances=[]){
    const lines=String(markdown||'').replace(/\r\n?/g,'\n').split('\n');
    const sorted=[...instances].sort((a,b)=>compareSections(a.section,b.section)||String(a.planned_at||'99:99').localeCompare(String(b.planned_at||'99:99'))||String(a.title||'').localeCompare(String(b.title||''),'ja'));
    for(const instance of sorted)insertOne(lines,instance);
    return sortPlannedTasks(sortClockSectionBlocks(lines)).join('\n');
  }
  return{sectionName,existingInstances,mergeGeneratedIntoMarkdown};
});
