import {useEffect,useRef,useState} from "react";
import {Alert,Button, Checkbox, Empty, Flex, Pagination, Space, Tag, Typography} from "antd";
import {DeleteOutlined, PlusOutlined, RightOutlined} from "@ant-design/icons";
import {errorText} from "./workspace";
import {uiMessage} from "./language";
import type {ConstantInput, Shape} from "./types";
import {isBooleanShape,ScalarValueControl} from "./value-control";
import {ValuePath} from "./value-path";
const unset:ConstantInput={kind:"unset"};
type Step=string|number;
function element(shape:Shape):Shape{return {...shape,array:false,nullable:false};}
function child(shape:Shape,key:Step):Shape{return typeof key==="number"?element(shape):shape.fields!.find(([f])=>f.name===key)![1];}
function at(input:ConstantInput,path:Step[]):ConstantInput {
  if(!path.length)return input;
  const [key,...rest]=path;
  const next=typeof key==="number"&&input.kind==="sequence"?input.value[key]:typeof key==="string"&&input.kind==="mapping"?input.value.find(([name])=>name===key)?.[1]:undefined;
  return at(next??unset,rest);
}
function replace(input:ConstantInput,path:Step[],value:ConstantInput):ConstantInput {
  if(!path.length)return value;
  const [key,...rest]=path;
  if(typeof key==="number"&&input.kind==="sequence")return {...input,value:input.value.map((old,i)=>i===key?replace(old,rest,value):old)};
  if(typeof key==="string"&&input.kind==="mapping")return {...input,value:input.value.map(([name,old]):[string,ConstantInput]=>[name,name===key?replace(old,rest,value):old])};
  return input;
}
const summary=(v:ConstantInput)=>v.kind==="scalar"?v.text:v.kind==="unset"?"未入力":v.kind==="null"?"null":`${v.value.length} ${v.kind==="sequence"?"要素":"フィールド"}`;

// One level is mounted at a time, with sixteen children per page. The shared
// resolved shape chooses controls; Rust alone interprets and validates input.
type InitializerAction={kind:'materialize'}|{kind:'flag';symbol:string;enabled:boolean;members:string[]};
export function TypedInitializer({shape,value,onChange,request,disabled=false}:{shape:Shape;value:ConstantInput;onChange:(v:ConstantInput)=>void;request:(path:Step[],action:InitializerAction)=>Promise<ConstantInput>;disabled?:boolean}) {
  const [path,setPath]=useState<Step[]>([]),[page,setPage]=useState(1);
  const current=at(value,path),resolved=path.reduce(child,shape);
  const set=(v:ConstantInput)=>onChange(replace(value,path,v));
  const open=(key:Step)=>{setPath([...path,key]);setPage(1);};
  const [pending,setPending]=useState(false),[error,setError]=useState<string|null>(null),alive=useRef(true);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  disabled=disabled||pending;
  async function apply(action:InitializerAction,append=false){if(disabled)return;setPending(true);setError(null);try{const next=await request(append?[...path,entries.length]:path,action);if(alive.current){if(append&&current.kind==='sequence'){set({...current,value:[...current.value,next]});setPage(Math.floor(current.value.length/16)+1);}else set(next);}}catch(e){if(alive.current)setError(uiMessage(errorText(e)));}finally{if(alive.current)setPending(false);}}
  const materialize=()=>void apply({kind:'materialize'});
  const entries=current.kind==="sequence"?current.value.map((v,i)=>({key:i,label:String(i+1),value:v})):current.kind==="mapping"?current.value.map(([name,v])=>({key:name,label:name,value:v})):[];
  const visiblePage=Math.min(page,Math.max(1,Math.ceil(entries.length/16)));
  return <div className="typed-initializer" aria-label="型に合わせた初期値">
    {error&&<Alert type="error" showIcon title={error}/>}
    <Flex gap={8} align="center" className="initializer-heading">
      <ValuePath items={['初期値',...path.map(key=>typeof key==='number'?String(key+1):key)].map((label,index)=>({label,key:JSON.stringify(path.slice(0,index))}))} onSelect={index=>{setPath(path.slice(0,index));setPage(1);}} backLabel='親の初期値に戻る' rootLabel='初期値全体に戻る'/>
      <Tag>{resolved.typeName}{resolved.array?"[]":resolved.nullable?"?":""}</Tag>
      <Space className="initializer-actions"><Button type="text" disabled={disabled} onClick={()=>set(unset)}>未設定</Button>{resolved.nullable&&<Button type="text" disabled={disabled} onClick={()=>set({kind:"null"})}>nullを使用</Button>}</Space>
    </Flex>
    {current.kind==="unset"||current.kind==="null"&&!isBooleanShape(resolved)?<Flex gap={12} align="center"><Typography.Text type="secondary">{summary(current)}</Typography.Text><Button disabled={disabled} onClick={materialize}>値を入力</Button></Flex>
    :resolved.category==="flags"&&!resolved.array&&current.kind==="sequence"?<Space wrap>{(resolved.members??[]).map(symbol=><Checkbox key={symbol} disabled={disabled} checked={current.value.some(v=>v.kind==='scalar'&&v.text===symbol)} onChange={e=>void apply({kind:'flag',symbol,enabled:e.target.checked,members:current.value.flatMap(v=>v.kind==='scalar'?[v.text]:[])})}>{symbol}</Checkbox>)}</Space>
    :current.kind==="scalar"||current.kind==="null"?<ScalarValueControl shape={resolved} value={current.kind==='null'?null:current.text} label="初期値" disabled={disabled} onChange={text=>set(text===null?{kind:'null'}:{kind:'scalar',text})}/>
    :<>
      {entries.length===0&&<Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="空の配列"/>}
      <div role="list" aria-label="初期値の要素">{entries.slice((visiblePage-1)*16,visiblePage*16).map(entry=><Flex key={entry.key} role="listitem" align="center" className="initializer-child"><Button type="text" disabled={disabled} onClick={()=>open(entry.key)}><Typography.Text>{entry.label}</Typography.Text><Typography.Text type="secondary">{summary(entry.value)}</Typography.Text><RightOutlined aria-hidden="true"/></Button>{current.kind==="sequence"&&<Button type="text" disabled={disabled} icon={<DeleteOutlined aria-hidden="true"/>} aria-label={`初期値の要素を削除: ${entry.label}`} onClick={()=>set({...current,value:current.value.filter((_,i)=>i!==entry.key)})}/>}</Flex>)}</div>
      {entries.length>16&&<Pagination size="small" simple current={visiblePage} pageSize={16} total={entries.length} onChange={setPage}/>}
      {resolved.array&&current.kind==="sequence"&&<Button icon={<PlusOutlined aria-hidden="true"/>} disabled={disabled} onClick={()=>void apply({kind:"materialize"},true)}>要素を追加</Button>}
    </>}
  </div>;
}
