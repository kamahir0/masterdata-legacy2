import { uiMessage, statusLabel, sourceCategoryLabel, uiTerms } from "./language";
import {useEffect, useLayoutEffect, useRef, useState, type ReactNode} from "react";
import {Alert, Button, Checkbox, Descriptions, Dropdown, Flex, Form, Input, Modal, Popover, Radio, Select, Space, Spin, Table, Tag, Typography, type MenuProps} from "antd";
import {DeleteOutlined, EditOutlined, MoreOutlined, PlusOutlined, SettingOutlined} from "@ant-design/icons";
import {desktop, basename, type Surface} from "./workspace";
import type {ConstantInput, DeclarationInput, MigrationReview, SetResult, Shape, TypeOperation, TypeProjection} from "./types";
import {TypedInitializer} from "./initializer";
type Draft={id:number;target:TypeProjection;command:TypeOperation;input:ConstantInput;shape:Shape|null;shapeError:string|null;review:MigrationReview|null;pending:boolean;applying:boolean;closing:boolean;error:string|null;outcome:SetResult|null;stale:boolean;uncertain:boolean;choices:string[];direct:boolean};
const message=(error:unknown)=>error&&typeof error==="object"&&"message" in error?`${"code" in error?String(error.code)+": ":""}${String(error.message)}`:String(error);
const labels:Record<TypeOperation["operation"],string>={setValueObjectConversions:"変換の設定",addEnumMember:"メンバーを追加",renameEnumMember:"メンバーの名前を変更",dropEnumMember:"メンバーを削除",addCustomField:"フィールドを追加",renameCustomField:"フィールドの名前を変更",dropCustomField:"フィールドを削除"};
function targetLabel(c:TypeOperation){return "member" in c?c.member:"field" in c?c.field:"name" in c?c.name:"declaration" in c?c.declaration.name:c.typeName;}
function changeLabel(c:TypeOperation){const target=targetLabel(c);return "newName" in c?`${target} → ${c.newName}`:c.operation==="addEnumMember"?`${target} = ${c.value}`:c.operation==="addCustomField"?`${target} · ${c.declaration.typeName}${c.declaration.array?"[]":c.declaration.nullable?"?":""} · キー ${c.declaration.key}`:target;}

