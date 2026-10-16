import {desktop} from './workspace';

const frame=()=>new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
async function until(test:()=>boolean,message:string){const deadline=performance.now()+8000;while(!test()){if(performance.now()>deadline)throw new Error(message);await frame();}}
const active=()=>document.querySelector('#explorer .ant-tree-treenode-active [data-path]')?.getAttribute('data-path');
const key=(element:HTMLElement,value:string)=>element.dispatchEvent(new KeyboardEvent('keydown',{key:value,keyCode:value==='Home'?36:value==='ArrowDown'?40:38,bubbles:true}));
function foreground(){if(document.visibilityState!=='visible'||!document.hasFocus())throw new Error('Explorer measurement lost native foreground');}

// Use real native WebView rendering, with many FILES inside one folder. A tree
// of empty sibling folders cannot detect expensive expansion or row mounting.
export async function measureExplorerFolders(){
 const samples:{count:number;expanded:boolean;dispatchMs:number;commitMs:number;paintOpportunityMs:number;acceptedMs:number;mountedRows:number;peakRows:number;motionSubtrees:number}[]=[],rpc:Record<string,number>={};
 const original=desktop.rpc.bind(desktop),target=desktop.surface.target;
 const tree=document.querySelector<HTMLElement>('#explorer [role="tree"]')!;
 desktop.rpc=async function<T>(intent:Record<string,unknown>){const name=String(intent.kind);rpc[name]=(rpc[name]??0)+1;return original<T>(intent);};
 try{
  tree.focus();key(tree,'Home');await frame();await frame();
  for(const count of [20,200,2000]){
   const path=`folder:sources/b-dense-${String(count).padStart(4,'0')}`;
   const source=()=>document.querySelector<HTMLElement>(`#explorer [data-path="${path}"]`)!;
   for(let cycle=0;cycle<100;cycle++)for(const expanded of [true,false]){
    if(!source())throw new Error('dense folder not visible: '+path);
    let committed=0,peakRows=0,motionSubtrees=0;
    const observer=new MutationObserver(()=>{
     peakRows=Math.max(peakRows,tree.querySelectorAll('[role="treeitem"]').length);
     motionSubtrees=Math.max(motionSubtrees,tree.querySelectorAll('.ant-tree-treenode-motion').length);
     if(source()?.closest('[role="treeitem"]')?.getAttribute('aria-expanded')===String(expanded)&&!committed)committed=performance.now();
    });
    observer.observe(tree,{subtree:true,attributes:true,childList:true});
    foreground();const start=performance.now();source().click();const dispatched=performance.now();
    await until(()=>!!committed,'folder expansion did not commit');
    await frame();const paint=performance.now();foreground();
    key(tree,'ArrowDown');await until(()=>!!active()&&active()!==path,'tree keyboard not accepted after folder toggle');
    const accepted=performance.now();foreground();key(tree,'ArrowUp');await until(()=>active()===path,'tree focus did not return to folder');
    observer.disconnect();
    samples.push({count,expanded,dispatchMs:dispatched-start,commitMs:committed-start,paintOpportunityMs:paint-start,acceptedMs:accepted-start,mountedRows:tree.querySelectorAll('[role="treeitem"]').length,peakRows,motionSubtrees});
    if(desktop.surface.target!==target)throw new Error('folder performance probe changed editor');
    await frame();
   }
  }
  if(Object.keys(rpc).length)throw new Error('folder toggle issued domain RPC: '+JSON.stringify(rpc));
  return {clock:'performance.now; DOM handler / MutationObserver commit / rAF opportunity / keyboard acceptance; rAF is not GPU presentation',viewportRows:Math.ceil(document.querySelector<HTMLElement>('#explorer .explorer-viewport')!.clientHeight/22),samples,rpc};
 }finally{desktop.rpc=original;}
}
