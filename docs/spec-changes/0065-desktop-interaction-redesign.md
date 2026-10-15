# Desktop操作モデルと直接編集の再設計

Status: Applied

## Why / Decision

2026-10-15 Humanが先行UIレビューと追加18項目を含む全体改善を選択。直接操作、状態/focus、nested typed editing、安全な初期値、復元可能なfile削除、viewport/drag、feedbackを統一する。レガシー版は実画面だけを参考にし、codeは参照しない。

## Canonical owners

- GUI-EXPLORER-INT-008 / LAYOUT-005: [Explorer](../gui/explorer/spec.md)
- GUI-GRID-009: [Grid](../gui/data-editor/grid-authoring.md)
- GUI-DATA-EDIT-005: [Data](../gui/data-editor/spec.md)
- GUI-UNIFIED-009: [Table](../gui/table-editor/spec.md)
- GUI-SHELL-FEEDBACK-001: [Shell](../gui/app-shell.md)
- SOURCE-RECORD-001/004、GUI-DATA-ROW-003の旧null placeholder生成を置換し、新ownerへroute。
- AUTHORING-DEFAULT-001..003: [Defaults](../specs/authoring-defaults.md)
- SOURCE-TRASH-001..002: [Trash](../specs/source-trash.md)

## Approval Record

Approval mode: Agent-autonomous
Basis: Human-selected 2026-10-15 request。fresh review-spec challenge passでBlockingなし、Approved as Proposed: Yes、Eligible: Yes、Human gate: None。新規Custom fieldの一時initializerも共有defaultへ含める追加challengeでBlockingなし。既存format / authorityを維持し、永久削除・releaseはscope外。proposalの詳細はGit作業履歴ではなくcanonical ownersへ適用済み。
