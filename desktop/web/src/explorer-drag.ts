import type {PointerEvent as ReactPointerEvent} from 'react';
import {desktop} from './workspace';
import {entryPath,parentPath} from './explorer-model';

// WebKit's native HTML drag can swallow pointer movement in the virtual tree.
// A file move uses the same explicit threshold/capture/Escape model as records;
// hit testing always resolves the row's folder, never a sibling insertion gap.
export function explorerDrag(event:ReactPointerEvent<HTMLElement>,root:string,canMove:(path:string)=>boolean,drop:(path:string,folder:string)=>void,suppressClick:()=>void):(()=>void)|null {
 if(event.button!==0||!event.isPrimary||!(event.target instanceof Element)||event.target.closest('button,input,textarea,[role=combobox]'))return null;
 const area=event.currentTarget,row=event.target.closest<HTMLElement>('.ant-tree-treenode'),source=row?.querySelector<HTMLElement>('[data-path]')?.dataset.path;
 if(!row||!source||source.startsWith('folder:')||!canMove(source))return null;
 const epoch=desktop.surface.status.epoch,pointer=event.pointerId,first={x:event.clientX,y:event.clientY};
 let point=first,frame=0,lifted=false,alive=true,target:HTMLElement|null=null,folder:string|null=null,ghost:HTMLDivElement|null=null;
 const finish=()=>{
  if(!alive)return;alive=false;cancelAnimationFrame(frame);ghost?.remove();target?.classList.remove('source-drop-target');row.classList.remove('source-drag-origin');area.classList.remove('source-drop-root');
  document.removeEventListener('pointermove',move,true);document.removeEventListener('pointerup',up,true);document.removeEventListener('pointercancel',cancel,true);document.removeEventListener('keydown',key,true);window.removeEventListener('blur',finish);area.removeEventListener('lostpointercapture',cancel);
  if(area.hasPointerCapture(pointer))area.releasePointerCapture(pointer);
 };
 const lift=()=>{
  if(lifted)return;lifted=true;ghost=document.createElement('div');ghost.className='source-drag-preview';ghost.inert=true;ghost.setAttribute('aria-hidden','true');document.body.append(ghost);row.classList.add('source-drag-origin');
  try{area.setPointerCapture(pointer);}catch{/* Synthetic evidence has no OS pointer capture. */}
 };
 const landing=()=>{
  target?.classList.remove('source-drop-target');area.classList.remove('source-drop-root');folder=null;target=null;
  const hit=document.elementFromPoint(point.x,point.y);
  if(hit&&area.contains(hit)){
   const hitRow=hit.closest<HTMLElement>('.ant-tree-treenode'),key=hitRow?.querySelector<HTMLElement>('[data-path]')?.dataset.path;
   const destination=key?(key.startsWith('folder:')?entryPath(key):parentPath(key)):root;
   if(key!=='creation:temporary'&&key!==source&&destination!==parentPath(source)){
    folder=destination;target=hitRow??area;if(hitRow)hitRow.classList.add('source-drop-target');else area.classList.add('source-drop-root');
   }
  }
 };
 const move=(e:PointerEvent)=>{if(e.pointerId===pointer){point={x:e.clientX,y:e.clientY};if(!lifted&&Math.hypot(point.x-first.x,point.y-first.y)>=5)lift();if(lifted)e.preventDefault();}};
 const up=(e:PointerEvent)=>{if(e.pointerId!==pointer)return;point={x:e.clientX,y:e.clientY};landing();const destination=folder,apply=lifted&&destination&&epoch===desktop.surface.status.epoch&&canMove(source);if(lifted){e.preventDefault();e.stopImmediatePropagation();suppressClick();}finish();if(apply)drop(source,destination!);};
 const cancel=(e:PointerEvent)=>{if(e.pointerId===pointer)finish();};
 const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();suppressClick();finish();}};
 const paint=()=>{
  if(!alive)return;if(epoch!==desktop.surface.status.epoch||desktop.mutating||!canMove(source)){finish();return;}
  if(!lifted&&Math.hypot(point.x-first.x,point.y-first.y)>=5)lift();
  if(lifted){
   const holder=area.querySelector<HTMLElement>('.ant-tree-list-holder'),bounds=area.getBoundingClientRect();
   if(holder){if(point.y<bounds.top+24)holder.scrollTop-=12;else if(point.y>bounds.bottom-24)holder.scrollTop+=12;}
   landing();
   ghost!.textContent=`${source.split('/').at(-1)} → ${folder??'移動先を選択'}`;ghost!.style.transform=`translate(${point.x+12}px,${point.y+12}px)`;
   ghost!.classList.toggle('invalid',!folder);
  }
  frame=requestAnimationFrame(paint);
 };
 document.addEventListener('pointermove',move,{capture:true,passive:false});document.addEventListener('pointerup',up,true);document.addEventListener('pointercancel',cancel,true);document.addEventListener('keydown',key,true);window.addEventListener('blur',finish);area.addEventListener('lostpointercapture',cancel);
 frame=requestAnimationFrame(paint);return finish;
}
