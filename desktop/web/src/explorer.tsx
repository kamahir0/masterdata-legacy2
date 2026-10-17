import {memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentRef} from 'react';
import {Button, Dropdown, Input, Modal, Select, Tooltip, Tree, type MenuProps, type TreeDataNode} from 'antd';
import {ApartmentOutlined, BarsOutlined, CheckOutlined, CloseOutlined, DeleteOutlined, CopyOutlined, DatabaseOutlined, EditOutlined, FileAddOutlined, FileOutlined, FlagOutlined, FolderAddOutlined, FolderOpenOutlined, FolderOutlined, MoreOutlined, NumberOutlined, ReloadOutlined, SearchOutlined, TableOutlined, WarningOutlined, AimOutlined, RightOutlined} from '@ant-design/icons';
import {invoke} from '@tauri-apps/api/core';
import {basename, desktop, type Surface} from './workspace';
import {sourceCategoryLabel} from './language';
import {useCreation} from './creation';
import {useSourcePath} from './source-path';
import {explorerDrag} from './explorer-drag';
import {useSourceTrash} from './source-trash';
import {useExplorerActions} from './explorer-actions';
import {ExplorerRow} from './explorer-row';
import {ancestorKeys, entryPath, explorerEntries, folderKey, matchingAncestors, nextPrefix, parentPath, visibleEntries, type ExplorerEntry, type ExplorerSort} from './explorer-model';

function CollapseFoldersIcon(){return <svg width='14' height='14' viewBox='0 0 16 16' fill='none' stroke='currentColor' strokeWidth='1.2' aria-hidden='true' focusable='false'><path d='M5 2h8v8'/><rect x='2' y='5' width='8' height='8' rx='.6'/><path d='M4 9h4'/></svg>;}

