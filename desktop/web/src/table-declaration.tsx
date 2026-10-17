import { uiMessage, uiTerms } from "./language";
import {useCallback, useEffect, useLayoutEffect, useRef, useState} from "react";
import {Alert, Button, Checkbox, Drawer, Empty, Flex, Form, Input, Select, Space, Spin, Table, Tabs, Tag, Typography} from "antd";
import {DeleteOutlined, EditOutlined, PlusOutlined, ReloadOutlined} from "@ant-design/icons";
import {desktop, type Surface} from "./workspace";
import type {DeclarationKey, ReferenceDetail, ReferenceInput, TableDeclarationChange, TableDeclarationSnapshot} from "./types";

type Context={id:number;epoch:number;target:string;source:string;table:string;snapshot:TableDeclarationSnapshot|null;change:TableDeclarationChange|null;pending:boolean;applying:boolean;closing:boolean;error:string|null;stale:boolean;referenceKey:number|null;externalVersion:number;tab:string;requestedField?:string;origin:HTMLElement|null};
const errorText=(e:unknown)=>e&&typeof e==="object"&&"message" in e?`${"code" in e?String(e.code)+": ":""}${String(e.message)}`:String(e);
const labels:Record<TableDeclarationChange["kind"],string>={setFieldKey:"MessagePackキー",setPrimaryKey:"主キー",addSecondaryKey:"副キーを追加",editSecondaryKey:"副キーを編集",removeSecondaryKey:"副キーを削除",addReference:"参照を追加",editReference:"参照を編集",removeReference:"参照を削除"};
const keyLabel=(key:DeclarationKey)=>`${key.fields.join(" → ")}${key.nonUnique?" · 重複許可":" · 一意"}`;
export function useTableDeclaration(s:Surface) {
  const [context,setContext]=useState<Context|null>(null),live=useRef(context);live.current=context;
  const request=useRef(0),ids=useRef(0),closed=useRef<{epoch:number;target:string;input:number;origin:HTMLElement|null}|null>(null);
  const focus=useRef<{input:number;id:number}|null>(null);
  const focusDetail=()=>{const root=document.querySelector('.ant-drawer-open');(root?.querySelector<HTMLElement>("[aria-label=\"テーブル宣言の変更計画\"],.table-declaration-operation input:not(:disabled)")??root?.querySelector<HTMLElement>("button[aria-label=\"テーブル宣言の変更を適用\"]:not(:disabled)")??root?.querySelector<HTMLElement>('.table-declarations button:not(:disabled)'))?.focus();};
  const patch=(value:Partial<Context>)=>{if(live.current){live.current={...live.current,...value};setContext(live.current);}};
  const current=(c:Context)=>live.current?.id===c.id&&desktop.surface.status.epoch===c.epoch&&desktop.surface.target===c.target;
  useLayoutEffect(()=>{
    const frame=requestAnimationFrame(()=>{const f=focus.current,c=live.current;if(!f||!c||c.closing||f.id!==c.id||f.input!==desktop.inputIntent||!current(c)||desktop.surface.choice||desktop.surface.comparison)return;
      focusDetail();});
    return()=>cancelAnimationFrame(frame);
  },[context?.change?.kind,context?.pending,s.choice,s.comparison]);
  useEffect(()=>{if(live.current&&(live.current.epoch!==s.status.epoch||live.current.target!==s.target)&&!live.current.applying){request.current++;live.current=null;setContext(null);}},[s.status.epoch,s.target]);
  const wasOverlay=useRef(false);
  useLayoutEffect(()=>{const overlay=!!s.choice||!!s.comparison;if(wasOverlay.current&&!overlay&&live.current)focus.current={id:live.current.id,input:desktop.inputIntent};wasOverlay.current=overlay;},[s.choice,s.comparison]);
  useEffect(()=>{const c=live.current;if(c&&!c.applying&&c.externalVersion!==s.status.externalVersion)patch({stale:true,error:"ソースが外部で変更されています。取得済みの宣言を保持しています。現在のテーブル定義を読み直してください。"});},[s.status.externalVersion]);
  function close(){const c=live.current;if(!c||c.applying)return;closed.current={epoch:c.epoch,target:c.target,input:desktop.inputIntent,origin:c.origin};request.current++;patch({closing:true});}
  async function load(c:Context) {
    const mine=++request.current;patch({pending:true,error:null});
    try {
      const reply=await desktop.rpc<TableDeclarationSnapshot>({kind:"tableDeclarationDetail",epoch:c.epoch,source:c.source,table:c.table});
      if(mine===request.current&&current(c)&&reply.host.epoch===c.epoch){
        const occurrence=c.requestedField===undefined?-1:reply.data.detail.fields.findIndex(f=>f.name===c.requestedField);
        patch({snapshot:reply.data,change:occurrence>=0&&c.tab==="fields"?{kind:"setFieldKey",occurrence,key:String(reply.data.detail.fields[occurrence].key)}:null,requestedField:undefined,pending:false,stale:false,externalVersion:desktop.surface.status.externalVersion});
      }
    }catch(e){if(mine===request.current&&current(c))patch({pending:false,error:errorText(e),stale:true});}
  }
  async function open(field?:string,tab="fields") {
    const expected=s.projection,input=desktop.inputIntent;
    if(s.pending||s.busy||s.status.recoveryRequired||s.uncertainField||!expected||!(await desktop.commit()))return;
    const p=desktop.surface.projection;if(!p||p.sessionEpoch!==expected.sessionEpoch||p.clicked!==expected.clicked||p.sessionEpoch!==desktop.surface.status.epoch||p.clicked!==desktop.surface.target||desktop.surface.pending)return;
    const c:Context={id:++ids.current,epoch:p.sessionEpoch,target:p.clicked,source:p.table.source,table:p.table.name,snapshot:null,change:null,pending:true,applying:false,closing:false,error:null,stale:false,referenceKey:null,externalVersion:desktop.surface.status.externalVersion,tab,requestedField:field,origin:field&&document.activeElement instanceof HTMLElement?document.activeElement:document.querySelector<HTMLElement>('button[aria-label="テーブルの操作"]')};
    focus.current={input,id:c.id};live.current=c;setContext(c);await load(c);
  }
  function change(value:TableDeclarationChange|null){request.current++;if(live.current)focus.current={id:live.current.id,input:desktop.inputIntent};
    const previous=live.current?.change;const referenceKey=value?.kind==="editReference"&&previous?.kind!=="editReference"?live.current?.snapshot?.detail.references[value.occurrence]?.selectedKey??null:value?.kind==="addReference"&&previous?.kind!=="addReference"?null:live.current?.referenceKey??null;
    patch({change:value,error:null,referenceKey});}
  async function commit() {
    const c=live.current,d=c?.snapshot?.detail;if(!c||!d||!c.change||c.pending||c.applying||!current(c))return;
    patch({applying:true,error:null});
    const ok=await desktop.operation(async()=>{
      if(!current(c))throw new Error('テーブル定義の編集対象が変更されています。');
      desktop.focusSchema();
      return {kind:'authorTable',epoch:c.epoch,command:{table:d.table,source:d.source,identity:d.identity,change:c.change}};
    });
    if(current(c)){
      patch({applying:false});focus.current={input:desktop.inputIntent,id:c.id};
      if(ok)await load(c);else patch({error:desktop.surface.error??'変更を適用できません。'});
    }
  }
  const c=context,d=c?.snapshot?.detail,operation=c?.change;
  const blocked=!!c&&(c.pending||c.applying||c.stale||s.status.recoveryRequired||s.pending||s.busy||!!s.uncertainField);
  const reference=operation&&"declaration" in operation?operation.declaration:null;
  const setReference=(input:Partial<ReferenceInput>)=>{if(operation&&"declaration" in operation)change({...operation,declaration:{...operation.declaration,...input}});};
  const newReference=():ReferenceInput=>({name:"",fields:[],targetTable:"",targetFields:[],csharpName:null});
  const footer=c&&<Space><Button disabled={c.applying} onClick={close}>閉じる</Button>
    {c.stale&&<Button icon={<ReloadOutlined/>} disabled={c.applying||c.pending} onClick={()=>void load(c)}>テーブル定義を再取得</Button>}
    {operation&&<><Button disabled={c.pending||c.applying} onClick={()=>change(null)}>定義に戻る</Button><Button aria-label='テーブル宣言の変更を適用' type='primary' loading={c.applying} disabled={blocked} onClick={()=>void commit()}>変更</Button></>}
  </Space>;
  const ordered=(label:string,values:string[],options:string[],update:(v:string[])=>void)=><Form.Item label={`${label} · 選択順`}><Select showSearch optionFilterProp="label" aria-label={label} mode="multiple" value={values} disabled={blocked} options={options.map(value=>({value,label:`${value} (${d?.fields.find(field=>field.name===value)?.typeName??"?"}${d?.fields.find(field=>field.name===value)?.array?"[]":d?.fields.find(field=>field.name===value)?.nullable?"?":""})`}))} onChange={update}/></Form.Item>;
  const control=(label:string,changeValue:TableDeclarationChange,remove=false)=><Button type="text" size="small" aria-label={label} title={label} danger={remove} icon={remove?<DeleteOutlined aria-hidden="true"/>:<EditOutlined aria-hidden="true"/>} disabled={blocked} onClick={()=>change(changeValue)}/>;
  const openRef=useRef(open);openRef.current=open;
  const openColumn=useCallback((field:string,tab:"fields"|"keys"|"references")=>{void openRef.current(field,tab);},[]);
  return {open,openColumn,drawer:<Drawer title={operation?`${labels[operation.kind]} · ${c?.table}`:`${uiTerms.tableDefinition} · ${c?.table??""}`} open={!!c&&!c.closing&&!s.comparison&&!s.choice} size={620} closable={!c?.applying} keyboard={!c?.applying} mask={{closable:!c?.applying}} onClose={close} focusable={{focusTriggerAfterClose:false}} destroyOnHidden={false} footer={footer} afterOpenChange={visible=>{
    if(!visible){if(live.current?.closing){live.current=null;setContext(null);const r=closed.current;if(r&&r.epoch===desktop.surface.status.epoch&&r.target===desktop.surface.target&&r.input===desktop.inputIntent)(r.origin?.isConnected?r.origin:document.querySelector<HTMLElement>("button[aria-label=\"テーブルの操作\"]"))?.focus();}return;}
    const f=focus.current;if(!f||f.id!==live.current?.id||f.input!==desktop.inputIntent)return;
    focusDetail();
  }}>
    <div className="table-declarations">
      <Typography.Paragraph type="secondary">{c?.source}</Typography.Paragraph>
      {c?.pending&&!d?<Spin/>:d&&!operation?<Tabs size="small" activeKey={c.tab} onChange={tab=>patch({tab})} destroyOnHidden items={[
        {key:"fields",label:"MessagePackキー",children:<Table size="small" rowKey="occurrence" pagination={{pageSize:20,hideOnSinglePage:true}} dataSource={d.fields.map((f,occurrence)=>({...f,occurrence}))} columns={[{title:"フィールド",dataIndex:"name"},{title:"キー",dataIndex:"key"},{title:"",width:44,render:(_,f)=>control(`編集: ${f.name} MessagePackキー`,{kind:"setFieldKey",occurrence:f.occurrence,key:String(f.key)})}]}/>},
        {key:"keys",label:"キー",children:<Space direction="vertical" className="declaration-section">
          <Flex align="center" justify="space-between"><span><Typography.Text strong>主キー</Typography.Text><Typography.Paragraph>{keyLabel(d.primary)}</Typography.Paragraph></span>{control("主キーを編集",{kind:"setPrimaryKey",fields:d.primary.fields})}</Flex>
          <Flex align="center" justify="space-between"><Typography.Text strong>副キー</Typography.Text><Button size="small" icon={<PlusOutlined aria-hidden="true"/>} disabled={blocked} onClick={()=>change({kind:"addSecondaryKey",fields:[],nonUnique:false})}>キーを追加</Button></Flex>
          <Table size="small" showHeader={false} rowKey="occurrence" pagination={{pageSize:20,hideOnSinglePage:true}} dataSource={d.secondary.map((key,occurrence)=>({...key,occurrence}))} locale={{emptyText:<Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="副キーなし"/>}} columns={[{render:(_,key)=>keyLabel(key)},{width:78,render:(_,key)=><Space size={0}>{control(`副キーを編集: ${key.occurrence+1}`,{kind:"editSecondaryKey",occurrence:key.occurrence,fields:key.fields,nonUnique:key.nonUnique})}{control(`副キーを削除: ${key.occurrence+1}`,{kind:"removeSecondaryKey",occurrence:key.occurrence},true)}</Space>}]}/>
        </Space>},
        {key:"references",label:"参照",children:<Space direction="vertical" className="declaration-section"><Button size="small" icon={<PlusOutlined aria-hidden="true"/>} disabled={blocked} onClick={()=>change({kind:"addReference",declaration:newReference()})}>参照を追加</Button>
          <Table size="small" showHeader={false} rowKey="occurrence" pagination={{pageSize:20,hideOnSinglePage:true}} dataSource={d.references} locale={{emptyText:<Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="参照なし"/>}} columns={[{render:(_,ref:ReferenceDetail)=><ReferenceSummary reference={ref}/>},{width:78,render:(_,ref:ReferenceDetail)=><Space size={0}>{control(`編集: ${ref.declaration.name} 参照`,{kind:"editReference",occurrence:ref.occurrence,declaration:ref.declaration})}{control(`削除: ${ref.declaration.name} 参照`,{kind:"removeReference",occurrence:ref.occurrence},true)}</Space>}]}/>
        </Space>},
      ]}/>:d&&operation?<Form layout="vertical" className={`table-declaration-operation${reference?" reference-operation":""}`} disabled={blocked} onKeyDown={e=>{if(e.key==="Enter"&&!e.nativeEvent.isComposing&&e.target instanceof HTMLInputElement&&e.target.getAttribute('role')!=="combobox"){e.preventDefault();void commit();}}}>
        {operation.kind==="setFieldKey"&&<Form.Item label={`MessagePackキー · ${d.fields[operation.occurrence]?.name}`}><Input aria-label="MessagePackキー" inputMode="numeric" value={operation.key} onChange={e=>change({...operation,key:e.target.value})}/></Form.Item>}
        {"fields" in operation&&ordered("キーのフィールド",operation.fields,d.keyFields,fields=>change({...operation,fields}))}
        {"nonUnique" in operation&&<Form.Item><Checkbox checked={operation.nonUnique} onChange={e=>change({...operation,nonUnique:e.target.checked})}>重複を許可</Checkbox></Form.Item>}
        {reference&&<><div className="reference-context"><Typography.Text strong>{reference.name||"参照"}</Typography.Text><Typography.Text type="secondary">{c.table} ({reference.fields.join(" → ")||"未選択"}) → {reference.targetTable||"未選択"} ({reference.targetFields.join(" → ")||"未選択"})</Typography.Text></div><Form.Item label="参照名"><Input aria-label="参照名" value={reference.name} onChange={e=>setReference({name:e.target.value})}/></Form.Item>
          {ordered("参照元のフィールド",reference.fields,d.referenceFields,fields=>setReference({fields}))}
          <Form.Item label="参照先のテーブル"><Select showSearch optionFilterProp="label" aria-label="参照先のテーブル" value={reference.targetTable||undefined} options={d.targets.map(t=>({value:t.table,label:t.table}))} onChange={targetTable=>{setReference({targetTable,targetFields:[]});patch({referenceKey:null});}}/></Form.Item>
          <Form.Item label="参照先のキー"><Select showSearch optionFilterProp="label" aria-label="参照先のキー" value={c?.referenceKey??undefined} options={(d.targets.find(t=>t.table===reference.targetTable)?.keys??[]).map((key,value)=>({value,label:keyLabel(key)}))} onChange={index=>{const key=d.targets.find(t=>t.table===reference.targetTable)?.keys[index];if(key){setReference({targetFields:key.fields});patch({referenceKey:index});}}}/></Form.Item>
          <Form.Item label="C#ヘルパー名の指定（任意）"><Input aria-label="参照ヘルパー名の指定" value={reference.csharpName??""} placeholder="既定のヘルパー名" onChange={e=>setReference({csharpName:e.target.value||null})}/></Form.Item>
        </>}
        {(operation.kind==="removeReference"||operation.kind==="removeSecondaryKey")&&<Alert type="warning" showIcon title="対象宣言を削除" description={operation.kind==="removeReference"?d.references[operation.occurrence]?.declaration.name:keyLabel(d.secondary[operation.occurrence])}/>}
      </Form>:null}
      {!!d?.diagnostics.length&&<Alert type="warning" showIcon title="宣言の問題" description={d.diagnostics.slice(0,8).map((p,i)=><div key={i}>{p.code}: {uiMessage(p.message)}</div>)}/>}
      {c?.error&&<Alert type="error" showIcon title="変更を適用できません" description={uiMessage(c.error)}/>}
    </div>
  </Drawer>};
}
function ReferenceSummary({reference:r}:{reference:ReferenceDetail}) {
  return <Flex vertical gap="small" className="type-plan-file"><Typography.Text strong>{r.table} · {r.declaration.name}</Typography.Text><Typography.Text type="secondary">{r.declaration.fields.join(" → ")} → {r.declaration.targetTable} ({r.declaration.targetFields.join(" → ")})</Typography.Text><Space><Tag>{r.helper}</Tag>{r.multi!==null&&<Tag>{r.multi?"複数":"単一"}</Tag>}{r.optional!==null&&<Tag>{r.optional?"任意":"必須"}</Tag>}</Space>{r.problem&&<Typography.Text type="danger">{uiMessage(r.problem)}</Typography.Text>}</Flex>;
}
