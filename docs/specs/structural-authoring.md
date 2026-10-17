# Ordinary Structural Authoring

Status: Approved

Desktopの通常構造編集を、[Source Edit](source-edit.md)のcurrent draftとfile Saveへ統合するowner。明示的な[Schema Migration](schema-migration.md) / [Type Migration](type-migration.md)のstrict saved-source Planとは別のlifecycleである。

### AUTHORING-STRUCTURE-001

Table fieldのadd / rename / drop、Type Editorのconversion / member / field操作、TableのMessagePack key / Key / Reference操作はcurrent workspace draftへ適用する（MUST）。disk Save、dirtyの破棄、strict Migration実行を編集の前提にしない（MUST NOT）。field type / modifier / orderも同じdraft lifecycleを使う。開閉・候補取得・取消だけでsourceを変更しない。

### AUTHORING-STRUCTURE-002

操作対象の宣言・occurrenceを一意に特定しsource-preserving patchを作れる場合、既存diagnostic、未解決型、対象と無関係なsyntax errorを編集拒否条件にしない（MUST NOT）。現在の宣言・値・unknown memberを保持し、対象外のsourceを推測で修正しない。対象自体の構文位置やrename先が曖昧なら具体的な対象と理由を返す。Recovery Required、Outcome Unknown、stale revision / source binding、unsafe syntaxは既存の安全境界に従う。

### AUTHORING-STRUCTURE-003

関連するparse可能なschema / record / nested valueへ、shared Coreが同じ操作のlossless patchを構成する（MUST）。field renameではkey / referenceの名前を既知の文脈で追従し、dropでは明示した宣言と対応値だけを除去する。Enum memberのdropは既存symbol値を自動変換・削除せず、診断として残す。未解決またはparse不能なsourceはそのまま保持し、残る不整合を診断する。既存dirtyとinline recordsを候補へcomposeし、途中で他sourceのbufferを保存・破棄しない。

### AUTHORING-STRUCTURE-004

一操作の全candidateを検証してからdraftへ反映し、複数sourceへ跨る場合も一Undo / Redo unitとしてexact前後のbytesとoccurrence identityを復元する（MUST）。他の後続編集を巻き戻してgroup historyを適用しない。通常Saveは関連groupのdirty sourceを含め、file別lost-update / partial-save結果を保持する。明示Save / Discardでhistoryを終了したfileは残るgroup historyから外し、後のUndoでそのfileへ書き戻さない。SaveとBuildabilityを同一視せず、Build / Publish / Gitを暗黙実行しない。

### AUTHORING-STRUCTURE-005

GUIは入力確定で直接draftへ反映し、通常編集にPlan / Diff / disk Applyの確認を必須にしない（MUST NOT）。未確定入力のEscape、操作単位Undo、source Saveを区別する。削除は対象を明示し、draftへ反映後にUndoで回復できる。局所編集中の入力を無言で捨てず、到着順に処理するか、対象変更等の理由を表示する。局所処理やbackground diagnosticsだけで画面全体のdisable / enable、focus喪失、mount animationを発生させない。
