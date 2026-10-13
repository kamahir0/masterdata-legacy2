# sourcesを唯一の固定ディレクトリにする

Status: Proposed

## 目的 / Confirmed Decisions

Project直下の`sources/`を唯一のsource directoryとし、利用者がsource rootを選択・設定する必要をなくす。配下のfolderは自由に整理でき、pathからTable / Type等の意味を推測しない。今回の到達点は、互換性方針を含むreview可能な改善計画である。canonical適用と製品実装は下記Human decision後に進める。

## Affected Specifications

| Canonical owner | 差分の対象 |
| --- | --- |
| [Project layout](../specs/project-layout.md) | PROJECT-006、PROJECT-CONVENTION-001、PROJECT-CONFIG-002 / 003 / 006 / 007 / 008、PROJECT-PATH-001、config例とacceptance |
| [Source Creation](../specs/source-creation.md) | SOURCE-CREATE-001 / 002とconfigured rootの用語。exclusive create / recoveryは維持 |
| [Source Path Mutation](../specs/source-path-mutation.md) | SOURCE-PATH-002、用語 / acceptance / non-scopeの複数root前提を解消 |
| [Build / Publish](../specs/build-pipeline.md) | source保護境界の参照。artifact / cache / publish destinationの契約は維持 |
| [GUI app shell](../gui/app-shell.md) | GUI-SHELL-LAYOUT-002のnavigation |
| [Explorer](../gui/explorer/spec.md) | GUI-EXPLORER-001、GUI-EXPLORER-INT-004 |
| [GUI Source Creation](../gui/source-creation/spec.md) | GUI-CREATE-LAYOUT-001 / 002 / 003、GUI-CREATE-INT-001 |
| [Project Settings](../gui/project-settings/spec.md) / [Config Edit](../specs/project-config-edit.md) | root設定 / 外部変更の説明。dirty / conflict guardは維持 |
| [ADR 0004](../adr/0004-file-location-has-no-semantic-meaning.md) | rootがconfigurableというConsequencesを更新。pathにdomain semanticsを与えないDecisionは維持 |

## Source Evidence and Classification

- **Human Decision**: 2026-10-13、UnityのAssetsに相当する固定・単一の`sources/`という説明を受けて「この方向性で改善計画を進めて」と依頼。固定化する方向性と計画作成は選択済み。
- **Requirement**: source rootの不要な選択肢をなくし、GUI / CLIの認知・学習コストを下げる。
- **Constraint**: YAML + Git、shared Rust semantic/application boundary、native write safetyを維持する。
- **Proposal**: 以下のconfig互換読み込みと、別名・複数rootのno-mutation拒否 / 手動移行。Humanがこの互換性方針まで承認したものとは扱わない。
- **Impact evidence**: current shared Configは`Sources.roots: Vec<String>`を必須としてProject Open、creation、path move、保存時のbinding確認、Migration / Build snapshotに使う。Desktopはshared inventoryを描画し、複数rootにも対応する。`desktop/native/tests/project.rs`はempty external rootを含む複数root Openを成功として保護している。調査したtracked fixtureのroot設定はすべて`["sources"]`だったが、利用者の既存Projectが標準配置だけという証拠にはしない。

## Proposed Delta

### Project / configuration