export function TypeSurface({s,footer}:{s:Surface;footer:ReactNode}) {
  const p=s.typeProjection,ready=p&&!s.pending&&p.clicked===s.target;
  const body=useRef<HTMLDivElement>(null),origin=useRef<{element:HTMLElement;label:string|null;source:string;epoch:number}|null>(null);
  const [height,setHeight]=useState(420),[draft,setDraft]=useState<Draft|null>(null);
  const live=useRef(draft);live.current=draft;
  const ids=useRef(0),version=useRef(0),shapeVersion=useRef(0);
  const planFocus=useRef<{token:string;intent:number}|null>(null);
  const inputFocus=useRef<{id:number;intent:number}|null>(null),focusedInput=useRef<number|null>(null);
  const wasOverlay=useRef(false),nameComposing=useRef(false),restoreAfterApply=useRef(true),nameCommit=useRef<Promise<boolean>|null>(null);
  const memberTable=useRef<React.ComponentRef<typeof Table>>(null);
  const returnFocus=useRef<{element:HTMLElement;label:string|null;source:string;epoch:number;intent:number}|null>(null);
  function restoreOrigin() {
    const saved=returnFocus.current;
    if(!saved)return;
    if(saved.epoch!==desktop.surface.status.epoch||saved.source!==desktop.surface.target||saved.intent!==desktop.inputIntent){returnFocus.current=null;return;}
    if(desktop.surface.pending)return;
    const restored=(saved.label?[...document.querySelectorAll<HTMLElement>('[aria-label]')].find(el=>el.getAttribute('aria-label')===saved.label):null)??(saved.element.isConnected?saved.element:null);
    if(!restored||!restored.getClientRects().length||restored instanceof HTMLButtonElement&&restored.disabled)return;
    restored.focus({preventScroll:true});
    if(document.activeElement===restored)returnFocus.current=null;
  }
  function focusPlan(element=document.querySelector<HTMLElement>("[aria-label=\"型の変更計画\"]")) {
    const current=live.current;
    if(element?.isConnected&&current?.review&&planFocus.current?.token===current.review.token&&planFocus.current.intent===desktop.inputIntent&&current.target.clicked===desktop.surface.target&&!desktop.surface.comparison&&!desktop.surface.choice)element.focus();
  }
  function focusInput() {
    const c=live.current,intent=inputFocus.current;
    if(c&&!c.review&&!c.closing&&focusedInput.current!==c.id&&c.target.clicked===desktop.surface.target&&intent?.id===c.id&&intent.intent===desktop.inputIntent) {
      const element=document.querySelector<HTMLInputElement>('.type-body input[aria-label="変更後の名前"],.near-type-input input[aria-label="変更後の名前"]');
      if(c.command.operation==="renameEnumMember")memberTable.current?.scrollTo({key:c.command.member});
      element?.focus({preventScroll:true});element?.select();if(element)focusedInput.current=c.id;
    }
  }
  const patch=(change:Partial<Draft>)=>{if(live.current){live.current={...live.current,...change};setDraft(live.current);}};
  useLayoutEffect(()=>{if(p&&ready&&body.current){desktop.committedType(p,body.current);if(document.activeElement===document.getElementById('editor-pane'))body.current.focus({preventScroll:true});}},[p,ready]);
  useLayoutEffect(()=>{if(!draft&&ready){const frame=requestAnimationFrame(restoreOrigin);return()=>cancelAnimationFrame(frame);}},[p,ready,draft]);
  useLayoutEffect(()=>{
    const overlay=!!s.comparison||!!s.choice;
    if(wasOverlay.current&&!overlay&&live.current?.review) {
      planFocus.current={token:live.current.review.token,intent:desktop.inputIntent};
      const frame=requestAnimationFrame(()=>focusPlan());
      wasOverlay.current=overlay;return()=>cancelAnimationFrame(frame);
    }
    wasOverlay.current=overlay;
  },[s.comparison,s.choice]);
  useEffect(()=>{const element=body.current;if(!element)return;const observer=new ResizeObserver(()=>setHeight(Math.max(160,element.clientHeight-122)));observer.observe(element);return()=>observer.disconnect();},[]);
  useEffect(()=>{ids.current++;version.current++;shapeVersion.current++;live.current=null;setDraft(null);},[s.status.epoch]);
  useEffect(()=>{const c=live.current;if(c&&c.target.clicked!==s.target&&!c.applying&&!c.direct){version.current++;shapeVersion.current++;live.current=null;setDraft(null);}},[s.target,draft?.applying]);
  function close(restore=true) {
    if(live.current?.applying)return;
    if(restore&&origin.current)returnFocus.current={...origin.current,intent:desktop.inputIntent};
    else returnFocus.current=null;
    version.current++;
    const command=live.current?.command;
    if(!live.current?.review && (command?.operation==="renameEnumMember"||command?.operation==="renameCustomField"||command?.operation==="addEnumMember")){live.current=null;setDraft(null);}else patch({closing:true});
  }
  async function begin(command:TypeOperation, originLabel?:string,direct=command.operation==="renameEnumMember"||command.operation==="renameCustomField") {
    const p=desktop.surface.typeProjection;
    if(!p||!desktop.currentType(p)||s.status.recoveryRequired||s.uncertainField||live.current?.applying)return;
    returnFocus.current=null;
    const el=document.activeElement as HTMLElement;
    origin.current={element:el,label:originLabel??el.getAttribute('aria-label'),source:p.clicked,epoch:p.sessionEpoch};
    const id=++ids.current;
    inputFocus.current={id,intent:desktop.inputIntent};restoreAfterApply.current=true;nameComposing.current=false;
    const next:Draft={id,target:p,command,input:{kind:"unset"},shape:null,shapeError:null,review:null,pending:false,applying:false,closing:false,error:null,outcome:null,stale:false,uncertain:false,choices:[],direct};
    live.current=next;setDraft(next);
    if(command.operation==="addCustomField") {
      try {
        const choices=await desktop.rpc<{fieldTypes:string[]}>({kind:"creationChoices",epoch:p.sessionEpoch});
        if(live.current?.id===id&&p.sessionEpoch===desktop.surface.status.epoch)patch({choices:choices.data.fieldTypes});
      }catch(error){if(live.current?.id===id)patch({error:message(error)});}
    }
  }
  const adding=useRef(false);
  const [addPending,setAddPending]=useState(false),[operationError,setOperationError]=useState<string|null>(null);
  useEffect(()=>setOperationError(null),[p?.source,p?.identity]);
  async function addMember() {
    if(!p||!desktop.currentType(p)||adding.current)return;
    adding.current=true;setAddPending(true);setOperationError(null);
    const intent=desktop.inputIntent;
    try {
      const reply=await desktop.rpc<TypeOperation>({kind:"defaultEnumMember",epoch:p.sessionEpoch,source:p.source,identity:p.identity});
      if(!desktop.currentType(p)||intent!==desktop.inputIntent)return;
      await begin(reply.data,"メンバーを追加",true);
      await plan();
    }catch(error){if(desktop.currentType(p))setOperationError(message(error));}
    finally{adding.current=false;setAddPending(false);}
  }
  async function addField() {
    if(!p||p.declaration.category!=="custom"||!desktop.currentType(p))return;
    setOperationError(null);
    try {
      const reply=await desktop.rpc<DeclarationInput>({kind:"creationField",epoch:p.sessionEpoch,fields:p.declaration.fields.map(f=>({...f,key:String(f.key)}))});
      if(desktop.currentType(p))await begin({operation:"addCustomField",typeName:p.name,declaration:reply.data,initializer:null},"フィールドを追加");
    }catch(error){if(desktop.currentType(p))setOperationError(message(error));}
  }
  function change(command:TypeOperation,input=live.current?.input??{kind:"unset"} as ConstantInput) {
    version.current++;patch({command,input,review:null,error:null,outcome:null,stale:false,...(live.current?.target.clicked!==desktop.surface.target?{direct:false}:{})});
  }
  function fieldChange(changeInput:Partial<DeclarationInput>) {
    const c=live.current?.command;if(c?.operation!=="addCustomField")return;
    const changesType=("typeName" in changeInput&&changeInput.typeName!==c.declaration.typeName)||("nullable" in changeInput&&changeInput.nullable!==c.declaration.nullable)||("array" in changeInput&&changeInput.array!==c.declaration.array);
    change({...c,declaration:{...c.declaration,...changeInput}},changesType?{kind:"unset"}:live.current!.input);
    if(changesType)patch({shape:null,shapeError:null});
  }
  useLayoutEffect(()=>{
    const c=live.current;if(!c||c.review||c.closing)return;
    const intent=inputFocus.current;
    const frame=requestAnimationFrame(()=>{
      if(live.current?.id===c.id&&intent?.id===c.id)focusInput();
    });return()=>cancelAnimationFrame(frame);
  },[draft?.id,draft?.review?.token]);
  const field=draft?.command.operation==="addCustomField"?draft.command.declaration:null;
  useEffect(()=>{
    const current=live.current;if(!current||current.command.operation!=="addCustomField")return;
    const mine=++shapeVersion.current;
    void desktop.rpc<Shape>({kind:"typeInitializer",epoch:current.target.sessionEpoch,source:current.target.source,identity:current.target.identity,declaration:current.command.declaration}).then(reply=>{
      if(mine===shapeVersion.current&&live.current?.id===current.id&&reply.host.epoch===desktop.surface.status.epoch)patch({shape:reply.data,shapeError:null});
    }).catch(error=>{if(mine===shapeVersion.current&&live.current?.id===current.id)patch({shape:null,shapeError:message(error)});});
    return()=>{shapeVersion.current++;};
  },[draft?.id,field?.typeName,field?.nullable,field?.array]);
  async function plan(replan=false) {
    const current=live.current;if(!current||current.applying||current.uncertain||current.pending)return;
    const mine=++version.current;
    const intent=desktop.inputIntent;
    patch({pending:true,review:replan?current.review:null,error:null,outcome:null});
    try {
      let target=current.target;
      if(replan) {
        const fresh=(await desktop.rpc<TypeProjection>({kind:"typeView",epoch:target.sessionEpoch,source:target.clicked})).data;
        if(fresh.kind!=="type"||fresh.source!==target.source||fresh.name!==target.name||fresh.sessionEpoch!==target.sessionEpoch)throw new Error("型の対応付けが変わりました。現在の宣言から操作を開始してください。");
        target=fresh;
      }
      const reply=await desktop.rpc<MigrationReview>({kind:"typeMigrationPlan",epoch:target.sessionEpoch,source:target.source,identity:target.identity,command:current.command,input:current.command.operation==="addCustomField"&&current.input.kind!=="unset"?current.input:null});
      if(mine===version.current&&live.current?.id===current.id&&reply.host.epoch===desktop.surface.status.epoch){planFocus.current={token:reply.data.token,intent};patch({target,review:reply.data,pending:false,stale:false});
        if(current.direct) {
          if(!reply.data.destructive&&reply.data.affectedRecords===0&&reply.data.files.every(f=>f.source===target.source)&&!reply.data.files.some(f=>desktop.surface.status.dirty.includes(f.source)))await apply();
          else patch({direct:false});
        }}
    }catch(error){if(mine===version.current&&live.current?.id===current.id)patch({pending:false,error:message(error),stale:message(error).includes("E-MIGRATION-STALE")});}
  }
  async function apply() {
    const current=live.current,review=current?.review;
    if(!current||!review||current.applying||current.pending||current.uncertain||current.stale||current.target.sessionEpoch!==desktop.surface.status.epoch)return;
    const dirty=review.files.filter(file=>desktop.surface.status.dirty.includes(file.source));
    if(dirty.length){patch({error:`未保存のソースを先に確認してください: ${dirty.map(f=>f.source).join(", ")}`});return;}
    if(review.destructive) {
      const answer=await desktop.choose(`削除: ${targetLabel(current.command)}`,`${current.target.name}の${targetLabel(current.command)}と対象の値を削除します。`,["Delete","Cancel"]);
      if(answer!=="Delete"||live.current!==current||current.target.sessionEpoch!==desktop.surface.status.epoch)return;
    }
    const inputIntent=desktop.inputIntent,key=`field:${review.token}`;
    let received:SetResult|null=null;
    patch({applying:true,error:null});desktop.protectWriteView(key,true);
    try {
      const reply=await desktop.rpc<SetResult>({kind:"migrationApply",epoch:current.target.sessionEpoch,token:review.token,authorizeDestructive:review.destructive});
      received=reply.data;
      desktop.protectWriteView(key,false);
      if(current.target.sessionEpoch!==desktop.surface.status.epoch)return;
      // Keep the review surface through the resulting view refresh. Clearing
      // it early reopens the old Add input and exposes disabled new-row actions
      // before the write has completed its UI transition.
      patch({outcome:reply.data});
      await desktop.refreshInventory();
      await desktop.refresh();
      if(live.current?.id!==current.id)return;
      patch({applying:false,review:null});
      if(reply.data.outcome==="Success") {
        if(origin.current) {
          const operation=current.command;
          if(operation.operation==="renameEnumMember"||operation.operation==="renameCustomField")origin.current.label=origin.current.label?.startsWith("名前を変更: ")?`名前を変更: ${operation.newName}`:`${operation.newName} ${operation.operation==="renameEnumMember"?"メンバー":"フィールド"}の操作`;
          if(operation.operation==="dropEnumMember"||operation.operation==="dropCustomField")origin.current.label=operation.operation==="dropEnumMember"?"メンバーを追加":"フィールドを追加";
        }
        if(current.direct&&(current.command.operation==="renameEnumMember"||current.command.operation==="renameCustomField"))close(restoreAfterApply.current&&inputIntent===desktop.inputIntent&&desktop.surface.target===current.target.clicked);
        else if(current.direct&&current.command.operation==="addEnumMember") {
          if(inputIntent===desktop.inputIntent&&desktop.surface.target===current.target.clicked&&!desktop.surface.pending) {
            await begin({operation:"renameEnumMember",typeName:current.command.typeName,member:current.command.name,newName:current.command.name},`名前を変更: ${current.command.name}`,true);
          } else close(false);
        } else if(inputIntent===desktop.inputIntent)close(restoreAfterApply.current);
      }
      else patch({error:`${reply.data.outcome}: ${reply.data.message}`,stale:true});
    }catch(error){
      if(received) {if(current.target.sessionEpoch===desktop.surface.status.epoch&&live.current?.id===current.id)patch({applying:false,outcome:received,review:null,error:`${statusLabel(received.outcome)} · 表示の再取得に失敗しました: ${message(error)}`,stale:true});return;}
      const known=!!error&&typeof error==="object"&&"code" in error;
      if(known)desktop.protectWriteView(key,false);
      else desktop.migrationUncertain(review.token,current.target.sessionEpoch,current.target.clicked);
      if(current.target.sessionEpoch===desktop.surface.status.epoch&&live.current?.id===current.id)patch({applying:false,error:known?message(error):"Outcome Unknown: 結果を受信できません。再確認で現在のソース一式を確認してください。",stale:known,uncertain:!known});
    }
  }
  async function recheck() {
    await desktop.recheckFieldOperation();
    if(!desktop.surface.uncertainField)patch({uncertain:false,review:null,stale:true});
  }
  function actions(name:string,member:boolean):MenuProps {
    const protectedMember=member&&p?.protectedMembers.includes(name);
    return {items:protectedMember?[]:[{key:"rename",label:"名前を変更…",icon:<EditOutlined aria-hidden="true"/>},{key:"drop",label:"削除…",danger:true,icon:<DeleteOutlined aria-hidden="true"/>}],onKeyDown:event=>{
      // Ant Menu 6.6.5 activates on keydown without consuming the native default.
      // WKWebView's remaining Enter activation can close the newly opened input.
      // Consume the handled Enter, keeping Menu's normal path and key-only input.
      // Composition Enter remains text input; the native Type workflow exercises
      // both Enter representations and Cancel with source/focus preservation.
      if(event.key==="Enter"&&!event.nativeEvent.isComposing&&event.target instanceof HTMLElement) {
        const item=event.target.closest<HTMLElement>('[role="menuitem"]');
        if(item&&item.getAttribute('aria-disabled')!=="true"){event.preventDefault();if(event.which!==13)item.click();}
      }
    },onClick:({key})=>{
      if(!p)return;
      void begin(member?(key==="rename"?{operation:"renameEnumMember",typeName:p.name,member:name,newName:name}:{operation:"dropEnumMember",typeName:p.name,member:name}):(key==="rename"?{operation:"renameCustomField",typeName:p.name,field:name,newName:name}:{operation:"dropCustomField",typeName:p.name,field:name}),`${name} ${member?"メンバー":"フィールド"}の操作`);
    }};
  }
  const disabled=addPending||!!draft?.applying||!ready||s.busy||s.status.recoveryRequired||!!s.uncertainField;
  const declaration=ready?p.declaration:null;
  const typeLabel=sourceCategoryLabel(declaration?.category==="enum"&&declaration.flags?"flags":declaration?.category??"");
  const dirty=draft?.review?.files.filter(file=>s.status.dirty.includes(file.source)).map(file=>file.source)??[];
  const command=draft?.command;
  const inlineRename=command?.operation==="renameEnumMember"||command?.operation==="renameCustomField";
  const nearbyAdd=command?.operation==="addEnumMember";
  const lightInput=(inlineRename||nearbyAdd)&&(!draft?.review||draft.direct&&!draft.error&&!draft.stale)&&!draft?.uncertain&&!(draft?.direct&&nearbyAdd&&draft.error)&&(!draft||draft.target.clicked===s.target||draft.direct&&!draft.error);
  const cancelInput=(event:React.KeyboardEvent)=>{if(event.key==="Escape"&&!event.nativeEvent.isComposing&&event.keyCode!==229){event.preventDefault();event.stopPropagation();close();}};
  function confirmName(restore=false):Promise<boolean> {
    if(nameCommit.current)return nameCommit.current;
    if(nameComposing.current)return Promise.resolve(false);
    restoreAfterApply.current=restore;
    const current=live.current,c=current?.command;
    if(!current||!c||!("newName" in c)||current.review||current.applying)return Promise.resolve(true);
    const old="member" in c?c.member:"field" in c?c.field:"";
    if(!c.newName.trim()||c.newName===old){close(restore);return Promise.resolve(true);}
    // Blur and the following navigation can request the same input commit.
    // Keep one promise and its original source until the native write settles.
    nameCommit.current=plan().then(()=>!live.current||live.current.id!==current.id||!!live.current.review).finally(()=>{nameCommit.current=null;});
    return nameCommit.current;
  }
  useLayoutEffect(()=>{
    if(!draft?.direct||!inlineRename||draft.review||draft.applying)return;
    return desktop.bindEditor(()=>confirmName(),()=>null);
  },[draft?.id,draft?.direct,inlineRename,!!draft?.review,draft?.applying]);
  const confirmInput=<Space size="small"><Button disabled={draft?.pending} onClick={()=>close()}>キャンセル</Button><Button type="primary" loading={draft?.pending} disabled={disabled||!!draft?.stale} onClick={()=>{if(live.current?.direct)confirmName(true);else void plan();}}>{draft?.direct?"確定":"変更を確認"}</Button></Space>;
  const nameCell=(name:string,member:boolean)=>{
    const editing=lightInput&&inlineRename&&command&&("member" in command?command.member: "field" in command?command.field:null)===name;
    if(editing&&command&&"newName" in command)return <Input ref={input=>{if(input&&focusedInput.current!==draft?.id)requestAnimationFrame(focusInput);}} aria-label="変更後の名前" value={command.newName} readOnly={draft?.pending||draft?.applying} onChange={e=>change({...command,newName:e.target.value})} onCompositionStart={()=>{nameComposing.current=true;}} onCompositionEnd={()=>{nameComposing.current=false;}} onBlur={e=>{if(!e.relatedTarget?.closest('.type-inline-actions'))confirmName();}} onKeyDown={e=>{cancelInput(e);if((e.key==="Enter"||e.key==="Tab")&&!e.nativeEvent.isComposing&&e.keyCode!==229){if(e.key==="Enter"){e.preventDefault();e.stopPropagation();}void confirmName(e.key==="Enter");}}}/>;
    if(member&&p!.protectedMembers.includes(name))return name;
    return <Button type="text" className="type-name-edit" aria-label={`名前を変更: ${name}`} disabled={disabled} onClick={()=>void begin(member?{operation:"renameEnumMember",typeName:p!.name,member:name,newName:name}:{operation:"renameCustomField",typeName:p!.name,field:name,newName:name},`名前を変更: ${name}`)}>{name}</Button>;
  };
  const addMemberInput=nearbyAdd&&command&&<div className="near-type-input" onKeyDown={cancelInput}><Form layout="vertical" className="type-operation" onKeyDown={e=>{if(e.key==="Enter"&&!e.nativeEvent.isComposing&&e.keyCode!==229&&e.target instanceof HTMLInputElement&&e.target.getAttribute('role')!=="combobox"){e.preventDefault();void plan();}}}>
    <Form.Item label="名前"><Input aria-label="変更後の名前" value={command.name} readOnly={draft?.pending} onChange={e=>change({...command,name:e.target.value})}/></Form.Item>
    {draft?.target.declaration.category==="enum"&&draft.target.declaration.flags&&<Form.Item label="未使用のBit"><Select aria-label="追加するFlagsのBit" showSearch={{optionFilterProp:"label"}} disabled={draft.pending} value={draft.target.availableFlagBits.find(bit=>bit.value===command.value)?.value} placeholder="Bitを選択" options={draft.target.availableFlagBits.map(bit=>({value:bit.value,label:`Bit ${bit.bit} · 1 << ${bit.bit} (${bit.value})`}))} onChange={value=>change({...command,value})}/></Form.Item>}
    <Form.Item label="数値"><Input aria-label="メンバーの数値" inputMode="numeric" value={command.value} readOnly={draft?.pending} onChange={e=>change({...command,value:e.target.value})}/></Form.Item>
  </Form>{draft?.error&&<Alert type="error" showIcon title={uiMessage(draft.error)}/>}<div className="type-input-actions">{confirmInput}</div></div>;
  return <section id="type-surface">
    <div className="type-context"><Typography.Text strong>{ready?p.name:basename(s.target)}</Typography.Text><Typography.Text type="secondary" className="selection-label">{s.target}</Typography.Text>{declaration&&<Tag>{typeLabel}</Tag>}</div>
    <div className="type-body" ref={body} tabIndex={0} aria-label="型エディター" aria-busy={s.pending} onFocus={()=>{if(p)desktop.acceptedType(p);}} onKeyDown={()=>{if(p)desktop.acceptedType(p);}}>
      {operationError&&<Alert type="error" showIcon closable={{onClose:()=>setOperationError(null)}} title="追加できません" description={uiMessage(operationError)}/>}
      {s.pending?<div className="type-pending" role="status"><Spin size="small"/><span>{basename(s.target)}を開いています…</span></div>:!declaration?<Alert type="error" showIcon title="型を開けません" description={uiMessage(s.error)}/>:<>
        <div className="type-summary"><Descriptions size="small" column={2} items={[{key:"name",label:"名前",children:p!.name},{key:"category",label:"種類",children:typeLabel},...("underlying" in declaration?[{key:"underlying",label:"基になる型",children:declaration.underlying}]:[])]}/></div>
        {declaration.category==="valueObject"?<>
          <div className="type-list-heading"><Typography.Text strong>変換</Typography.Text><Button icon={<SettingOutlined aria-hidden="true"/>} aria-label="変換を編集" disabled={disabled} onClick={()=>void begin({operation:"setValueObjectConversions",typeName:p!.name,fromImplicit:declaration.from_implicit,toImplicit:declaration.to_implicit},"変換を編集")}>変換を編集</Button></div>
          <Descriptions size="small" column={1} items={[{key:"from",label:"基になる型から",children:declaration.from_implicit?"暗黙の変換":"明示的な変換"},{key:"to",label:"基になる型へ",children:declaration.to_implicit?"暗黙の変換":"明示的な変換"}]}/>
        </>:<>
          <div className="type-list-heading"><Typography.Text strong>{declaration.category==="enum"?"メンバー":"フィールド"}</Typography.Text><Space size={0}><Button icon={<PlusOutlined aria-hidden="true"/>} aria-label={declaration.category==="enum"?"メンバーを追加":"フィールドを追加"} disabled={disabled||!!draft&&!draft.closing} loading={addPending} onClick={()=>{if(declaration.category==="enum")void addMember();else void addField();}}>{declaration.category==="enum"?"メンバーを追加":"フィールドを追加"}</Button>{declaration.category==="enum"&&<Popover open={!!draft&&nearbyAdd&&lightInput&&!draft.direct&&!draft.closing&&!s.comparison&&!s.choice} trigger={["click"]} placement="bottomRight" content={addMemberInput} afterOpenChange={open=>{if(open)focusInput();}} onOpenChange={open=>{if(!open&&nearbyAdd&&lightInput){const c=live.current?.command;if(c?.operation==="addEnumMember"&&c.name.trim()&&c.value.trim())void plan();else close(false);}}}><Dropdown menu={{items:[{key:"explicit",label:"値を指定して追加…"}],onClick:()=>void begin({operation:"addEnumMember",typeName:p!.name,name:"",value:""},"メンバー追加の詳細")}} trigger={["click"]}><Button type="text" aria-label="メンバー追加の詳細" disabled={disabled||!!draft&&!draft.closing} icon={<MoreOutlined aria-hidden="true"/>}/></Dropdown></Popover>}</Space></div>
          {declaration.category==="enum"?<Table virtual size="small" pagination={false} scroll={{x:660,y:height}} ref={memberTable} rowKey="name" dataSource={declaration.members.map(([name,value])=>({name,value}))} columns={[{title:"名前",dataIndex:"name",width:330,render:name=>nameCell(name,true)},{title:"値",dataIndex:"value",width:260,render:(value,row)=><span className="type-numeric">{value}{declaration.flags&&<Typography.Text type="secondary" className="flag-bit-hint">{value==="0"?" · None":p!.flagBits[row.name]!==undefined?` · Bit ${p!.flagBits[row.name]} · 1 << ${p!.flagBits[row.name]}`:""}</Typography.Text>}</span>},{title:"",width:70,render:(_,row)=>!p!.protectedMembers.includes(row.name)&&<Dropdown menu={actions(row.name,true)} trigger={["click"]}><Button type="text" disabled={disabled} icon={<MoreOutlined aria-hidden="true"/>} aria-label={`${row.name} メンバーの操作`}/></Dropdown>}]}/>:<Table virtual size="small" pagination={false} scroll={{x:720,y:height}} rowKey="name" dataSource={declaration.fields} columns={[{title:"キー",dataIndex:"key",width:70},{title:"名前",dataIndex:"name",width:240,render:name=>nameCell(name,false)},{title:"型",dataIndex:"typeName",width:240},{title:"修飾子",width:100,render:(_,row)=>row.array?"配列":row.nullable?"nullを許可":"—"},{title:"",width:70,render:(_,row)=><Dropdown menu={actions(row.name,false)} trigger={["click"]}><Button type="text" disabled={disabled} icon={<MoreOutlined aria-hidden="true"/>} aria-label={`${row.name} フィールドの操作`}/></Dropdown>}]}/>}
        </>}
      </>}
      {lightInput&&inlineRename&&<div className="type-inline-actions">{draft?.error&&<Alert type="error" showIcon title={uiMessage(draft.error)}/>}<span>{confirmInput}</span></div>}
      {s.uncertainField&&<Alert type="warning" showIcon title="構造変更の結果を確認できません" description={<Space direction="vertical" size={4}><Typography.Text>{uiTerms.sourceRecheckDescription}</Typography.Text><Button aria-label="状態を再確認（対象ソース一式）" onClick={()=>void desktop.recheckFieldOperation()}>{uiTerms.recheck}</Button></Space>}/>}
    </div>
    {footer}
    {draft&&!lightInput&&<Modal open={!draft.closing&&!s.comparison&&!s.choice} title={`${labels[draft.command.operation]} · ${draft.target.name}`} width={620} destroyOnHidden={false} focusTriggerAfterClose={false} onCancel={()=>close()} keyboard={!draft.applying} mask={{closable:!draft.applying}} afterClose={()=>{if(live.current?.closing&&live.current.id===draft.id){live.current=null;setDraft(null);}}} afterOpenChange={open=>{if(!open)return;if(live.current?.review)focusPlan();else if(inputFocus.current?.id===live.current?.id&&inputFocus.current?.intent===desktop.inputIntent)document.querySelector<HTMLElement>('.type-operation input:not(:disabled),.type-operation button')?.focus();}} footer={<Space>
      <Button disabled={draft.applying} onClick={()=>close()}>キャンセル</Button>
      {draft.uncertain?<Button type="primary" aria-label="状態を再確認（対象ソース一式）" onClick={()=>void recheck()}>{uiTerms.recheck}</Button>:draft.review?<>
        <Button disabled={draft.applying} onClick={()=>{version.current++;inputFocus.current={id:draft.id,intent:desktop.inputIntent};focusedInput.current=null;patch({review:null});}}>入力を修正</Button>
        {draft.stale&&<Button title="現在の対象ソースから変更計画を取得します" loading={draft.pending} disabled={draft.applying} onClick={()=>void plan(true)}>計画を作り直す</Button>}
        <Button type="primary" danger={draft.review.destructive} loading={draft.applying} disabled={draft.pending||!!dirty.length||s.status.recoveryRequired||draft.stale||s.pending} onClick={()=>void apply()}>適用</Button>
      </>:<Button type="primary" loading={draft.pending} disabled={draft.applying||s.status.recoveryRequired||s.pending} onClick={()=>void plan(draft.stale)}>{draft.stale?"計画を作り直す":"変更を確認"}</Button>}
    </Space>}>
      <Typography.Paragraph type="secondary" className="type-source">{draft.target.source}</Typography.Paragraph>{draft.uncertain&&<Typography.Paragraph>{uiTerms.sourceRecheckDescription}</Typography.Paragraph>}
      {!draft.review?<Form layout="vertical" className="type-operation" onKeyDown={e=>{if(e.key==="Enter"&&!e.nativeEvent.isComposing&&e.target instanceof HTMLInputElement){e.preventDefault();void plan(draft.stale);}}}>
        {command?.operation==="setValueObjectConversions"&&<Space direction="vertical"><Checkbox disabled={draft.pending} checked={command.fromImplicit} onChange={e=>change({...command,fromImplicit:e.target.checked})}>基になる型から暗黙に変換</Checkbox><Checkbox disabled={draft.pending} checked={command.toImplicit} onChange={e=>change({...command,toImplicit:e.target.checked})}>基になる型へ暗黙に変換</Checkbox></Space>}
        {(command?.operation==="addEnumMember"||command?.operation==="renameEnumMember"||command?.operation==="renameCustomField")&&<Form.Item label="名前"><Input aria-label="変更後の名前" readOnly={draft.pending} value={command.operation==="addEnumMember"?command.name:command.newName} onChange={e=>change(command.operation==="addEnumMember"?{...command,name:e.target.value}:{...command,newName:e.target.value})}/></Form.Item>}
        {command?.operation==="addEnumMember"&&<Form.Item label="数値を明示"><Input aria-label="メンバーの数値" readOnly={draft.pending} inputMode="numeric" value={command.value} onChange={e=>change({...command,value:e.target.value})}/></Form.Item>}
        {command?.operation==="addCustomField"&&<>
          <Flex gap={12}><Form.Item label="MessagePackキー"><Input aria-label="Custom Typeフィールドのキー" readOnly={draft.pending} value={command.declaration.key} onChange={e=>fieldChange({key:e.target.value})}/></Form.Item><Form.Item label="名前" className="type-field-name"><Input aria-label="Custom Typeフィールドの名前" readOnly={draft.pending} value={command.declaration.name} onChange={e=>fieldChange({name:e.target.value})}/></Form.Item></Flex>
          <Form.Item label="基になる型"><Select aria-label="Custom Typeフィールドの基になる型" disabled={draft.pending} value={command.declaration.typeName} options={draft.choices.map(type=>({value:type,label:type}))} onChange={typeName=>fieldChange({typeName})}/></Form.Item>
          <Form.Item label="修飾子"><Radio.Group disabled={draft.pending} value={command.declaration.array?"array":command.declaration.nullable?"nullable":"required"} options={[{value:"required",label:"必須"},{value:"nullable",label:"nullを許可"},{value:"array",label:"配列"}]} onChange={e=>fieldChange({nullable:e.target.value==="nullable",array:e.target.value==="array"})}/></Form.Item>
          {draft.shape?<TypedInitializer key={`${command.declaration.typeName}:${command.declaration.nullable}:${command.declaration.array}`} shape={draft.shape} value={draft.input} disabled={draft.pending} onChange={input=>change(command,input)}/>:draft.shapeError?<Alert type="error" showIcon title={uiMessage(draft.shapeError)}/>:<Spin size="small"/>}
        </>}
        {(command?.operation==="dropEnumMember"||command?.operation==="dropCustomField")&&<Typography.Paragraph>削除対象: <Typography.Text strong>{targetLabel(command)}</Typography.Text></Typography.Paragraph>}
      </Form>:<PlanPanel token={draft.review.token} focus={focusPlan}>
        <Space wrap><Tag color={draft.review.destructive?"error":"default"}>{draft.review.destructive?"値に影響する変更":"検証済みの変更候補"}</Tag><Typography.Text>{draft.review.affectedRecords} 個の値 · {draft.review.files.length} 個のソース</Typography.Text></Space>
        <Typography.Paragraph>{labels[draft.command.operation]}: <Typography.Text strong>{changeLabel(draft.command)}</Typography.Text></Typography.Paragraph>
        {draft.review.files.map(file=><Flex className="type-plan-file" key={file.source} align="center" gap={12}><Typography.Text>{file.source}</Typography.Text><Button onClick={()=>void desktop.migrationCompare(draft.review!.token,file.source,draft.review!.files.map(f=>f.source)).catch(desktop.showError)}>比較</Button></Flex>)}
        {!!dirty.length&&<Alert type="warning" showIcon title="変更対象のソースに未保存の変更があるため適用できません" description={dirty.join(", ")}/>}
      </PlanPanel>}
      {draft.error&&<Alert type={draft.uncertain?"warning":"error"} showIcon title={draft.stale?"計画を作り直してください":"操作を完了できません"} description={uiMessage(draft.error)}/>}
    </Modal>}
  </section>;
}
function PlanPanel({token,focus,children}:{token:string;focus:(element:HTMLElement|null)=>void;children:ReactNode}) {
  const element=useRef<HTMLDivElement>(null);
  // Ant Modal owns a deferred portal/motion commit. Focusing in its parent's
  // effect can run before this content exists. Use this panel's own commit,
  // with latest-input guards, and the Modal's opening callback as a fallback.
  useLayoutEffect(()=>{const frame=requestAnimationFrame(()=>focus(element.current));return()=>cancelAnimationFrame(frame);},[token]);
  return <div ref={element} className="type-plan" aria-label="型の変更計画" tabIndex={-1}>{children}</div>;
}
