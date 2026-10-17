import {useEffect,useRef,useState} from 'react';
import {Alert,Button,Drawer,Select,Spin,Typography} from 'antd';
import {desktop,errorText,basename} from './workspace';
import {uiMessage,statusLabel,sourceFolderLabel} from './language';
type Operation='move'|'copy'|'trash';
type Item={source:string;destination:string;receipt:string|null;result:{outcome:string;message:string}};
type Result={token:string;items:Item[]};
type Attempt={token:string;epoch:number;operation:Operation;intent:number;items:Item[];error:string|null};
export function useExplorerActions(epoch:number,changed:(items:Item[],operation:Operation,intent:number)=>void,restored:(items:Item[],intent:number)=>void){
  const [clipboard,setClipboard]=useState<{paths:string[];cut:boolean}|null>(null),[busy,setBusy]=useState(false),[attempt,setAttempt]=useState<Attempt|null>(null),[details,setDetails]=useState(false),[deleted,setDeleted]=useState<Item[]>([]);
  const [restorePending,setRestorePending]=useState(false);
  const [move,setMove]=useState<{paths:string[];folder:string}|null>(null);
  const running=useRef(false),live=useRef(attempt);live.current=attempt;
  const acknowledged=useRef(new Set<string>()),lastEpoch=useRef(epoch);
  useEffect(()=>{lastEpoch.current=epoch;setClipboard(null);setAttempt(null);setDeleted([]);setMove(null);setDetails(false);setRestorePending(false);acknowledged.current.clear();},[epoch]);
  const pending=attempt?.items.some(item=>item.result.outcome==='OutcomeUnknown')||!!attempt?.error;
  const protection=(token:string)=>`entry-batch:${epoch}:${token}`;
  async function accept(state:Attempt,result:Result){
    const unknown=result.items.some(i=>i.result.outcome==='OutcomeUnknown');desktop.protectWriteView(protection(state.token),unknown);
    if(lastEpoch.current!==state.epoch)return;
    const next={...state,items:result.items,error:null};live.current=next;setAttempt(next);
    const fresh=result.items.filter(item=>item.result.outcome==='Success'&&!acknowledged.current.has(state.token+':'+item.source));
    fresh.forEach(item=>acknowledged.current.add(state.token+':'+item.source));
    try{if(state.operation==='move')await desktop.sourcesMoved(fresh.map(i=>({source:i.source,destination:i.destination})),epoch);
    if(state.operation==='trash'){for(const item of fresh)await desktop.sourceRemoved(item.source,epoch,false);if(fresh.length)setDeleted(previous=>[...previous.filter(p=>!fresh.some(i=>i.receipt===p.receipt)),...fresh]);}
    await desktop.refreshInventory();
    }catch(e){desktop.showError('ファイル操作後の表示更新に失敗しました。'+errorText(e));}
    changed(fresh,state.operation,state.intent);
    if(unknown||result.items.some(i=>i.result.outcome!=='Success'))setDetails(true);
    if(state.operation==='move')setClipboard(old=>{if(!old?.cut)return old;const paths=old.paths.filter(path=>!fresh.some(i=>path===i.source||path.startsWith(i.source+'/')));return paths.length?{...old,paths}:null;});
  }
  async function run(operation:Operation,paths:string[],folder?:string){
    if(pending||restorePending){desktop.showError('先のファイル操作の結果を再確認してください。');setDetails(true);return;}
    if(running.current){desktop.showError('ファイル操作が進行中です。完了後に再操作してください。');return;}
    running.current=true;setBusy(true);let state:Attempt|null=null;
    try{
      if(operation!=='copy'&&!(await desktop.guardEntries(paths,epoch)))return;
      if(operation==='trash'&&await desktop.choose('ファイル・フォルダーを削除',paths.map(basename).join('\n')+'\n削除した項目は元に戻せます。',['Delete','Cancel'])!=='Delete')return;
      if(epoch!==desktop.surface.status.epoch)return;
      const review=await desktop.rpc<{token:string;items:[string,string][]}>({kind:'entryBatchPreview',epoch,operation,sources:paths,folder:folder??null});
      state={token:review.data.token,epoch,operation,intent:desktop.inputIntent,items:[],error:null};live.current=state;setAttempt(state);
      desktop.protectWriteView(protection(state.token),true);
      const result=await desktop.rpc<Result>({kind:'entryBatchApply',epoch,token:state.token});
      await accept(state,result.data);
    }catch(e){
      const known=!!e&&typeof e==='object'&&'code' in e;
      if(state&&!known){const next={...state,error:'結果を受信できませんでした。状態を再確認してください。'};live.current=next;setAttempt(next);setDetails(true);}
      else{if(state)desktop.protectWriteView(protection(state.token),false);desktop.showError(e);}
    }finally{running.current=false;if(epoch===desktop.surface.status.epoch)setBusy(false);}
  }
  async function recheck(){const a=live.current;if(!a||running.current)return;running.current=true;setBusy(true);try{await accept(a,(await desktop.rpc<Result>({kind:'entryBatchRecheck',epoch,token:a.token})).data);}catch(e){setAttempt({...a,error:uiMessage(errorText(e))});}finally{running.current=false;setBusy(false);}}
  async function recheckRestores(){try{const reply=await desktop.rpc<{id:string;state:string}[]>({kind:'sourceTrash',epoch});const unknown=reply.data.some(e=>e.state==='OutcomeUnknown');desktop.protectWriteView(`entry-restore:${epoch}`,unknown);setRestorePending(unknown);setDeleted(old=>old.filter(item=>reply.data.some(e=>e.id===item.receipt)));await desktop.refreshInventory();}catch(e){desktop.showError(e);}}
  async function restore(){
    if(running.current)return;running.current=true;setBusy(true);const intent=desktop.inputIntent,complete:Item[]=[];
    try{
      for(const item of deleted){if(!item.receipt)continue;desktop.protectWriteView(`entry-restore:${epoch}`,true);
        try{const reply=await desktop.rpc<{outcome:string;message:string}>({kind:'restoreSource',epoch,id:item.receipt});
          if(epoch!==desktop.surface.status.epoch)return;
          if(reply.data.outcome==='OutcomeUnknown'){setRestorePending(true);break;}
          desktop.protectWriteView(`entry-restore:${epoch}`,false);
          if(reply.data.outcome==='Success'){complete.push(item);setDeleted(old=>old.filter(i=>i.receipt!==item.receipt));}else desktop.showError(reply.data.message);
        }catch(e){if(e&&typeof e==='object'&&'code' in e)desktop.protectWriteView(`entry-restore:${epoch}`,false);else setRestorePending(true);desktop.showError(e);break;}
      }
      await desktop.refreshInventory();
      if(intent===desktop.inputIntent&&epoch===desktop.surface.status.epoch&&complete.length){
        const file=complete.find(item=>!desktop.surface.inventory?.folders.includes(item.source));
        if(file)await desktop.selectTarget(file.source);
        if(intent===desktop.inputIntent)restored(complete,intent);
      }
    }finally{running.current=false;if(epoch===desktop.surface.status.epoch)setBusy(false);}
  }
  const copy=(paths:string[],cut=false)=>setClipboard({paths,cut});
  const paste=(folder:string)=>clipboard?run(clipboard.cut?'move':'copy',clipboard.paths,folder):Promise.resolve();
  const feedback=<>{busy&&<div className='source-trash-feedback' role='status'><Spin size='small'/>ファイル操作中…</div>}
    {!!deleted.length&&<div className='source-trash-feedback' role='status'><span>{deleted.length}項目を削除</span><Button size='small' disabled={busy} onClick={()=>void(restorePending?recheckRestores():restore())}>{restorePending?'復元状態を再確認':'元に戻す'}</Button></div>}
    {pending&&<Alert type='warning' showIcon title='ファイル操作の結果を再確認してください' action={<Button size='small' disabled={busy} onClick={()=>void recheck()}>状態を再確認</Button>}/>}</>;
  const drawers=<>
    <Drawer title='ファイル操作の結果' open={details} onClose={()=>setDetails(false)} size={460} extra={pending&&<Button disabled={busy} onClick={()=>void recheck()}>状態を再確認</Button>}>
      {attempt?.error&&<Alert type='warning' title={attempt.error}/>} {attempt?.items.map(item=><div key={item.source} className='trash-entry'><Typography.Text>{item.source}{item.destination&&' → '+item.destination}</Typography.Text><Typography.Text type={item.result.outcome==='Success'?'secondary':'danger'}>{statusLabel(item.result.outcome)} · {uiMessage(item.result.message)}</Typography.Text></div>)}
    </Drawer>
    <Drawer title='選択した項目を移動' open={!!move} onClose={()=>setMove(null)} size={420} extra={<Button type='primary' disabled={busy||!move?.folder} onClick={()=>{if(move){const target=move;setMove(null);void run('move',target.paths,target.folder);}}}>移動</Button>}>
      <Typography.Paragraph>{move?.paths.map(basename).join(', ')}</Typography.Paragraph>
      <Select style={{width:'100%'}} showSearch optionFilterProp='label' aria-label='項目の移動先フォルダー' value={move?.folder} options={desktop.surface.inventory?.folders.map(value=>({value,label:sourceFolderLabel(value,desktop.surface.inventory!.sourceDirectory)}))} onChange={folder=>setMove(old=>old&&{...old,folder})}/>
    </Drawer>
  </>;
  return {busy,pending,clipboard,copy,paste,run,recheck,feedback,drawers,beginMove:(paths:string[],folder:string)=>setMove({paths,folder})};
}
