const {test}=require('node:test');const assert=require('node:assert/strict');
const path=require('node:path');
test('rate limiting stops subsequent GitHub requests without changing global fetch',async()=>{
  const {createGithubFetch}=require(path.join(__dirname,'github-client.js'));let calls=0;
  const values=new Map(),storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,String(v))};
  const request=createGithubFetch({storage,fetch:async()=>{calls++;return new Response('{}',{status:429,headers:{'retry-after':'60'}})},wait:async()=>{}});
  await request('https://api.github.com/repos/test/test');
  const response=await request('https://api.github.com/repos/test/test/contents/a');
  assert.equal(response.status,429);assert.equal(calls,1);assert.ok(Number(values.get('taskliner_github_api_cooldown_until_v1'))>Date.now());
});
test('non GitHub traffic is not blocked by the GitHub cooldown',async()=>{
  const {createGithubFetch}=require(path.join(__dirname,'github-client.js'));
  const storage={getItem:()=>String(Date.now()+60000),setItem(){}};let calls=0;
  const request=createGithubFetch({storage,fetch:async()=>{calls++;return new Response('ok')}});
  assert.equal(await(await request('https://example.test/')).text(),'ok');assert.equal(calls,1);
});
