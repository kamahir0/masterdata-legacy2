import {invoke} from '@tauri-apps/api/core';
import {desktop} from './workspace';
import {stemEnd} from './explorer-model';
const SOURCE='sources/catalog-data.yaml',SCHEMA='sources/catalog-schema.yaml';
const frame=()=>new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
async function until(test:()=>boolean,message:string){const deadline=performance.now()+8000;while(!test()){if(performance.now()>deadline)throw new Error(message);await frame();}}
function assert(test:unknown,message:string):asserts test{if(!test)throw new Error(message);}
function tree(){const element=document.querySelector<HTMLElement>('#explorer [role="tree"]');assert(element,'Explorer tree missing');return element;}
function row(path:string){const element=[...document.querySelectorAll<HTMLElement>('#explorer [data-path]')].find(element=>element.dataset.path===path);assert(element,'row not rendered: '+path);return element;}
function input(label:string){const element=document.querySelector<HTMLInputElement>('input[aria-label="'+label+'"]');assert(element,'input missing: '+label);return element;}
function text(element:HTMLInputElement,value:string){Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(element,value);element.dispatchEvent(new Event('input',{bubbles:true}));}
function key(element:HTMLElement,key:string,options:KeyboardEventInit={}){const code:Record<string,number>={Enter:13,ArrowDown:40,ArrowUp:38,ArrowLeft:37,ArrowRight:39,Home:36,End:35,F2:113};element.dispatchEvent(new KeyboardEvent('keydown',{key,keyCode:code[key]??0,which:code[key]??0,bubbles:true,...options}));}
function button(label:string){const element=[...document.querySelectorAll<HTMLButtonElement>('button')].find(button=>button.getAttribute('aria-label')===label||button.textContent===label);assert(element,'button missing: '+label);return element;}
async function rename(){tree().focus();key(tree(),'F2');await until(()=>!!document.querySelector('input[aria-label="変更後のファイル名"]'),'inline rename missing');await until(()=>document.activeElement===input('変更後のファイル名'),'inline rename not focused');return input('変更後のファイル名');}
async function showSource(path:string){
  await desktop.selectTarget(path,'explorer-evidence');button('ソースの操作').click();
  const label='表示中のファイルをエクスプローラーで表示';
  await until(()=>[...document.querySelectorAll<HTMLElement>('.ant-dropdown:not(.ant-dropdown-hidden) [role="menuitem"]')].some(item=>item.textContent===label),'Reveal menu missing');
  [...document.querySelectorAll<HTMLElement>('.ant-dropdown:not(.ant-dropdown-hidden) [role="menuitem"]')].find(item=>item.textContent===label)!.click();
  await until(()=>!![...document.querySelectorAll<HTMLElement>('#explorer [data-path]')].find(element=>element.dataset.path===path),'selected source not revealed');await frame();
}
export async function run({startup}:{startup:Record<string,unknown>}){
  const checks:string[]=[],originalRpc=desktop.rpc.bind(desktop),originalMoved=desktop.sourceMoved.bind(desktop),focusLog:unknown[]=[];
  const focusState=(phase:string)=>{focusLog.push({phase,active:document.activeElement?.tagName+':'+document.activeElement?.id,focused:document.hasFocus(),target:desktop.surface.target,pending:desktop.surface.pending,projection:desktop.surface.projection?.source,input:desktop.inputIntent});};
  desktop.sourceMoved=async(source,destination,epoch)=>{focusState('sourceMoved:before');await originalMoved(source,destination,epoch);focusState('sourceMoved:after');};
  try{
    await until(()=>document.hasFocus()&&!!desktop.surface.inventory,'Project / foreground unavailable');
    assert(desktop.surface.inventory!.folders.length>1500,'long Explorer inventory missing');
    await showSource(SOURCE);
    assert(document.querySelectorAll('#explorer .ant-tree-treenode').length<60,'Explorer mounted entire inventory');
    assert(![...document.querySelectorAll<HTMLElement>('#explorer [data-path]')].some(element=>element.dataset.path==='folder:sources'),'hidden root left a tree row');
    const sourceHeight=row(SOURCE).closest('.ant-tree-treenode')!.getBoundingClientRect().height;
    assert(sourceHeight<=24,'Explorer rows are not compact');
    checks.push('compact-hidden-root-bounded-tree');
    const separator=document.querySelector<HTMLElement>('#explorer [role="separator"]')!;
    const width=Number(separator.getAttribute('aria-valuenow'));
    key(separator,'ArrowRight');await until(()=>Number(separator.getAttribute('aria-valuenow'))===width+10,'keyboard resize did not update width');
    key(separator,'Home');await until(()=>separator.getAttribute('aria-valuenow')==='200','resize minimum missing');
    key(separator,'End');await until(()=>Number(separator.getAttribute('aria-valuenow'))===Number(separator.getAttribute('aria-valuemax')),'resize maximum missing');
    assert(row(SOURCE).closest('.ant-tree-treenode')!.getBoundingClientRect().height===sourceHeight,'resize changed row height');
    checks.push('keyboard-resize-and-stable-row-height');
    tree().focus();key(tree(),'Home');await until(()=>!!document.querySelector('[data-path="folder:sources/a-nested"]'),'Home did not scroll to first folder');
    row('folder:sources/a-nested').click();await until(()=>!!document.querySelector('[data-path="folder:sources/a-nested/deep"]'),'folder click did not expand');
    key(tree(),'ArrowDown');await frame();assert(String(desktop.surface.target)===SOURCE,'folder / arrow focus switched editor');
    key(tree(),'End');await frame();assert(String(desktop.surface.target)===SOURCE,'End opened focused source');
    key(tree(),'Home');await frame();key(tree(),'z');await frame();
    assert(document.querySelector('.ant-tree-treenode-active [data-path]')?.getAttribute('data-path')?.startsWith('folder:sources/z-folder-'),'type ahead did not focus matching row');
    checks.push('folder-focus-navigation-typeahead');
    key(tree(),'f',{ctrlKey:true});await until(()=>!!document.querySelector('input[aria-label="ソースを絞り込む"]'),'filter shortcut missing');
    text(input('ソースを絞り込む'),'catalog-schema');await until(()=>!!document.querySelector('[data-path="sources/catalog-schema.yaml"]'),'filter did not show match');
    await until(()=>document.querySelectorAll('#explorer [data-path]').length===1,'filter kept unrelated rows after transition');
    assert(String(desktop.surface.target)===SOURCE,'filter changed editor');
    text(input('ソースを絞り込む'),'no-matching-source');await until(()=>document.querySelector('.explorer-empty')?.textContent==='一致するソースがありません','no-match message missing');
    key(input('ソースを絞り込む'),'Escape');await until(()=>!document.querySelector('input[aria-label="ソースを絞り込む"]'),'Escape did not close filter');
    checks.push('filter-is-presentation-only');
    await showSource(SOURCE);
    row(SOURCE).dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,button:2,clientX:120,clientY:200}));
    await until(()=>[...document.querySelectorAll<HTMLElement>('.ant-dropdown:not(.ant-dropdown-hidden) [role="menuitem"]')].some(item=>item.textContent==='移動…'),'context menu did not open');
    [...document.querySelectorAll<HTMLElement>('.ant-dropdown:not(.ant-dropdown-hidden) [role="menuitem"]')].find(item=>item.textContent==='移動…')!.click();
    await until(()=>!!document.querySelector('input[aria-label="移動後のソースファイル名"]'),'context Move did not open');
    await until(()=>![...document.querySelectorAll<HTMLElement>('.ant-dropdown:not(.ant-dropdown-hidden)')].some(menu=>menu.textContent?.includes('相対パスをコピー')),'context menu remained behind Move');
    button('キャンセル').click();await until(()=>!document.querySelector('input[aria-label="移動後のソースファイル名"]'),'context Move Cancel missing');
    checks.push('context-menu-closes-before-next-surface');
    await showSource('sources/other-table.yaml');
    tree().focus();
    for(let attempt=0;attempt<15&&document.querySelector('.ant-tree-treenode-active [data-path]')?.getAttribute('data-path')!==SCHEMA;attempt++){key(tree(),'ArrowUp');await frame();}
    assert(document.querySelector('.ant-tree-treenode-active [data-path]')?.getAttribute('data-path')===SCHEMA,'context source not focused');
    button('ソースを作成').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0}));button('ソースを作成').click();
    await until(()=>[...document.querySelectorAll<HTMLElement>('.ant-dropdown:not(.ant-dropdown-hidden) [role="menuitem"]')].some(item=>item.textContent==='データ'),'Data kind menu missing');
    [...document.querySelectorAll<HTMLElement>('.ant-dropdown:not(.ant-dropdown-hidden) [role="menuitem"]')].find(item=>item.textContent==='データ')!.click();
    await until(()=>!!document.querySelector('input[aria-label="新しいソースのファイル名"]')&&input('新しいソースのファイル名').title.includes('識別子: item'),'Data proposal followed another editor instead of context source');
    await until(()=>document.activeElement===input('新しいソースのファイル名'),'Data proposal not focused');
    key(input('新しいソースのファイル名'),'Escape');await until(()=>!document.querySelector('.creation-inline'),'Data proposal Cancel missing');
    checks.push('file-context-freezes-data-binding');
    const transfer=new DataTransfer();transfer.items.add(new File(['kind: data'],'external.yaml',{type:'text/plain'}));
    const externalDrop=new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:transfer});
    document.querySelector('.explorer-viewport')!.dispatchEvent(externalDrop);
    assert(externalDrop.defaultPrevented&&!desktop.surface.inventory!.sources.some(source=>source.path.endsWith('/external.yaml')),'external drop navigated/imported a file');
    checks.push('external-drop-is-not-source-import');

    await showSource(SOURCE);
    let field=await rename();assert(field.selectionStart===0&&field.selectionEnd===stemEnd(field.value),'rename did not select stem');
    text(field,'composition.yaml');key(field,'Enter',{isComposing:true});await frame();assert(String(desktop.surface.target)===SOURCE,'IME Enter renamed source');
    key(field,'Escape');await until(()=>!document.querySelector('input[aria-label="変更後のファイル名"]'),'Escape did not cancel rename');
    field=await rename();text(field,'catalog-schema.yaml');key(field,'Enter');await until(()=>!!document.querySelector('.source-path-inline .ant-alert'),'rename conflict missing');
    assert(input('変更後のファイル名').value==='catalog-schema.yaml'&&desktop.surface.target===SOURCE,'conflict lost input or changed source');
    key(input('変更後のファイル名'),'Escape');await until(()=>!document.querySelector('.source-path-inline'),'conflict Cancel missing');
    field=await rename();text(field,'');
    document.getElementById('editor-pane')!.dispatchEvent(new PointerEvent('pointerdown',{button:0,bubbles:true}));
    await until(()=>!document.querySelector('.source-path-inline'),'empty outside rename did not cancel');
    checks.push('inline-rename-stem-ime-empty-conflict');
    await showSource(SOURCE);field=await rename();text(field,'renamed-inline.yaml');
    // Delay the preview reply so the outside click and a later file selection
    // occur before rename finishes. The commit must not steal that new focus.
    let release=()=>{},received=false;
    const gate=new Promise<void>(resolve=>{release=resolve;});
    desktop.rpc=async function<T>(intent:Record<string,unknown>){const reply=await originalRpc<T>(intent);if(intent.kind==='pathMovePreview'){received=true;await gate;}return reply;};
    text(field,'renamed-final.yaml');await until(()=>received,'rename preview gate unavailable');
    row(SCHEMA).dispatchEvent(new PointerEvent('pointerdown',{button:0,bubbles:true}));row(SCHEMA).click();document.getElementById('editor-pane')!.focus();focusState('outside:focused');release();
    await until(()=>desktop.surface.inventory!.sources.some(source=>source.path==='sources/renamed-final.yaml')&&!document.querySelector('.source-path-inline'),'outside rename did not finish latest preview');
    await until(()=>!desktop.surface.pending&&desktop.surface.projection?.clicked===SCHEMA,'renamed Table view did not refresh');
    focusState('outside:settled');
    assert(String(desktop.surface.target)===SCHEMA&&document.activeElement?.closest('#editor-pane'),'outside rename stole newer selection/focus');
    desktop.rpc=originalRpc;checks.push('outside-rename-waits-latest-preview-preserves-new-intent');
    await showSource('sources/renamed-final.yaml');field=await rename();text(field,'lost-reply.yaml');
    let moves=0;
    desktop.rpc=async function<T>(intent:Record<string,unknown>){const reply=await originalRpc<T>(intent);if(intent.kind==='moveSource'){moves++;throw new Error('lost rename reply');}return reply;};
    key(field,'Enter');await until(()=>document.querySelector<HTMLInputElement>('input[aria-label="変更後のファイル名"]')?.disabled===true,'lost rename reply did not protect input');
    await desktop.refreshInventory();await until(()=>!!document.querySelector('input[aria-label="変更後のファイル名"]'),'uncertain rename input disappeared after inventory refresh');
    document.getElementById('editor-pane')!.dispatchEvent(new PointerEvent('pointerdown',{button:0,bubbles:true}));key(input('変更後のファイル名'),'Escape');await frame();
    assert(moves===1&&!!document.querySelector('.source-path-inline'),'uncertain rename retried or disappeared');
    desktop.rpc=originalRpc;button('変更前・変更後のパスを再確認').click();
    await until(()=>desktop.surface.target==='sources/lost-reply.yaml'&&!desktop.surface.pending&&!document.querySelector('.source-path-inline'),'rename recheck did not converge');
    checks.push('uncertain-rename-no-retry-explicit-recheck');
    const projection=desktop.surface.projection!;
    await desktop.rpc({kind:'editText',source:projection.source,revision:projection.revision,generation:projection.generation,row:projection.rows[0].id,field:'name',text:'Explorer dirty guard'});
    await showSource('sources/lost-reply.yaml');tree().focus();key(tree(),'F2');
    await until(()=>!!desktop.surface.choice,'inline rename bypassed dirty guard');
    // Published state precedes React's modal commit on WebView2. Wait for the
    // observable guard control, rather than treating the state as rendered UI.
    await until(()=>[...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].some(element=>element.textContent==='キャンセル'&&element.getClientRects().length>0),'dirty guard Cancel not rendered');
    button('キャンセル').click();
    await until(()=>!desktop.surface.choice,'dirty Cancel not accepted');assert(desktop.surface.status.dirty.includes('sources/lost-reply.yaml')&&!document.querySelector('.source-path-inline'),'dirty Cancel lost buffer or opened rename');
    checks.push('inline-rename-scoped-dirty-guard');
    assert((startup.browserErrors as string[]).length===0,'browser errors');
    await invoke('evidence_write',{report:{kind:'explorer',checks,startup,visibility:document.visibilityState,focused:document.hasFocus(),sourceHeight,renderedRows:document.querySelectorAll('#explorer .ant-tree-treenode').length,inventoryFolders:desktop.surface.inventory!.folders.length,dirty:desktop.surface.status.dirty}});
  }catch(error){await invoke('evidence_write',{report:{kind:'explorer',checks,error:error instanceof Error?(error.message+"\n"+(error.stack??"")):JSON.stringify(error),startup,paths:[...document.querySelectorAll<HTMLElement>('#explorer [data-path]')].map(element=>element.dataset.path),focusLog,status:desktop.surface.status,pending:desktop.surface.pending,viewport:document.querySelector('.explorer-viewport')?.outerHTML.slice(0,3000),active:document.activeElement?.outerHTML.slice(0,500),target:desktop.surface.target}});}
  finally{desktop.rpc=originalRpc;desktop.sourceMoved=originalMoved;}
}
