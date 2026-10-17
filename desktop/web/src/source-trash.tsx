import {useEffect,useRef,useState} from 'react';
import {Alert,Button,Drawer,Empty,Space,Typography} from 'antd';
import {desktop,basename,errorText,type Surface} from './workspace';
import {uiMessage} from './language';
type Entry={id:string;source:string;state:string};
type Result={outcome:string;message:string};
export function useSourceTrash(s:Surface,onRemoved:(source:string)=>void,onRestored:(source:string)=>void) {
  const [visible,setVisible]=useState(false),[entries,setEntries]=useState<Entry[]>([]),[last,setLast]=useState<Entry|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null);
  const running=useRef(false),epoch=s.status.epoch;
  useEffect(()=>{setVisible(false);setEntries([]);setLast(null);setError(null);},[epoch]);
  async function load() {
    const reply=await desktop.rpc<Entry[]>({kind:'sourceTrash',epoch});
    if(epoch!==desktop.surface.status.epoch)return [];
    setEntries(reply.data);desktop.protectWriteView('source-trash:'+epoch,reply.data.some(e=>e.state==='OutcomeUnknown'));
    await desktop.refreshInventory();return reply.data;
  }
  async function open(){setVisible(true);setError(null);try{await load();}catch(e){setError(uiMessage(errorText(e)));}}
  async function remove(source:string) {
    if(running.current)return;running.current=true;setBusy(true);setError(null);
    try {
      if(!(await desktop.guardSource(source,epoch,'削除前の未保存変更')))return;
      const choice=await desktop.choose('ファイルを削除',source+'をソースから削除します。削除したファイルは「削除したファイルを復元」から元の場所へ戻せます。TableやTypeへの参照は自動変更しません。',['Delete','Cancel']);
      if(choice!=='Delete'||epoch!==desktop.surface.status.epoch)return;
      desktop.protectWriteView('source-trash:'+epoch,true);
      const reply=await desktop.rpc<{receipt:Entry;result:Result}>({kind:'trashSource',epoch,source});
      if(epoch!==desktop.surface.status.epoch)return;
      if(reply.data.result.outcome==='Success'){
        setLast({...reply.data.receipt,state:'Stored'});await desktop.sourceRemoved(source,epoch);onRemoved(source);
      }else{setError(uiMessage(reply.data.result.message));setVisible(true);}
      await load();
    }catch(e){if(epoch!==desktop.surface.status.epoch)return;setError(uiMessage(errorText(e)));setVisible(true);try{const actual=await load();if(actual.some(e=>e.source===source&&e.state==='Stored')){await desktop.sourceRemoved(source,epoch);onRemoved(source);}}catch{/* Explicit Recheck stays reachable. */}}
    finally{running.current=false;setBusy(false);}
  }
  async function restore(entry:Entry) {
    if(running.current)return;running.current=true;setBusy(true);setError(null);
    const intent=desktop.inputIntent;
    try {
      desktop.protectWriteView('source-trash:'+epoch,true);
      const reply=await desktop.rpc<Result>({kind:'restoreSource',epoch,id:entry.id});
      if(epoch!==desktop.surface.status.epoch)return;
      if(reply.data.outcome==='Success') {setLast(null);await desktop.refreshInventory();if(intent===desktop.inputIntent){if(!desktop.surface.inventory?.folders.includes(entry.source))await desktop.selectTarget(entry.source);if(intent===desktop.inputIntent)onRestored(entry.source);}}
      else setError(uiMessage(reply.data.message));
      await load();
    }catch(e){if(epoch!==desktop.surface.status.epoch)return;setError(uiMessage(errorText(e)));setVisible(true);try{await load();}catch{/* Keep recheck and persisted receipt. */}}
    finally{running.current=false;setBusy(false);}
  }
  const feedback=last&&<div className='source-trash-feedback' role='status'><span title={last.source}>{basename(last.source)}を削除</span><Button size='small' disabled={busy} onClick={()=>void restore(last)}>元に戻す</Button></div>;
  const drawer=<Drawer title='削除した項目を復元' open={visible} onClose={()=>setVisible(false)} size={460} extra={<Button disabled={busy} onClick={()=>void open()}>状態を再確認</Button>}>
    <Typography.Paragraph type='secondary'>元の場所に同名ファイルがある場合は上書きしません。削除した内容はProject内に保持されています。</Typography.Paragraph>
    {error&&<Alert type='error' showIcon title={error}/>}
    {!entries.length?<Empty description='削除した項目はありません'/>:entries.map(entry=><div className='trash-entry' key={entry.id}><Typography.Text>{entry.source}</Typography.Text><Space><span>{entry.state==='Conflict'?'復元先に同名ファイルがあります':entry.state==='OutcomeUnknown'?'結果の確認が必要です':'削除済み'}</span><Button disabled={busy||entry.state!=='Stored'} onClick={()=>void restore(entry)}>復元</Button></Space></div>)}
  </Drawer>;
  return {open,remove,drawer,feedback};
}
