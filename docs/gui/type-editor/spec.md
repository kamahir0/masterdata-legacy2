# GUI仕様: Type Editor

Status: Approved

## 目的

既存Value Object / Enum / Flags Enum / Custom Type documentをWorkspace Explorerから選択し、[Ordinary Structural Authoring](../../specs/structural-authoring.md)のdraft / Undo / Saveで編集できるschema-aware Type Editorを提供する。

Type category、member/field、data representation、generated C# semanticsは[Type System](../../specs/type-system/README.md) family、通常編集のsource-preserving patch / history / SaveはOrdinary Structural Authoring、明示Migrationのstrict Plan / disk transactionはType Migration v1が所有する。本仕様はType Editorのlayout、state、interaction、dirty-buffer composition、error/recovery、adapter boundaryを所有する。frontendはYAMLを独自parse/rewriteしない。

## レイアウト（Layout）

### GUI-TYPE-LAYOUT-001

Workspace Explorerでshared source semantics上の`kind: type` documentを選択した場合、main areaはType Editorを表示しなければならない（MUST）。physical pathやfolder名だけでtype categoryまたはlogical identityを決定してはならない（MUST NOT）。

Type Editorは少なくともlogical type name、source provenance、resolved categoryを確認できなければならない（MUST）。表示値はshared application/domain snapshotから取得し、frontendがYAMLを独自parseしてdomain meaningを再構成してはならない（MUST NOT）。

### GUI-TYPE-LAYOUT-002

Value Objectではunderlying primitiveと`fromUnderlyingImplicit` / `toUnderlyingImplicit`、Normal Enum / Flags Enumではunderlyingとmember declaration order・name・numeric value、Custom Typeではfield declaration order・MessagePack key・name・base type・modifierを表示しなければならない（MUST）。

Flagsの既存numeric declarationにはatomic bitの位置と式を補助表示する。数値をJS Numberへ変換せず、None=0の保護と既存mutation範囲を維持する。

Flagsの詳細Addではunderlying幅内の未使用atomic bitをshared Rustからexact numeric valueと共に提示し、選択でexplicit numeric入力を補助する。既存member numeric変更やimplicit numberingではない。候補取得・開閉はsourceを変更せず、draft適用時に現在のsourceで検証する。

v1非対象のdeclaration name、underlying、member numeric value、field type/modifier/key/reorder等をdirect-edit可能なcontrolとして表示してはならない（MUST NOT）。read-onlyとして表示することはできる（MAY）。

### GUI-TYPE-LAYOUT-003

categoryごとの初期mutation actionは次に限定しなければならない（MUST）。

- Value Object: conversion setting変更。
- Normal Enum / Flags Enum: member Add / Rename / Drop。
- Custom Type: field Add / Rename / Drop。

Type category conversion、type rename、underlying変更、member numeric value変更、Custom field type/modifier/key変更またはreorderを同じType Editor v1のApply actionへ含めてはならない（MUST NOT）。

### GUI-TYPE-LAYOUT-004

member / field名からinline Renameを開始し、Add / Dropは対象行やlist文脈へ置く。入力確定でordinary draftへ反映し、通常編集にPlan / Diff / disk Applyを要求しない。開閉・取消・focus復元はGUI-SHELL-INPUT-001へ従う。

## 状態（States）

### GUI-TYPE-STATE-001

loading、ready、入力中、draft dirty、保存中、局所エラー、Conflict / Unknown / Recovery Requiredを識別できるようにする。以前のtypeを新selectionの編集対象として表示しない。

### GUI-TYPE-STATE-002

型の通常変更はsource dirty bufferであり、Cmd/Ctrl+Sは通常Saveへ接続する。入力確定、Undo、disk Saveを区別し、開閉だけでdirtyを作らない。

### GUI-TYPE-STATE-003

関連Data sourceのdirtyを操作候補へcomposeし、既存dirtyだけを理由に編集を拒否しない。unrelated buffer / historyを保持する。