export const SourceIcon=memo(function SourceIcon({category,error,expanded}:{category:string|null;error?:string|null;expanded?:boolean}) {
  return <span className={'source-kind kind-'+(category??'file')} role='img' aria-label={error?'ソースエラー':category==='folder'?'フォルダー':category?sourceCategoryLabel(category):'ファイル'}>
    {error?<WarningOutlined aria-hidden='true'/>:category==='folder'?(expanded?<FolderOpenOutlined aria-hidden='true'/>:<FolderOutlined aria-hidden='true'/>):category==='table'?<TableOutlined aria-hidden='true'/>:category==='data'?<DatabaseOutlined aria-hidden='true'/>:category==='enum'?<BarsOutlined aria-hidden='true'/>:category==='flags'?<FlagOutlined aria-hidden='true'/>:category==='custom'?<ApartmentOutlined aria-hidden='true'/>:category==='valueObject'?<NumberOutlined aria-hidden='true'/>:<FileOutlined aria-hidden='true'/>}
  </span>;
});
export function Explorer({s,reveal,width,resize}:{s:Surface;reveal:()=>void;width:number;resize:(width:number)=>void}) {
  const inventory=s.inventory!,root=inventory.sourceDirectory;
  const [keys,setKeys]=useState<string[]>(()=>ancestorKeys(s.target,root));
  const [selection,setSelection]=useState<string[]>(s.target?[s.target]:[]),rangeAnchor=useRef<string|null>(null);
  const [selected,setSelected]=useState(s.target),[activeKey,setActiveKey]=useState<string|null>(s.target||null);
  const activeItem=useRef<string|null>(activeKey);
  // Discrete keys can precede a controlled Tree commit. Commands always use
  // the user's latest focused item, including a rapid Arrow then Enter/F2.
  const activate=(key:string|null)=>{activeItem.current=key;setActiveKey(key);};
  const [focusRequest,setFocusRequest]=useState<{key:string;intent:number;focus:boolean}|null>(null);
  const tree=useRef<ComponentRef<typeof Tree>>(null),container=useRef<HTMLElement|null>(null),viewport=useRef<HTMLDivElement|null>(null);
  const [height,setHeight]=useState(500),[sticky,setSticky]=useState<string|null>(null),stickyFrame=useRef(0);
  const [maxPaneWidth,setMaxPaneWidth]=useState(520),widthValue=useRef(width);widthValue.current=width;
  const [filterOpen,setFilterOpen]=useState(false),[filter,setFilter]=useState(''),[sort,setSort]=useState<ExplorerSort>('name');
  const filterInput=useRef<ComponentRef<typeof Input>>(null),prefix=useRef({text:'',time:0});
  const [context,setContext]=useState<string>(folderKey(root)),[contextOpen,setContextOpen]=useState(false);
  const [findEpoch,setFindEpoch]=useState<number|null>(null),findRestore=useRef<{input:number;epoch:number;target:string}|null>(null);
  const [resizing,setResizing]=useState(false),dragWidth=useRef<{pointer:number;x:number;width:number}|null>(null),fileDrag=useRef<(()=>void)|null>(null),suppressClick=useRef(0);
  const contextKey=()=>activeItem.current||selected||s.target||folderKey(root);
  const focusItem=(key:string,focus=true)=>{activate(key);setFocusRequest({key,intent:desktop.inputIntent,focus});};
  const revealPath=(path=s.target,focus=true)=>{
    if(!path)return;
    reveal();setFilter('');setSticky(null);setSelected(path);setSelection([path]);
    setKeys(old=>[...new Set([...old,...ancestorKeys(path,root)])]);focusItem(path,focus);
  };
  useEffect(()=>{
    setSelected(s.target);setSelection(s.target?[s.target]:[]);
    if(s.target){
      setKeys(old=>[...new Set([...old,...ancestorKeys(s.target,root)])]);
      focusItem(s.target,false);
    }
  },[s.target]);
  useEffect(()=>{
    setKeys(ancestorKeys(s.target,root));setSelected(s.target);setSelection(s.target?[s.target]:[]);activate(s.target||null);setFocusRequest(null);
    setFilter('');setFilterOpen(false);setSticky(null);setContextOpen(false);setFindEpoch(null);findRestore.current=null;
  },[s.status.epoch]);
  useLayoutEffect(()=>{
    const element=viewport.current;if(!element)return;
    const measure=()=>{
      setHeight(Math.max(22,element.clientHeight));
      const max=maxWidth();setMaxPaneWidth(max);if(widthValue.current>max)resize(max);
    };
    const observer=new ResizeObserver(measure);
    observer.observe(element);const workbench=document.getElementById('workbench');if(workbench)observer.observe(workbench);
    measure();return()=>observer.disconnect();
  },[]);
  useLayoutEffect(()=>{
    if(!focusRequest)return;
    const frame=requestAnimationFrame(()=>{
      // Creation's offscreen virtual row needs reveal, while ordinary Tree
      // requests must not pull focus/scroll away from its filename input.
      if(focusRequest.intent!==desktop.inputIntent||(creationPending.current&&focusRequest.key!=='creation:temporary'))return;
      tree.current?.scrollTo({key:focusRequest.key});
      if(focusRequest.focus&&!creationPending.current)container.current?.querySelector<HTMLElement>('[role="tree"]')?.focus({preventScroll:true});
    });return()=>cancelAnimationFrame(frame);
  },[focusRequest]);
  const creation=useCreation(inventory,s.status.epoch,contextKey(),async(path,folder,inputIntent)=>{
    if(inputIntent!==desktop.inputIntent)return;
    const key=folder?folderKey(path):path;
    setFilter('');setKeys(old=>[...new Set([...old,...ancestorKeys(path,root),...(folder?[key]:[])])]);setSelected(key);setSelection([key]);
    if(!folder)await desktop.selectTarget(path,'creation').catch(desktop.showError);
    if(inputIntent===desktop.inputIntent)focusItem(key);
  });
  const creationPending=useRef(false);creationPending.current=!!creation.draft;
  const pathMutation=useSourcePath(s.status.epoch,(source,destination,inputIntent,focus)=>{
    setKeys(old=>[...new Set([...old,...ancestorKeys(destination,root)])]);
    if(inputIntent!==desktop.inputIntent)return;
    const remap=(key:string)=>{const path=entryPath(key);return path===source||path.startsWith(source+'/')?(key.startsWith('folder:')?folderKey(destination+path.slice(source.length)):destination+path.slice(source.length)):key;};
    setKeys(old=>old.map(remap));setSelection(old=>old.map(remap));setSelected(remap);
    const key=desktop.surface.inventory?.folders.includes(destination)?folderKey(destination):destination;
    if(focus){setFilter('');focusItem(key);}
  });
  const trash=useSourceTrash(s,source=>{setSelected(old=>old===source?'':old);if(activeItem.current===source)activate(null);},source=>{setKeys(old=>[...new Set([...old,...ancestorKeys(source,root)])]);const key=desktop.surface.inventory?.folders.includes(source)?folderKey(source):source;setSelected(key);setSelection([key]);focusItem(key);});
  const keyForPath=(path:string)=>desktop.surface.inventory?.folders.includes(path)?folderKey(path):path;
  const actions=useExplorerActions(s.status.epoch,(items,operation,inputIntent)=>{
    if(!items.length)return;
    const remap=(key:string)=>{const path=entryPath(key),item=items.find(i=>path===i.source||path.startsWith(i.source+'/'));return item?keyForPath(item.destination+path.slice(item.source.length)):key;};
    if(operation==='move'){setKeys(old=>old.map(remap));setSelection(old=>old.map(remap));setSelected(remap);}
    if(operation==='trash'){const removed=(key:string)=>items.some(i=>entryPath(key)===i.source||entryPath(key).startsWith(i.source+'/'));setSelection(old=>old.filter(key=>!removed(key)));setSelected(old=>removed(old)?'':old);if(activeItem.current&&removed(activeItem.current))activate(null);}
    if(operation==='copy'&&inputIntent===desktop.inputIntent){const next=items.map(i=>keyForPath(i.destination));setSelection(next);setSelected(next.at(-1)??'');setKeys(old=>[...new Set([...old,...items.flatMap(i=>ancestorKeys(i.destination,root))])]);if(next.length)focusItem(next.at(-1)!);}
  },(items,inputIntent)=>{if(inputIntent!==desktop.inputIntent)return;const restored=items.map(i=>keyForPath(i.source));setSelection(restored);setSelected(restored[0]??'');setKeys(old=>[...new Set([...old,...items.flatMap(i=>ancestorKeys(i.source,root))])]);if(restored.length)focusItem(restored[0]);});
  const targets=(key:string)=>selection.includes(key)?selection:[key];
  const targetPaths=(key:string)=>targets(key).map(entryPath);
  const destinationFolder=(key:string)=>key.startsWith('folder:')?entryPath(key):parentPath(key);
  const canCreate=creation.ready&&!actions.busy&&!actions.pending&&!creation.draft&&!pathMutation.open&&!s.status.recoveryRequired&&!s.status.environmentError;
  const canMove=(path:string)=>entryPath(path)!==root&&!actions.busy&&!actions.pending&&!creation.draft&&!pathMutation.open&&!s.busy&&!s.status.recoveryRequired&&!s.status.environmentError&&!s.status.uncertain.some(p=>entryPath(path)===p||entryPath(path).startsWith(p+'/'));
  const beginCreation=(category:Parameters<typeof creation.begin>[0],key=contextKey())=>{setFilter('');creation.begin(category,key);};
  const guide=useRef(beginCreation);guide.current=beginCreation;
  useEffect(()=>canCreate?desktop.bindSourceCreation(category=>{reveal();guide.current(category);}):undefined,[canCreate,s.status.epoch]);
  useEffect(()=>{
    if(!creation.draft)return;
    setKeys(old=>[...new Set([...old,...ancestorKeys(creation.draft!.folder+'/placeholder',root)])]);
    setFocusRequest({key:'creation:temporary',intent:desktop.inputIntent,focus:false});
  },[creation.draft?.id]);
  useEffect(()=>{
    if(!pathMutation.draft?.inline)return;
    setKeys(old=>[...new Set([...old,...ancestorKeys(pathMutation.draft!.source,root)])]);
    setFocusRequest({key:pathMutation.draft.choices.directory?folderKey(pathMutation.draft.source):pathMutation.draft.source,intent:desktop.inputIntent,focus:false});
  },[pathMutation.draft?.id,inventory.generation,inventory.externalVersion]);
  const entries=useMemo(()=>explorerEntries(inventory,sort,filter),[inventory.sources,inventory.folders,inventory.sourceDirectory,sort,filter]);
  const expanded=useMemo(()=>filter.trim()?matchingAncestors(entries):keys,[filter,entries,keys]);
  const visible=useMemo(()=>visibleEntries(entries,new Set(expanded)),[entries,expanded]);
  useEffect(()=>{
    const active=activeItem.current;
    if(pathMutation.draft?.inline&&active===pathMutation.draft.source)return;
    if(active&&!visible.some(item=>item.key===active)){
      const ancestor=ancestorKeys(entryPath(active),root).reverse().find(key=>visible.some(item=>item.key===key));
      activate(ancestor??visible.find(item=>item.key===selected)?.key??visible[0]?.key??null);
    }
  },[visible]);
  const findOptions=useMemo(()=>[
    ...inventory.logicalTables.map(table=>({value:table.source,label:'テーブル · '+table.name+' — '+table.source})),
    ...inventory.logicalTypes.map(type=>({value:type.source,label:'型 · '+type.name+' — '+type.source})),
  ],[inventory]);
  const closeFind=()=>{findRestore.current={input:desktop.inputIntent,epoch:s.status.epoch,target:s.target};setFindEpoch(null);};
  const openFilter=()=>{if(creation.draft||pathMutation.open)return;setFilterOpen(true);requestAnimationFrame(()=>filterInput.current?.focus());};
  const closeFilter=()=>{setFilter('');setFilterOpen(false);setSticky(null);container.current?.querySelector<HTMLElement>('[role="tree"]')?.focus();};
  const copyPath=(key:string,absolute=false)=>{
    const path=entryPath(key),separator=inventory.root.startsWith('/')?'/':'\\';
    const text=absolute?inventory.root.replace(/[\\/]$/,'')+separator+path.split('/').join(separator):path;
    void invoke('clipboard_text',{text}).catch(desktop.showError);
  };
  const categoryItems=creation.menu.items?.filter(item=>item?.key!=='folder').map(item=>item&&'key' in item?{...item,icon:<SourceIcon category={String(item.key)}/>} :item);
  const newItems=():NonNullable<MenuProps['items']>=>[
    {key:'newFile',label:'新しいソース',icon:<FileAddOutlined aria-hidden='true'/>,disabled:!canCreate,children:categoryItems},
    {key:'folder',label:'新しいフォルダー',icon:<FolderAddOutlined aria-hidden='true'/>,disabled:!canCreate},
  ];
  const menuFor=(key:string):MenuProps=>({items:[
    ...newItems(),{type:'divider'},
    ...(entryPath(key)!==root?[
      {key:'rename',label:<span className='explorer-menu-label'>名前の変更…<span>F2</span></span>,icon:<EditOutlined/>,disabled:!canMove(key)||targets(key).length!==1},
      {key:'move',label:'移動…',icon:<FolderOpenOutlined/>,disabled:!canMove(key)},
      {key:'copy',label:'コピー',icon:<CopyOutlined/>,disabled:!canMove(key)},
      {key:'cut',label:'切り取り',disabled:!canMove(key)},
      {key:'duplicate',label:'複製',icon:<CopyOutlined/>,disabled:!canMove(key)||targets(key).length!==1},
      {key:'trash',label:'削除…',danger:true,icon:<DeleteOutlined/>,disabled:!canMove(key)},
    ]:[]),
    {key:'paste',label:'貼り付け',disabled:!actions.clipboard||!canCreate},
    {type:'divider'},
    {key:'copyRelative',label:'相対パスをコピー',icon:<CopyOutlined/>},
    {key:'copyAbsolute',label:'パスをコピー',icon:<CopyOutlined/>},
  ],onClick:({key:action})=>{
    setContextOpen(false);
    if(action==='rename')void pathMutation.begin(entryPath(key),{inline:true});
    else if(action==='move'){const paths=targetPaths(key);if(paths.length===1)void pathMutation.begin(paths[0]);else actions.beginMove(paths,destinationFolder(key));}
    else if(action==='trash')void actions.run('trash',targetPaths(key));
    else if(action==='copy'||action==='cut')actions.copy(targetPaths(key),action==='cut');
    else if(action==='paste')void actions.paste(destinationFolder(key));
    else if(action==='duplicate')void actions.run('copy',[entryPath(key)],parentPath(entryPath(key)));
    else if(action==='copyRelative'||action==='copyAbsolute')copyPath(key,action==='copyAbsolute');
    else beginCreation(action as Parameters<typeof creation.begin>[0],key);
  }});
  // Row titles can skip unrelated Tree renders; commands still read the latest
  // guards when invoked. Row identity below is scoped to the Project epoch.
  const currentMenu=useRef(menuFor);currentMenu.current=menuFor;
  const [rowMenu]=useState(()=>(key:string)=>currentMenu.current(key));
  const sourceItems:MenuProps={items:[
    {key:'reveal',label:'表示中のファイルをエクスプローラーで表示',icon:<AimOutlined aria-hidden='true'/>,disabled:!s.target||!!creation.draft||pathMutation.open},
    {key:'filter',label:'ファイル名で絞り込む…',icon:<SearchOutlined aria-hidden='true'/>,disabled:!!creation.draft||pathMutation.open},
    {key:'find',label:'テーブル・型を検索…',icon:<SearchOutlined aria-hidden='true'/>,disabled:!findOptions.length||!!creation.draft||pathMutation.open},
    {type:'divider'},
    {key:'sort',label:'並べ替え',disabled:!!creation.draft||pathMutation.open,children:[{key:'sortName',label:'名前',icon:sort==='name'?<CheckOutlined aria-hidden='true'/>:null},{key:'sortType',label:'種類',icon:sort==='type'?<CheckOutlined aria-hidden='true'/>:null}]},
    {key:'trashList',label:'削除した項目を復元…',icon:<ReloadOutlined aria-hidden='true'/>},
    {key:'refresh',label:'一覧を更新',icon:<ReloadOutlined aria-hidden='true'/>},
    {key:'collapse',label:'フォルダーをすべて折りたたむ',icon:<CollapseFoldersIcon/>,disabled:!!creation.draft||pathMutation.open},
  ],onClick:({key})=>{
    if(key==='trashList')void trash.open();else if(key==='reveal')revealPath();else if(key==='filter')openFilter();
    else if(key==='find'){findRestore.current=null;setFindEpoch(s.status.epoch);}
    else if(key==='sortName'||key==='sortType')setSort(key==='sortName'?'name':'type');
    else if(key==='collapse'){setFilter('');setKeys([]);setSticky(null);}
    else void desktop.refreshInventory().catch(desktop.showError);
  }};
  const nodes=useMemo(()=>{
    function convert(items:ExplorerEntry[]):TreeDataNode[] {
      return items.map(item=>({key:item.key,title:item.name,isLeaf:!item.folder,selectable:pathMutation.draft?.inline&&(pathMutation.draft.choices.directory?folderKey(pathMutation.draft.source):pathMutation.draft.source)===item.key?false:undefined,
        icon:props=><SourceIcon category={item.folder?'folder':item.category} error={item.error} expanded={props.expanded}/>,
        children:item.children?convert(item.children):undefined}));
    }
    const result=convert(entries),draft=creation.draft,rename=pathMutation.draft;
    function find(nodes:TreeDataNode[],key:string):TreeDataNode|undefined {
      for(const node of nodes){if(node.key===key)return node;const child=node.children&&find(node.children,key);if(child)return child;}
    }
    // A lost move reply or external removal can make the old path disappear
    // from inventory. Keep its recovery input reachable until explicit Recheck.
    const renameKey=rename?.choices.directory?folderKey(rename.source):rename?.source;
    if(rename?.inline&&renameKey&&!find(result,renameKey)) {
      const parent=find(result,folderKey(parentPath(rename.source)));
      (parent?.children??result).push({key:renameKey,title:rename.choices.filename,isLeaf:!rename.choices.directory,selectable:false,icon:<SourceIcon category={null} error='対象のソースが一覧にありません'/>});
    }
    if(draft) {
      let destination=result;
      for(const ancestor of ancestorKeys(draft.folder+'/placeholder',root)) {
        const node=destination.find(item=>item.key===ancestor);if(!node)return result;destination=node.children!;
      }
      const insert=draft.category==='folder'?0:destination.findIndex(node=>!String(node.key).startsWith('folder:'));
      destination.splice(insert<0?destination.length:insert,0,{key:'creation:temporary',title:draft.filename,isLeaf:true,selectable:false,icon:<SourceIcon category={draft.category}/>});
    }
    return result;
  },[entries,creation.draft?.id,creation.draft?.filename,creation.draft?.folder,pathMutation.draft?.id]);
  const toggleFolder=(key:string)=>{setKeys(old=>old.includes(key)?old.filter(value=>value!==key):[...old,key]);setSticky(null);};
  function keyDown(event:React.KeyboardEvent) {
    if(!(event.target instanceof Element)||event.target.closest('input,textarea,button,[contenteditable=true],[role=menu]'))return;
    if(event.nativeEvent.isComposing||event.keyCode===229){if(event.target.closest('[role="tree"]'))event.stopPropagation();return;}
    if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='f'){event.preventDefault();event.stopPropagation();openFilter();return;}
    const command=event.metaKey||event.ctrlKey;
    if(command&&event.target.closest('[role="tree"]')){
      const key=activeItem.current??selected,paths=selection.map(entryPath),letter=event.key.toLowerCase();
      if(letter==='a'){event.preventDefault();event.stopPropagation();const next=visible.filter(i=>!filter||i.path.toLowerCase().includes(filter.toLowerCase())).map(i=>i.key);setSelection(next);return;}
      if(letter==='c'||letter==='x'){event.preventDefault();event.stopPropagation();if(paths.length)actions.copy(paths,letter==='x');return;}
      if(letter==='v'){event.preventDefault();event.stopPropagation();void actions.paste(destinationFolder(key??folderKey(root)));return;}
      if(letter==='d'){event.preventDefault();event.stopPropagation();if(selection.length===1&&canMove(selection[0]))void actions.run('copy',[entryPath(selection[0])],parentPath(entryPath(selection[0])));return;}
      if(['ArrowUp','ArrowDown','Home','End','PageUp','PageDown'].includes(event.key)){
        event.preventDefault();event.stopPropagation();const index=visible.findIndex(item=>item.key===key),page=Math.max(1,Math.floor(height/22)-1);
        const next=event.key==='Home'?0:event.key==='End'?visible.length-1:Math.max(0,Math.min(visible.length-1,index+(event.key==='ArrowDown'?1:event.key==='ArrowUp'?-1:event.key==='PageDown'?page:-page)));
        if(visible[next])focusItem(visible[next].key);return;
      }
    }
    if(command||event.altKey||!event.target.closest('[role="tree"]'))return;
    const key=activeItem.current??selected;
    if(event.key==='Delete'||event.key==='Backspace'){event.preventDefault();event.stopPropagation();if(selection.length&&selection.every(canMove))void actions.run('trash',selection.map(entryPath));return;}
    if(event.key==='F2'){event.preventDefault();event.stopPropagation();if(key&&canMove(key))void pathMutation.begin(entryPath(key),{inline:true});return;}
    if(event.key==='Enter') {
      event.preventDefault();event.stopPropagation();if(!key)return;
      setSelection([key]);setSelected(key);
      if(key.startsWith('folder:')){toggleFolder(key);return;}
      activate(key);void desktop.selectTarget(key).catch(desktop.showError);
      document.getElementById('editor-pane')?.focus({preventScroll:true});return;
    }
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();setSelection([]);setSelected('');rangeAnchor.current=null;return;}
    if(event.shiftKey&&['ArrowUp','ArrowDown','Home','End'].includes(event.key)){
      event.preventDefault();event.stopPropagation();const index=Math.max(0,visible.findIndex(item=>item.key===key));
      const next=event.key==='Home'?0:event.key==='End'?visible.length-1:Math.max(0,Math.min(visible.length-1,index+(event.key==='ArrowDown'?1:-1)));
      const anchor=rangeAnchor.current??key;rangeAnchor.current=anchor;const begin=Math.max(0,visible.findIndex(item=>item.key===anchor));
      setSelection(visible.slice(Math.min(begin,next),Math.max(begin,next)+1).map(item=>item.key));if(visible[next]){setSelected(visible[next].key);focusItem(visible[next].key);}return;
    }
    if(!event.shiftKey)rangeAnchor.current=null;
    const selectFocus=(key:string)=>{setSelection([key]);setSelected(key);focusItem(key);};
    if(['ArrowUp','ArrowDown','Home','End','PageUp','PageDown'].includes(event.key)) {
      event.preventDefault();event.stopPropagation();const index=visible.findIndex(item=>item.key===key),page=Math.max(1,Math.floor(height/22)-1);
      const next=event.key==='Home'?0:event.key==='End'?visible.length-1:Math.max(0,Math.min(visible.length-1,index+(event.key==='ArrowDown'?1:event.key==='ArrowUp'?-1:event.key==='PageDown'?page:-page)));
      if(visible[next])selectFocus(visible[next].key);return;
    }
    if(key&&(event.key==='ArrowLeft'||event.key==='ArrowRight')){
      event.preventDefault();event.stopPropagation();const folder=key.startsWith('folder:'),open=expanded.includes(key);
      if(folder&&((event.key==='ArrowLeft'&&open)||(event.key==='ArrowRight'&&!open))){toggleFolder(key);setSelection([key]);setSelected(key);}
      else if(event.key==='ArrowLeft'){const parent=parentPath(entryPath(key));if(parent!==root)selectFocus(folderKey(parent));}
      else if(folder){const index=visible.findIndex(item=>item.key===key);if(visible[index+1])selectFocus(visible[index+1].key);}
      return;
    }
    if(event.key.length===1) {
      event.preventDefault();event.stopPropagation();const now=performance.now(),text=(now-prefix.current.time<700?prefix.current.text:'')+event.key;
      let match=nextPrefix(visible,key,text),search=text;
      if(!match){search=event.key;match=nextPrefix(visible,key,search);}
      prefix.current={text:search,time:now};if(match)selectFocus(match);
    }
  }
  function updateSticky() {
    const bounds=viewport.current?.getBoundingClientRect();if(!bounds)return;
    const first=[...viewport.current!.querySelectorAll<HTMLElement>('[role="treeitem"]')].find(row=>row.getBoundingClientRect().bottom>bounds.top+1);
    if(!first){if(!viewport.current!.querySelector('[role="treeitem"]'))setSticky(null);return;}
    const key=first?.querySelector<HTMLElement>('[data-path]')?.dataset.path;
    const parent=key?parentPath(entryPath(key)):root;setSticky(parent&&parent!==root?parent:null);
  }
  function scrolled(){
    cancelAnimationFrame(stickyFrame.current);
    stickyFrame.current=requestAnimationFrame(updateSticky);
  }
  useEffect(()=>{
    // A scroll callback (even its next rAF) can precede rc-tree's virtual row
    // commit. Observe the committed row/offset changes too, then measure actual
    // treeitems; the hidden indent measurer has no navigation identity.
    const observer=new MutationObserver(scrolled);
    observer.observe(viewport.current!,{childList:true,subtree:true,attributes:true,attributeFilter:['style']});
    return()=>{observer.disconnect();cancelAnimationFrame(stickyFrame.current);};
  },[s.status.epoch]);
  useEffect(()=>()=>fileDrag.current?.(),[]);
  function moveTo(source:string,folder:string) {
    if(!canMove(source)||parentPath(entryPath(source))===folder)return;
    const paths=targetPaths(source);if(paths.length>1)void actions.run('move',paths,folder);else void pathMutation.begin(entryPath(source),{folder,direct:true});
  }
  const maxWidth=()=>Math.max(200,Math.min(520,(document.getElementById('workbench')?.clientWidth??840)-320));
  const clamp=(value:number)=>Math.max(200,Math.min(maxWidth(),value));
  return <aside id='explorer' ref={container} className={resizing?'explorer-resizing':''} aria-label='エクスプローラー' onKeyDownCapture={keyDown} onCompositionEnd={event=>{
    if(event.target instanceof Element&&event.target.closest('[role="tree"]')&&!event.target.closest('input,textarea,[contenteditable=true]')){
      const match=nextPrefix(visible,activeItem.current,event.data);if(match){setSelection([match]);setSelected(match);focusItem(match);}
    }
  }}>
    <div className='explorer-heading'>
      <span className='explorer-heading-name' title={inventory.root+'/'+root}>ソース</span>
      <div className='explorer-toolbar' role='toolbar' aria-label='エクスプローラーの操作'>
        <Dropdown menu={{items:categoryItems,onClick:({key})=>beginCreation(key as Parameters<typeof creation.begin>[0])}} trigger={['click']}>
          <Tooltip title='新しいソース'><Button type='text' icon={<FileAddOutlined aria-hidden='true'/>} aria-label='ソースを作成' disabled={!canCreate}/></Tooltip>
        </Dropdown>
        <Tooltip title='新しいフォルダー'><Button type='text' icon={<FolderAddOutlined aria-hidden='true'/>} aria-label='フォルダーを作成' disabled={!canCreate} onClick={()=>beginCreation('folder')}/></Tooltip>
        <Tooltip title='一覧を更新'><Button type='text' icon={<ReloadOutlined aria-hidden='true'/>} aria-label='一覧を更新' onClick={()=>void desktop.refreshInventory().catch(desktop.showError)}/></Tooltip>
        <Tooltip title='フォルダーをすべて折りたたむ'><Button type='text' icon={<CollapseFoldersIcon/>} aria-label='フォルダーをすべて折りたたむ' disabled={!!creation.draft||pathMutation.open} onClick={()=>{setFilter('');setKeys([]);setSticky(null);}}/></Tooltip>
        <Dropdown menu={sourceItems} trigger={['click']}><Tooltip title='エクスプローラーのその他の操作'><Button type='text' icon={<MoreOutlined aria-hidden='true'/>} aria-label='ソースの操作'/></Tooltip></Dropdown>
      </div>
    </div>
    {filterOpen&&<div className='explorer-filter'><Input ref={filterInput} aria-label='ソースを絞り込む' placeholder='ファイル名で絞り込む' prefix={<SearchOutlined aria-hidden='true'/>} allowClear disabled={!!creation.draft||pathMutation.open} value={filter} onChange={event=>{setFilter(event.target.value);setSticky(null);}} onKeyDown={event=>{if(event.nativeEvent.isComposing)return;if(event.key==='Escape'){event.preventDefault();event.stopPropagation();closeFilter();}else if(event.key==='Enter'){event.preventDefault();container.current?.querySelector<HTMLElement>('[role="tree"]')?.focus();}}}/><Button type='text' icon={<CloseOutlined aria-hidden='true'/>} aria-label='絞り込みを閉じる' title='絞り込みを閉じる（Escape）' onClick={closeFilter}/></div>}
    <Dropdown menu={menuFor(context)} trigger={['contextMenu']} open={contextOpen} onOpenChange={setContextOpen}>
      <div ref={viewport} className='explorer-viewport' onScrollCapture={scrolled} onContextMenu={event=>{
        const element=event.target instanceof Element?event.target:null,row=element?.closest('.ant-tree-treenode'),stickyFolder=element?.closest<HTMLElement>('.explorer-sticky')?.dataset.folder;
        const key=row?.querySelector<HTMLElement>('[data-path]')?.dataset.path??folderKey(stickyFolder??root);
        if(key==='creation:temporary')return;
        setContext(key);if(row){if(!selection.includes(key)){setSelected(key);setSelection([key]);}activate(key);}
      }} onPointerDownCapture={event=>{if(event.button===0&&!(event.target as Element).closest(".ant-tree-treenode,.explorer-sticky,input,button")){setSelection([]);setSelected('');activate(null);}fileDrag.current?.();fileDrag.current=explorerDrag(event,root,canMove,moveTo,()=>{suppressClick.current=performance.now()+400;});}}
        onClickCapture={event=>{if(event.detail>0&&performance.now()<suppressClick.current){event.preventDefault();event.stopPropagation();suppressClick.current=0;}}}
        onDragStart={event=>event.preventDefault()} onDragOver={event=>event.preventDefault()} onDrop={event=>event.preventDefault()}>
        {!nodes.length&&<div className='explorer-empty'>{filter?'一致するソースがありません':'ソースはまだありません'}</div>}
        <Tree ref={tree} aria-label='ソース' activeKey={activeKey} onActiveChange={key=>{
          // rc-tree clears activeKey on blur, then restores its last rendered
          // selection on focus. That callback can follow a newer click before
          // React commits it; keep our synchronous navigation identity instead.
          if(activeItem.current===null&&key!==null)activate(String(key));
        }}
          // Ant Design 6.6 treats null as its default collapse motion. false
          // keeps rc-tree from mounting a second branch for the transition;
          // explorer-performance measures both row bounds and next input.
          treeData={nodes} height={height} itemHeight={22} virtual blockNode showIcon motion={false} expandedKeys={expanded} multiple selectedKeys={selection}
          onExpand={next=>{if(!filter.trim())setKeys(next.map(String));setSticky(null);}}
          onSelect={(next,info)=>{
            const key=String(info.node.key),modified=info.nativeEvent.ctrlKey||info.nativeEvent.metaKey||info.nativeEvent.shiftKey;
            if(info.nativeEvent.shiftKey){
              const anchor=rangeAnchor.current??activeItem.current??key;rangeAnchor.current=anchor;
              const begin=Math.max(0,visible.findIndex(item=>item.key===anchor)),end=Math.max(0,visible.findIndex(item=>item.key===key));
              const range=visible.slice(Math.min(begin,end),Math.max(begin,end)+1).map(item=>item.key);
              setSelection(info.nativeEvent.ctrlKey||info.nativeEvent.metaKey?[...new Set([...selection,...range])]:range);
            }else{rangeAnchor.current=key;setSelection(modified?next.map(String):[key]);}
            setSelected(key);activate(key);
            if(!modified){if(key.startsWith('folder:'))toggleFolder(key);else if(key!==s.target||s.pending||(!s.projection&&!s.typeProjection))void desktop.selectTarget(key).catch(desktop.showError);}
          }}

          titleRender={node=>node.key==='creation:temporary'?creation.inline:<ExplorerRow key={s.status.epoch+':'+node.key} path={String(node.key)} title={String(node.title)} root={inventory.root}
            dirty={s.status.dirty.includes(String(node.key))} state={s.pending&&s.target===node.key?'pending':s.status.uncertain.includes(String(node.key))?'uncertain':s.projection?.source===node.key&&s.projection.conflict?'conflict':null}
            actionable={String(node.key)===activeKey||String(node.key)===selected} commands={`${canCreate}:${canMove(String(node.key))}:${selection.length}:${!!actions.clipboard}`} menu={rowMenu}
            inline={pathMutation.draft?.inline&&(pathMutation.draft.choices.directory?folderKey(pathMutation.draft.source):pathMutation.draft.source)===node.key?pathMutation.inline:undefined}/>}/>
        {sticky&&!filter.trim()&&<button className='explorer-sticky' data-folder={sticky} title={inventory.root+'/'+sticky} aria-label= {basename(sticky)+' フォルダーへ戻る'} onClick={()=>{setSelected(folderKey(sticky));setSelection([folderKey(sticky)]);focusItem(folderKey(sticky));setSticky(null);}}><RightOutlined rotate={90} aria-hidden='true'/><SourceIcon category='folder' expanded/><span>{basename(sticky)}</span></button>}
      </div>
    </Dropdown>
    {trash.feedback}{trash.drawer}{actions.feedback}{actions.drawers}
    <div className='explorer-resize-handle' role='separator' aria-label='エクスプローラーの幅' aria-orientation='vertical' tabIndex={0} aria-valuemin={200} aria-valuemax={maxPaneWidth} aria-valuenow={width}
      onPointerDown={event=>{if(event.button!==0)return;event.preventDefault();dragWidth.current={pointer:event.pointerId,x:event.clientX,width};event.currentTarget.setPointerCapture(event.pointerId);setResizing(true);}}
      onPointerMove={event=>{const drag=dragWidth.current;if(drag?.pointer===event.pointerId)resize(clamp(drag.width+event.clientX-drag.x));}}
      onPointerUp={event=>{if(dragWidth.current?.pointer===event.pointerId){dragWidth.current=null;setResizing(false);event.currentTarget.releasePointerCapture(event.pointerId);}}}
      onPointerCancel={()=>{if(dragWidth.current)resize(dragWidth.current.width);dragWidth.current=null;setResizing(false);}}
      onLostPointerCapture={()=>{dragWidth.current=null;setResizing(false);}}
      onDoubleClick={()=>resize(280)} onKeyDown={event=>{
        if(event.key==='Escape'&&dragWidth.current){resize(dragWidth.current.width);dragWidth.current=null;setResizing(false);}
        else if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();event.stopPropagation();resize(event.key==='Home'?200:event.key==='End'?maxWidth():clamp(width+(event.key==='ArrowRight'?10:-10)));}
      }}/>
    <Modal title='テーブル・型を検索' open={findEpoch===s.status.epoch} onCancel={closeFind} footer={null} width={640} destroyOnHidden focusable={{focusTriggerAfterClose:false}} afterOpenChange={open=>{
      const request=findRestore.current,current=desktop.surface;
      if(open||!request||request.input!==desktop.inputIntent||request.epoch!==current.status.epoch||request.target!==current.target||current.openingProject||current.projectCreation)return;
      container.current?.querySelector<HTMLElement>('[role="tree"]')?.focus();
    }}><Select<string> aria-label='テーブルまたは型を検索' autoFocus showSearch={{optionFilterProp:'label'}} placeholder='テーブル / 型名を検索' style={{width:'100%'}} options={findOptions} value={undefined} onSelect={source=>{
      if(findEpoch!==desktop.surface.status.epoch)return;findRestore.current=null;setFindEpoch(null);revealPath(source,false);
      setSelected(source);void desktop.selectTarget(source).catch(desktop.showError);document.getElementById('editor-pane')?.focus({preventScroll:true});
    }}/></Modal>
    {creation.modal}{pathMutation.modal}
  </aside>;
}
