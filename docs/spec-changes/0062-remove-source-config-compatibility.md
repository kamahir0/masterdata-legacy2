# 開発期間のsource設定互換維持を撤回する

Status: Applied

## Affected Specifications

[Project layout](../specs/project-layout.md)のPROJECT-SOURCE-002を新規PROJECT-SOURCE-003へ置換。PROJECT-SOURCE-001、YAML semantics、native write safety、Build / Publish destinationは維持する。[Explorer](../gui/explorer/spec.md)の移行参照と[0061](0061-fixed-source-directory.md)のauditを新ownerへrouteする。

## Source Evidence and Classification / Confirmed Decisions

Human Decision: 2026-10-13、互換性 / 移行policyの質問に対して「まだ開発期間で使用プロジェクトは無いため保守の必要性は全く無い」と回答した。0061の標準設定互換維持 / 非標準Project手動移行を継続する前提を撤回する。固定・単一の`sources/`というdirectionと実装依頼は継続する。

## Proposed Delta

- PROJECT-SOURCE-003: source directoryは設定項目として提供しない。`masterdata.toml`に`[sources]`を含めることを許可しない（MUST NOT）。値が旧標準形であっても受理せず、fixed directoryに対するunsupported settingと識別できるstructured config diagnosticで拒否する。拒否で現在のworkspace / dirty bufferを破棄したり、Project / source / outputを変更したりしない（MUST NOT）。migration、互換読み込み、config自動変換を提供しない。
- 共有Configからsource roots fieldと互換default / alias validationを除去する。source scan / write / snapshot / Publish保護境界はPROJECT-SOURCE-001の固定directoryを参照し、configurable rootと解釈できる状態を残さない。
- GUIは設定拒否の理由を日本語で示す。Type / 未選択状態でもOpen失敗の理由を保持したeditorと並べて確認できる。作成 / 移動のfolder表示は0061のまま。

## Compatibility / Implementation Impact / Acceptance

旧`[sources]`を含むconfigはすべて非対応となる。Humanの「使用Projectなし / 保守不要」という判断を根拠とし、互換性維持のための新しいHuman gateを作らない。

frozen fixtureは書き換えない。test / measurementのtemporary Project作成では、旧corpusからYAMLのexact bytesをコピーし、当該testのconfigを現行shapeで構成する。production parserへfixture専用のcompatibility modeを追加しない。既存fixtureの意味論・source mutationの期待bytesを変更せず、fixture内の旧configを現在のpublic contractとして扱わない。

focused evidenceは旧標準形を含むsetting拒否 / no-mutation、設定なしのProject Open / create / move / config Save、GUI / CLI一致、source boundary / stale / recovery、actual UIでのエラー表示。既存oracleとrequired CIを現行configで実行する。

## Open Questions / Potential ADRs

None identified。自動移行 / 旧形式の期間限定読み込みは非scope。architecture WHYはADR 0004の既存fixed-directory decisionで足り、新規ADR不要。

## Approval Eligibility

Autonomous approval eligible: No（public configのbreaking policyを含む）。Human gate: Human decision supplied by上記回答。Human approvalとして記録し、review後に適用できる。

## Review

Proposed確定後の別review-spec passでrequest、PROJECT-SOURCE-001 / 002、config parser / native boundary、frozen corpusの扱いを照合した。Blocking Issues / Non-blocking Issues / Questions: None identified。Approved as Proposed: Yes。Eligible: No（breaking config policy）。Human decision supplied。Intent / cross-spec consistency / terminology / strength / testability / compatibility / ambiguity / implementation leakage / scope / ownershipを確認した。

## Approval Record

Approval mode: Human。Basis: 上記の互換性質問への「使用Projectなし / 保守不要」という回答。固定directoryという既に選択されたdirectionの中で旧形式を保守しないというclarificationを適用し、PROJECT-SOURCE-002の互換維持を撤回する。既存Windows actual Desktop / Unity actual Editor-runtime gatesは維持する。
