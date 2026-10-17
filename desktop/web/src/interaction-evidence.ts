import {invoke} from '@tauri-apps/api/core';
import {desktop} from './workspace';
const SOURCE='sources/interaction-data.yaml',SCHEMA='sources/interaction-schema.yaml';
const frame=()=>new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
async function until(test:()=>boolean,message:string){const end=performance.now()+8000;while(!test()){if(performance.now()>end)throw new Error(message);await frame();}}
function assert(value:unknown,message:string):asserts value{if(!value)throw new Error(message);}
function find(selector:string){const value=document.querySelector<HTMLElement>(selector);assert(value,'missing '+selector);return value;}
function key(element:HTMLElement,key:string){element.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true}));}
function text(input:HTMLInputElement,value:string){Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));}
async function settled(){await until(()=>!desktop.surface.pending&&!desktop.mutating,'operation unsettled');await frame();assert(!desktop.surface.error,desktop.surface.error??'operation failed');}
async function cell(row:number,column:number){desktop.viewport!.focus();desktop.setSelection(row,column);desktop.move(0,0);await until(()=>!!document.getElementById(`cell-${row}-${column}`),'cell not mounted');key(desktop.viewport!,'Enter');await frame();}
async function readyValue(){await until(()=>!!document.querySelector('.near-value-body>[aria-busy="false"],.ant-drawer-body>[aria-busy="false"]'),'value descriptor did not become current');await frame();}
async function undo(){await desktop.undo(false);await settled();}
function booleanGeometry(element:HTMLElement){
 const track=element.querySelector<HTMLElement>('.boolean-track')!,thumb=track.firstElementChild!,label=element.querySelector<HTMLElement>('.boolean-state')!,rect=track.getBoundingClientRect(),t=thumb.getBoundingClientRect(),l=label.getBoundingClientRect(),style=getComputedStyle(element);
 return JSON.stringify({track:[rect.width,rect.height],thumb:[t.width,t.height],gap:Math.round((l.left-rect.right)*10)/10,font:[style.fontFamily,style.fontSize,style.fontWeight,style.lineHeight],label:label.textContent});
}
export async function run({startup}:{startup:Record<string,unknown>}){
 const checks:string[]=[];
 try{
  await until(()=>document.hasFocus()&&!!desktop.surface.inventory,'Project not ready');
  await desktop.selectTarget(SOURCE);desktop.setSelection(1,4);await desktop.selectTarget('sources/catalog-data.yaml');await settled();
  assert(desktop.interaction.selection.column===0&&desktop.interaction.selection.row===0,'unvisited source inherited a hidden cell');
  await desktop.selectRecordSource(SCHEMA);await settled();
  assert(desktop.surface.projection?.source===SCHEMA&&desktop.surface.projection.totalRows===0,'explicit Schema destination unavailable');
  await desktop.addRow();await settled();assert(desktop.surface.projection!.rows[0].cells.every(c=>c.valid),'Schema Add has invalid defaults');
  await undo();assert(!desktop.surface.projection!.dirty&&desktop.surface.projection!.totalRows===0,'first Schema Add did not undo to absence');
  checks.push('new-source-origin-explicit-schema-and-defaults');

  await desktop.selectRecordSource(SOURCE);await settled();await cell(0,1);
  await until(()=>!!document.querySelector('.active-cell-editor .boolean-empty'),'nullable bool choices unavailable');
  find('[aria-label="enabled 行 1 をtrueにする"]').click();await until(()=>desktop.surface.projection!.rows[0].cells[1].display==='true'&&!desktop.interaction.editor,'bool choice not committed');await settled();
  assert(document.activeElement===desktop.viewport,'nullable bool lost grid focus');await undo();assert(desktop.surface.projection!.rows[0].cells[1].isNull,'nullable bool Undo lost null');
  checks.push('nullable-boolean-choice-and-focus');

  await cell(0,0);await until(()=>!!document.querySelector('.active-cell-editor input'),'scalar input unavailable');text(find('.active-cell-editor input') as HTMLInputElement,'3');
  await desktop.save();await settled();assert(document.activeElement===desktop.viewport&&desktop.surface.saveNotice&&!desktop.surface.projection!.dirty,'typing Save lost focus / saved feedback');
  await cell(0,0);await until(()=>!!document.querySelector('.active-cell-editor input'),'restore input unavailable');text(find('.active-cell-editor input') as HTMLInputElement,'1');await desktop.save();await settled();
  checks.push('save-commits-input-retains-focus-and-reports-target');

  await cell(0,2);await until(()=>!!document.querySelector('.value-null-state button'),'nullable Custom did not show create action');await readyValue();find('.value-null-state button').click();
  await until(()=>!!document.querySelector('.custom-fields'),'Custom materialize did not open editable fields');
  find('[aria-label="note の値を設定"]').click();await until(()=>!!document.querySelector('.complex-input input'),'nested nullable did not directly expose input');
  const nested=find('.complex-input input') as HTMLInputElement;text(nested,'temporary');key(nested,'Escape');
  await until(()=>!document.querySelector('.complex-input input'),'nested Escape did not end typing');await frame();
  assert(document.activeElement!==document.body&&find('.near-value-popover,.ant-drawer-content').contains(document.activeElement),'nested Escape lost focus');
  desktop.closeComplex();await undo();await undo();assert(desktop.surface.projection!.rows[0].cells[2].isNull,'nullable Custom Undo did not restore null');
  checks.push('nested-nullable-direct-create-cancel-and-exact-undo');

  await cell(0,4);await until(()=>!!document.querySelector('.flags-members'),'Flags not shown');await readyValue();
  const member=(name:string)=>[...document.querySelectorAll<HTMLLabelElement>('.flags-members label')].find(el=>el.textContent===name)!;
  member('Fire').click();await until(()=>!(document.querySelector('.flags-members input') as HTMLInputElement).checked,'bit did not clear None');
  member('None').click();await until(()=>!!(document.querySelector('.flags-members input') as HTMLInputElement).checked,'None did not clear bits');
  assert([...document.querySelectorAll<HTMLInputElement>('.flags-members input')].filter(i=>i.checked).length===1,'None coexists with bits');desktop.closeComplex();await undo();await undo();
  checks.push('flags-none-automatic-exclusion');

  await cell(0,3);await until(()=>[...document.querySelectorAll<HTMLButtonElement>('button')].some(e=>e.textContent?.includes('空の配列へ置き換えて修復')),'invalid array repair not discoverable');await readyValue();
  [...document.querySelectorAll<HTMLButtonElement>('button')].find(e=>e.textContent?.includes('空の配列へ置き換えて修復'))!.click();
  await until(()=>desktop.surface.projection!.rows[0].cells[3].valid,'array repair failed');desktop.closeComplex();await undo();assert(!desktop.surface.projection!.rows[0].cells[3].valid,'array repair Undo lost original invalid input');
  checks.push('invalid-array-explicit-repair-and-undo');

  // GUI-DATA-EDIT-005 / GUI-DATA-NAV-001: compare rendered controls in their
  // real hosts, and navigate every ancestor without creating source history.
  const direct=find('#cell-1-1 [role="switch"]'),geometry=booleanGeometry(direct);
  await cell(1,1);await until(()=>!!document.querySelector('.active-cell-editor [role="switch"]'),'active bool missing');
  assert(booleanGeometry(find('.active-cell-editor [role="switch"]'))===geometry,'active / direct bool appearance differs');
  key(find('.active-cell-editor [role="switch"]'),'Escape');await frame();
  await cell(0,5);await readyValue();
  const child=(label:string)=>{const row=[...document.querySelectorAll<HTMLElement>('.complex-field')].find(el=>el.firstElementChild?.textContent===label);assert(row,'missing nested '+label);return row;};
  const enter=async(label:string)=>{await until(()=>[...document.querySelectorAll<HTMLElement>('.complex-field')].some(el=>el.firstElementChild?.textContent===label),'nested field not ready');child(label).querySelector<HTMLButtonElement>('button')!.click();await until(()=>desktop.interaction.complex?.path.at(-1)===label,'nested navigation did not start');await until(()=>document.querySelector('.value-path-current')?.textContent===label,'breadcrumb did not resolve');await readyValue();};
  await enter('second');await enter('third');
  const crumbs=()=>[...find('.value-path').querySelectorAll<HTMLElement>('li>button,[aria-current="location"]')].map(el=>el.textContent);
  assert(JSON.stringify(crumbs())===JSON.stringify(['first','second','third']),'intermediate breadcrumb was omitted');
  const nestedBool=child('enabled').querySelector<HTMLElement>('[role="switch"]')!;
  assert(booleanGeometry(nestedBool)===geometry,'nested / direct bool appearance differs');
  nestedBool.click();await until(()=>child('enabled').querySelector('[role="switch"]')?.getAttribute('aria-checked')==='true','nested bool did not commit');await settled();
  const undoOrigin=child('enabled').querySelector<HTMLElement>('[role="switch"]')!;
  const actualRpc=desktop.rpc.bind(desktop);let heldDescriptor=false,releaseDescriptor=()=>{};
  const descriptorGate=new Promise<void>(resolve=>{releaseDescriptor=resolve;});
  desktop.rpc=async function<T>(intent:Record<string,unknown>){const reply=await actualRpc<T>(intent);if(intent.kind==='complex'){heldDescriptor=true;await descriptorGate;}return reply;};
  try{undoOrigin.focus();undoOrigin.dispatchEvent(new KeyboardEvent('keydown',{key:'z',ctrlKey:true,bubbles:true}));await until(()=>heldDescriptor,'Undo did not refresh its descriptor');
    const valueBody=document.querySelector<HTMLElement>('.near-value-body>[aria-busy],.ant-drawer-body>[aria-busy]')!;
    assert(!valueBody.inert&&valueBody.getAttribute('aria-busy')==='true'&&document.activeElement===undoOrigin,'local descriptor refresh hid pending state / disabled keyboard input / lost focus');
  }finally{releaseDescriptor();desktop.rpc=actualRpc;}
  await until(()=>child('enabled').querySelector('[role="switch"]')?.getAttribute('aria-checked')==='false','nested keyboard Undo did not commit');await settled();await readyValue();
  assert(document.activeElement===child('enabled').querySelector('[role="switch"]'),'nested keyboard Undo lost control focus');
  assert(child('enabled').querySelector('[role="switch"]')?.getAttribute('aria-checked')==='false','nested bool Undo failed');
  child('optional').querySelector<HTMLButtonElement>('[aria-label="optional をtrueにする"]')!.click();await until(()=>!!child('optional').querySelector('[role="switch"]'),'nested null bool choice did not commit');await settled();await readyValue();
  assert(!!child('optional').querySelector('[role="switch"]'),'nested null bool did not use common control');
  child('optional').querySelector<HTMLButtonElement>('[aria-label="optional を未設定にする"]')!.click();await until(()=>!!child('optional').querySelector('.boolean-empty'),'nested bool null did not commit');await settled();await undo();await undo();await readyValue();
  child('invalid').querySelector<HTMLButtonElement>('button')!.click();await until(()=>!!child('invalid').querySelector('input'),'invalid bool not editable as text');
  const invalid=child('invalid').querySelector<HTMLInputElement>('input')!;text(invalid,'true');await frame();
  assert(child('invalid').querySelector('input')===invalid,'valid text replaced the editor before commit');key(invalid,'Enter');await until(()=>!!child('invalid').querySelector('[role="switch"]'),'invalid bool text did not commit');await settled();await undo();await readyValue();
  assert(child('invalid').textContent?.includes('broken'),'invalid bool original was lost');
  find('.value-path-ancestors button[aria-label="second の値に戻る"]').click();await until(()=>document.querySelector('.value-path-current')?.textContent==='second','ancestor did not resolve');await readyValue();
  const long='thirdWithALongNameThatMustRemainReadableAtNarrowWidths';await enter(long);
  const popup=find('.near-value-popover');popup.style.maxWidth='140px';await frame();await frame();
  const path=find('.value-path'),current=path.querySelector<HTMLElement>('[aria-current]')!,rail=path.querySelector<HTMLElement>('.value-path-ancestors')!,pathBounds=path.getBoundingClientRect(),c=current.getBoundingClientRect();
  assert(current.textContent===long&&c.height>20&&c.right<=pathBounds.right+1,'current long name is clipped');
  assert(rail.scrollWidth>rail.clientWidth&&JSON.stringify(crumbs())===JSON.stringify(['first','second',long]),'narrow breadcrumb lost an ancestor');
  rail.focus();assert(document.activeElement===rail,'ancestor scroll rail is not keyboard reachable');popup.style.maxWidth='';
  find('[aria-label="元のセルの値"]').click();await until(()=>document.querySelector('.value-path-current')?.textContent==='first','root did not resolve');await readyValue();assert(JSON.stringify(crumbs())===JSON.stringify(['first']),'root breadcrumb did not navigate');
  desktop.closeComplex();await cell(0,6);await readyValue();await until(()=>!!document.querySelector('.element-value button'),'array root did not resolve');find('.element-value button').click();await until(()=>document.querySelector('.value-path-current')?.textContent==='1','array occurrence did not resolve');await readyValue();await enter('third');
  assert(JSON.stringify(crumbs())===JSON.stringify(['groups','1','third']),'array breadcrumb exposes opaque identity / omits path');desktop.closeComplex();await settled();
  assert(!desktop.surface.projection!.dirty&&!desktop.surface.projection!.canUndo,'navigation created source history');
  checks.push('shared-boolean-rendering-all-levels-and-full-breadcrumbs');

  await desktop.selectTarget('sources/InteractionFirst.yaml');await settled();
  const button=(label:string)=>{const match=[...document.querySelectorAll<HTMLButtonElement>('button')].find(el=>el.getClientRects().length&&el.textContent===label);assert(match,'missing button '+label);return match;};
  button('フィールドを追加').click();await until(()=>!!document.querySelector('[aria-label="Custom Typeフィールドの基になる型"]'),'field initializer missing');
  const combo=find('[aria-label="Custom Typeフィールドの基になる型"]');combo.focus();combo.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',keyCode:40,which:40,bubbles:true}));
  await until(()=>[...document.querySelectorAll<HTMLElement>('.ant-select-item-option-content')].some(el=>el.getClientRects().length&&el.textContent==='InteractionFirst'),'initializer type choice missing');
  [...document.querySelectorAll<HTMLElement>('.ant-select-item-option-content')].find(el=>el.getClientRects().length&&el.textContent==='InteractionFirst')!.click();
  [...document.querySelectorAll<HTMLElement>('.ant-radio-wrapper')].find(el=>el.textContent==='必須')!.click();
  await until(()=>!!document.querySelector('.initializer-child button:not(:disabled)'),'recursive initializer default not ready');
  const openInitial=async(label:string)=>{const match=[...document.querySelectorAll<HTMLButtonElement>('.initializer-child button')].find(el=>el.querySelector('.ant-typography')?.textContent===label);assert(match,'initializer child '+label+' missing');match.click();await frame();};
  await openInitial('second');await openInitial('third');await openInitial('enabled');
  const temporaryBoolean=find('.typed-initializer [role="switch"]');
  await until(()=>!temporaryBoolean.closest('.ant-modal')?.getAnimations().some(animation=>animation.playState==='running'),'initializer opening animation did not finish');
  assert(booleanGeometry(temporaryBoolean)===geometry,'temporary / nested / direct bool appearance differs: '+booleanGeometry(temporaryBoolean)+' != '+geometry);
  assert(JSON.stringify(crumbs())===JSON.stringify(['初期値','second','third','enabled']),'initializer intermediate path missing');
  button('キャンセル').click();await desktop.selectTarget(SOURCE);await settled();
  checks.push('temporary-initializer-uses-shared-scalar-and-breadcrumbs');

  const drag=async(source:string,destination:HTMLElement,releaseBetweenFrames=false)=>{
   const item=find(`#explorer [data-path="${source}"]`),r=item.getBoundingClientRect(),d=destination.getBoundingClientRect(),a={x:r.left+r.width/2,y:r.top+r.height/2},b={x:d.left+d.width/2,y:d.top+d.height/2};
   const pointer=(where:EventTarget,kind:string,at:{x:number;y:number})=>where.dispatchEvent(new PointerEvent(kind,{bubbles:true,button:0,buttons:kind==='pointerup'?0:1,pointerId:1,pointerType:'mouse',isPrimary:true,clientX:at.x,clientY:at.y}));
   pointer(item,'pointerdown',a);await frame();pointer(document,'pointermove',b);
   await until(()=>!!document.querySelector('.source-drag-preview'),'file drag did not lift');
   assert(getComputedStyle(find('.source-drag-preview')).visibility==='visible','file preview invisible');
   if(releaseBetweenFrames)pointer(document,'pointerup',b);else{await frame();pointer(document,'pointerup',b);}
  };
  await drag(SOURCE,find('#explorer [data-path="folder:sources/moved"]'),true);
  await until(()=>desktop.surface.inventory!.sources.some(s=>s.path==='sources/moved/interaction-data.yaml'),'direct folder drop did not move file');
  assert(![...document.querySelectorAll<HTMLElement>('[role=dialog]')].some(e=>e.textContent?.includes('名前変更・移動')),'ordinary drop opened a Move dialog');
  const area=find('.explorer-viewport'),bounds=area.getBoundingClientRect();
  const moved=find('#explorer [data-path="sources/moved/interaction-data.yaml"]'),r=moved.getBoundingClientRect();
  moved.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,pointerId:1,isPrimary:true,clientX:r.left+20,clientY:r.top+10}));
  document.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,buttons:1,pointerId:1,isPrimary:true,clientX:bounds.left+40,clientY:bounds.bottom-10}));await frame();
  document.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,button:0,pointerId:1,isPrimary:true,clientX:bounds.left+40,clientY:bounds.bottom-10}));
  await until(()=>desktop.surface.inventory!.sources.some(s=>s.path===SOURCE),'root whitespace drop did not move file back');await settled();
  checks.push('file-pointer-threshold-folder-and-root-direct-move');

  find(`#explorer [data-path="${SOURCE}"]`).click();await settled();const tree=find('#explorer [role="tree"]');tree.focus();key(tree,'Delete');
  await until(()=>!!desktop.surface.choice,'Explorer Delete unavailable');desktop.surface.choice!.finish('Delete');
  await until(()=>!desktop.surface.inventory!.sources.some(s=>s.path===SOURCE)&&!!document.querySelector<HTMLButtonElement>('.source-trash-feedback button:not(:disabled)'),'deleted source lacks Undo');find('.source-trash-feedback button').click();
  await until(()=>desktop.surface.inventory!.sources.some(s=>s.path===SOURCE)&&desktop.surface.target===SOURCE&&!desktop.surface.pending,'source Undo failed');
  checks.push('explorer-delete-and-persisted-restore-wiring');
  assert(!desktop.surface.status.dirty.length,'interaction left unexpected dirty files');
  await invoke('evidence_write',{report:{kind:'interaction',checks,startup,dirty:desktop.surface.status.dirty,visibility:document.visibilityState,focused:document.hasFocus()}});
 }catch(error){await invoke('evidence_write',{report:{kind:'interaction',error:String(error),surfaceError:desktop.surface.error,checks,startup,status:desktop.surface.status,target:desktop.surface.target,active:document.activeElement?.outerHTML.slice(0,1200),body:document.querySelector('.near-value-popover,.ant-drawer-content')?.outerHTML.slice(0,12000)}});}
}
