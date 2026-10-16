import { uiMessage, complexSummary } from "./language";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  Alert,
  Button,
  Checkbox,
  Drawer,
  Dropdown,
  Empty,
  Spin,
  Tag,
  Typography,
  type InputRef,
  type MenuProps,
} from "antd";
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  DeleteOutlined,
  HolderOutlined,
  LeftOutlined,
  MoreOutlined,
  PlusOutlined,
  RightOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import { useInteraction, useSurface } from "./app";
import { desktop, GRID, type ComplexView, type EditorNode } from "./workspace";
import { beginArrayDrag, consumeSpatialClick } from "./spatial";
import {isBooleanShape,ScalarValueControl} from "./value-control";
import {ValuePath} from "./value-path";
const same = (a: string[], b: string[]) =>
  a.length === b.length && a.every((s, i) => s === b[i]);

// One active surface, anchored to the exact occurrence. Large/deep editors
// retain the existing drawer rather than building nested popup stacks.
function ValueSurface({target, root, title, open, onClose, children}: {
  target: ReturnType<typeof useInteraction>["complex"];
  root?: EditorNode; title: ReactNode; open: boolean; onClose: () => void; children: ReactNode;
}) {
  const popup = useRef<HTMLDivElement>(null);
  const occurrence = useRef<{row:string;index:number;column:number}|null>(null);
  const [position, setPosition] = useState<{left:number;top:number;width:number;height:number}|null>(null);
  const surface = useRef<{key:string;mode:"inline"|"near"|"drawer"}|null>(null);
  const projection = desktop.surface.projection;
  const shape = projection?.columns.find(c=>c.field.name===target?.root)?.shape;
  const key=target?JSON.stringify([target.epoch,target.source,target.row,target.root]):"";
  if(surface.current?.key!==key)surface.current=null;
  if(target && root && !surface.current) {
    const small=target.path.length===1 && shape && (shape.array?root.totalChildren<=6:
      shape.category==="enum" || shape.category==="flags" || shape.category==="custom"&&(shape.fields?.length??0)<=6);
    // Resolve once before mounting. Loading must not open a drawer that is
    // replaced by an anchored editor, and nested navigation keeps its DOM.
    surface.current={key,mode:small?(shape?.category==="enum"&&!shape.array?"inline":"near"):"drawer"};
  }
  const near=!!surface.current && surface.current.mode!=="drawer";
  const inline=surface.current?.mode==="inline";
  useLayoutEffect(()=>{
    if(!target || !near) {setPosition(null);return;}
    const viewport = desktop.viewport, area = document.getElementById("grid-area");
    const update = () => {
      const p = desktop.surface.projection;
      const row = p?.rows.find(row=>row.id===target.row), column = p?.columns.findIndex(c=>c.field.name===target.root) ?? -1;
      if(row && column>=0)occurrence.current={row:target.row,index:row.viewIndex,column};
      const saved=occurrence.current;
      if(saved?.row!==target.row || !viewport || !area)return;
      const cell=document.getElementById(`cell-${saved.index}-${saved.column}`)?.getBoundingClientRect();
      const bounds=area.getBoundingClientRect(),view=viewport.getBoundingClientRect();
      const cellLeft=cell?cell.left-bounds.left:view.left-bounds.left+GRID.identity+saved.column*GRID.column-viewport.scrollLeft;
      const cellTop=cell?cell.top-bounds.top:view.top-bounds.top+GRID.header+saved.index*GRID.row-viewport.scrollTop;
      const width=inline?GRID.column:Math.min(324,area.clientWidth-GRID.identity);
      const height=inline?GRID.row:Math.min(popup.current?.offsetHeight??240,area.clientHeight-GRID.header);
      const anchorTop=Math.max(GRID.header,Math.min(cellTop,area.clientHeight-GRID.row));
      const top=inline?anchorTop:anchorTop+GRID.row+height<=area.clientHeight?anchorTop+GRID.row:Math.max(GRID.header,anchorTop-height);
      const next={left:Math.max(GRID.identity,Math.min(cellLeft,area.clientWidth-width)),top,width,height:GRID.row};
      // A moving reference element does not make Ant's popup realign. Place
      // the single editor directly in the grid area and move it in this scroll
      // event; the virtualizer's later React commit must not leave it behind.
      if(popup.current){popup.current.style.left=`${next.left}px`;popup.current.style.top=`${next.top}px`;}
      setPosition(next);
    };
    update();viewport?.addEventListener("scroll",update,{passive:true});
    const resize=new ResizeObserver(update);if(area)resize.observe(area);if(popup.current)resize.observe(popup.current);
    return()=>{viewport?.removeEventListener("scroll",update);resize.disconnect();};
  },[target,near,projection?.revision,projection?.rowStart,!!position]);
  useEffect(()=>{
    if(!near || !open)return;
    const outside=(event:PointerEvent)=>{
      const element=event.target;
      if(element instanceof Element&&!element.closest(".inline-enum-surface,.near-value-popover,.ant-select-dropdown,.ant-dropdown"))onClose();
    };
    document.addEventListener("pointerdown",outside);
    return()=>document.removeEventListener("pointerdown",outside);
  },[near,open,onClose]);
  if(!target||!surface.current)return null;
  if(!near)
    return <Drawer title={title} open={open} onClose={onClose} keyboard={false} mask={false} size={400}
      getContainer={()=>document.getElementById("grid-area")!} rootStyle={{position:"absolute"}}
      classNames={{body:"complex-body"}} destroyOnHidden autoFocus={false}>{children}</Drawer>;
  if(!open||!position)return null;
  if(inline)
    return <div ref={popup} className="inline-enum-surface" style={{position:"absolute",...position}}>{children}</div>;
  return <div ref={popup} className="near-value-popover" role="dialog" aria-label={`${target.root} の値を編集`}
    style={{position:"absolute",left:position.left,top:position.top,width:position.width}}>
    <div className="near-value-title">{title}</div><div className="near-value-body">{children}</div>
  </div>;
}
type Typing = {
  authority: ComplexView;
  path: string[];
  initial: string;
  text: string;
  composing: boolean;
  label: string;
  cancel: () => void;
};
export function ComplexPanel() {
  const { complex: target } = useInteraction(),
    s = useSurface();
  const [view, setView] = useState<ComplexView | null>(null),
    [error, setError] = useState<string | null>(null),
    [loading, setLoading] = useState(false);
  const [active, setActive] = useState<string[] | null>(null),
    [nonNull, setNonNull] = useState(false);
  const [menu, setMenu] = useState<{
    child: EditorNode;
    index: number;
    x: number;
    y: number;
  } | null>(null);
  const typing = useRef<Typing | null>(null),
    committing = useRef<Promise<boolean> | null>(null),
    body = useRef<HTMLDivElement>(null),
    request = useRef(0),
    viewRef = useRef(view);
  const focusedTarget = useRef<typeof target>(null);
  // focus-only / window changes can retain the same value path. Focus must
  // wait for that target's descriptor; a later pending state would make its
  // newly focused control inert and silently lose focus.
  const resolvedTarget = useRef<typeof target>(null);
  const restoreFocus = useRef<{
    target: typeof target;
    intent: number;
    element: HTMLElement;
    path?: string;
  } | null>(null);
  const blocked =
    s.pending ||
    s.busy ||
    s.status.recoveryRequired ||
    s.status.uncertain.includes(target?.source ?? "");
  viewRef.current = view;
  useEffect(() => {
    const mine = ++request.current;
    if (s.pending && s.externalPending) return;
    if (
      !target ||
      s.pending ||
      target.epoch !== s.status.epoch ||
      target.source !== s.projection?.source
    ) {
      setView(null);
      resolvedTarget.current = null;
      setMenu(null);
      return;
    }
    setLoading(true);
    setError(null);
    setMenu(null);
    void desktop
      .complexView(target)
      .then((value) => {
        if (
          mine !== request.current ||
          desktop.interaction.complex !== target ||
          value?.generation !== desktop.surface.projection?.generation
        )
          return;
        resolvedTarget.current = target;
        setView(value);
        setLoading(false);
      })
      .catch((e) => {
        if (mine === request.current) {
          setError(
            typeof e === "object" && e && "message" in e
              ? String(e.message)
              : String(e),
          );
          setView(null);
          setLoading(false);
        }
      });
    return () => {
      request.current++;
    };
  }, [
    target,
    s.projection?.revision,
    s.projection?.generation,
    s.pending,
    s.externalPending,
    s.status.epoch,
  ]);
  const operation = useCallback(
    async (
      path: string[],
      op: Record<string, unknown>,
      observed?: ComplexView,
    ) => {
      const value = observed ?? viewRef.current;
      if (!value) return false;
      const element = document.activeElement as HTMLElement | null;
      restoreFocus.current =
        element && body.current?.contains(element)
          ? {
              target: desktop.interaction.complex,
              intent: desktop.inputIntent,
              element,
              path: element.closest<HTMLElement>("[data-value-path]")?.dataset
                .valuePath,
            }
          : null;
      const ok = await desktop.complexEdit(value, path, op);
      if (ok) {
        setActive(null);
        setNonNull(false);
        typing.current = null;
        setMenu(null);
      } else restoreFocus.current = null;
      return ok;
    },
    [],
  );
  const commit = useCallback((): Promise<boolean> => {
    if (committing.current) return committing.current;
    const current = typing.current;
    if (!current || current.text === current.initial)
      return Promise.resolve(true);
    if (current.composing) return Promise.resolve(false);
    committing.current = operation(
      current.path,
      {
        kind: "text",
        text: current.text,
      },
      current.authority,
    ).finally(() => {
      committing.current = null;
    });
    return committing.current;
  }, [operation]);
  useLayoutEffect(() => {
    if (!target) return;
    return desktop.bindEditor(commit, () => {
      const value = typing.current;
      return value ? { source: value.authority.source, revision: value.authority.revision, generation: value.authority.generation, label: `${value.authority.node.label} · ${value.label}`, text: value.text, dirty: value.text !== value.initial, cancel: () => { value.cancel(); typing.current = null; setActive(null); setNonNull(false); } } : null;
    });
  }, [target, commit]);
  useEffect(() => {
    setActive(null);
    setNonNull(false);
    typing.current = null;
    setMenu(null);
  }, [target?.row, target?.source, target?.path]);
  const close = async () => {
    const current = desktop.interaction.complex, intent = desktop.inputIntent, element = document.activeElement;
    if ((await commit()) && desktop.interaction.complex === current) {
      // Outside dismissal must not steal the search/menu/navigation focus that
      // caused it. Explicit Escape/close still returns focus to the grid.
      const restore = intent === desktop.inputIntent && element === document.activeElement && element instanceof Element &&
        !!element.closest(".ant-drawer,.near-value-popover,.inline-enum-surface");
      desktop.closeComplex();
      if(restore)desktop.viewport?.focus({preventScroll:true});
    }
  };
  const navigate = async (path: string[], start = 0) => {
    const previous = desktop.interaction.complex;
    if ((await commit()) && desktop.interaction.complex === previous)
      desktop.complexPath(path, start);
  };
  const change = async (path: string[], op: Record<string, unknown>) => {
    const previous = desktop.interaction.complex,
      observed = viewRef.current,
      p = desktop.surface.projection;
    if (
      !previous ||
      !observed ||
      p?.revision !== observed.revision ||
      p.generation !== observed.generation
    )
      return false;
    if (!(await commit()) || desktop.interaction.complex !== previous)
      return false;
    const current = desktop.surface.projection;
    if (
      current?.revision !== observed.revision ||
      current.generation !== observed.generation
    ) {
      // Completing this editor's own typing can advance the descriptor. Fetch
      // its bounded replacement before composing the user's next direct action.
      const next = await desktop.complexView(previous);
      if (
        !next ||
        desktop.interaction.complex !== previous ||
        next.generation !== desktop.surface.projection?.generation ||
        next.revision !== desktop.surface.projection.revision
      )
        return false;
      viewRef.current = next;
      setView(next);
    }
    return operation(path, op);
  };
  const keydown = (e: KeyboardEvent) => {
    if (
      e.isDefaultPrevented() ||
      e.nativeEvent.isComposing ||
      e.keyCode === 229 ||
      typing.current?.composing
    )
      return;
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      if (typing.current && typing.current.text !== typing.current.initial) {
        const path=typing.current.path;
        typing.current.cancel();
        typing.current = null;
        setActive(null);
        setNonNull(false);
        requestAnimationFrame(()=>{const control=[...body.current?.querySelectorAll<HTMLElement>('[data-value-path]')??[]].find(element=>element.dataset.valuePath===JSON.stringify(path));(control?.querySelector<HTMLElement>('button,input,[role=combobox]')??control)?.focus({preventScroll:true});});
      } else if (active || nonNull) {
        void close();
      } else if (menu) setMenu(null);
      else void close();
    } else if (
      (e.metaKey || e.ctrlKey) &&
      e.key.toLowerCase() === "z" &&
      !(e.target as Element).closest("input,textarea")
    ) {
      e.preventDefault();
      e.stopPropagation();
      history(e.shiftKey);
    } else if (
      e.ctrlKey &&
      e.key.toLowerCase() === "y" &&
      !(e.target as Element).closest("input,textarea")
    ) {
      e.preventDefault();
      e.stopPropagation();
      history(true);
    }
  };
  const history = (redo:boolean) => {
    // History refresh makes the body inert after the keyboard intent advances.
    // Retain the exact control path so that refresh cannot leave focus on body.
    const element=document.activeElement;
    if(element instanceof HTMLElement&&body.current?.contains(element))
      restoreFocus.current={target:desktop.interaction.complex,intent:desktop.inputIntent,element,path:element.closest<HTMLElement>('[data-value-path]')?.dataset.valuePath};
    void desktop.undo(redo);
  };
  const leafControl = (node: EditorNode) => {
    if (!node.editable || !node.shape)
      return (
        <Typography.Text type="secondary" title={uiMessage(node.reason ?? undefined)}>
          {complexSummary(node.display, node.kind === "sequence" || node.kind === "mapping")}
        </Typography.Text>
      );
    if (!node.shape.array && (node.shape.category==='enum'||isBooleanShape(node.shape)&&(node.kind==='null'||['true','false'].includes(node.input??''))))
      return <ScalarValueControl shape={node.shape} value={node.kind==='null'?null:node.input} label={node.label} invalid={!node.valid}
        onChange={next=>void change(node.path,next===null?{kind:'null'}:node.shape!.category==='enum'?{kind:'enum',symbol:next}:{kind:'text',text:next})}/>;
    if (
      node.shape.array ||
      ["custom", "flags"].includes(node.shape.category)
    )
      return (
        <Button
          type="text"
          className="complex-value-link"
          aria-invalid={!node.valid}
          icon={node.valid ? undefined : <WarningOutlined aria-hidden="true" />}
          onClick={() => void navigate(node.path)}
        >
          {complexSummary(node.display, node.kind === "sequence" || node.kind === "mapping")}
          <RightOutlined aria-hidden="true" />
        </Button>
      );
    if (active && same(active, node.path))
      return (
        <LeafInput
          node={node}
          nonNull={node.kind==="null"}
          authority={view!}
          update={(value) => {
            typing.current = value;
          }}
          commit={commit}
          enumSelect={(symbol) =>
            void change(node.path, symbol===null?{kind:"null"}:{ kind: "enum", symbol })
          }
        />
      );
    return (
      <Button
        type="text"
        className="complex-value-link"
        aria-invalid={!node.valid}
        icon={node.valid ? undefined : <WarningOutlined aria-hidden="true" />}
        data-value-path={JSON.stringify(node.path)}
        aria-label={`編集: ${node.label}: ${complexSummary(node.display, node.kind === "sequence" || node.kind === "mapping")}`}
        onClick={() => setActive(node.path)}
      >
        {complexSummary(node.display, node.kind === "sequence" || node.kind === "mapping")}
      </Button>
    );
  };
  const control = (node:EditorNode) => {
    if(!node.shape?.nullable||!node.editable)return leafControl(node);
    if(!node.shape.array&&(node.shape.category==='enum'||isBooleanShape(node.shape)&&(node.kind==='null'||['true','false'].includes(node.input??''))))return leafControl(node);
    return <div className="nullable-value-control">
      {node.kind==="null" ? <Button type="text" className="null-value" aria-label={`${node.label} の値を設定`} onClick={()=>{
        const previous=desktop.interaction.complex,intent=desktop.inputIntent;
        void change(node.path,{kind:"materialize"}).then(ok=>{
          if(!ok||previous!==desktop.interaction.complex||intent!==desktop.inputIntent)return;
          if(node.shape?.array||["custom","flags"].includes(node.shape?.category??""))void navigate(node.path);
          else if(node.shape?.typeName!=="bool"&&node.shape?.underlying!=="bool")setActive(node.path);
        });
      }}><span>未設定</span><PlusOutlined aria-hidden="true"/>値を設定</Button> : leafControl(node)}
      {node.kind!=="null"&&<Button type="text" className="nullable-clear" aria-label={`${node.label} を未設定にする`} title="未設定（null）にする" onClick={()=>void change(node.path,{kind:"null"})}>×</Button>}
    </div>;
  };
  const root =
    target &&
    view?.source === target.source &&
    view.row === target.row &&
    same(view.node.path, target.path)
      ? view.node
      : undefined;
  const stale =
    !!view &&
    (resolvedTarget.current !== target ||
      view.revision !== s.projection?.revision ||
      view.generation !== s.projection?.generation);
  const focusCurrent=useRef<()=>void>(()=>{});
  focusCurrent.current=() => {
    const restore = restoreFocus.current;
    const validRestore =
      restore?.target === target && restore.intent === desktop.inputIntent;
    if (restore && !validRestore) restoreFocus.current = null;
    if (
      !target ||
      !root ||
      loading ||
      stale ||
      blocked ||
      (!validRestore &&
        target.inputIntent !== undefined &&
        target.inputIntent !== desktop.inputIntent) ||
      (focusedTarget.current === target && !restoreFocus.current && body.current?.contains(document.activeElement))
    )
      return;
    const container = body.current;
    if (!container) return;
    // The anchored surface mounts before its deferred initial focus callback.
    // A leaf can already own focus by then; initial focus must not replace it
    // with the first handle and blur/commit the user's composing input.
    if (!validRestore && !target.focusPath && container.contains(document.activeElement)) {
      focusedTarget.current = target;
      return;
    }
    if (focusedTarget.current === target && !validRestore && container.contains(document.activeElement)) return;
    const focusPath =
      validRestore && restore.path
        ? restore.path
        : target.focusPath
          ? JSON.stringify(target.focusPath)
          : undefined;
    const requested = focusPath
      ? [...container.querySelectorAll<HTMLElement>("[data-value-path]")].find(
          (element) => element.dataset.valuePath === focusPath,
        )
      : undefined;
    const within = requested ?? container;
    const control = within.querySelector<HTMLElement>(
      "input:not(:disabled),button:not(:disabled),[role=combobox]:not([aria-disabled=true])",
    );
    const focus =
      validRestore && restore.element.isConnected
        ? restore.element
        : (control ?? requested);
    if (focus) {
      focus.focus({ preventScroll: true });
      if (
        document.activeElement === focus ||
        focus.contains(document.activeElement)
      ) {
        focusedTarget.current = target;
        restoreFocus.current = null;
      }
    }
  };
  useLayoutEffect(()=>focusCurrent.current(),[target,root,loading,stale,blocked]);
  // The anchored body mounts after its cell position is known. Publish initial
  // focus from that mount, guarded against newer input and existing leaf focus.
  const bindBody=useCallback((element:HTMLDivElement|null)=>{
    body.current=element;
    if(element)requestAnimationFrame(()=>focusCurrent.current());
  },[]);

  const arrayItems = (invalidFlag = false) =>
    root?.children
      .filter((child) => !invalidFlag || !child.valid)
      .map((child, index) => (
        <div
          key={child.path.at(-1)}
          className="complex-item"
          data-item={child.path.at(-1)}
        >
          <button
            className="spatial-handle element-grip"
            title="要素を並べ替え"
            aria-label={`要素を並べ替え ${child.label}`}
            disabled={!root?.editable || !root.shape?.array}
            onPointerDown={(e) =>
              view &&
              beginArrayDrag(
                e,
                view,
                child,
                (item, index) =>
                  change(root!.path, { kind: "place", item, index }),
                (path) => desktop.complexPath(root!.path, root!.start, path),
              )
            }
            onClick={(e) => {
              if (consumeSpatialClick(e.detail)) return;
              const r = e.currentTarget.getBoundingClientRect();
              setMenu({ child, index, x: r.left, y: r.bottom });
            }}
          >
            <HolderOutlined aria-hidden="true" />
          </button>
          <span className="element-number">{child.label}</span>
          <div
            className="element-value complex-control"
            data-value-path={JSON.stringify(child.path)}
            tabIndex={-1}
          >
            {invalidFlag ? (
              <Tag color="warning">{child.display}</Tag>
            ) : (
              control(child)
            )}
          </div>
          <button
            className="spatial-handle"
            aria-label={`${child.label} の操作`}
            title="要素の操作"
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              setMenu({ child, index, x: r.left - 150, y: r.bottom });
            }}
          >
            <MoreOutlined aria-hidden="true" />
          </button>
        </div>
      ));
  const items: MenuProps["items"] = root?.shape?.array
    ? [
        {
          key: "up",
          label: "上に移動",
          icon: <ArrowUpOutlined aria-hidden="true" />,
          disabled: root.start + (menu?.index ?? 0) === 0,
        },
        {
          key: "down",
          label: "下に移動",
          icon: <ArrowDownOutlined aria-hidden="true" />,
          disabled: root.start + (menu?.index ?? 0) + 1 === root.totalChildren,
        },
        { type: "divider" },
        {
          key: "remove",
          label: "削除",
          icon: <DeleteOutlined aria-hidden="true" />,
          danger: true,
        },
      ]
    : [
        {
          key: "remove",
          label: "削除",
          icon: <DeleteOutlined aria-hidden="true" />,
          danger: true,
        },
      ];
  return (
    <ValueSurface
      target={target}
      root={root}
      title={root&&view?<ValuePath items={view.breadcrumbs.map(item=>({key:JSON.stringify(item.path),label:item.label}))} onSelect={index=>void navigate(view.breadcrumbs[index].path)}/>:<span>{target?.root??'複合値'}</span>}
      open={!!target && (!s.pending || s.externalPending) && target.epoch === s.status.epoch}
      onClose={() => void close()}
    >
      <div
        ref={bindBody}
        onKeyDown={keydown}
        inert={loading || stale || blocked}
        aria-busy={loading || stale || blocked}
      >
        {error ? (
          <Alert
            type="error"
            showIcon
            title="値を取得できません"
            description={uiMessage(error)}
          />
        ) : loading && !root ? (
          <Spin size="small" />
        ) : (
          root && (
            <>
              {root.problem && !(root.shape?.category==="enum"&&!root.shape.array&&target?.path.length===1) && (
                <Alert
                  type="warning"
                  showIcon
                  title={uiMessage(root.problem.message)}
                  className="value-problem"
                  description={root.shape?.array&&root.kind!=="sequence" ? `元の値：${root.display}。下の修復操作で空の配列へ置き換えます。元に戻すで復元できます。` : undefined}
                />
              )}
              {root.shape?.nullable && !isBooleanShape(root.shape) && !(root.shape.category==="enum"&&!root.shape.array&&target?.path.length===1) && (
                <div className="value-null-state"><Tag>{root.kind==="null"?"未設定（null）":"値あり"}</Tag>
                  <Button size="small" disabled={!root.editable} onClick={()=>void change(root.path,{kind:root.kind==="null"?"materialize":"null"})}>{root.kind==="null"?"初期値で設定":"未設定にする"}</Button>
                </div>
              )}
              {!root.shape || !root.editable ? (
                <Typography.Paragraph type="secondary">
                  {root.display} · {uiMessage(root.reason)}
                </Typography.Paragraph>
              ) : root.kind === "null" && root.shape.nullable && !isBooleanShape(root.shape) ? (
                <Typography.Paragraph type="secondary">値を設定すると、この型の初期値から編集できます。</Typography.Paragraph>
              ) : root.shape.array && root.kind === "sequence" ? (
                <>
                  {arrayItems()}
                  <Button
                    type="text"
                    icon={<PlusOutlined aria-hidden="true" />}
                    onClick={() => {
                      const previous = target,
                        intent = desktop.inputIntent;
                      void change(root.path, { kind: "add" }).then(
                        async (ok) => {
                          if (
                            !ok ||
                            intent !== desktop.inputIntent ||
                            desktop.interaction.complex !== previous ||
                            !previous
                          )
                            return;
                          const start =
                            Math.floor(root.totalChildren / 64) * 64;
                          const next = await desktop.complexView({
                            ...previous,
                            start,
                          });
                          if (
                            next &&
                            intent === desktop.inputIntent &&
                            desktop.interaction.complex === previous &&
                            next.generation ===
                              desktop.surface.projection?.generation
                          ) {
                            const added =
                              next.node.children[root.totalChildren - start];
                            desktop.complexPath(root.path, start, added?.path);
                          }
                        },
                      );
                    }}
                  >

                    要素
                  </Button>
                </>
              ) : root.shape.category === "flags" &&
                !root.shape.array &&
                root.kind === "sequence" ? (
                <>
                  <div className="flags-members">
                    {root.shape.members?.map((symbol) => (
                      <Checkbox
                        key={symbol}
                        checked={root.selectedMembers.includes(symbol)}
                        onChange={(e) =>
                          void change(root.path, {
                            kind: "flag",
                            symbol,
                            enabled: e.target.checked,
                          })
                        }
                      >
                        {symbol}
                      </Checkbox>
                    ))}
                  </div>
                  {arrayItems(true)}
                </>
              ) : root.shape.category === "custom" &&
                root.kind === "mapping" ? (
                <div className="custom-fields">
                  {root.children.map((child) => (
                    <div key={child.label} className="complex-field">
                      <Typography.Text type="secondary">
                        {child.label}
                      </Typography.Text>
                      <div
                        className="complex-control"
                        data-value-path={JSON.stringify(child.path)}
                        tabIndex={-1}
                      >
                        {control(child)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : root.shape.array ||
                root.shape.category === "custom" ||
                root.shape.category === "flags" ? (
                <Button
                  icon={<PlusOutlined aria-hidden="true" />}
                  onClick={() =>
                    void change(root.path, { kind: "materialize" })
                  }
                >
                  {root.shape.array
                    ? "空の配列へ置き換えて修復"
                    : root.shape.category === "flags"
                      ? "Flagsの値を作成"
                      : "Custom Typeの値を作成"}
                </Button>
              ) : (
                <div
                  className="complex-control"
                  data-value-path={JSON.stringify(root.path)}
                  tabIndex={-1}
                >
                  <LeafInput
                    key={JSON.stringify(root.path)}
                    node={root}
                    authority={view!}
                    nonNull={root.kind==="null"}
                    update={(value) => {
                      typing.current = value;
                    }}
                    commit={commit}
                    enumSelect={(symbol) =>
                      void change(root.path, symbol===null?{kind:"null"}:{ kind: "enum", symbol })
                    }
                  />
                </div>
              )}
              {root.totalChildren > 64 && (
                <div className="complex-pages">
                  <Button
                    icon={<LeftOutlined aria-hidden="true" />}
                    aria-label="前の要素"
                    disabled={root.start === 0}
                    onClick={() =>
                      void navigate(root.path, Math.max(0, root.start - 64))
                    }
                  />
                  <Typography.Text type="secondary">
                    {root.start + 1}–
                    {Math.min(root.totalChildren, root.start + 64)} /{" "}
                    {root.totalChildren}
                  </Typography.Text>
                  <Button
                    icon={<RightOutlined aria-hidden="true" />}
                    aria-label="次の要素"
                    disabled={root.start + 64 >= root.totalChildren}
                    onClick={() => void navigate(root.path, root.start + 64)}
                  />
                </div>
              )}
            </>
          )
        )}
      </div>
      <Dropdown
        trigger={[]}
        open={!!menu}
        autoFocus
        onOpenChange={(open) => {
          if (!open) setMenu(null);
        }}
        menu={{
          items,
          onClick: ({ key }) => {
            if (!menu || !root) return;
            const item = menu.child.path.at(-1);
            const previous = target,
              path = menu.child.path;
            const destination = Math.max(
              0,
              root.start + menu.index + (key === "up" ? -1 : 1),
            );
            setMenu(null);
            void change(
              root.path,
              key === "remove"
                ? { kind: "remove", item }
                : { kind: "nudge", item, delta: key === "up" ? -1 : 1 },
            ).then((ok) => {
              if (ok && desktop.interaction.complex === previous)
                desktop.complexPath(
                  root.path,
                  key === "remove"
                    ? root.start
                    : Math.floor(destination / 64) * 64,
                  key === "remove" ? undefined : path,
                );
            });
          },
        }}
      >
        <span
          className="menu-anchor"
          style={{ position: "fixed", left: menu?.x ?? 0, top: menu?.y ?? 0 }}
          aria-hidden="true"
        />
      </Dropdown>
    </ValueSurface>
  );
}
function LeafInput({
  node,
  authority,
  nonNull = false,
  update,
  commit,
  enumSelect,
}: {
  node: EditorNode;
  authority: ComplexView;
  nonNull?: boolean;
  update: (typing: Typing) => void;
  commit: () => Promise<boolean>;
  enumSelect: (symbol: string | null) => void;
}) {
  const input = useRef<InputRef>(null),
    initial = useRef(nonNull ? "" : (node.input ?? "")),
    value = useRef(initial.current),
    composing = useRef(false),
    observed = useRef(authority);
  const [text, set] = useState(initial.current);
  const report = (force = false) =>
    update({
      authority: observed.current,
      path: node.path,
      initial: force ? "\u0000" : initial.current,
      text: value.current,
      composing: composing.current,
      label: node.label,
      cancel: () => {
        value.current = initial.current;
        set(initial.current);
      },
    });
  useLayoutEffect(() => {
    input.current?.focus({ cursor: "all" });
  }, []);
  useLayoutEffect(() => {
    const next = nonNull ? "" : (node.input ?? "");
    // A fresh committed value/Undo updates a clean editor. A background
    // interpretation update cannot discard unfinished input.
    if (value.current === initial.current || value.current === next) {
      initial.current = next;
      value.current = next;
      set(next);
      observed.current = authority;
    }
  }, [node.input, nonNull, authority]);
  const boolean=isBooleanShape(node.shape)&&(node.kind==='null'||['true','false'].includes(node.input??''));
  return (
    <div className="complex-input">
      <ScalarValueControl
        shape={node.shape}
        textSession={isBooleanShape(node.shape)&&!boolean}
        inputRef={input}
        autoFocus
        defaultOpen={node.shape?.category==='enum'}
        value={node.shape?.category==='enum'?node.input:node.kind==='null'&&boolean?null:text}
        label={node.label}
        invalid={!node.valid}
        onChange={next=>{
          if(next===null||node.shape?.category==='enum'){enumSelect(next);return;}
          value.current=next;set(next);report();
          if(boolean)void commit();
        }}
        onCompositionStart={()=>{composing.current=true;report();}}
        onCompositionEnd={()=>{composing.current=false;report();}}
        onBlur={()=>{if(!desktop.surface.externalPending)void commit();}}
        onKeyDown={e=>{
          if(e.nativeEvent.isComposing||composing.current||e.keyCode===229||node.shape?.category==='enum')return;
          if(!boolean&&e.key==='Enter'){e.preventDefault();e.stopPropagation();void commit();}
          else if(!boolean&&e.key==='Tab')void commit();
        }}
      />
      {nonNull && (node.shape?.typeName==="string"||node.shape?.underlying==="string") && (
        <Button
          onClick={() => {
            report(true);
            void commit();
          }}
        >
          入力を確定
        </Button>
      )}
    </div>
  );
}
