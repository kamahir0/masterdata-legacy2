# 開発期間のsource設定互換維持を撤回する

Status: Applied

## Why / adopted decision

2026-10-13 Humanは互換性 / 移行policyの質問に「まだ開発期間で使用プロジェクトは無いため保守の必要性は全く無い」と回答した。固定・単一の`sources/`というdirectionを継続し、0061の旧設定互換維持 / 手動移行を撤回した。共有Configからsource rootsを除去し、旧`[sources]`を含む設定はunsupported settingとして拒否する。

## Canonical owners

- [Project layout](../specs/project-layout.md): PROJECT-SOURCE-003（PROJECT-SOURCE-002を置換）、PROJECT-SOURCE-001
- [Explorer](../gui/explorer/spec.md): source設定拒否と旧workspace保持
- [Build / Publish](../specs/build-pipeline.md): config例を現行shapeへ同期

## Approval / application provenance

Approval mode: Human。Basis: 上記の具体的な互換性質問への回答。Proposed確定後の別review-spec passでrequest、canonical / native boundary、frozen corpusを照合。Blocking Issues / Questions: None identified。Approved as Proposed: Yes。Eligible: No（breaking config policy）、Human decision supplied。

canonical application / implementationとfull proposal / reviewは`58adf301fd27c6c596144530ae3aa7084066df08`に保持する。test / measurementのtemporary Projectは現行configで構成し、frozen fixtureとYAML expected bytesを維持した。production parserにfixture compatibility modeを追加していない。Windows actual Desktop / Unity actual Editor-runtimeの既存gatesは維持する。
