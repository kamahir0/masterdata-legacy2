# 日常編集の手数と編集距離

Status: Applied

## Why / adopted decision

2026-10-11 Humanは、両Pass統合後に残る5点（セルの編集開始、小さい配列・入れ子、型定義の入力手順、Flagsの入力支援、キー・参照定義への導線）を進めるよう選択した。[0058の統合採用ledger](0058-contextual-table-authoring.md#confirmed-decisions--finite-adoption-ledger)に記録された第一Pass 22–33 / 36 / 42–43、第二Pass 8–12 / 13–22のactual UI観察を使い、旧implementationは参照しない。

通常入力を近接化し、型・キー・参照の構造変更は既存Plan / Diff / explicit Applyを維持する。Flagsの候補はRustのread projectionであり、write authorityではない。新しい常設surface、既存numeric変更、Type Migration v1の拡張はしない。

## Canonical owners

- [Data Editor](../gui/data-editor/spec.md): GUI-DATA-EDIT-001 / 003 / 004、GUI-DATA-KEY-002
- [Type Editor](../gui/type-editor/spec.md): GUI-TYPE-LAYOUT-002 / 004、GUI-TYPE-INT-002
- [Unified Table](../gui/table-editor/spec.md): GUI-UNIFIED-005

## Approval / application provenance

Approval mode: Agent-autonomous。Basis: 2026-10-11 Human-selected残り5点。Proposed確定後の別review-spec passでintent fidelity / cross-spec / terminology / testability / compatibility / ownershipを確認。Blocking Issues / Questions: None identified。Approved as Proposed: Yes。Eligible: Yes。Human gate: None for this reversible presentation scope。既存external evidence gatesは保持。

canonical applicationと実装はこのartifactを追加したcommitに含む。有限5項目のevidenceは[Candidate evidence](../evidence/clean-room-candidate.md)にrouteし、既存required targetをstretchへ置き換えない。
