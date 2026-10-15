const {readFileSync}=require('node:fs');
const {resolve}=require('node:path');
const {runInNewContext}=require('node:vm');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const ts=require('typescript'),exportsValue={};
runInNewContext(ts.transpileModule(readFileSync(resolve(__dirname,'../src/source-diff.ts'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,{exports:exportsValue});
const {sourceDiff}=exportsValue;
const restored=(lines,side)=>Array.from(lines).flatMap(line=>line[side]?[line[side].text]:[]).join('\n');
test('挿入と削除の後も変更していない行を対応させ、両sourceの全文を復元できる',()=>{
 const before='records:\n  - id: 1\n    name: before\n  - id: 2\n    name: kept\n';
 const after='records:\n  - id: 1\n    name: after\n    added: yes\n  - id: 2\n    name: kept\n';
 const result=sourceDiff(before,after);
 assert.equal(restored(result,'left'),before);assert.equal(restored(result,'right'),after);
 assert.equal(result.find(line=>line.left?.text==='  - id: 2').changed,false);
 assert.equal(result.filter(line=>line.changed).length,2);
});
test('繰り返し行と末尾改行を失わず、大きい同一sourceに変更を捏造しない',()=>{
 for(const [a,b] of [['',''],['a\na\na\n','a\na\n'],['','new\n'],['old\n',''],['x\n'.repeat(20000),'x\n'.repeat(20000)]]){
  const result=sourceDiff(a,b);assert.equal(restored(result,'left'),a);assert.equal(restored(result,'right'),b);
  if(a===b)assert.equal(result.some(line=>line.changed),false);
 }
});
