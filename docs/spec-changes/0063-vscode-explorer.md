# VSCodeを参考にしたExplorer再構成

Status: Applied

## Why / adopted decision

Humanが2026-10-14に選択したscope。起動中VSCodeと検証専用workspaceを実操作し、folder / file / 空白のcontext menu、toolbar、矢印移動、inline作成・rename、重複エラー、外側click、collapse、長い一覧、幅変更を観察した。

Agent Decisionとして、密な全幅行、控えめなindent / guide、type icon、selectionとfocusの区別、短いtoolbar、inline rename、filter / sort / reveal / path copy、幅変更へ再構成する。file移動は既存reviewへ接続し、motion、固定sources、shared Rust、dirty / uncertain lifecycleを維持する。Data creationのdefaultはclicked / focused fileのshared bindingを優先して開始時へ固定する。別editorでdefaultを差し替えるalternativeは、その行の文脈を不安定にするため採用しない。

## Canonical owners

- [Explorer](../gui/explorer/spec.md): GUI-EXPLORER-001 / 003、LAYOUT-004、INT-001 / 002 / 004 / 007、KEY-001、FOCUS-001、A11Y-001。
- [Source Creation](../gui/source-creation/spec.md): GUI-CREATE-LAYOUT-001 / 002、INT-003。
- [App shell](../gui/app-shell.md)、[Source Path Mutation](../specs/source-path-mutation.md)の既存contractを維持。

## Approval Record

Approval mode: Agent-autonomous
Objective/request basis: Human-selected Explorer再構成（2026-10-14）。
Review: proposal確定後の別review-spec passと、context bindingの追加challenge pass。Blocking / Non-blocking / Questions: None identified。Approved as Proposed: Yes。Eligible: Yes。Human gate: None。

Intent / motion constraint、canonical boundary、terminology、normative strength、testability、compatibility、ambiguity、implementation leakage、scope / owner routingを照合。保存形式・source identity・public APIを変更せず、未承認のfolder / delete / multi-file mutationを先取りしない。Source classification / creation / path preflightは既存shared authorityへ委譲する。
