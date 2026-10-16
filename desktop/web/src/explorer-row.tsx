import {memo,useState,type ReactNode} from 'react';
import {Dropdown,Spin,type MenuProps} from 'antd';
import {MoreOutlined,WarningOutlined} from '@ant-design/icons';
import {basename} from './workspace';
import {entryPath} from './explorer-model';

interface Props {
 path:string;
 title:string;
 root:string;
 dirty:boolean;
 state:'pending'|'uncertain'|'conflict'|null;
 actionable:boolean;
 // Invalidate memo equality when an open menu's safety guards change.
 commands:string;
 menu:(path:string)=>MenuProps;
 inline?:ReactNode;
}

// Expansion changes Tree context for every mounted row. Keep unchanged titles
// out of that hot path, and build command items only for the open row menu.
// The native button also avoids mounting a styled Ant Button on every new row.
export const ExplorerRow=memo(function ExplorerRow({path,title,root,dirty,state,actionable,menu,inline}:Props){
 const [open,setOpen]=useState(false);
 const commands=open?menu(path):{};
 return <span className='source' data-path={path} title={root+'/'+entryPath(path)}>
  {inline??<>
   <span className='source-name'>{title}</span>
   <span className='source-state'>{state==='pending'?<Spin size='small'/>:state==='uncertain'?<span role='img' aria-label='結果を確認できません' title='結果を確認できません'>!</span>:state==='conflict'?<WarningOutlined role='img' aria-label='外部変更と競合'/>:null}</span>
   <span className='source-dirty' role='img' aria-label={dirty?'未保存':undefined} aria-hidden={!dirty}>{dirty?'●':''}</span>
   <Dropdown open={open} onOpenChange={setOpen} menu={{...commands,onClick:info=>{setOpen(false);menu(path).onClick?.(info);}}} trigger={['click']}>
    <button className='source-actions' type='button' aria-label={basename(entryPath(path))+' の操作'} tabIndex={actionable?0:-1} title='項目の操作' onPointerDown={event=>event.stopPropagation()} onClick={event=>event.stopPropagation()}><MoreOutlined aria-hidden='true'/></button>
   </Dropdown>
  </>}
 </span>;
});
