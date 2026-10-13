# Current Objective

## Objective

**Clean-room Rewrite**。HumanによるPR #16のmerge後のcurrent `main`上で、精製済みProduct Constitution / canonical contracts / independent oracleからMasterDataをfreshに再実装し、Humanがmainへのcutoverを判断できる状態へ到達する。

## Completion boundary

- contractからのarchitecture導出、buildable workspaceとCI、instrumentされたDesktop vertical slice。
- [ordinary authoring baseline](gui/rewrite-baseline.md)、[canonical domain](specs/README.md)、[Desktop contracts](gui/README.md)の実装。
- [Desktop presentation quality](gui/app-shell.md#presentation-quality)とReact / Ant Design baseline、theme / motion / actual visual review。
- [日本語を第一言語とするDesktop](gui/app-shell.md#gui-shell-language-001)（2026-10-09 Human-selected追加scope）。 [開発者用語の見直し](spec-changes/0057-desktop-developer-terminology.md)（2026-10-10 Human-selected実装scope）。
- [Desktop操作feedback修正](spec-changes/0056-desktop-authoring-feedback.md)（2026-10-10 Human-selected追加scope）。
- [既存GUIのmotion / 操作feedbackの磨き込み](gui/app-shell.md#gui-shell-presentation-002)（2026-10-10 Human-selected追加scope）。
- [表の理解と近接編集](spec-changes/0058-contextual-table-authoring.md)（2026-10-11 Human-selected両Pass統合改善scope）。
- [日常編集の手数と編集距離](spec-changes/0059-direct-authoring-continuity.md)（2026-10-11 Human-selected残り5点の改善scope）。
- [近接編集と入力確定の統一](spec-changes/0060-consistent-direct-input.md)（2026-10-13 Human-selected GUI違和感の解消scope）。
- [sources固定・単一化の改善計画](spec-changes/0061-fixed-source-directory.md)（2026-10-13 Human-selected計画scope。互換性方針のdecision後にcanonical適用 / implementationへ進む）。
- source / schema / type mutation、write safety、Migration、CLI、Build / Publish、native MasterMemory delegationとactual consumer。
- [independent oracle](../fixtures/rewrite-oracle/v1/README.md)の全category、[acceptance matrix](rewrite-preparation/acceptance-matrix.md)、source exact bytes、100k capacity。
- [performance contract](gui/performance.md)のdistribution / work counts、macOS arm64 / Windows x64 actual Desktop、fresh Candidate reviewとrequired CI。
- 未解決Blockingなしの**Cutover-ready**。内部milestoneはこのObjectiveのcompletionではない。

## Authority / non-scope

[formal inputs](rewrite-preparation/README.md)、[constitution](rewrite-preparation/constitution.md)、[domain / safety](rewrite-preparation/domain-safety.md)、[handoff](rewrite-preparation/clean-room-handoff.md)。

旧production code / topologyをdefault input、template、copy sourceにしない。mainへのmerge、release、scope外featureの追加は行わない。

2026-10-07 Human completion decisionにより、completion boundaryは現在のApproved canonical requirements / oracle / acceptance matrix / Human decisionsへ固定する。required target、stretch、non-blocking polishを区別し、未取得の外部環境証拠はspecific Human gateへrouteする。