### GUI-TYPE-STATE-004

draft適用後はcurrent declarationと関連view / diagnosticsを更新し、既存buffer・focus・最新navigation先を保持する。

## 操作（Interactions）

### GUI-TYPE-INT-001

Value Objectのconversion editingは`SetValueObjectConversions` semantic commandを構成するguided inputを提供し、`fromUnderlyingImplicit`と`toUnderlyingImplicit`を独立して設定できなければならない（MUST）。underlyingまたはtype nameを同じoperationで変更してはならない（MUST NOT）。

### GUI-TYPE-INT-002

Normal Enum / Flags Enumは`AddEnumMember`、`RenameEnumMember`、`DropEnumMember`のguided inputを提供しなければならない（MUST）。詳細Addはexplicit nameとnumeric valueを入力できなければならない（MUST）。通常AddはGUI-TYPE-INT-011を使い、frontendがimplicit numberingを生成してsemantic defaultとして扱ってはならない（MUST NOT）。Renameはcurrent member nameをselectorとしてshared ordinary authoring boundaryへ渡し、numeric valueを編集してはならない（MUST NOT）。

Dropはdestructive actionとして明示しなければならない（MUST）。Flagsの`None = 0`はRename / Drop actionの対象として提供してはならない（MUST NOT）。

### GUI-TYPE-INT-003

Custom Typeは`AddCustomField`、`RenameCustomField`、`DropCustomField`のguided inputを提供しなければならない（MUST）。AddはMessagePack key、field name、base type、modifier、およびshared default / explicit initializerを入力できなければならない（MUST）。initializerのvalidityをfrontend独自Type Systemで確定してはならない（MUST NOT）。

Renameはcurrent field nameをselectorとしてshared ordinary authoring boundaryへ渡し、MessagePack key / base type / modifierを同時変更してはならない（MUST NOT）。Dropはdestructive actionとして明示しなければならない（MUST）。

### GUI-TYPE-INT-004

通常入力の確定はshared ordinary authoringへsemantic intentを渡し、source patchをfrontendで作らない。詳細formの確定もdraft適用でありdisk mutationではない。

### GUI-TYPE-INT-005

sourceの未保存差分は通常のsource comparisonから確認できる。別のsnapshotやgenerated artifactをsource差分の代用にしない。

### GUI-TYPE-INT-006

captured source identity / epochと入力対象を確認してdraftへ適用する。stale時は未確定入力を保持して局所に理由を表示し、別snapshotへ黙って再適用しない。最新navigation先をold targetへ戻さない。

### GUI-TYPE-INT-007

Dropは対象を明示した可逆的draft操作とし、一Undoで復元できる。Enum member Drop後の既存symbol値を勝手に置換・削除しない。

### GUI-TYPE-INT-008

Type Migration成功をBuild / Publish / Git / generated artifact更新と同一操作へ結合してはならない（MUST NOT）。成功後にBuild等を別actionとして実行できてよい（MAY）。

### GUI-TYPE-INT-009

Type Editorからshared application boundaryへ渡すsemantic valueは、Approved Type System / YAML subsetが許すexact valueをlosslessに保持しなければならない（MUST）。特にEnum / Flagsの`long` / `ulong`を含むmember numeric value、Custom Type field initializer内の64-bit integerその他のscalar valueを、JavaScriptのsafe-integer rangeへ丸めたり、floating-point `number`へlossy coercionしてはならない（MUST NOT）。

このrequirementはspecific wire encodingを固定しない。string、tagged scalar、BigInt-safe adapter等の具体的transport representationは、round-tripでexact semantic valueを保持し、shared Rust semanticsが最終validationを行う限りimplementation detailとしてよい（MAY）。

### GUI-TYPE-INT-011

Enum / Flagsの通常Addはshared Rustが未使用の有効nameとexact numericを提案し、ordinary draftへ追加する。normal Enumは最小の未使用非負整数、Flagsは最小の未使用atomic bit（signed sign bitを含む）。追加後に名前をinline選択編集する。Escape / 空入力は追加済み名へ戻る。任意name/numericの詳細追加を保持し、64-bitをJS Numberへ変換しない。member / field Renameは関連する安全に特定できる値へ追従し、一操作のgroup historyを持つ。

