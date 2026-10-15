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
async function readyValue(){await until(()=>!!document.querySelector('.near-value-body>[aria-busy="false"],.ant-drawer-body>[aria-busy="false"]'),'value control did not become interactive');await frame();}
async function undo(){await desktop.undo(false);await settled();}
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
  await until(()=>!!document.querySelector('.null-bool-editor'),'nullable bool choices unavailable');
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
 }catch(error){await invoke('evidence_write',{report:{kind:'interaction',error:String(error),surfaceError:desktop.surface.error,checks,startup,status:desktop.surface.status,target:desktop.surface.target,active:document.activeElement?.outerHTML.slice(0,1200),body:document.querySelector('.near-value-popover,.ant-drawer-content')?.outerHTML.slice(0,2000)}});}
}
