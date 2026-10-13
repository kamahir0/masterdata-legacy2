# 近接編集と入力確定の統一

Status: Applied

## Why / adopted decision

2026-10-13 Humanは、左ペイン開閉・window drag・不要な左余白・選択依存のfile操作・同じsource icon・冗長な作成先選択・Enum追加・outside click・複合値editorの追従と隙間・null編集のちらつきを、学習と認知の負担を減らす共通仕様として解消するよう依頼した。Enumの通常追加は有効なdefaultで完了してから名前を編集するという明示decisionを採用した。

Agent Decision: 単項目入力の確定と取消、近接編集、対象を固定した行操作を統一する。inline Renameは作成時期に依存させず、current Planの値 / fileへの影響で直接確定と明示reviewを区別する。null placeholder、既存stringの空文字への変更、64-bit、stale / dirty / destructive / recoveryの既存authorityを維持する。window dragの追加許可はlocal main windowの操作だけでdata / workspace authorityを変更しない。

## Canonical owners

- [GUI app shell](../gui/app-shell.md): GUI-SHELL-LAYOUT-001 / 002、GUI-SHELL-INPUT-001
- [Explorer](../gui/explorer/spec.md): GUI-EXPLORER-001 / INT-004
- [Source Creation](../gui/source-creation/spec.md): GUI-CREATE-LAYOUT-002 / 003、GUI-CREATE-INT-011
- [Data Editor](../gui/data-editor/spec.md): GUI-DATA-EDIT-003 / 004
- [Type Editor](../gui/type-editor/spec.md): GUI-TYPE-LAYOUT-002 / 004、GUI-TYPE-STATE-002、GUI-TYPE-INT-002 / 006 / 011

## Approval / application provenance

Approval mode: Agent-autonomous。Basis: 2026-10-13 Human-selected GUI改善request。Proposed確定後の別review-spec pass、および影響判定によるinline Rename統一の追加challenge passでintent fidelity、cross-spec consistency、terminology、normative strength、testability、compatibility、ambiguity、implementation leakage、scope、ownershipを確認。Blocking Issues / Questions: None identified。Approved as Proposed: Yes。Eligible: Yes。Human gate: None for this scope。

canonical applicationと実装はこのartifactを追加したcommitに含む。既存Windows actual Desktop / Unity actual Editor-runtime evidence gatesは保持する。今回scopeのevidenceは[Candidate evidence](../evidence/clean-room-candidate.md)へrouteする。
