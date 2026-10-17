import type {KeyboardEventHandler, MouseEventHandler, PointerEventHandler, Ref} from 'react';
import {Input, Select, type InputRef} from 'antd';
import type {Shape} from './types';
import {NullableValue} from './nullable-control';

export const isBooleanShape = (shape:Shape|null|undefined) => !!shape && !shape.array && (shape.typeName==='bool'||shape.underlying==='bool');

type Props = {
  shape:Shape|null|undefined;
  value:string|null;
  label:string;
  onChange:(value:string|null)=>void;
  disabled?:boolean;
  invalid?:boolean;
  textSession?:boolean;
  autoFocus?:boolean;
  defaultOpen?:boolean;
  placeholder?:string;
  inputRef?:Ref<InputRef>;
  onKeyDown?:KeyboardEventHandler<HTMLElement>;
  onPointerDown?:PointerEventHandler<HTMLElement>;
  onClick?:MouseEventHandler<HTMLButtonElement>;
  onBlur?:()=>void;
  onCompositionStart?:()=>void;
  onCompositionEnd?:()=>void;
  passive?:boolean;
  isNull?:boolean;
};

// Hosts own draft/commit/cancel and source authority; this renderer owns the
// control for a resolved scalar. Keeping even the cheap grid toggle here avoids
// a second visual system growing beside nested and temporary editors.
export function ScalarValueControl(props:Props) {
  return <NullableValue nullable={!!props.shape?.nullable} isNull={props.isNull??props.value===null} label={props.label}
    disabled={props.disabled} passive={props.passive} onClear={()=>props.onChange(null)}>
    <ScalarInput {...props}/>
  </NullableValue>;
}
function ScalarInput({shape,value,label,onChange,disabled,invalid,textSession,autoFocus,defaultOpen,placeholder,inputRef,onKeyDown,onPointerDown,onClick,onBlur,onCompositionStart,onCompositionEnd}:Props) {
  const activate=(next:string|null):MouseEventHandler<HTMLButtonElement>=>event=>{
    onClick?.(event);
    if(!event.defaultPrevented)onChange(next);
  };
  if(!textSession&&isBooleanShape(shape)&&(value===null||value==='true'||value==='false'))
    return <span className='scalar-control boolean-control' data-value-control='bool' onKeyDown={onKeyDown}>
      {value===null?<span className='boolean-empty' role='group' aria-label={label}>
        {['true','false'].map((choice,i)=><button type='button' className='boolean-choice' key={choice} disabled={disabled} autoFocus={autoFocus&&i===0} aria-label={`${label} を${choice}にする`} onPointerDown={onPointerDown} onClick={activate(choice)}>{choice}</button>)}
      </span>:<button type='button' className='boolean-value' role='switch' aria-label={label} aria-checked={value==='true'} aria-invalid={invalid||undefined} disabled={disabled} autoFocus={autoFocus} onPointerDown={onPointerDown} onClick={activate(value==='true'?'false':'true')}>
        <span className='boolean-track' aria-hidden='true'><span/></span><span className='boolean-state'>{value}</span>
      </button>}
    </span>;
  if(!textSession&&shape?.category==='enum'&&!shape.array)
    return <Select className='scalar-control scalar-enum' data-value-control='enum' aria-label={label} showSearch optionFilterProp='label' autoFocus={autoFocus} defaultOpen={defaultOpen} placeholder={placeholder??'値を選択'} value={value??undefined} options={shape.members?.map(symbol=>({value:symbol,label:symbol}))} disabled={disabled} status={invalid?'error':undefined} onChange={symbol=>onChange(symbol??null)} onKeyDown={event=>{
      onKeyDown?.(event);
      // Choosing a member must not also submit an enclosing structural form.
      if(event.key==='Enter')event.stopPropagation();
    }}/>;
  // Invalid bool input stays editable text; displaying it as false would hide
  // the original source value and make an unrelated click destructive.
  return <Input className='scalar-control scalar-text' data-value-control='text' ref={inputRef} aria-label={label} value={value??''} disabled={disabled} status={invalid?'error':undefined} autoFocus={autoFocus} onChange={event=>onChange(event.target.value)} onBlur={onBlur} onKeyDown={onKeyDown} onCompositionStart={onCompositionStart} onCompositionEnd={onCompositionEnd}/>;
}
