const {readFileSync}=require('node:fs');
const {resolve}=require('node:path');
const {runInNewContext}=require('node:vm');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const ts=require('typescript');
function load(name){
  const exports={};
  const code=ts.transpileModule(readFileSync(resolve(__dirname,'../src',name+'.ts'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  runInNewContext(code,{exports,require:id=>id==='./serial-actions'?load('serial-actions'):id==='react-dom'?{flushSync:f=>f()}:{},setTimeout,clearTimeout,performance,document:{activeElement:null}});
  return exports;
}
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve};};
function workspace(){
  const d=load('workspace').desktop;
  const p={sessionEpoch:1,clicked:'sources/data.yaml',source:'sources/data.yaml',revision:1,generation:1,table:{source:'sources/schema.yaml'}};
  d.surface={...d.surface,target:p.clicked,projection:p,status:{...d.surface.status,epoch:1}};
  d.complexView=async target=>({...d.surface.projection,row:target.row});
  d.refresh=async()=>{d.surface={...d.surface,projection:{...d.surface.projection,revision:d.surface.projection.revision+1,generation:d.surface.projection.generation+1}};};
  return {d,p};
}
test('先行編集の途中に押したnull解除を失わず、最新revisionで順に適用する',async()=>{
  const {d,p}=workspace(),entered=deferred(),release=deferred(),calls=[];
  let value='true';
  d.rpc=async intent=>{
    calls.push(intent);
    if(calls.length===1){entered.resolve();await release.promise;value='false';}
    else value=null;
    return {data:true};
  };
  const first=d.operation({kind:'editText'});await entered.promise;
  const clear=d.setCellNull(p,'row:1','value');
  assert.equal(d.surface.busy,false,'局所入力で画面全体をdisableしない');
  assert.equal(calls.length,1);
  release.resolve();
  assert.equal(await first,true);assert.equal(await clear,true);
  assert.equal(calls.length,2);assert.equal(calls[1].revision,2);
  assert.equal(calls[1].operation.kind,'null');assert.equal(value,null);assert.equal(d.surface.error,null);
});
test('途中の失敗後も後続入力を受け付け、別Projectへ古い入力を適用しない',async()=>{
  const {d}=workspace(),entered=deferred(),release=deferred();let calls=0;
  d.rpc=async()=>{calls++;entered.resolve();await release.promise;throw new Error('known rejection');};
  const first=d.operation({kind:'editText'});await entered.promise;
  const next=d.operation({kind:'editText'});
  d.surface={...d.surface,status:{...d.surface.status,epoch:2}};release.resolve();
  assert.equal(await first,false);assert.equal(await next,false);assert.equal(calls,1);
  d.rpc=async()=>{calls++;return {data:true};};
  assert.equal(await d.operation({kind:'editText'}),true);assert.equal(calls,2);
});
