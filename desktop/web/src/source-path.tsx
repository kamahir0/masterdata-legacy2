import {uiMessage, statusLabel, sourceFolderLabel} from './language';
import {useEffect, useLayoutEffect, useRef, useState} from 'react';
import {Alert, Button, Flex, Form, Input, Modal, Select, Space, Spin, Typography} from 'antd';
import {CloseOutlined} from '@ant-design/icons';
import {desktop} from './workspace';
import {parentPath, stemEnd} from './explorer-model';

type Choices = {root:string;folders:string[];filename:string};
type Review = {token:string;source:string;destination:string};
type Result = {source:string;outcome:string;message:string};
type Draft = {id:number;source:string;folder:string;filename:string;choices:Choices;inline:boolean;review:Review|null;pending:boolean;committing:boolean;result:Result|null;error:string|null};
const join = (folder:string,filename:string) => folder && folder!=='.' ? folder+'/'+filename : filename;
const errorText = (error:unknown) => error&&typeof error==='object'&&'message' in error ? ('code' in error?String(error.code)+': ':'')+String(error.message) : String(error);

// The form owns an explicit destination and an opaque review token. Rust owns
// path safety, current source identity, exclusive commit and result recovery.
export function useSourcePath(epoch:number,onMoved:(source:string,destination:string,inputIntent:number,focus:boolean)=>void) {
  const [draft,setDraft]=useState<Draft|null>(null);
  const live=useRef(draft);live.current=draft;
  const version=useRef(0),ids=useRef(0),running=useRef(false);
  const queued=useRef<{draft:Draft;version:number;epoch:number;resolve:()=>void}|null>(null);
  const validation=useRef<Promise<void>>(Promise.resolve()),submitting=useRef(false),composing=useRef(false);
  const filename=useRef<HTMLInputElement|null>(null),inlineElement=useRef<HTMLDivElement|null>(null),origin=useRef<HTMLElement|null>(null);
  const restoreFocus=useRef<{epoch:number;intent:number;target:string;editor:boolean;rename:boolean}|null>(null);
  // WebKit can clear document focus when the previously focused filename is
  // disabled or removed. Preserve a newer editor gesture across that update.
  useLayoutEffect(()=>{
    const restore=restoreFocus.current;
    if(!restore||restore.epoch!==epoch||restore.intent!==desktop.inputIntent||restore.target!==desktop.surface.target||document.activeElement!==document.body)return;
    if(restore.editor)document.getElementById('editor-pane')?.focus({preventScroll:true});
    else if(restore.rename&&!live.current?.committing){
      if(live.current?.result?.outcome==='OutcomeUnknown')inlineElement.current?.querySelector<HTMLButtonElement>('button:not([disabled])')?.focus();
      else filename.current?.focus();
    }
  });
  const protection='source-path:'+epoch;
  const patch=(change:Partial<Draft>)=>{if(live.current){live.current={...live.current,...change};setDraft(live.current);}};
  useEffect(()=>{restoreFocus.current=null;version.current++;ids.current++;queued.current?.resolve();queued.current=null;live.current=null;setDraft(null);},[epoch]);
  useLayoutEffect(()=>{
    if(!draft?.inline)return;
    const id=draft.id,intent=desktop.inputIntent;
    const frame=requestAnimationFrame(()=>{
      if(live.current?.id!==id||intent!==desktop.inputIntent)return;
      filename.current?.focus();filename.current?.setSelectionRange(0,stemEnd(live.current.filename));
    });
    return()=>cancelAnimationFrame(frame);
  },[draft?.id,draft?.inline]);
  async function begin(source:string,options:{inline?:boolean;folder?:string}={}) {
    const id=++ids.current;
    origin.current=document.activeElement as HTMLElement;composing.current=false;
    try {
      if(!(await desktop.guardSource(source,epoch))||id!==ids.current)return;
      const reply=await desktop.rpc<Choices>({kind:'pathMoveChoices',epoch,source});
      if(epoch!==desktop.surface.status.epoch||id!==ids.current)return;
      const next:Draft={id,source,folder:options.folder??parentPath(source),filename:reply.data.filename,choices:reply.data,inline:!!options.inline,review:null,pending:true,committing:false,result:null,error:null};
      live.current=next;setDraft(next);review(next);
    } catch(error) {if(epoch===desktop.surface.status.epoch)desktop.showError(error);}
  }
  function review(next=live.current) {
    if(!next)return;
    const mine=++version.current;
    patch({review:null,pending:true,result:null,error:null});
    validation.current=new Promise<void>(resolve=>{
      queued.current?.resolve();queued.current={draft:next,version:mine,epoch,resolve};void drain();
    });
  }
  async function drain() {
    if(running.current)return;
    running.current=true;
    try {
      while(queued.current) {
        const request=queued.current;queued.current=null;
        try {
          const reply=await desktop.rpc<Review>({kind:'pathMovePreview',epoch:request.epoch,source:request.draft.source,destination:join(request.draft.folder,request.draft.filename)});
          if(request.version===version.current&&request.epoch===desktop.surface.status.epoch&&live.current?.id===request.draft.id)patch({review:reply.data,pending:false});
        } catch(error) {
          if(request.version===version.current&&request.epoch===desktop.surface.status.epoch&&live.current?.id===request.draft.id)patch({error:errorText(error),pending:false});
        } finally {request.resolve();}
      }
    } finally {running.current=false;}
  }
  function change(change:Partial<Draft>) {if(live.current){patch(change);review(live.current);}}
  function cancel(restore=true) {
    if(live.current?.committing||live.current?.result?.outcome==='OutcomeUnknown')return;
    version.current++;ids.current++;queued.current?.resolve();queued.current=null;live.current=null;setDraft(null);
    if(restore&&origin.current?.isConnected)origin.current.focus();
  }
  async function apply(focus=true) {
    const current=live.current;
    if(!current||current.pending||current.committing||!current.review)return;
    const focused=document.activeElement;
    restoreFocus.current={epoch,intent:desktop.inputIntent,target:desktop.surface.target,editor:!!focused?.closest('#editor-pane'),rename:focused===filename.current};
    const token=current.review.token,inputIntent=desktop.inputIntent,recheck=current.result?.outcome==='OutcomeUnknown';
    version.current++;queued.current?.resolve();queued.current=null;desktop.protectWriteView(protection,true);patch({committing:true,error:null});
    try {
      const reply=await desktop.rpc<Result>({kind:recheck?'recheckMove':'moveSource',epoch,token});
      if(epoch!==desktop.surface.status.epoch||live.current?.id!==current.id)return;
      desktop.protectWriteView(protection,reply.data.outcome==='OutcomeUnknown');
      patch({committing:false,result:reply.data,review:reply.data.outcome==='OutcomeUnknown'?current.review:null});
      if(reply.data.outcome==='Success') {
        const restore=restoreFocus.current;
        if(restore?.editor&&restore.intent===desktop.inputIntent&&restore.target===desktop.surface.target&&document.activeElement===document.body)document.getElementById('editor-pane')?.focus({preventScroll:true});
        live.current=null;setDraft(null);
        await desktop.sourceMoved(current.source,current.review.destination,epoch);
        await desktop.refreshInventory();
        if(epoch===desktop.surface.status.epoch)onMoved(current.source,current.review.destination,inputIntent,focus);
        restoreFocus.current=null;
      } else await desktop.refreshInventory();
    } catch(error) {
      if(epoch===desktop.surface.status.epoch&&live.current?.id===current.id) {
        const knownRejection=error&&typeof error==='object'&&'code' in error;
        desktop.protectWriteView(protection,recheck||!knownRejection);
        patch({committing:false,review:recheck||!knownRejection?current.review:null,error:errorText(error),result:!knownRejection?{source:current.source,outcome:'OutcomeUnknown',message:'結果を受信できませんでした。変更前・変更後のパスを再確認してください。'}:current.result});
      }
    }
  }
  async function finish(explicit=false) {
    const current=live.current;
    if(!current?.inline||current.committing||composing.current||submitting.current||current.result?.outcome==='OutcomeUnknown')return;
    if(!current.filename.trim()||current.filename===current.choices.filename){cancel(explicit);return;}
    if(!explicit&&(current.error||current.result))return;
    submitting.current=true;
    try {
      if(!current.pending&&!current.review)review();
      let pending:Promise<void>;
      do{pending=validation.current;await pending;}while(pending!==validation.current);
      if(live.current?.id===current.id&&epoch===desktop.surface.status.epoch)await apply(explicit);
    }finally{submitting.current=false;}
  }
  const finishRef=useRef(finish);finishRef.current=finish;
  useEffect(()=>{
    if(!draft?.inline)return;
    const outside=(event:PointerEvent)=>{if(event.target instanceof Element&&!inlineElement.current?.contains(event.target))void finishRef.current();};
    document.addEventListener('pointerdown',outside);return()=>document.removeEventListener('pointerdown',outside);
  },[draft?.id,draft?.inline]);
  const uncertain=draft?.result?.outcome==='OutcomeUnknown';
  const feedback=draft&&<Flex vertical gap={4}>
    {draft.error&&<Alert type='error' showIcon title={uiMessage(draft.error)}/>}
    {draft.result&&<Alert type={uncertain?'warning':'error'} showIcon title={uncertain?'結果を確認できません':statusLabel(draft.result.outcome)} description={uiMessage(draft.result.message)}/>}
  </Flex>;
  const inline=draft?.inline&&<div ref={inlineElement} className='source-path-inline' onClick={e=>e.stopPropagation()} onKeyDown={e=>e.stopPropagation()}>
    <div className='explorer-input-row'>
      <Input aria-label='変更後のファイル名' ref={r=>{filename.current=r?.input??null;}} value={draft.filename} disabled={draft.committing||uncertain} status={draft.error||draft.result?'error':undefined}
        suffix={<span className='creation-pending'>{draft.pending||draft.committing?<Spin size='small'/>:null}</span>}
        onChange={e=>change({filename:e.target.value})} onCompositionStart={()=>{composing.current=true;}} onCompositionEnd={()=>{composing.current=false;}}
        onKeyDown={e=>{if(e.nativeEvent.isComposing||composing.current||e.keyCode===229)return;if(e.key==='Escape'){e.preventDefault();cancel();}else if(e.key==='Enter'||e.key==='Tab'){if(e.key==='Enter')e.preventDefault();void finish(e.key==='Enter');}}}/>
      <Button type='text' size='small' icon={<CloseOutlined aria-hidden='true'/>} aria-label='名前変更をキャンセル' title='名前変更をキャンセル（Escape）' disabled={draft.committing||uncertain} onClick={()=>cancel()}/>
    </div>
    {feedback}
    {uncertain&&<Button loading={draft.committing} onClick={()=>void apply()}>変更前・変更後のパスを再確認</Button>}
  </div>;
  const modal=draft&&!draft.inline&&<Modal title='ソースの名前変更・移動' open width={520} focusTriggerAfterClose={false} afterOpenChange={open=>{if(open){filename.current?.focus();filename.current?.setSelectionRange(0,stemEnd(draft.filename));}}} onCancel={()=>cancel()} keyboard={!draft.committing&&!uncertain} mask={{closable:!draft.committing&&!uncertain}} footer={<Space>
    <Button onClick={()=>cancel()} disabled={draft.committing||uncertain}>キャンセル</Button>
    {!uncertain&&!draft.review&&!draft.pending&&<Button onClick={()=>review()}>現在のソースを確認</Button>}
    <Button type='primary' loading={draft.committing||draft.pending} disabled={draft.pending||!draft.review} onClick={()=>void apply()}>{uncertain?'変更前・変更後のパスを再確認':'移動'}</Button>
  </Space>}>
    <Typography.Paragraph type='secondary' className='source-path-origin'>{draft.source}</Typography.Paragraph>
    <Form layout='vertical' disabled={draft.committing||uncertain}>
      <Form.Item label='フォルダー'>{draft.choices.folders.length>1?<Select aria-label='ソースの移動先フォルダー' value={draft.folder} options={draft.choices.folders.map(folder=>({value:folder,label:sourceFolderLabel(folder,draft.choices.root),title:folder}))} onChange={folder=>change({folder})}/>:<Typography.Text aria-label='ソースの移動先フォルダー' title={draft.folder}>{sourceFolderLabel(draft.folder,draft.choices.root)}</Typography.Text>}</Form.Item>
      <Form.Item label='ファイル名'><Input aria-label='移動後のソースファイル名' ref={r=>{filename.current=r?.input??null;}} value={draft.filename} onChange={e=>change({filename:e.target.value})} onKeyDown={e=>{if(e.nativeEvent.isComposing)return;if(e.key==='Enter'){e.preventDefault();void apply();}}}/></Form.Item>
    </Form>
    <Typography.Paragraph type='secondary'>{join(draft.folder,draft.filename)}</Typography.Paragraph>
    {feedback}
  </Modal>;
  return {begin,modal,inline,draft,open:!!draft};
}
