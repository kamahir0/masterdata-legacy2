const {readFileSync}=require('node:fs');
const {resolve}=require('node:path');
const {runInNewContext}=require('node:vm');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const ts=require('typescript');
const exportsValue={};
runInNewContext(ts.transpileModule(readFileSync(resolve(__dirname,'../src/explorer-model.ts'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,{exports:exportsValue,Intl});
const {explorerEntries,ancestorKeys,visibleEntries,matchingAncestors,nextPrefix,stemEnd}=exportsValue;
const source=(path,category)=>({path,category,kind:null,binding:null,error:null});
const inventory={sourceDirectory:'sources',folders:['sources','sources/z-empty','sources/items','sources/items/nested'],sources:[source('sources/entry10.yaml','enum'),source('sources/entry2.yaml','custom'),source('sources/entry1.yaml','enum'),source('sources/items/schema.yaml','table'),source('sources/items/nested/data.yaml','data'),source('sources/items/readme.yaml',null)]};
const keys=nodes=>Array.from(nodes,node=>node.key);

test('sourcesを省略し、空フォルダーも先行させて自然順に並べる',()=>{
  const nodes=explorerEntries(inventory);
  assert.deepEqual(keys(nodes),['folder:sources/items','folder:sources/z-empty','sources/entry1.yaml','sources/entry2.yaml','sources/entry10.yaml']);
  assert.equal(nodes[1].folder,true);assert.equal(nodes[1].children.length,0);
  assert.deepEqual(keys(nodes[0].children),['folder:sources/items/nested','sources/items/readme.yaml','sources/items/schema.yaml']);
});
test('folderやfilenameから型を推測せずshared categoryで種類順にする',()=>{
  const nodes=explorerEntries(inventory,'type');
  assert.deepEqual(keys(nodes),['folder:sources/items','folder:sources/z-empty','sources/entry2.yaml','sources/entry1.yaml','sources/entry10.yaml']);
  assert.equal(nodes[0].children.find(node=>node.name==='readme.yaml').category,null);
});
test('path filterがancestorだけを残しinventoryを変更しない',()=>{
  const before=JSON.stringify(inventory),nodes=explorerEntries(inventory,'name','nested/data');
  assert.deepEqual(keys(nodes),['folder:sources/items']);
  const expanded=new Set(matchingAncestors(nodes));
  assert.deepEqual(keys(visibleEntries(nodes,expanded)),['folder:sources/items','folder:sources/items/nested','sources/items/nested/data.yaml']);
  assert.equal(JSON.stringify(inventory),before);
  assert.equal(explorerEntries(inventory,'name','absent').length,0);
});
test('keyboard移動の可視順はcollapse状態を守り、revealはhidden rootを展開候補にしない',()=>{
  const nodes=explorerEntries(inventory);
  assert.deepEqual(keys(visibleEntries(nodes,new Set())),keys(nodes));
  assert.deepEqual(Array.from(ancestorKeys('sources/items/nested/data.yaml','sources')),['folder:sources/items','folder:sources/items/nested']);
  assert.deepEqual(Array.from(ancestorKeys('sources/root.yaml','sources')),[]);
  const visible=visibleEntries(nodes,new Set(['folder:sources/items']));
  assert.equal(nextPrefix(visible,'sources/entry1.yaml','entry'),'sources/entry2.yaml');
  assert.equal(nextPrefix(visible,'sources/entry10.yaml','entry'),'sources/entry1.yaml');
  assert.equal(nextPrefix(visible,null,'does-not-exist'),null);
});
test('inline filenameのstem選択は拡張子とdotfileを保持する',()=>{
  assert.equal(stemEnd('Item.yaml'),4);assert.equal(stemEnd('item.part.yml'),9);
  assert.equal(stemEnd('folder'),6);assert.equal(stemEnd('.hidden'),7);
});
