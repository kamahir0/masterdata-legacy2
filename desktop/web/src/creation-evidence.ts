import {invoke} from "@tauri-apps/api/core";
import {desktop} from "./workspace";

const SOURCE="sources/catalog-data.yaml";
const frame=()=>new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
async function until(test:()=>boolean,message:string) {const deadline=performance.now()+8000;while(!test()){if(performance.now()>deadline)throw new Error(message);await frame();}}
function assert(test:unknown,message:string):asserts test {if(!test)throw new Error(message);}
function key(e:HTMLElement,key:string,extra:KeyboardEventInit={}) {e.dispatchEvent(new KeyboardEvent("keydown",{key,bubbles:true,...extra}));}
function input(label:string) {const e=document.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);assert(e,`missing input: ${label}`);return e;}
function text(e:HTMLInputElement,value:string) {Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(e,value);e.dispatchEvent(new Event("input",{bubbles:true}));}
function findButton(label:string){return [...document.querySelectorAll<HTMLButtonElement>("button")].find(e=>e.getAttribute("aria-label")===label||e.textContent===label);}
function button(label:string){const e=findButton(label);assert(e,`missing action: ${label}`);return e;}
async function begin(category:string,filename:string) {
  await until(()=>!button("ソースを作成").disabled,"New remained unavailable");
  if(category==="フォルダー")button("フォルダーを作成").click();
  else {
  button("ソースを作成").click();
  await until(()=>[...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].some(e=>e.textContent===category),"New menu missing");
  [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(e=>e.textContent===category)!.click();
  }
  await until(()=>!!document.querySelector("input[aria-label=\"新しいソースのファイル名\"]"),"temporary Explorer node missing");
  const file=input("新しいソースのファイル名");
  await until(()=>document.activeElement===file,"creation filename was not focused once");
  text(file,filename);
  await until(()=>file.getAttribute("value")===filename,"filename input was not published");
  await ready();
}
async function ready(){await until(()=>!document.querySelector('.creation-inline .ant-spin')&&!document.querySelector('.creation-inline .ant-alert'),"creation preflight did not become valid");}
async function focusedSource(label:string) {
  await until(()=>{
    const tree=document.activeElement;
    const target=tree?.getAttribute('aria-activedescendant');
    return tree?.getAttribute('role')==='tree'&&!!target&&!!document.getElementById(target)?.textContent?.includes(label.replace(/\.ya?ml$/i,''));
  },`created ${label} was not the active keyboard target`);
}
async function choose(label:string,value:string) {
  const combo=input(label);combo.focus();key(combo,"ArrowDown",{keyCode:40,which:40});
  await until(()=>[...document.querySelectorAll<HTMLElement>('.ant-select-item-option-content')].some(e=>e.textContent===value),"choice missing");
  const option=[...document.querySelectorAll<HTMLElement>('.ant-select-item-option-content')].find(e=>e.textContent===value)!;option.click();
}
export async function run({startup}:{startup:Record<string,unknown>}) {
  const checks:string[]=[],created:string[]=[];
  try {
    await until(()=>!!desktop.surface.inventory,"Project not open");
    await desktop.selectTarget(SOURCE,"creation-setup",false);
    const p=desktop.surface.projection!;
    await desktop.rpc({kind:"editText",source:SOURCE,revision:p.revision,generation:p.generation,row:p.rows[0].id,field:"name",text:"Existing draft"});
    await desktop.selectTarget(SOURCE,"after-operation");
    const gridTop=desktop.viewport!.getBoundingClientRect().top;
    await begin("テーブル","cancelled.yaml");
    const file=input("新しいソースのファイル名");
    key(file,"Enter",{isComposing:true});await frame();
    assert(!!document.querySelector('.creation-inline'),"composition Enter created an artifact");
    key(file,"Escape");await until(()=>!document.querySelector('.creation-inline'),"Escape did not cancel");
    assert(desktop.surface.status.dirty.includes(SOURCE),"cancel discarded existing draft");
    assert(!desktop.surface.inventory!.sources.some(s=>s.path==='sources/cancelled.yaml'),"cancel created source");
    checks.push("inline-cancel-composition");
    await begin("テーブル","outside-created.yaml");
    text(input("新しいソースのファイル名"),"");
    const outside=document.querySelector<HTMLInputElement>('#search')!;outside.focus();outside.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0}));
    await until(()=>!document.querySelector('.creation-inline'),"empty outside input was not cancelled");
    assert(!desktop.surface.inventory!.sources.some(source=>source.path==='sources/outside-created.yaml'),"empty outside input created a source");
    await begin("テーブル","outside-created.yaml");
    outside.focus();outside.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0}));
    await until(()=>desktop.surface.inventory!.sources.some(source=>source.path==='sources/outside-created.yaml')&&!document.querySelector('.creation-inline'),"filled outside input was not created");
    created.push('sources/outside-created.yaml');
    await until(()=>!desktop.surface.pending&&document.activeElement===outside,"outside creation stole the new focus");
    assert(desktop.surface.target===SOURCE,"outside creation changed the latest selection");
    checks.push("outside-empty-cancel-filled-create-focus");
    await begin("テーブル","mode-switch.yaml");
    {
      const previewRpc=desktop.rpc.bind(desktop);let received=false,createCount=0,release=()=>{};
      const previewGate=new Promise<void>(resolve=>{release=resolve;});
      desktop.rpc=async function<T>(intent:Record<string,unknown>){if(intent.kind==="create")createCount++;const reply=await previewRpc<T>(intent);if(intent.kind==="creationPreview"){received=true;await previewGate;}return reply;};
      try {
        text(input("新しいソースのファイル名"),"mode-switch-final.yaml");await until(()=>received,"latest preview did not reach its response gate");
        outside.focus();outside.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0}));button("作成内容の詳細").click();
        await until(()=>!!document.querySelector('[role="dialog"] input[aria-label="ソースの識別子"]'),"advanced form did not open during validation");
        document.querySelector<HTMLButtonElement>('.ant-modal-close')!.click();
        await until(()=>!document.querySelector<HTMLElement>('.creation-form')?.getClientRects().length,"advanced form did not return to inline input");
        release();await ready();await frame();await frame();
        assert(createCount===0&&!!document.querySelector('.creation-inline')&&!desktop.surface.inventory!.sources.some(source=>source.path==='sources/mode-switch-final.yaml'),"old inline finish survived the Advanced form mode change");
        key(input("新しいソースのファイル名"),"Escape");await until(()=>!document.querySelector('.creation-inline'),"mode-switched input Cancel failed");
      }finally{release();desktop.rpc=previewRpc;}
    }
    checks.push("pending-inline-finish-respects-advanced-form-mode");
    await begin("テーブル","lost-create.yaml");
    const actualRpc=desktop.rpc.bind(desktop);let createCount=0;
    desktop.rpc=async function<T>(intent:Record<string,unknown>){const reply=await actualRpc<T>(intent);if(intent.kind==="create"){createCount++;throw new Error("lost creation reply");}return reply;};
    try {
      key(input("新しいソースのファイル名"),"Enter");
      await until(()=>!!findButton("保存先を再確認"),"lost reply did not expose read-only Recheck");
      outside.focus();outside.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0}));await frame();await frame();
      assert(createCount===1&&input("新しいソースのファイル名").disabled,"outside click retried an uncertain write");
      button("保存先を再確認").click();await until(()=>desktop.surface.target==='sources/lost-create.yaml'&&!desktop.surface.pending&&!document.querySelector('.creation-inline'),"Recheck did not recover the successful native Create");
      assert(createCount===1,"Recheck performed a second write");created.push('sources/lost-create.yaml');
    } finally {desktop.rpc=actualRpc;}
    checks.push("lost-create-reply-outside-no-retry-explicit-recheck");



    await begin("テーブル","fresh-table.yaml");key(input("新しいソースのファイル名"),"Enter");
    await until(()=>desktop.surface.target==='sources/fresh-table.yaml'&&!desktop.surface.pending&&!!desktop.surface.projection,"created Table not selected");
    created.push('sources/fresh-table.yaml');
    await focusedSource('fresh-table.yaml');
    assert(desktop.surface.projection!.totalRows===0&&desktop.surface.projection!.canAdd,"new inline Table did not start empty");
    assert(desktop.surface.status.dirty.includes(SOURCE),"creation saved or discarded other draft");
    assert(desktop.viewport!.getBoundingClientRect().top===gridTop,"creation moved working grid");
    checks.push("inline-table-exclusive-create");

    await begin("フォルダー","catalog-new");key(input("新しいソースのファイル名"),"Enter");
    await until(()=>desktop.surface.inventory!.folders.includes('sources/catalog-new')&&!document.querySelector('.creation-inline'),"folder not published");
    assert(document.querySelector('[data-path="folder:sources/catalog-new"]'),"empty folder missing from Explorer");
    await focusedSource('catalog-new');
    checks.push("empty-folder-selection");
    await begin("データ","storage-name.yml");
    assert(input("新しいソースのファイル名").title.includes('fresh-table'),"Data did not expose explicit Table");
    key(input("新しいソースのファイル名"),"Enter");
    await until(()=>desktop.surface.target==='sources/catalog-new/storage-name.yml'&&!desktop.surface.pending&&!!desktop.surface.projection,"created Data not routed");
    created.push('sources/catalog-new/storage-name.yml');
    await focusedSource('storage-name.yml');
    assert(desktop.surface.projection!.table.name==='fresh-table'&&desktop.surface.projection!.totalRows===0,"filename changed Table identity or implicit rows appeared");
    checks.push("explicit-data-binding-yml");

    await begin("Enum","huge-token.yaml");button("作成内容の詳細").click();
    await until(()=>!!document.querySelector("[role=\"dialog\"] input[aria-label=\"ソースの識別子\"]"),"Advanced dialog missing");
    assert(!document.querySelector('input[aria-label="作成先のソースルート"]')&&!!document.querySelector('input[aria-label="作成先のフォルダー"]'),"creation kept a redundant root selector");
    text(input("ソースの識別子"),"HugeToken");
    await choose("基になる型","ulong");
    text(input("メンバー 1 名前"),"Maximum");text(input("メンバー 1 値"),"18446744073709551615");
    await until(()=>!button("作成").disabled,"lossless Advanced declaration invalid");button("作成").click();
    await until(()=>desktop.surface.inventory!.types.includes('HugeToken')&&!document.querySelector('.creation-inline'),"Advanced Enum not published");
    created.push('sources/catalog-new/huge-token.yaml');
    await focusedSource('huge-token.yaml');
    checks.push("advanced-lossless-member");

    await desktop.selectTarget(SOURCE,"creation-return");
    assert(desktop.surface.projection!.rows[0].cells.find((_c,i)=>desktop.surface.projection!.columns[i].field.name==='name')!.display==='Existing draft',"creation lost source-local draft");
    assert(desktop.surface.projection!.canUndo,"creation lost source-local history");
    checks.push("dirty-revisit-after-creation");
    assert((startup.browserErrors as string[]).length===0,"browser errors");
    await invoke("evidence_write",{report:{kind:"creation",checks,created,dirty:desktop.surface.status.dirty,visibility:document.visibilityState,focused:document.hasFocus(),startup}});
  }catch(error){await invoke("evidence_write",{report:{kind:"creation",error:String(error),checks,created,startup,status:desktop.surface.status,active:document.activeElement?.outerHTML.slice(0,2000),creation:document.querySelector('.creation-inline')?.outerHTML,dialog:document.querySelector('[role="dialog"]')?.outerHTML}});}
}
