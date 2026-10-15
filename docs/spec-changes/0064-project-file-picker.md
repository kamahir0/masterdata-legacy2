# ProjectをTOMLファイルから開く

Status: Applied

## Why / adopted decision

Humanが2026-10-15に、Projectを開くOS pickerの選択対象をfolderからTOMLへ変更するよう指定した。
Agent Decisionとして`.toml` extension filterを使い、filenameとProjectの有効性は既存shared validationへ委ねる。Createのdestination pickerはscope外。

## Canonical owners

- [Project Workflow](../gui/project-workflow.md): GUI-PROJECT-001。
- [Project layout](../specs/project-layout.md): PROJECT-001 / 002のidentityとdirectory / config path入力互換性を維持。

## Approval Record

Approval mode: Agent-autonomous
Objective/request basis: 2026-10-15 Human-selected TOML picker変更。
Review: proposal確定後の別review-spec pass。Blocking Issues / Non-blocking Issues / Questions: None identified。Approved as Proposed: Yes。Eligible: Yes。Human gate: None。
Intent fidelity、既存PROJECT-001 / 002との整合、terminology、normative strength、testability、backward compatibility、ambiguity、implementation leakage、unrequested behavior、documentation ownershipを照合。pickerの拡張子filterはidentity判定を置換せず、保存形式とshared境界を維持する。
