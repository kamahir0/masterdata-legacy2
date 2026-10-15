export type DiffLine = {left?:{number:number;text:string};right?:{number:number;text:string};changed:boolean};

// Unique unchanged lines anchor YAML blocks without allocating a quadratic
// matrix for large sources. Repeated-only blocks remain one explicit change.
export function sourceDiff(before:string,after:string):DiffLine[] {
  const a=before.split('\n'),b=after.split('\n'),result:DiffLine[]=[];
  const same=(i:number,j:number)=>result.push({left:{number:i+1,text:a[i]},right:{number:j+1,text:b[j]},changed:false});
  function block(a0:number,a1:number,b0:number,b1:number) {
    while(a0<a1&&b0<b1&&a[a0]===b[b0])same(a0++,b0++);
    let tail=0;while(a0<a1-tail&&b0<b1-tail&&a[a1-tail-1]===b[b1-tail-1])tail++;
    const ae=a1-tail,be=b1-tail;
    const counts=(lines:string[],start:number,end:number)=>{const map=new Map<string,number>();for(let i=start;i<end;i++)map.set(lines[i],map.has(lines[i])?-1:i);return map;};
    const ac=counts(a,a0,ae),bc=counts(b,b0,be),pairs:[number,number][]=[];
    for(const [text,i] of ac){const j=bc.get(text);if(i>=0&&j!==undefined&&j>=0)pairs.push([i,j]);}
    const tails:number[]=[],previous:number[]=[];
    pairs.forEach((pair,i)=>{let lo=0,hi=tails.length;while(lo<hi){const mid=(lo+hi)>>1;if(pairs[tails[mid]][1]<pair[1])lo=mid+1;else hi=mid;}previous[i]=lo?tails[lo-1]:-1;tails[lo]=i;});
    const anchors:[number,number][]=[];for(let i=tails.at(-1)??-1;i>=0;i=previous[i])anchors.push(pairs[i]);anchors.reverse();
    if(anchors.length){for(const [i,j] of anchors){block(a0,i,b0,j);same(i,j);a0=i+1;b0=j+1;}block(a0,ae,b0,be);}
    else for(let offset=0;offset<Math.max(ae-a0,be-b0);offset++)result.push({left:a0+offset<ae?{number:a0+offset+1,text:a[a0+offset]}:undefined,right:b0+offset<be?{number:b0+offset+1,text:b[b0+offset]}:undefined,changed:true});
    for(let offset=0;offset<tail;offset++)same(ae+offset,be+offset);
  }
  block(0,a.length,0,b.length);return result;
}
