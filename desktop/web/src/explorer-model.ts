import type {Inventory} from './types';

export type ExplorerSort = 'name' | 'type';
export interface ExplorerEntry {
  key: string;
  path: string;
  name: string;
  folder: boolean;
  category: string | null;
  error: string | null;
  children?: ExplorerEntry[];
}
const natural = new Intl.Collator('ja', {numeric:true, sensitivity:'base'});
export const folderKey = (path:string) => 'folder:' + path;
export const entryPath = (key:string) => key.startsWith('folder:') ? key.slice(7) : key;
export const parentPath = (path:string) => path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
export function ancestorKeys(path:string, root:string):string[] {
  const result:string[] = [];
  for(let parent=parentPath(path); parent && parent!==root; parent=parentPath(parent)) result.unshift(folderKey(parent));
  return result;
}
export function stemEnd(filename:string):number {
  const dot=filename.lastIndexOf('.');
  return dot>0 ? dot : filename.length;
}

// Inventory owns discovery and classification; this model only arranges its
// paths for navigation. Folder names never imply a source's domain category.
export function explorerEntries(inventory:Pick<Inventory,'sources'|'folders'|'sourceDirectory'>, sort:ExplorerSort='name', filter=''):ExplorerEntry[] {
  const root=inventory.sourceDirectory, folders=new Map<string,ExplorerEntry>();
  folders.set(root,{key:folderKey(root),path:root,name:root,folder:true,category:null,error:null,children:[]});
  function ensure(path:string):ExplorerEntry | undefined {
    if(folders.has(path))return folders.get(path);
    if(!path.startsWith(root+'/'))return undefined;
    const parent=ensure(parentPath(path));
    if(!parent)return undefined;
    const node:ExplorerEntry={key:folderKey(path),path,name:path.split('/').at(-1)!,folder:true,category:null,error:null,children:[]};
    folders.set(path,node);parent.children!.push(node);return node;
  }
  for(const path of inventory.folders)ensure(path);
  for(const source of inventory.sources) {
    ensure(parentPath(source.path))?.children!.push({key:source.path,path:source.path,name:source.path.split('/').at(-1)!,folder:false,category:source.category,error:source.error});
  }
  const query=filter.trim().toLocaleLowerCase();
  function arrange(nodes:ExplorerEntry[]):ExplorerEntry[] {
    return nodes.flatMap(node=>{
      const children=node.children ? arrange(node.children) : undefined;
      const matches=!query || node.path.slice(root.length+1).toLocaleLowerCase().includes(query);
      return matches || children?.length ? [{...node,children}] : [];
    }).sort((a,b)=>{
      if(a.folder!==b.folder)return a.folder ? -1 : 1;
      if(sort==='type'&&!a.folder) {
        const category=natural.compare(a.category??'',b.category??'');
        if(category)return category;
      }
      return natural.compare(a.name,b.name)||a.path.localeCompare(b.path);
    });
  }
  return arrange(folders.get(root)!.children!);
}
export function visibleEntries(nodes:ExplorerEntry[], expanded:ReadonlySet<string>):ExplorerEntry[] {
  const result:ExplorerEntry[]=[];
  function visit(children:ExplorerEntry[]) {
    for(const node of children){result.push(node);if(node.children&&expanded.has(node.key))visit(node.children);}
  }
  visit(nodes);return result;
}
export function matchingAncestors(nodes:ExplorerEntry[]):string[] {
  return nodes.flatMap(node=>node.folder&&node.children?.length ? [node.key,...matchingAncestors(node.children)] : []);
}
export function nextPrefix(entries:ExplorerEntry[], current:string | null, text:string):string | null {
  const index=entries.findIndex(entry=>entry.key===current), prefix=text.toLocaleLowerCase();
  for(let offset=1;offset<=entries.length;offset++) {
    const entry=entries[(index+offset+entries.length)%entries.length];
    if(entry.name.toLocaleLowerCase().startsWith(prefix))return entry.key;
  }
  return null;
}
