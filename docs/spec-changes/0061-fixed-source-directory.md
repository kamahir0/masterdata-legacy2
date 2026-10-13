# sourcesを唯一の固定ディレクトリにする

Status: Applied

## Why / adopted decision

2026-10-13 Humanは、UnityのAssetsに相当するProject直下の固定・単一の`sources/`というdirectionで改善計画を依頼した。Proposed / review-spec後、標準設定は継続利用し、非標準設定はデータを変更せず移行案内付きで拒否して手動移行する推奨案を提示したところ、「実装へ」と指示した。source root選択を不要にし、共有エンジン・CLI・GUIの前提を揃える。

## Canonical owners

- [Project layout](../specs/project-layout.md): PROJECT-SOURCE-001 / 002（PROJECT-CONFIG-002を置換）、PROJECT-CONFIG-003 / 006 / 007 / 008、PROJECT-006 / CONVENTION-001
- [Source Creation](../specs/source-creation.md): SOURCE-CREATE-001 / 002
- [Source Path Mutation](../specs/source-path-mutation.md): SOURCE-PATH-002
- [Build / Publish](../specs/build-pipeline.md): source directory保護境界の参照
- [GUI app shell](../gui/app-shell.md): GUI-SHELL-LAYOUT-002
- [Explorer](../gui/explorer/spec.md): GUI-EXPLORER-001 / INT-004
- [GUI Source Creation](../gui/source-creation/spec.md): GUI-CREATE-LAYOUT-001 / 002 / 003、GUI-CREATE-INT-001
- [Project Settings](../gui/project-settings/spec.md) / [Config Edit](../specs/project-config-edit.md): binding / 外部変更の説明
- [ADR 0004](../adr/0004-file-location-has-no-semantic-meaning.md): fixed source directoryのConsequences

## Approval / application provenance

Approval mode: Human。Basis: 上記の具体的なconfig互換性 / 手動移行方針への回答としての2026-10-13「実装へ」。固定化directionだけから移行policyを自動承認したものではない。

Proposed確定後の別review-spec passでBlocking Issues: None identified、Approved as Proposed: Yes、Eligible: No / Breaking compatibilityのHuman gateを確認。Human decisionにより今回policy gateを解消し、canonical ownersへ適用した。計画 / reviewの詳細は本artifactをProposedとして追加した`6b9c6be34af9a1c4c346a2d3a343adde2eaed4f3`から復元できる。Windows actual Desktop / Unity actual Editor-runtimeの既存evidence gatesは保持する。

2026-10-13の追加Human decision「使用Projectなし / 保守不要」で、互換維持 / 手動移行の採用を[0062](0062-remove-source-config-compatibility.md)へ置換した。固定directoryとfolder-only GUIというdirectionは継続する。
