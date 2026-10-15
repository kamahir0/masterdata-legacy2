import {useLayoutEffect,useMemo,useRef,useState} from 'react';
import {Button,Space} from 'antd';
import {invoke} from '@tauri-apps/api/core';
import {desktop} from './workspace';
import {sourceDiff} from './source-diff';
const ROW=22;
export function SourceDiff({before,after,leftLabel,rightLabel}:{before:string;after:string;leftLabel:string;rightLabel:string}) {
  const lines=useMemo(()=>sourceDiff(before,after),[before,after]);
  const changes=useMemo(()=>lines.flatMap((line,i)=>line.changed&&!lines[i-1]?.changed?[i]:[]),[lines]);
  const width=useMemo(()=>lines.reduce((max,line)=>Math.max(max,...[line.left?.text,line.right?.text].map(text=>text?text.length+(text.match(/[\u2e80-\u9fff\uac00-\ud7af\uff00-\uffef]/g)?.length??0):0)),0),[lines]);
  const [at,setAt]=useState(-1),[copied,setCopied]=useState(''),body=useRef<HTMLDivElement>(null),[window,setWindow]=useState({top:0,height:440});
  const update=()=>{const el=body.current;if(el)setWindow({top:el.scrollTop,height:el.clientHeight});};
  useLayoutEffect(()=>{const el=body.current;if(!el)return;update();const observer=new ResizeObserver(update);observer.observe(el);return()=>observer.disconnect();},[]);
  async function copy(side:'before'|'after'){try{await invoke('clipboard_text',{text:side==='before'?before:after});setCopied(side);}catch(error){desktop.showError(error);}}
  function jump(direction:number){const next=at<0?(direction<0?changes.length-1:0):(at+direction+changes.length)%changes.length;setAt(next);if(body.current)body.current.scrollTop=Math.max(0,(changes[next]+1)*ROW-body.current.clientHeight/2);}
  const first=Math.max(0,Math.floor(window.top/ROW)-12),last=Math.min(lines.length,first+Math.ceil(window.height/ROW)+26);
  return <div className='source-diff'>
    <Space wrap className='diff-navigation'><span role='status'>{changes.length?`${changes.length}か所の変更${at>=0?` · ${at+1} / ${changes.length}`:''}`:'変更はありません'}</span><Button size='small' disabled={!changes.length} onClick={()=>jump(-1)}>前の変更</Button><Button size='small' disabled={!changes.length} onClick={()=>jump(1)}>次の変更</Button><Button size='small' onClick={()=>void copy('before')}>{copied==='before'?'✓ ':''}変更前をコピー</Button><Button size='small' onClick={()=>void copy('after')}>{copied==='after'?'✓ ':''}変更後をコピー</Button></Space>
    <div className='diff-body' ref={body} onScroll={update} style={{height:`min(55vh, ${(lines.length+1)*ROW+4}px)`}} tabIndex={0} aria-label='ソースの変更行（左が変更前、右が変更後）'>
      <div className='diff-canvas' style={{height:(lines.length+1)*ROW,width:`${(width+10)*2}ch`}}>
        <div className='diff-headings'><strong>{leftLabel}</strong><strong>{rightLabel}</strong></div>
        {lines.slice(first,last).map((line,offset)=>{const i=first+offset;return <div className={`diff-row ${line.changed?'diff-changed':''} ${changes[at]===i?'diff-current':''}`} data-line={i} key={i} style={{top:(i+1)*ROW}}>
          <div className={line.changed&&line.left?'diff-removed':''}><span className='diff-number'>{line.left?.number}</span><span className='diff-mark'>{line.changed&&line.left?'−':''}</span><code>{line.left?.text.replace(/\r$/,'')??' '}</code></div>
          <div className={line.changed&&line.right?'diff-added':''}><span className='diff-number'>{line.right?.number}</span><span className='diff-mark'>{line.changed&&line.right?'+':''}</span><code>{line.right?.text.replace(/\r$/,'')??' '}</code></div>
        </div>;})}
      </div>
    </div>
  </div>;
}
