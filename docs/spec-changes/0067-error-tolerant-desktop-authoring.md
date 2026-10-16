# エラーを保持した編集と基本ファイル操作

Status: Applied

## Affected Specifications

Source Edit、Field Declaration Mutation、GUI Table / Type Editor、Explorer、Source Path Mutation、Source Trash、Desktop workspace ADR。新しいordinary structural authoring ownerを追加する。

## Source Evidence and Classification

- Requirement: 2026-10-16 Humanは、フォルダ削除の欠落、nullableの見た目と解除失敗、エラー状態で構造編集できない問題を指摘し、すべてを修正または作り直すよう指示した。
- Decision: 開発期間・ユーザー0人の互換性方針を適用する。
- Evidence: nullableはhost別に分岐し、mutation中の入力を無言で捨てる。通常column rename/add/dropもstrict saved-source Migrationへ接続されている。

## Confirmed Decisions / Agent Decisions

1. 通常GUIの構造変更はcurrent draftへ適用する。明示CLI Migrationのstrict Plan / disk transactionは別のworkflowとして維持する。
2. エラーの有無ではなく、指定した宣言・occurrenceを安全に特定し、lossless patchを作れるかで編集可否を判定する。未知型のfield削除・rename、無関係sourceの構文エラー、既存dirtyをblock理由にしない。特定不能な対象は理由を局所表示し、他の編集を継続できる。
3. 関連するparse可能なsourceのrename/add/dropをcurrent draftへ一括反映する。既存invalid値・unknown memberを保持し、unparseable sourceを推測で書き換えない。残る不整合はdiagnosticへ出す。複数sourceに跨る一操作は同じUndo/Redo unitとし、Saveまでdiskへ書かない。
4. nullableは型別controlの外側の共通表示・解除操作とする。表、active editor、nested、initializerで同じ配置・label・null状態を使い、型rendererはnullable actionを重複して持たない。処理中の入力は順に処理し、対象が変われば理由を示す。無言で捨てない。
5. Explorerのfile/folderにrename、move、copy/paste、cut/paste、duplicate、recoverable delete/restoreを提供する。複数選択のcopy/move/deleteを可能にする。選択祖先と子孫は重複実行しない。domain identityはcopyを含め暗黙変更しない。
6. folder mutationはtree entryをnative境界でexclusiveに移動する。root、自分自身の子孫への移動・copy、symlink escape、collisionは拒否する。deleteはProject内trashへの退避とし、元path・全内容・空folderを保持して再起動後も復元できる。永久削除は追加しない。
7. dirty guardは対象と配下だけへ適用し、まとめた一つの判断にする。batchはitem別結果を明示し、失敗を全成功にしない。Unknownは対象pathを保持してrecheckし、blind retryしない。
8. 局所編集は全体busy / disable / mount transitionへ波及させない。background diagnosticsは編集許可を所有せず、エラー修復中の入力・focus・selection・scrollを保持する。

## New / Changed Requirements

ordinary structural authoringの安全境界、history、diagnostic、Saveを新ownerへ集約する。GUIのstrict Migration必須規則は通常編集について置換する。Explorer / path / trashのfolder・copy・multiple-selection除外を上記操作へ置換する。nullable共通表示と入力受付をGUI-DATA-EDIT-005へ追加する。

## Open Questions

None. duplicate identityは自動renameしない。書き換え可能な対象を特定できないsourceは保持する。

## Potential ADRs

ADR-0009のordinary draftと明示Migrationの分離、group historyを更新する。

## Compatibility Impact

通常GUIのrename/add/dropとType / Table declaration Applyは即時disk mutationからdraftへ変わる。protocolは新しいordinary authoring intentを追加する。保存形式・shared Rust・native write safety・CLI Migrationの意味は維持する。

## Implementation Impact / Acceptance

- Core: invalid/unresolved/dirty/unknown sourceを含むfield/type/table編集、exact bytes、group Undo/Redo、Save、stale/conflictを検証。
- Native: folder empty/nonempty、移動/複製/削除/復元、衝突、symlink、Unknown/recheck、batch結果と対象dirtyを検証。
- Web: nullable全host・全型、連続操作受付、multi-selectionとkeyboard/context actionを検証。
- Actual macOS: 同一sampleのcopy上で上記主要workflow、null解除、error修復、画面とfocus安定を実操作。required CIとローカルproduction更新まで閉じる。

## Approval Eligibility

Autonomous approval eligible: Yes
Human gate: None
Basis: Human-selected修正scope、開発期間の互換性方針。実在するuser dataの破棄・外部公開は実行しない。

## Approval Record

Approval mode: Agent-autonomous
Basis: Human-selected全問題解消と開発期間の互換性方針。proposal確定後の別challenge passでintent fidelity、cross-spec、scope、data preservation、group history、invalid source保持、native namespace、testability、documentation ownerを確認。Blocking / Non-blocking / Questions: None identified。Approved as Proposed: Yes。Eligible: Yes。Human gate: None。