## キーボード（Keyboard）

### GUI-TYPE-KEY-001

keyboardだけでAdd / Rename / Drop、form確定・取消、Undo / Redo、Saveへ到達できる。入力中のnative Undoとfile historyを区別する。

## フォーカス（Focus）

### GUI-TYPE-FOCUS-001

Explorerからtype documentを開いた場合、main Type Editorへ移動できる明確なkeyboard pathを持たなければならない（MUST）。operation dialog / panelを閉じた場合は、可能な範囲で開始元setting/member/field/actionへfocusを復元しなければならない（MUST）。source comparisonから戻る場合も、可能な範囲でtarget selectionを復元しなければならない（MUST）。

## 検証（Validation）

### GUI-TYPE-VAL-001

型・member・field・initializerの意味とdiagnosticsはshared Rustが所有する。frontendにYAML parser / Type Systemを実装しない。未解決dependencyやunrelated diagnosticを一律の編集禁止条件にしない。

### GUI-TYPE-VAL-002

diagnosticがsource locationまたはaffected fileへmap可能な場合、利用者が該当source / member / fieldを識別できる形で表示しなければならない（MUST）。unmappable project-level diagnosticも不必要に失ってはならない（MUST NOT）。

## エラー（Errors）

### GUI-TYPE-ERR-001

draft適用に失敗した場合は入力と既存bufferを保持して対象と原因を表示し、成功と表示しない。Save failureはSource Editの安全境界へ従う。

### GUI-TYPE-ERR-002

Type Migration commitが`Recovery Required`となった場合、Type Editorはその状態を明示し、affected file stateと利用可能なrecovery informationを表示できなければならない（MUST）。cross-surfaceなsource mutation停止は[GUI app shell](../app-shell.md)の`GUI-SHELL-STATE-001` / `GUI-SHELL-CAPABILITY-001`へ委譲し、Type Editor独自の別gateを実装してはならない（MUST NOT）。

### GUI-TYPE-ERR-003

selected sourceをshared semanticsで安全にtype declarationとしてresolveできない場合、推測したcategoryで編集可能にしてはならない（MUST NOT）。structured error stateを表示し、unrelated dirty bufferやExplorer selectionを不必要に破壊してはならない（MUST NOT）。

## アクセシビリティ（Accessibility）

### GUI-TYPE-A11Y-001

type category/declaration surface、member/field list、operation controls、Plan summary、Diff navigation、destructive confirmation、error / Recovery Required stateはassistive technologyからpurposeとstateを識別できなければならない（MUST）。stateやdestructive severityを色・iconだけで伝えてはならない（MUST NOT）。

## Adapter boundary

### GUI-TYPE-ADAPTER-001

Tauri frontendはthin intent / view adapterとし、YAML patch、型解決、history、write safetyをshared Rustへ委譲する。通常編集をstrict Migrationへ迂回させない。

## 参照artifact（Reference Artifacts）

None.

## 検証evidence

- 型別表示、64-bit numeric / initializerのlossless transport、Flags None保護。
- current dirtyと既存invalid値を保持したAdd / Rename / Drop / conversion、局所診断。
- 関連sourceを含む一Undo / Redo、Save前のdisk不変、source exact bytesと部分Save。
- stale / unsafe syntax時の入力保持、keyboard・focus・通常Save。
- Tauri / frontendに型意味論・YAML patch・filesystem safetyを複製しない。

## 未解決事項（Open Questions）

None identified for Type Editor v1. exact Ant Design component、一時入力面のmodal / inline配置、member/field row action placement、numeric input widget、initializer widget / serialized wire shape、Diff layout、minor focus stylingは、`GUI-TYPE-INT-009`のlossless transportを満たす限りimplementation detailとする。
