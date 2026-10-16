# 型別入力部品と値の階層表示の統一

Status: Applied

## Why / Decision

2026-10-16 Humanがnested boolと表内boolの視覚的不統一、および途中階層の欠落を指摘。共有scalar controlとsession adapterへ分離し、全経路を保持しながら現在名を優先する階層表示に統一する。

## Canonical owners

[Data Editor](../gui/data-editor/spec.md)のGUI-DATA-EDIT-005、GUI-DATA-NAV-001。

## Approval Record

Approval mode: Agent-autonomous
Basis: Human-selected 2026-10-16 request。Proposed確定後の別challenge passでintent fidelity / cross-spec / terminology / normative strength / testability / compatibility / ambiguity / implementation leakage / unrequested behavior / ownerを確認。Blocking / Non-blocking / Questions: None identified。Approved as Proposed: Yes。Eligible: Yes。Human gate: None。source format、write authority、single editor、Undo / Saveを維持するUI内修正。
