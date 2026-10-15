import {invoke} from "@tauri-apps/api/core";
import {desktop} from "./workspace";
import type {TypeOperation, TypeProjection} from "./types";
const frame=()=>new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
async function until(test:()=>boolean,message:string){const deadline=performance.now()+10000;while(!test()){if(performance.now()>deadline)throw new Error(message);await frame();}}
function assert(test:unknown,message:string):asserts test{if(!test)throw new Error(message);}
function visible(element:Element){return !!element.getClientRects().length&&getComputedStyle(element).visibility!=='hidden'&&!element.closest('.ant-zoom-leave,.ant-fade-leave');}
function findButton(label:string){const dialog=[...document.querySelectorAll<HTMLElement>('[role="dialog"]')].find(visible);return [...(dialog??document).querySelectorAll<HTMLButtonElement>('button')].find(b=>visible(b)&&(b.getAttribute('aria-label')===label||b.textContent===label));}
function button(label:string){const element=findButton(label);assert(element,`missing button ${label}`);return element;}
function input(label:string){const element=[...document.querySelectorAll<HTMLInputElement>(`input[aria-label="${label}"]`)].find(visible);assert(element,`missing input ${label}`);return element;}
function text(label:string,value:string){const element=input(label);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(element,value);element.dispatchEvent(new Event('input',{bubbles:true}));}
async function choice(label:string,value:string){const element=input(label);element.focus();element.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',keyCode:40,which:40,bubbles:true}));await until(()=>[...document.querySelectorAll<HTMLElement>('.ant-select-item-option-content')].some(el=>visible(el)&&el.textContent===value),`missing ${value} option`);[...document.querySelectorAll<HTMLElement>('.ant-select-item-option-content')].find(el=>visible(el)&&el.textContent===value)!.click();}
async function menu(label:string,action:string){await until(()=>!!findButton(label)&&!findButton(label)!.disabled,`menu ${label} did not become ready`);button(label).click();await until(()=>[...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].some(el=>visible(el)&&el.textContent===action),`missing ${action}`);[...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(el=>visible(el)&&el.textContent===action)!.click();}
async function selected(source:string):Promise<TypeProjection>{await desktop.selectTarget(source,"type-workflow",false);const p=desktop.surface.typeProjection;assert(p?.clicked===source&&!desktop.surface.pending,"Type selection did not resolve");document.querySelector<HTMLElement>("[aria-label=\"型エディター\"]")!.focus();return p;}
async function quickAdd(){await until(()=>!button("メンバーを追加").disabled&&!button("メンバーを追加").classList.contains('ant-btn-loading'),"member Add did not become ready");button("メンバーを追加").click();await until(()=>!!document.querySelector('input[aria-label="変更後の名前"]')&&document.activeElement?.getAttribute('aria-label')==="変更後の名前","default member Add did not focus the new name");}
async function plan(){const confirm=findButton("変更を確認")??findButton("確定");assert(confirm,"input confirmation missing");confirm.click();await until(()=>!!document.querySelector("[aria-label=\"型の変更計画\"]"),"Type Plan missing");await until(()=>document.activeElement?.getAttribute('aria-label')==="型の変更計画","Plan lost keyboard focus");}
async function applied(test:()=>boolean,destructive=false){button("適用").click();if(destructive){await until(()=>!!desktop.surface.choice,"destructive authorization missing");await until(()=>[...document.querySelectorAll<HTMLButtonElement>('button')].some(el=>visible(el)&&el.textContent==="削除"),"Delete confirmation not rendered");button("削除").click();}await until(()=>test()&&!document.querySelector("[aria-label=\"型の変更計画\"]"),"Type Apply did not update the current declaration");await until(()=>![...document.querySelectorAll('[role="dialog"]')].some(visible),"Type Apply did not close its review surface");}
async function compare(){button("比較").click();await until(()=>!!document.querySelector("input[aria-label=\"比較するソース\"]"),"Type Compare missing");assert(desktop.surface.comparison?.migration,"Compare is not tied to captured Plan");const dialog=document.querySelector("input[aria-label=\"比較するソース\"]")!.closest('[role="dialog"]')!;const close=[...dialog.querySelectorAll<HTMLButtonElement>('button')].find(button=>button.textContent==="閉じる");assert(close,"Compare Close action missing");close.click();await until(()=>!desktop.surface.comparison&&!!document.querySelector("[aria-label=\"型の変更計画\"]")&&!!findButton("適用"),"Compare did not render Type Plan の操作");}
export async function run({startup}:{startup:Record<string,unknown>}) {
  const checks:string[]=[];
  try {
    await until(()=>!!desktop.surface.inventory,"Project not open");
    for(const [source,category] of [["sources/item-id.yaml","valueObject"],["sources/rarity.yaml","enum"],["sources/item-tags.yaml","enum"],["sources/reward.yaml","custom"]]){
      const p=await selected(source);assert(p.declaration.category===category,"wrong category");
      for(const count of ['projectDiscovery','projectEnumeration','projectYamlParse','projectValidation'] as const)assert(p.measurement.work[count]===0,"Type warm project-wide work");
    }
    checks.push('resolved-type-selection-warm-zero');
    const custom=await selected('sources/reward.yaml');
    for(const which of [0,13]) {
      const trigger=button("itemId フィールドの操作");trigger.focus();trigger.click();
      await until(()=>[...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].some(el=>visible(el)&&el.textContent==="名前を変更…"),"keyboard menu missing");
      const rename=[...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(el=>visible(el)&&el.textContent==="名前を変更…")!;rename.focus();
      const enter=new KeyboardEvent('keydown',{key:'Enter',keyCode:which,which,bubbles:true,cancelable:true});rename.dispatchEvent(enter);
      assert(enter.defaultPrevented,"handled Menu Enter left native activation pending");
      await until(()=>!!document.querySelector("input[aria-label=\"変更後の名前\"]"),"Enter did not activate Rename");
      await until(()=>document.activeElement?.getAttribute('aria-label')==="変更後の名前","keyboard operation did not focus input");
      input("変更後の名前").dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',keyCode:27,which:27,bubbles:true}));
      await until(()=>document.activeElement?.getAttribute('aria-label')==="itemId フィールドの操作","keyboard cancel did not restore origin");
    }
    assert(desktop.surface.typeProjection?.identity===custom.identity,"opening and cancelling Type operation changed source");
    checks.push('type-keyboard-menu-cancel-focus');
    await desktop.selectTarget('sources/independent.yaml','type-unrelated-draft',false);const unrelated=desktop.surface.projection!;await desktop.rpc({kind:'editText',epoch:unrelated.sessionEpoch,source:unrelated.source,revision:unrelated.revision,generation:unrelated.generation,row:unrelated.rows[0].id,field:'id',text:'2'});await until(()=>desktop.surface.status.dirty.includes('sources/independent.yaml'),"unrelated dirty draft not observed");
    await selected('sources/item-id.yaml');button("変換を編集").click();await until(()=>[...document.querySelectorAll<HTMLElement>('.ant-checkbox-wrapper')].some(el=>visible(el)&&el.textContent==="基になる型から暗黙に変換"),"conversion input missing");
    [...document.querySelectorAll<HTMLElement>('.ant-checkbox-wrapper')].find(el=>visible(el)&&el.textContent==="基になる型から暗黙に変換")!.click();
    await plan();await compare();await applied(()=>desktop.surface.typeProjection?.declaration.category==='valueObject'&&desktop.surface.typeProjection.declaration.from_implicit);
    checks.push('value-object-plan-diff-apply');
    await selected('sources/item-tags.yaml');assert(!document.querySelector("[aria-label=\"None メンバーの操作\"]"),"None offers Rename or Drop");assert(document.querySelector('[aria-label="型エディター"]')?.textContent?.includes('Bit 63 · 1 << 63'),"ulong Flags bit hint missing");
    await selected('sources/long-features.yaml');assert(document.querySelector('[aria-label="型エディター"]')?.textContent?.includes('-9223372036854775808')&&document.querySelector('[aria-label="型エディター"]')?.textContent?.includes('Bit 63 · 1 << 63'),"signed Flags bit hint lost width or value");checks.push('flags-none-protected');
    const exhausted=await selected('sources/full-flags.yaml');button('メンバーを追加').click();
    await until(()=>!!document.querySelector('.type-body .ant-alert')?.textContent?.includes('未使用のBitがない'),'exhausted Flags did not show an actionable reason');
    assert(desktop.surface.typeProjection?.identity===exhausted.identity&&!document.querySelector('input[aria-label="変更後の名前"]')&&![...document.querySelectorAll('[role="dialog"]')].some(visible),'exhausted Flags changed source or opened a misleading input');
    checks.push('exhausted-flags-reason-and-no-write');
    await selected('sources/rarity.yaml');await quickAdd();
    await until(()=>!!document.querySelector('input[aria-label="変更後の名前"]')&&desktop.surface.typeProjection?.declaration.category==='enum'&&desktop.surface.typeProjection.declaration.members.some(([name])=>name==='NewMember'),"one-click Enum Add did not commit and edit the new member");
    assert(![...document.querySelectorAll('[role="dialog"]')].some(visible),"default Add exposed a review dialog");
    const generated=desktop.surface.typeProjection!.declaration;
    assert(generated.category==='enum',"Enum missing");const numeric=generated.members.find(([name])=>name==='NewMember')![1];
    await until(()=>document.activeElement===input("変更後の名前"),"generated member name did not receive focus");
    text("変更後の名前","QuickChoice");document.querySelector<HTMLElement>('.type-body')!.focus();
    await until(()=>desktop.surface.typeProjection?.declaration.category==='enum'&&desktop.surface.typeProjection.declaration.members.some(([name,value])=>name==='QuickChoice'&&value===numeric)&&![...document.querySelectorAll('input[aria-label="変更後の名前"]')].some(visible),"outside Rename did not commit exact default value");
    await quickAdd();await until(()=>!!document.querySelector('input[aria-label="変更後の名前"]'),"second Add missing");
    await until(()=>document.activeElement===input("変更後の名前"),"second generated name did not receive focus");
    text("変更後の名前","");document.querySelector<HTMLElement>('.type-body')!.focus();
    await until(()=>!document.querySelector('input[aria-label="変更後の名前"]'),"empty generated name was not cancelled");
    assert(desktop.surface.typeProjection?.declaration.category==='enum'&&desktop.surface.typeProjection.declaration.members.some(([name])=>name==='NewMember'),"empty Rename removed the added member");
    await selected('sources/item-tags.yaml');await quickAdd();await until(()=>!!document.querySelector('input[aria-label="変更後の名前"]'),"default Flags Add missing");
    assert(desktop.surface.typeProjection?.declaration.category==='enum'&&desktop.surface.typeProjection.declaration.members.some(([name,value])=>name==='NewMember'&&value==='4'),"default Flags Add lost unused exact bit");
    input("変更後の名前").dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await until(()=>!document.querySelector('input[aria-label="変更後の名前"]'),"Escape kept generated-name input");
    await quickAdd();await until(()=>!!document.querySelector('input[aria-label="変更後の名前"]')&&document.activeElement===input("変更後の名前"),"navigation Rename input missing");
    text("変更後の名前","NavigationChoice");
    await desktop.selectTarget('sources/rarity.yaml','type-outside-navigation');
    assert(desktop.surface.target==='sources/rarity.yaml'&&!desktop.surface.pending,"Rename completion replaced the latest navigation");
    const renamedFlags=await selected('sources/item-tags.yaml');
    assert(renamedFlags.declaration.category==='enum'&&renamedFlags.declaration.members.some(([name])=>name==='NavigationChoice'),"navigation lost the generated-member Rename");
    await selected('sources/rarity.yaml');button("名前を変更: Rare").click();await until(()=>document.activeElement?.getAttribute('aria-label')==="変更後の名前","affected Rename was not focused");text("変更後の名前","ReviewChoice");
    await desktop.selectTarget('sources/catalog-data.yaml','type-affected-outside-navigation');
    await until(()=>!!document.querySelector('[aria-label="型の変更計画"]'),"affected outside Rename skipped explicit review");
    assert(desktop.snapshot().target==='sources/catalog-data.yaml'&&!desktop.surface.pending&&document.querySelector('[role="dialog"]')?.textContent?.includes('Rarity'),"captured Rename Plan lost its target or replaced newer navigation");
    button("キャンセル").click();await until(()=>!document.querySelector('[aria-label="型の変更計画"]'),"outside Rename Plan Cancel failed");
    await selected('sources/item-tags.yaml');
    checks.push('one-click-enum-flags-add-outside-name-and-cancel');
    const lateTarget=desktop.surface.typeProjection!;
    const lateCommand=(await desktop.rpc<TypeOperation>({kind:'defaultEnumMember',epoch:lateTarget.sessionEpoch,source:lateTarget.source,identity:lateTarget.identity})).data;
    assert(lateCommand.operation==='addEnumMember','default Add command missing');
    const actualRpc=desktop.rpc.bind(desktop);let received=false,release=()=>{};
    const responseGate=new Promise<void>(resolve=>{release=resolve;});
    desktop.rpc=async function<T>(intent:Record<string,unknown>){const reply=await actualRpc<T>(intent);if(intent.kind==='migrationApply'){received=true;await responseGate;}return reply;};
    try {
      button('メンバーを追加').click();await until(()=>received,'default Add did not complete its native write');
      const outside=document.querySelector<HTMLElement>('.type-body')!;
      outside.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0}));outside.focus();release();
      await until(()=>desktop.surface.typeProjection?.declaration.category==='enum'&&desktop.surface.typeProjection.declaration.members.some(([name,value])=>name===lateCommand.name&&value===lateCommand.value)&&!button('メンバーを追加').disabled&&!button('メンバーを追加').classList.contains('ant-btn-loading'),'late Add left a blocked input state');
      assert(document.activeElement===outside&&!document.querySelector('input[aria-label="変更後の名前"]'),'late Add stole newer focus');
    } finally {release();desktop.rpc=actualRpc;}
    checks.push('one-click-add-late-reply-preserves-newer-focus');
    // Restore only the unused members this scratch workflow created. The
    // runner still checks every unrelated saved byte against the original input.
    for(const [source,names] of [['sources/rarity.yaml',['QuickChoice','NewMember']],['sources/item-tags.yaml',['NewMember','NavigationChoice',lateCommand.name]]] as const){
      for(const name of names){await selected(source);await menu(`${name} メンバーの操作`,"削除…");await until(()=>!!findButton("変更を確認"),"generated-member cleanup input missing");await plan();await applied(()=>desktop.surface.typeProjection?.declaration.category==='enum'&&!desktop.surface.typeProjection.declaration.members.some(([member])=>member===name),true);}
    }


    const flags=await selected('sources/item-tags.yaml');await menu("メンバー追加の詳細","値を指定して追加…");
    await until(()=>!!document.querySelector('input[aria-label="変更後の名前"]'),"near Flags Add missing");
    assert(!input("変更後の名前").closest('[role="dialog"]'),"simple Add input left the list");
    text("変更後の名前","NewBit");
    assert(!flags.availableFlagBits.some(bit=>bit.bit===0||bit.bit===63),"used bits offered as candidates");
    text("追加するFlagsのBit","Bit 62");
    await choice("追加するFlagsのBit","Bit 62 · 1 << 62 (4611686018427387904)");
    assert(input("メンバーの数値").value==="4611686018427387904","bit choice lost exact integer");
    await plan();button("キャンセル").click();await until(()=>!document.querySelector('[aria-label="型の変更計画"]'),"cancel Flags Add failed");
    assert(desktop.surface.typeProjection?.identity===flags.identity,"Flags suggestion / Plan changed source");
    checks.push('flags-explicit-bit-candidate-no-write');
    await selected('sources/ranges.yaml');await menu("メンバー追加の詳細","値を指定して追加…");await until(()=>!!document.querySelector("input[aria-label=\"変更後の名前\"]"),"member input missing");text("変更後の名前",'Max');text("メンバーの数値",'18446744073709551615');await plan();
    const identity=desktop.surface.typeProjection!.identity;await invoke('evidence_write',{report:{phase:'type-stale'}});await until(()=>desktop.surface.typeProjection?.identity!==identity&&!desktop.surface.pending,"external type change was not observed");button("適用").click();await until(()=>[...document.querySelectorAll<HTMLButtonElement>('button')].some(el=>visible(el)&&el.textContent==="計画を作り直す"),"stale Apply did not offer explicit Re-plan");assert(desktop.surface.typeProjection?.declaration.category==='enum'&&!desktop.surface.typeProjection.declaration.members.some(([n])=>n==='Max'),"stale Plan wrote a member");button("計画を作り直す").click();await until(()=>!!document.querySelector("[aria-label=\"型の変更計画\"]")&&!!findButton("適用")&&!findButton("適用")!.disabled,"Re-plan did not retain exact input");checks.push('external-stale-plan-explicit-replan');
    await applied(()=>desktop.surface.typeProjection?.declaration.category==='enum'&&desktop.surface.typeProjection.declaration.members.some(([n,v])=>n==='Max'&&v==='18446744073709551615'));checks.push('enum-ulong-lossless-add');
    button("名前を変更: Max").click();await until(()=>document.activeElement?.getAttribute("aria-label")==="変更後の名前","Rename input did not become focused");assert(!input("変更後の名前").closest('[role="dialog"]'),"Rename did not stay inline");text("変更後の名前",'Maximum');input("変更後の名前").dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',keyCode:13,bubbles:true}));await until(()=>desktop.surface.typeProjection?.declaration.category==='enum'&&desktop.surface.typeProjection.declaration.members.some(([n,v])=>n==='Maximum'&&v==='18446744073709551615')&&![...document.querySelectorAll('input[aria-label="変更後の名前"]')].some(visible),"unused inline Rename did not directly preserve the exact numeric value");checks.push('enum-rename-preserves-number');
    await menu("Maximum メンバーの操作","削除…");await until(()=>[...document.querySelectorAll<HTMLButtonElement>('button')].some(el=>visible(el)&&el.textContent==="変更を確認"),"Drop input missing");await plan();await compare();await applied(()=>desktop.surface.typeProjection?.declaration.category==='enum'&&!desktop.surface.typeProjection.declaration.members.some(([n])=>n==='Maximum'),true);checks.push('unused-member-authorized-drop');
    await selected('sources/reward.yaml');button("フィールドを追加").click();await until(()=>!!document.querySelector("input[aria-label=\"Custom Typeフィールドの名前\"]"),"Custom input missing");text("Custom Typeフィールドの名前",'minimum');await choice("Custom Typeフィールドの基になる型",'long');
    await until(()=>!!document.querySelector("[aria-label=\"型に合わせた初期値\"]"),"typed initializer missing");
    const required=[...document.querySelectorAll<HTMLElement>('.ant-radio-wrapper')].find(el=>visible(el)&&el.textContent==="必須");assert(required,"modifier input missing");required.click();
    await until(()=>!!document.querySelector<HTMLInputElement>('input[aria-label="初期値"]')&&!input("初期値").disabled&&input("初期値").value==="0","required field did not receive its typed default");
    button("未設定").click();button("変更を確認").click();await until(()=>[...document.querySelectorAll<HTMLElement>('.ant-alert')].some(el=>visible(el)&&el.textContent?.includes('初期値を明示してください')),"explicit Unset initializer was accepted");
    button("値を入力").click();await until(()=>!!document.querySelector("input[aria-label=\"初期値\"]")&&!input("初期値").disabled&&input("初期値").value==="0","guided scalar default missing");text("初期値",'-9223372036854775808');await plan();await compare();await applied(()=>desktop.surface.typeProjection?.declaration.category==='custom'&&desktop.surface.typeProjection.declaration.fields.some(f=>f.name==='minimum'&&f.typeName==='long'));checks.push('custom-long-min-guided-initializer');
    await menu("minimum フィールドの操作","名前を変更…");await until(()=>!!document.querySelector("input[aria-label=\"変更後の名前\"]"),"Custom Rename missing");text("変更後の名前",'lower');await plan();await applied(()=>desktop.surface.typeProjection?.declaration.category==='custom'&&desktop.surface.typeProjection.declaration.fields.some(f=>f.name==='lower'));await until(()=>document.activeElement?.getAttribute('aria-label')==="lower フィールドの操作","renamed field lost origin focus");checks.push('custom-rename-occurrences');
    await menu("lower フィールドの操作","削除…");await until(()=>[...document.querySelectorAll<HTMLButtonElement>('button')].some(el=>visible(el)&&el.textContent==="変更を確認"),"Custom Drop input missing");await plan();await applied(()=>desktop.surface.typeProjection?.declaration.category==='custom'&&!desktop.surface.typeProjection.declaration.fields.some(f=>f.name==='lower'),true);checks.push('custom-authorized-drop');
    await desktop.selectTarget('sources/catalog-data.yaml','type-dirty-setup',false);const data=desktop.surface.projection!;await desktop.rpc({kind:'editText',epoch:data.sessionEpoch,source:data.source,revision:data.revision,generation:data.generation,row:data.rows[0].id,field:'name',text:'local type workflow'});await until(()=>desktop.surface.status.dirty.includes('sources/catalog-data.yaml'),"dirty source not observed");
    await selected('sources/rarity.yaml');await menu("Rare メンバーの操作","名前を変更…");await until(()=>!!document.querySelector("input[aria-label=\"変更後の名前\"]"),"affected dirty Rename missing");text("変更後の名前",'Epic');await plan();assert(button("適用").disabled,"affected dirty Apply was enabled");assert(document.querySelector("[aria-label=\"型の変更計画\"]")!.textContent!.includes('sources/catalog-data.yaml'),"affected dirty source is not identifiable");button("キャンセル").click();await desktop.selectTarget('sources/catalog-data.yaml','type-dirty-return',false);assert(desktop.surface.projection!.dirty&&desktop.surface.projection!.rows[0].cells.find((_,i)=>desktop.surface.projection!.columns[i].field.name==='name')!.display==='local type workflow',"Type Plan lost data draft");checks.push('affected-dirty-plan-apply-gate');
    assert((startup.browserErrors as string[]).length===0,"browser errors");
    await desktop.selectTarget('sources/independent.yaml','type-unrelated-return',false);assert(desktop.surface.projection?.dirty&&desktop.surface.projection.canUndo&&desktop.surface.projection.rows[0].cells[0].display==='2',"unrelated draft or history was lost");checks.push('unrelated-draft-history-survives-apply');
    await invoke('evidence_write',{report:{kind:'type',checks,dirty:desktop.surface.status.dirty,samples:desktop.samples,visibility:document.visibilityState,focused:document.hasFocus(),startup}});
  }catch(error){await invoke('evidence_write',{report:{kind:'type',error:String(error),checks,startup,status:desktop.surface.status,typeProjection:desktop.surface.typeProjection,surfaceError:desktop.surface.error,active:document.activeElement?.outerHTML.slice(0,1000),dialog:[...document.querySelectorAll('[role="dialog"]')].find(visible)?.outerHTML}});}
}
