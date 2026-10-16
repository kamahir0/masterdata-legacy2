import {useLayoutEffect,useRef} from 'react';
import {Button} from 'antd';
import {LeftOutlined,RightOutlined} from '@ant-design/icons';
export type ValuePathItem={label:string;key:string};
export function ValuePath({items,onSelect,backLabel='親の値',rootLabel='元のセルの値'}:{items:ValuePathItem[];onSelect:(index:number)=>void;backLabel?:string;rootLabel?:string}) {
  const rail=useRef<HTMLDivElement>(null),identity=items.map(item=>item.key).join('\n');
  useLayoutEffect(()=>{if(rail.current)rail.current.scrollLeft=rail.current.scrollWidth;},[identity]);
  const current=items.at(-1);
  if(!current)return null;
  return <nav className='value-path' aria-label='値の階層' title={items.map(item=>item.label).join(' > ')}>
    {items.length>1&&<Button type='text' className='value-path-back' icon={<LeftOutlined aria-hidden='true'/>} aria-label={backLabel} onClick={()=>onSelect(items.length-2)}/>}
    {items.length>1&&<div className='value-path-ancestors' ref={rail} tabIndex={0} aria-label='上位の階層（横スクロールできます）'><ol>{items.slice(0,-1).map((item,index)=><li key={item.key}><button type='button' aria-label={index===0?rootLabel:`${item.label} の値に戻る`} onClick={()=>onSelect(index)}>{item.label}</button><RightOutlined aria-hidden='true'/></li>)}</ol></div>}
    <span className='value-path-current' aria-current='location'>{current.label}</span>
  </nav>;
}
