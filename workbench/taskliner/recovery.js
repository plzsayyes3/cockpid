(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.TaskLinerRecovery=api;
})(globalThis,function(){
  'use strict';
  const INDEX='taskliner_recovery_backups_v1';
  const PREFIX='taskliner_recovery_backup_v1:';
  function targetKey({repo,branch,folder,date}){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw new Error('日付が不正です');
    const dir=String(folder||'').replace(/^\/+|\/+$/g,'');
    return String(repo)+'|'+String(branch)+'|'+(dir?dir+'/':'')+date+'.md';
  }
  function index(storage){
    try{const value=JSON.parse(storage.getItem(INDEX)||'[]');return Array.isArray(value)?value:[]}
    catch{return []}
  }
  function createBackup(storage,source){
    const target=targetKey(source);
    const id=String(Date.now())+'-'+Math.random().toString(36).slice(2);
    const record={id,target,date:source.date,createdAt:new Date().toISOString(),markdown:String(source.markdown)};
    const key=PREFIX+id;
    // Write the complete recovery copy before changing the index. If storage is
    // full, abort the remote replacement instead of losing the local version.
    storage.setItem(key,JSON.stringify(record));
    try{storage.setItem(INDEX,JSON.stringify([...index(storage),{id,target,date:source.date,createdAt:record.createdAt}]))}
    catch(error){storage.removeItem?.(key);throw error}
    return record;
  }
  function latest(storage,source){
    const target=targetKey(source);
    const records=index(storage);
    for(let i=records.length-1;i>=0;i--){
      const entry=records[i];
      if(entry.target!==target)continue;
      try{
        const value=JSON.parse(storage.getItem(PREFIX+entry.id)||'null');
        if(value?.target===target&&typeof value.markdown==='string')return value;
      }catch{}
    }
    return null;
  }
  return{createBackup,latest,targetKey};
});