- **PROJECT-SOURCE-001（新規、PROJECT-CONFIG-002のroot数契約を置換）**: 読込み・作成・編集・検証・Buildが扱うsource directoryは、`masterdata.toml`のあるProject directory直下の`sources/`だけでなければならない（MUST）。別名・複数rootを有効にする設定は提供しない。Project markerとmetadataのidentityをfolder名から導かない。
- `sources/`配下のorganizationは自由である。`schemas/`、`types/`、`data/`は推奨に留まり、pathによってkind、Table、Type、field、keyの意味を決めてはならない（MUST NOT）。既存YAMLとgenerated API / binaryの意味をこの変更だけで変えない。
- **PROJECT-SOURCE-002（新規、互換性方針の提案）**: `[sources]`またはその`roots`を省略しても、source directoryは常に`sources/`である。既存の`roots = ["sources"]`を同じ意味で受理しなければならない（MUST）。`roots`を明示する場合のlist-of-strings shapeは維持し、shape違反は通常のstructured config diagnosticとする。明示された他のroot値、空list、重複を含む複数rootは、structured migration diagnosticで拒否する。`./sources`等の別表記も自動正規化する対象には含めない。unknown config keyの既存validatorは維持する。
- 新規CLI / GUI Project作成では冗長な`[sources] roots`を生成しない。既存の標準configはOpen / Saveを理由に自動削除・整形しない。config-only Saveのsource-preserving契約を維持する。
- `sources/`がないProjectは、空Projectとして成功したことにせず、missing source directoryを識別できるerrorを返す。Open / validateを理由にfolderを自動作成しない。新規Project作成のscaffold / 部分失敗は既存PROJECT-CONFIG-008 / PROJECT-INIT-*へ従う。
- 固定化してもactual directory identity、config exact bytes、source membership、stale / external replacementの再確認を省かない。symlink / junction / reparse pointを許可する新機能や既存guardの緩和は含めない。source discoveryのsymlink traversalの既存Open Questionはこの変更では解決しない。

### GUI / application boundary

- Explorerは`sources/`自体の行を省き、その直下から表示する。直下をtop levelのindentとして扱う。selection / diagnostic / write requestのphysical provenanceは維持する。
- 新規作成と移動では、作成先 / 移動先の**フォルダー**だけを扱う。root selector、複数rootを区別するgroup / labelは廃止する。表示上の基点は`ソース直下`とし、必要な場所では実際の`sources/`pathを確認できる。候補が1つならselectorにしない。
- 選択folderからの新規作成、file選択時のparent folder、inline filename、Enum追加、外側クリックの確定 / 取消は既存の入力契約へ従う。固定化を理由に追加手順を増やさない。
- inventory / folder choices / destination validationはshared Rustが提供する。GUIへfilesystem scan / path authorityを移さない。現在のinternal request / responseのroot fieldや配列形状は必要なら互換形状として保持し、固定rootしか有効にしない。型の全面変更を目的化しない。

## Compatibility Impact / 移行方針の提案

### 推奨: 標準configは継続、非標準配置は案内付き拒否

1. 既存`roots = ["sources"]`のProjectは、ファイル移動やconfig編集なしで利用を継続する。省略形でも同じsaved inputから同じdomain resultを得る。ただしconfig bytesが異なる場合のsnapshot / receipt identityまで同一とは主張しない。
2. 別名・複数rootのProjectは、誤って一部のデータだけを読まないよう、source discovery / Build / Publish / mutation前に拒否する。GUI / CLIは共有のdiagnostic codeと、設定されたroot・移行先`sources/`・必要な移行操作を伝える。GUIで開いていた旧workspace / dirty bufferはOpen失敗で破棄しない。
3. 拒否時にsource、config、artifact、cache、publish destinationを書き換えない。自動rename、merge、delete、config置換をしない。
4. 案内する手動移行は、まずGit checkpoint / backupを確保し、旧rootの内容を`sources/`配下へ配置してからroot設定を省略または`["sources"]`へ変更し、validateを通す。複数rootはそれぞれ別のsubfolderへ整理してfilename衝突を避ける。YAMLはbyte-for-byteコピーし、domain identityを変更しない。移行先の既存fileへ上書きせず、衝突 / duplicate declarationは利用者が解決する。旧rootの削除は成功の条件にしない。
5. pathに結び付くselection、diagnostic provenance、cached snapshotはreload時に再取得する。過去Plan / recovery / receiptを新配置へ推測で付け替えない。pending recovery / dirty / Outcome Unknownがある場合は既存contractで先に解決する。

この方針はcustom / multiple rootsという既存config capabilityを撤回するbreaking change。今回の固定化directionだけから、移行負担の受け入れまで承認済みと解釈しない。

代案は旧配置の読み込みを移行期間だけ残すことで、利用継続は容易になるが、複数root用の意味論・guard・UI例外と終了条件が残る。もう1つの代案は明示的な移行toolで、操作の負担は減るがmulti-file mutation / collision / recoveryを別途設計する必要がある。今回の単純化を小さい変更で成立させるには推奨案が適する。

## Implementation Plan / Acceptance

