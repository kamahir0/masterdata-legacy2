import type {ReactNode} from 'react';

// Nullability belongs to the value host, independently of its scalar/compound
// renderer. Reserve the same trailing action space in every editing surface.
export function NullableValue({nullable,isNull,label,onClear,children,disabled=false,passive=false}: {
  nullable:boolean;isNull:boolean;label:string;onClear:()=>void;
  children:ReactNode;disabled?:boolean;passive?:boolean;
}) {
  if(!nullable)return <>{children}</>;
  return <span className={`nullable-control${passive?' nullable-passive':''}`} data-nullable-state={isNull?'null':'value'}>
    {isNull&&<span className='nullable-state'>未設定</span>}
    <span className='nullable-content'>{children}</span>
    <span className='nullable-action'>{!isNull&&<button type='button' className='nullable-clear' disabled={disabled}
      aria-label={`${label} を未設定にする`} title='未設定（null）にする'
      onPointerDown={event=>{event.stopPropagation();if(event.button===0)event.preventDefault();}}
      onClick={event=>{event.stopPropagation();onClear();}}>×</button>}</span>
  </span>;
}
