import { invoke } from "@tauri-apps/api/core";
import { desktop, GRID } from "./workspace";

const SOURCE = "sources/catalog-data.yaml",
  SCHEMA = "sources/catalog-schema.yaml";
// This adapter drives the actual native WebView's event handlers. It does not
// substitute for OS pointer, keyboard, IME, accessibility or visual review.
const frame = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
async function until(test: () => boolean, message: string) {
  const deadline = performance.now() + 5000;
  while (!test()) {
    if (performance.now() >= deadline) throw new Error(message);
    await frame();
  }
}
function assert(test: unknown, message: string): asserts test {
  if (!test) throw new Error(message);
}
function key(element: HTMLElement, key: string, extra: KeyboardEventInit = {}) {
  element.dispatchEvent(
    new KeyboardEvent("keydown", { key, bubbles: true, ...extra }),
  );
}
function text(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )!.set!.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}
const find = (selector: string) => {
  const element = document.querySelector<HTMLElement>(selector);
  assert(element, `missing ${selector}`);
  return element;
};
const point = (element: HTMLElement) => {
  const rect = element.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
};
function pointer(
  element: EventTarget,
  kind: string,
  at: { x: number; y: number },
) {
  element.dispatchEvent(
    new PointerEvent(kind, {
      bubbles: true,
      button: 0,
      buttons: kind === "pointerup" ? 0 : 1,
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true,
      clientX: at.x,
      clientY: at.y,
    }),
  );
}
async function drag(handle: HTMLElement, destination: HTMLElement) {
  const start = point(handle),
    end = point(destination);
  pointer(handle, "pointerdown", start);
  await frame();
  await frame();
  pointer(document, "pointermove", end);
  await until(
    () => !!document.querySelector(".spatial-ghost"),
    "drag did not lift the whole object",
  );
  await frame();
  const ghost = find(".spatial-ghost");
  assert(
    ghost.inert && ghost.closest("[aria-hidden=true]"),
    "drag duplicated interactive controls",
  );
  assert(
    document.querySelectorAll(".spatial-ghost").length === 1,
    "unbounded drag previews",
  );
  assert(
    document.querySelector(".spatial-displaced"),
    "destination neighbours did not open space",
  );
  return { start, end, ghost };
}
async function neighbourMotion(axis:"x"|"y",sign:number) {
  const element=[...document.querySelectorAll<HTMLElement>('.spatial-displaced')].find(el=>axis==='x'?el.classList.contains('column'):el.classList.contains('grid-row'));
  assert(element,'visible neighbour missing');
  const value=()=>{const matrix=new DOMMatrixReadOnly(getComputedStyle(element).transform);return axis==='x'?matrix.m41:matrix.m42;};
  const destination=(axis==='x'?GRID.column:GRID.row)*sign;
  const samples:number[]=[];let completed=false;
  await until(()=>{
    const displacement=value();samples.push(displacement);
    if(Math.abs(displacement-destination)<.5){completed=true;return true;}
    return false;
  },'neighbour interpolation did not reach its destination');
  const intermediate=samples.some(x=>Math.abs(x)>0.1&&Math.abs(x)<Math.abs(destination)-.5);
  if(!matchMedia('(prefers-reduced-motion: reduce)').matches)assert(intermediate,'neighbour jumped directly instead of interpolating');
  assert(completed,'neighbour target missing');
}
async function settle() {
  await until(
    () =>
      !desktop.surface.busy &&
      !desktop.surface.pending &&
      !document.querySelector(".spatial-ghost"),
    "operation did not settle",
  );
  assert(!desktop.surface.error, desktop.surface.error ?? "operation failed");
  await frame();
}
async function focusCell(row: number, column: number) {
  const viewport = desktop.viewport!;
  viewport.focus();
  while (desktop.interaction.selection.row !== row) {
    key(
      viewport,
      desktop.interaction.selection.row < row ? "ArrowDown" : "ArrowUp",
    );
    await frame();
  }
  while (desktop.interaction.selection.column !== column) {
    key(
      viewport,
      desktop.interaction.selection.column < column
        ? "ArrowRight"
        : "ArrowLeft",
    );
    await frame();
  }
  await until(
    () => !!document.getElementById(`cell-${row}-${column}`),
    "selected cell did not mount",
  );
}
async function undo() {
  const revision = desktop.surface.projection!.revision,
    schema = desktop.surface.projection!.schemaRevision;
  find("button[aria-label=\"元に戻す\"]").click();
  await until(
    () =>
      desktop.surface.projection!.revision !== revision ||
      desktop.surface.projection!.schemaRevision !== schema,
    "Undo was not accepted",
  );
  await settle();
}
export async function run({ startup }: { startup: Record<string, unknown> }) {
  const checks: Record<string, unknown>[] = [];
  let arrayOpeningGeometry:unknown;
  const bytes = async (source = SOURCE) =>
    (
      await desktop.rpc<{ before: string; after: string }>({
        kind: "compare",
        source,
      })
    ).data;
  const record = (name: string, value: Record<string, unknown> = {}) =>
    checks.push({ name, ...value });
  if (!document.hasFocus())
    await new Promise<void>((resolve) =>
      window.addEventListener("focus", () => resolve(), { once: true }),
    );
  try {
    await desktop.selectTarget(SOURCE, "authoring", false);
    const base = await bytes(),
      schemaBase = await bytes(SCHEMA);
    const originalRows = desktop.surface.projection!.rows.map((row) => row.id);
    await focusCell(0, 11);
    find("#cell-0-11").click();
    await until(
      () => !!document.querySelector(".active-cell-editor input"),
      "scalar editor missing",
    );
    const input = find(".active-cell-editor input") as HTMLInputElement;
    const initialEditorFocused = input === document.activeElement;
    assert(initialEditorFocused, "scalar editor did not receive focus");
    input.dispatchEvent(
      new CompositionEvent("compositionstart", { bubbles: true }),
    );
    text(input, "日本語");
    key(input, "Enter", { isComposing: true });
    await frame();
    assert(
      (await bytes()).after === base.after && desktop.interaction.editor,
      "composition Enter committed or navigated",
    );
    input.dispatchEvent(
      new CompositionEvent("compositionend", { bubbles: true, data: "日本語" }),
    );
    key(input, "Enter", { keyCode: 229, which: 229 });
    await frame();
    assert(
      (await bytes()).after === base.after && desktop.interaction.editor &&
        desktop.interaction.selection.row === 0 && input === document.activeElement,
      "IME confirmation after compositionend committed or moved the scalar cell",
    );
    key(input, "Enter");
    await until(
      () => !desktop.interaction.editor && !desktop.surface.busy,
      "scalar commit did not finish",
    );
    assert(
      (await bytes()).after ===
        base.after.replace("name: Debug Sword", "name: 日本語"),
      "scalar commit changed non-target bytes",
    );
    record("scalar-composition", {
      initialEditorFocused,
      singleClickEditor: true,
      compositionEnterPreserved: true,
      compositionEndEnterPreserved: true,
      exactLocalizedBytes: true,
    });
    await undo();
    assert((await bytes()).after === base.after, "scalar Undo failed");
    await focusCell(0, 2);
    pointer(find("#cell-0-2"), "pointerdown", point(find("#cell-0-2")));
    await frame();
    await frame();
    pointer(document, "pointermove", point(find("#cell-1-3")));
    await frame();
    await frame();
    pointer(document, "pointerup", point(find("#cell-1-3")));
    await frame();
    assert(
      desktop.interaction.anchor?.id === originalRows[0] &&
        desktop.interaction.selection.id === originalRows[1] &&
        desktop.interaction.selection.column === 3,
      "range lost occurrence identity",
    );
    key(desktop.viewport!, "Escape");
    await frame();
    assert(!desktop.interaction.anchor, "Escape did not collapse range");
    assert(
      (await bytes()).after === base.after,
      "range selection mutated source",
    );
    record("pointer-range");
    await focusCell(0, 0);
    let gesture = await drag(
      find(".grid-row .row-grip"),
      find(".grid-row:nth-child(2) .row-identity"),
    );
    await neighbourMotion("y",-1);
    assert(
      gesture.ghost.querySelector(".row-identity") &&
        gesture.ghost.querySelector(".cell"),
      "row preview omitted identity or values",
    );
    assert(
      (await bytes()).after === base.after,
      "row preview mutated source before drop",
    );
    key(document.body, "Escape");
    await settle();
    assert(
      (await bytes()).after === base.after &&
        !desktop.surface.projection!.dirty,
      "cancelled row drag mutated source/history",
    );
    record("row-drag-cancel");
    gesture = await drag(
      find(".grid-row .row-grip"),
      find(".grid-row:nth-child(2) .row-identity"),
    );
    pointer(document, "pointerup", gesture.end);
    await settle();
    assert(
      desktop.surface.projection!.rows[1].id === originalRows[0] &&
        desktop.interaction.selection.id === originalRows[0],
      "row drop lost moved occurrence/focus",
    );
    await undo();
    assert(
      (await bytes()).after === base.after &&
        !desktop.surface.projection!.canUndo,
      "row drop was not one Undo",
    );
    record("row-drag-drop", { oneUndo: true });
    gesture=await drag(find('.grid-row:nth-child(2) .row-grip'),find('.grid-row .row-identity'));
    await neighbourMotion("y",1);key(document.body,'Escape');await settle();
    assert((await bytes()).after===base.after&&!desktop.surface.projection!.canUndo,'upward preview / cancel changed source');
    record('bidirectional-row-motion');
    const quickStart = point(find(".grid-row .row-grip")),
      quickEnd = point(find(".grid-row:nth-child(2) .row-identity"));
    pointer(find(".grid-row .row-grip"), "pointerdown", quickStart);
    await Promise.resolve();
    pointer(document, "pointermove", quickEnd);
    pointer(document, "pointerup", quickEnd);
    await until(() => desktop.surface.projection!.rows[1].id === originalRows[0], "between-frame drop was lost");
    await settle();
    await undo();
    assert((await bytes()).after === base.after && !desktop.surface.projection!.canUndo, "quick drop was not one Undo");
    record("between-frame-row-drop", { oneUndo: true });
    const originalColumns = desktop.surface.projection!.columns.map(
      (c) => c.field.name,
    );
    gesture = await drag(
      find(".column .column-grip"),
      find(".column:nth-child(4) .column-grip"),
    );
    await neighbourMotion("x",-1);
    assert(
      gesture.ghost.querySelector(".column") &&
        gesture.ghost.querySelector(".cell"),
      "column preview omitted header or values",
    );
    assert(
      (await bytes(SCHEMA)).after === schemaBase.after,
      "column preview mutated schema",
    );
    pointer(document, "pointerup", gesture.end);
    await settle();
    assert(
      desktop.surface.projection!.columns[2].field.name === originalColumns[0],
      "column drop destination wrong",
    );
    assert(
      (await bytes()).after === base.after &&
        desktop.surface.projection!.schemaDirty,
      "column drop dirtied record bytes",
    );
    await undo();
    assert(
      (await bytes(SCHEMA)).after === schemaBase.after &&
        !desktop.surface.projection!.schemaCanUndo,
      "column drop was not one schema Undo",
    );
    record("column-drag-drop", { oneUndo: true, separateDataPreserved: true });
    gesture=await drag(find('.column:nth-child(4) .column-grip'),find('.column .column-grip'));
    await neighbourMotion("x",1);key(document.body,'Escape');await settle();
    assert((await bytes(SCHEMA)).after===schemaBase.after&&!desktop.surface.projection!.schemaCanUndo,'leftward preview / cancel changed schema');
    record('bidirectional-column-motion');
    await focusCell(1, 15);
    key(desktop.viewport!, "Enter");
    await until(
      () => document.querySelectorAll(".complex-item").length === 3,
      "Array editor did not publish bounded controls",
    );
    assert(
      (await bytes()).after === base.after &&
        !desktop.surface.projection!.dirty,
      "opening Array made it dirty",
    );
    // Ant mounts a Popover offscreen until its alignment is ready. DOM presence
    // alone is not a pointer target; start as soon as both grips are on screen,
    // without waiting for the opening animation or delaying product input.
    const openingRect=()=>find(".near-value-body").getBoundingClientRect().toJSON();
    arrayOpeningGeometry={before:document.querySelector(".near-value-body")?openingRect():null};
    await until(()=>{
      const grips=[...document.querySelectorAll<HTMLElement>(".near-value-body .element-grip")].slice(0,2);
      return grips.length===2&&grips.every(element=>{const r=element.getBoundingClientRect();return r.width>0&&r.height>0&&r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight&&!element.closest('[inert]');});
    },"Array pointer targets were not placed on screen");
    arrayOpeningGeometry={...(arrayOpeningGeometry as object),accepted:openingRect()};
    const firstItem = find(".complex-item").dataset.item;
    gesture = await drag(
      find(".complex-item .element-grip"),
      find(".complex-item:nth-child(2) .element-grip"),
    );
    pointer(document, "pointerup", gesture.end);
    await settle();
    await until(
      () => find(".complex-item:nth-child(2)").dataset.item === firstItem,
      "Array drop lost exact equal-value occurrence",
    );
    assert(
      (await bytes()).after ===
        base.after.replace('numbers: [1, "1", -2]', 'numbers: ["1", 1, -2]'),
      "Array drop changed lexical/non-target bytes",
    );
    key(find(".complex-item:nth-child(2) .element-value button"), "Escape");
    await until(() => !desktop.interaction.complex, "Complex close missing");
    assert(
      desktop.surface.projection!.dirty,
      "closing Complex rolled back committed drop",
    );
    await undo();
    assert(
      (await bytes()).after === base.after &&
        !desktop.surface.projection!.canUndo,
      "Array drop was not one Undo",
    );
    record("array-drag-drop", {
      occurrencePreserved: true,
      lexicalBytesPreserved: true,
      closePreservedCommit: true,
      oneUndo: true,
    });
    await focusCell(1, 15);
    key(desktop.viewport!, "Enter");
    await until(
      () => document.querySelectorAll(".complex-item").length === 3,
      "Array reopen missing",
    );
    await until(()=>!!document.querySelector(':is(.near-value-body,.ant-drawer-body) > [aria-busy="false"]'),"Complex values did not become interactive");
    find(".complex-item .element-value button").click();
    await until(
      () => !!document.querySelector(".complex-input input"),
      "nested leaf input missing",
    );
    const nestedInput = find(".complex-input input") as HTMLInputElement;
    nestedInput.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    text(nestedInput, "invalid");
    nestedInput.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: "invalid" }));
    key(nestedInput, "Enter", { keyCode: 229, which: 229 });
    await frame();
    assert(
      (await bytes()).after === base.after && nestedInput === document.activeElement,
      "IME confirmation after compositionend committed a Complex operation",
    );
    const add = [
      ...document.querySelectorAll<HTMLButtonElement>(
        ":is(.ant-drawer-body,.near-value-body) button",
      ),
    ].find((b) => b.textContent?.trim() === "要素");
    assert(add, "Array Add missing");
    add.click();
    await until(
      () =>
        document.querySelectorAll(".complex-item").length === 4 &&
        !desktop.surface.busy,
      "typing then Add did not compose",
    );
    assert(
      (await bytes()).after ===
        base.after.replace(
          'numbers: [1, "1", -2]',
          'numbers: [invalid, "1", -2, null]',
        ),
      "composed Complex operation changed non-target bytes",
    );
    await until(
      () =>
        find(".complex-item:last-of-type .element-value").contains(
          document.activeElement,
        ),
      "Array Add did not focus added occurrence once",
    );
    record("complex-typing-add", {
      twoOperations: true,
      addedOccurrenceFocused: true,
    });
    await undo();
    await until(
      () => document.querySelectorAll(".complex-item").length === 3,
      "Add Undo missing",
    );
    await until(
      () =>
        document.querySelector(':is(.ant-drawer-body,.near-value-body) [aria-busy="false"]') !== null,
      "Array descriptor did not become current",
    );
    const secondAdd = [
      ...document.querySelectorAll<HTMLButtonElement>(
        ":is(.ant-drawer-body,.near-value-body) button",
      ),
    ].find((b) => b.textContent?.trim() === "要素")!;
    secondAdd.click();
    const search = find("#search");
    search.focus();
    key(search, "ArrowLeft");
    await until(
      () =>
        document.querySelectorAll(".complex-item").length === 4 &&
        !desktop.surface.busy &&
        document.querySelector(':is(.ant-drawer-body,.near-value-body) [aria-busy="false"]') !== null,
      "second Add did not finish",
    );
    await frame();
    await frame();
    assert(
      document.activeElement === search,
      "late Array Add focus stole newer user input",
    );
    await undo();
    record("complex-focus-intent", { newerInputRetained: true });
    find("#problems-bar button").click();
    await until(
      () =>
        !desktop.surface.status.diagnosticsPending &&
        desktop.surface.problems.length > 0,
      "Problems did not publish latest generation",
    );
    const gridTop = desktop.viewport!.getBoundingClientRect().top;
    const problem = desktop.surface.problems.find(
      (d) => d.source === SOURCE && d.fieldPath.join("/") === "numbers/0",
    );
    assert(problem, "nested diagnostic missing");
    const buttons = [
      ...document.querySelectorAll<HTMLButtonElement>(
        "#problems .problem-item",
      ),
    ];
    const problemButton = buttons[desktop.surface.problems.indexOf(problem)];
    assert(problemButton, "nested Problems action missing");
    problemButton.click();
    await until(
      () =>
        !!desktop.interaction.complex?.focusPath &&
        !!document.activeElement?.closest(".element-value"),
      "Problems did not focus nested target",
    );
    assert(
      desktop.viewport!.getBoundingClientRect().top === gridTop,
      "Problems arrival shifted the working grid",
    );
    record("nested-problem-focus", {
      stableGrid: true,
      latestGeneration: problem.generation,
    });
    find("button[aria-label=\"問題を閉じる\"]").click();
    key(document.activeElement as HTMLElement, "Escape");
    await until(
      () => !desktop.interaction.complex,
      "Complex Escape close missing",
    );
    await undo();
    assert(
      (await bytes()).after === base.after &&
        !desktop.surface.projection!.dirty,
      "Complex operations did not restore exact bytes",
    );
    await focusCell(1, 15);
    key(desktop.viewport!, "Enter");
    await until(
      () => document.querySelectorAll(".complex-item").length === 3,
      "Array reopen missing for navigation",
    );
    await until(()=>!!document.querySelector(':is(.near-value-body,.ant-drawer-body) > [aria-busy="false"]'),"Complex values did not become interactive");
    find(".complex-item .element-value button").click();
    await until(
      () => !!document.querySelector(".complex-input input"),
      "nested navigation input missing",
    );
    text(find(".complex-input input") as HTMLInputElement, "invalid");
    await desktop.selectTarget(SCHEMA, "complex-navigation", false);
    assert(
      !desktop.surface.error && desktop.surface.projection?.clicked === SCHEMA,
      "outgoing Complex typing blocked navigation",
    );
    assert(
      (await bytes()).after ===
        base.after.replace(
          'numbers: [1, "1", -2]',
          'numbers: [invalid, "1", -2]',
        ),
      "navigation discarded uncommitted nested typing",
    );
    await desktop.selectTarget(SOURCE, "complex-revisit", true);
    await undo();
    assert(
      (await bytes()).after === base.after &&
        !desktop.surface.projection!.dirty,
      "nested typing history did not survive navigation",
    );
    record("complex-navigation", {
      typingPreserved: true,
      sourceLocalUndo: true,
    });
    // GUI-UNIFIED-005 / GUI-DATA-EDIT-003: observable context and the
    // single active typed controls, not a component/command topology test.
    desktop.closeComplex();
    const col=(name:string)=>desktop.surface.projection!.columns.findIndex(c=>c.field.name===name);
    assert(document.querySelectorAll(".field-key").length===desktop.surface.projection!.columns.length,"serialization keys missing from normal headers");
    assert(document.querySelector('[data-field="id"] .column-context')?.textContent?.includes("PK"),"primary membership hidden");
    assert(document.querySelector('[data-field="code"] .column-context')?.textContent?.includes("SK3"),"composite secondary membership hidden");
    assert(desktop.surface.projection!.rows[0].cells[col("tags")].display.includes("Fire"),"Flags preview hides values");
    record("readable-table-context");
    await focusCell(0,col("rarity"));find(`#cell-0-${col("rarity")}`).click();
    await until(()=>!!document.querySelector('.inline-enum-surface [role="combobox"]'),"Enum not inline");
    assert(!(await bytes()).after.includes("rarity: Common\n    tags: [Fire"),"opening Enum changed values");
    await until(()=>!!document.querySelector('.ant-select-item-option[title="Common"]'),"searchable Enum candidates missing");
    find('.ant-select-item-option[title="Common"]').click();
    await until(()=>desktop.surface.projection!.rows[0].cells[col("rarity")].display==="Common","Enum choice not committed");
    await settle();
    const enumOutsideSearch=document.querySelector<HTMLInputElement>('#search')!;
    enumOutsideSearch.focus();enumOutsideSearch.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0}));
    await until(()=>!desktop.interaction.complex,"outside dismissal did not close Enum");
    assert(document.activeElement===enumOutsideSearch,"outside dismissal stole the user's newer focus");
    await undo();
    assert((await bytes()).after===base.after,"Enum Undo did not restore exact source");
    record("inline-enum-choice-and-undo");
    await focusCell(0,col("enabled"));find(`#cell-0-${col("enabled")} [role="switch"]`).click();
    await until(()=>desktop.surface.projection!.rows[0].cells[col("enabled")].display==="false","single click bool toggle missing");
    await settle();await undo();assert((await bytes()).after===base.after,"direct bool toggle was not one exact Undo");
    record("boolean-direct-toggle-one-undo");
    await focusCell(0,col("enabled"));find(`#cell-0-${col("enabled")}`).click();
    await until(()=>!!document.querySelector('.active-cell-editor [role="switch"]'),"bool active editor not typed");
    find('.active-cell-editor [role="switch"]').click();
    await until(()=>desktop.surface.projection!.rows[0].cells[col("enabled")].display==="false","bool change missing");
    await settle();await undo();
    assert((await bytes()).after===base.after,"bool Undo did not restore source");
    record("boolean-active-control");
    await focusCell(0,col("tags"));key(desktop.viewport!,"Enter");
    await until(()=>!!document.querySelector('.near-value-body .flags-members'),"Flags not near the cell");
    const flag=[...document.querySelectorAll<HTMLElement>('.flags-members label')].find(label=>label.textContent==="Ice");
    assert(flag,"Flags member unavailable");flag.click();
    await until(()=>desktop.surface.projection!.rows[0].cells[col("tags")].display.includes("Ice"),"Flags direct operation missing");
    await settle();desktop.closeComplex();await undo();
    assert((await bytes()).after===base.after,"Flags Undo did not restore source");
    record("nearby-flags-direct-operation");
    await focusCell(1,col("optionalCode"));
    const schemaControl=find('button[aria-label="名前を変更: optionalCode"]');
    schemaControl.focus();key(schemaControl,"Backspace",{altKey:true});await frame();
    assert((await bytes()).after===base.after,"schema focus applied a record null operation");
    desktop.viewport!.focus();
    key(desktop.viewport!,"Backspace",{altKey:true});
    await until(()=>desktop.surface.projection!.rows[1].cells[col("optionalCode")].isNull,"nullable direct null missing");
    await settle();await undo();
    assert((await bytes()).after===base.after,"null Undo did not restore lexical source");
    record("nullable-direct-null-and-undo");
    await focusCell(0,col("optionalCode"));key(desktop.viewport!,"Enter");
    await until(()=>!!document.querySelector('.active-cell-editor input'),"null scalar did not edit inside its cell");
    assert(!desktop.interaction.complex&&!document.querySelector('.ant-drawer'),"null scalar opened a drawer");
    const nullInput=find('.active-cell-editor input') as HTMLInputElement;
    const nullOutside=find('#search') as HTMLInputElement;nullOutside.focus();
    await until(()=>!desktop.interaction.editor,"empty null input did not cancel on blur");
    assert((await bytes()).after===base.after,"empty null input replaced null");
    await focusCell(0,col("optionalCode"));key(desktop.viewport!,"Enter");await until(()=>!!document.querySelector('.active-cell-editor input'),"null scalar reopen failed");
    text(find('.active-cell-editor input') as HTMLInputElement,"outside value");nullOutside.focus();
    await until(()=>desktop.surface.projection!.rows[0].cells[col("optionalCode")].display==="outside value"&&!desktop.interaction.editor,"filled null scalar was not committed on blur");
    assert(document.activeElement===nullOutside,"null edit stole outside focus");await settle();await undo();
    assert((await bytes()).after===base.after,"outside null edit was not one Undo");
    await focusCell(0,col("optionalCode"));key(desktop.viewport!,"Enter");await until(()=>!!document.querySelector('[aria-label="空文字にする"]'),"explicit empty string missing");find('[aria-label="空文字にする"]').click();await settle();
    assert(!desktop.surface.projection!.rows[0].cells[col("optionalCode")].isNull,"explicit empty string remained null");await undo();assert((await bytes()).after===base.after,"empty string Undo lost null");
    record("null-scalar-inline-empty-outside-and-explicit-string");
    await desktop.addRow();await until(()=>desktop.surface.projection!.totalRows===3&&!desktop.surface.busy,"Added row missing");
    await focusCell(2,col("enabled"));key(desktop.viewport!,"Enter");await until(()=>!!document.querySelector('.null-bool-editor'),"null bool did not expose inline choices");
    assert(desktop.surface.projection!.rows[2].cells[col("enabled")].isNull&&!desktop.interaction.complex,"opening null bool materialized a default or opened a pane");
    find('[aria-label="enabled 行 3 をfalseにする"]').click();await until(()=>desktop.surface.projection!.rows[2].cells[col("enabled")].display==="false"&&!desktop.surface.busy,"explicit bool choice failed");await settle();await undo();
    assert(desktop.surface.projection!.rows[2].cells[col("enabled")].isNull,"bool choice was not one Undo");await undo();assert((await bytes()).after===base.after,"Added-row bool workflow changed the restored source");
    record("added-null-boolean-inline-choice-and-exact-undo");


    await focusCell(0,col("reward"));key(desktop.viewport!,"Enter");
    await until(()=>!!document.querySelector('.near-value-body .custom-fields'),"small Custom not near cell");
    const near=find('.near-value-popover');
    const cellElement=find(`#cell-0-${col("reward")}`),view=desktop.viewport!;
    view.scrollLeft=Math.max(0,col("reward")*GRID.column-180);await frame();await frame();
    const beforeAnchor=cellElement.getBoundingClientRect(),beforePopup=near.getBoundingClientRect();
    assert(Math.abs(beforePopup.top-beforeAnchor.bottom)<=1,"near editor has a gap below its cell");
    const startScroll=view.scrollLeft;view.scrollLeft=Math.max(0,startScroll-40);await frame();await frame();
    const afterAnchor=cellElement.getBoundingClientRect(),afterPopup=near.getBoundingClientRect();
    assert(Math.abs(afterPopup.top-afterAnchor.bottom)<=1&&Math.abs((afterPopup.left-beforePopup.left)-(afterAnchor.left-beforeAnchor.left))<=1,"near editor did not follow horizontal scrolling");
    assert(document.querySelector('.near-value-popover')===near,"scroll remounted the near editor");
    record("near-editor-zero-gap-scroll-and-stable-surface");
    const customField=find(`.near-value-body [data-value-path='["reward","itemId"]'] button`);
    customField.click();
    await until(()=>!!document.querySelector('.near-value-body .complex-input input'),"nearby scalar editor missing");
    const draftInput=find('.near-value-body .complex-input input') as HTMLInputElement;
    text(draftInput,"2009");
    desktop.viewport!.scrollLeft=0;await frame();await frame();
    assert(draftInput.isConnected && draftInput.value==="2009","offscreen anchor destroyed temporary typing");
    key(draftInput,"Escape");await frame();
    assert((await bytes()).after===base.after,"Escape committed nearby temporary input");
    desktop.closeComplex();await frame();
    assert((await bytes()).after===base.after,"opening Custom mutated source");
    record("nearby-custom-open-is-read-only");
    await focusCell(1,col("numbers"));find(`#cell-1-${col("numbers")}`).click();
    await until(()=>!!document.querySelector('.near-value-body .complex-item'),"small Array not near the cell");
    find('.near-value-body .element-value button').click();
    await until(()=>!!document.querySelector('.near-value-body .complex-input input'),"near Array scalar missing");
    const arrayInput=find('.near-value-body .complex-input input') as HTMLInputElement;
    text(arrayInput,"7");key(arrayInput,"Enter");await settle();
    assert((await bytes()).after!==base.after,"near Array edit did not commit");
    desktop.closeComplex();await undo();assert((await bytes()).after===base.after,"near Array edit did not Undo exact bytes");
    await focusCell(0,col("reward"));find(`#cell-0-${col("reward")}`).click();
    await until(()=>!!document.querySelector('.near-value-body .custom-fields'),"Custom reopen missing");
    const nearby=document.querySelector('.near-value-body');
    find(`.near-value-body [data-value-path='["reward","values"]'] button`).click();
    await until(()=>!!document.querySelector('.near-value-body .complex-item'),"nested Array changed to distant editor");
    assert(document.querySelector('.near-value-body')===nearby,"nested navigation remounted value surface");
    find('button[aria-label="元のセルの値"]').click();
    await until(()=>!!document.querySelector('.near-value-body .custom-fields'),"return to root failed");
    assert(document.querySelector('.near-value-body')===nearby,"root navigation remounted value surface");
    desktop.closeComplex();await frame();assert((await bytes()).after===base.after,"nested navigation mutated source");
    record("nearby-array-and-nested-continuity");
    assert(
      !startup.browserErrors ||
        (startup.browserErrors as string[]).length === 0,
      "browser event errors",
    );
    await invoke("evidence_write", {
      report: {
        format: 1,
        kind: "authoring",
        checks,
        startup,
        visibility: document.visibilityState,
        focused: document.hasFocus(),
        reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
        mountedRows: document.querySelectorAll(".grid-row").length,
        source: await bytes(),
        schema: await bytes(SCHEMA),
      },
    });
  } catch (error) {
    await invoke("evidence_write", {
      report: {
        format: 1,
        kind: "authoring",
        error: String(error),
        arrayOpeningGeometry,
        checks,
        startup,
        visibility: document.visibilityState,
        focused: document.hasFocus(),
        projection: desktop.surface.projection,
        interaction: desktop.interaction,
        surfaceError: desktop.surface.error,
        dom: {
          active: document.activeElement?.outerHTML.slice(0, 2000),
          items: [
            ...document.querySelectorAll<HTMLElement>(".complex-item"),
          ].map((item) => ({
            id: item.dataset.item,
            value: item
              .querySelector(".element-value")
              ?.outerHTML.slice(0, 2000),
          })),
          drawerBusy: document
            .querySelector(":is(.ant-drawer-body,.near-value-body) [aria-busy]")
            ?.getAttribute("aria-busy"),
          intended: desktop.inputIntent,
        },
        source: await bytes().catch((e) => ({ error: String(e) })),
        schema: await bytes(SCHEMA).catch((e) => ({ error: String(e) })),
      },
    });
  }
}
