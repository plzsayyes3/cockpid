(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.TaskLinerGithubClient=api})(globalThis,function(){
  'use strict';
  function createGithubFetch({storage,fetch,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))}){
    const key='taskliner_github_api_cooldown_until_v1';let queue=Promise.resolve(),lastRequest=0;
    return function request(input,options){
      const url=typeof input==='string'?input:input.url;
      if(new URL(url,globalThis.location?.href).hostname!=='api.github.com')return fetch(input,options);
      const operation=queue.catch(()=>{}).then(async()=>{
        const until=Number(storage.getItem(key)||0);
        if(until>Date.now())return new Response(JSON.stringify({message:`GitHub APIを一時休止中です。${new Date(until).toLocaleTimeString('ja-JP')}頃に再試行してください。`}),{status:429,headers:{'Content-Type':'application/json'}});
        const gap=Date.now()-lastRequest;if(gap<500)await wait(500-gap);
        const response=await fetch(input,options);lastRequest=Date.now();
        let limited=response.status===429||response.headers?.get('x-ratelimit-remaining')==='0';
        if(response.status===403&&!limited){try{limited=/rate limit/i.test(await response.clone().text())}catch{}}
        if(limited){const reset=Number(response.headers?.get('x-ratelimit-reset')||0)*1000,retry=Number(response.headers?.get('retry-after')||0)*1000;storage.setItem(key,String(Math.max(Date.now()+60000,reset,Date.now()+retry)+5000))}
        return response;
      });queue=operation;return operation;
    };
  }
  return{createGithubFetch};
});