| 順序 | 変更slice | 完了証拠 |
| --- | --- | --- |
| 1 | 互換性方針のHuman decisionを記録し、上記canonical ownersへatomic適用。ADR 0004のconfigurable root前提を修正 | source契約とGUI契約が矛盾せず、古いroot選択の規範が残らない |
| 2 | shared Config / Projectに固定source directoryを集約。省略形と旧標準形を受理。非標準形をdiscovery前に識別 | config / Project Openのfocused tests。別名・複数・空・別表記の拒否がno-mutation。missing directoryが識別可能 |
| 3 | CLI / GUI init、creation / move choices、config reconcile、Migration / Build snapshot / Publishの保護境界を固定rootへ接続 | project_creation、source_creation、source_path、config_workspace、migration_commit、artifact_commit、publishの関連checks。境界外 / race / stale / replacement / recoveryの防護が維持 |
| 4 | Explorerと作成 / 移動のfolder表示を統一。migration diagnosticの日本語表示 / CLI JSONを共有 | native project Openで旧workspace / dirty維持、単一tree、作成 / move先、外部変更後のreload。実macOS操作で余分な選択・root行・indentが消える |
| 5 | regression review、required local checks / branch CI。成功後にproduction app更新 | source exact bytesとindependent oracleを維持し、GUI / CLIで省略形・旧標準形・非標準拒否の結果が一致。コード実装前のこの計画だけで製品検証完了とはしない |

fixtureの固定inputをこの変更の都合で書き換えない。省略形・非標準形のcasesはtestがtemporary Projectを組み立てる。既存の複数root成功testは仕様適用後にno-mutation拒否testへ変更する。full oracle、Rust checks、Desktop typecheck / native evidence、clean-slate check、required CIはimplementation / review-code手順に従ってscopeに応じて行う。Windows actual Desktop / Unity actual Editor-runtimeの既存evidence gatesを今回の計画で解消したとは扱わない。

## Open Questions / Potential ADRs

- Human decision needed: 上記推奨のconfig互換性 / 手動移行方針を採用するか。固定・単一というdirectionの再確認は不要。
- Potential ADRs: 新規ADRは不要。ADR 0004のConsequencesへ変更理由を最小限反映する。
- 非scope: automatic migration tool、named source group / ignore設定、external source linking、folder自体のrename / move、Build / Publish destinationの固定化、Unity project構成の変更。

## Approval Eligibility

Autonomous approval eligible: No

Human gate: [Execution Workflow / Human gate](../execution-workflow.md#human-gate)のBreaking compatibility。custom / multiple rootsの撤回と移行policyが未選択。方向性はHuman-selectedだが、その詳細policyをagentが自動承認しない。

## Review

Proposed確定後にreview-specの別challenge passを実施。source request、canonical owners、現行Config / Project / native guards / Desktop Open testへ照合した。authoring中の意図を不足するauthorityの代わりにせず、設定shapeの通常errorとmigration diagnosticを区別する補正を含めて再確認した。

- **Blocking Issues**: None identified。実装開始は下記Human gateに依存する。
- **Non-blocking Issues**: None identified。
- **Questions**: 推奨のconfig互換性 / 手動移行方針を採用するか。
- **Approved as Proposed**: Yes（semantic review verdict。approval / canonical applicationではない）。
- **Autonomous approval eligibility**: Eligible: No。Human gate: Breaking compatibility。固定化directionは選択済みだが、非標準Projectを拒否する移行policyは未選択。
- **Review dimensions**: Intent fidelityは計画scopeと固定化directionを保持。Internal / Cross-spec consistencyはPROJECT-CONFIG-002の置換と関連ownerの同時適用で整合。Terminology / Normative strengthはHuman directionとProposalを区別。Testabilityはconfig shape、no-mutation、旧workspace維持、boundary / stale、GUI / CLI一致を含む。Backward compatibilityは標準配置の継続と非標準配置のbreaking impactを明示。Unresolved ambiguityはpolicy decisionへ限定し、symlinkの既存Open Questionを追加permissionにしない。Implementation leakage / Unrequested behaviorはinternal型の全面変更とautomatic migrationを含めない。Documentation ownershipはProposed artifactに差分を置き、適用後はcanonical ownerへ集約する。

## Approval Record

Pending。canonical仕様 / product codeには未適用。
