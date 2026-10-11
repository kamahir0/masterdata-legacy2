# 表の理解と近接編集の改善

Status: Applied

## Affected Specifications

- `GUI-UNIFIED-005`: 日常のcolumn contextと低頻度の変更操作の分離。
- `GUI-DATA-EDIT-002 / 003 / 004`: 型別編集、値の要約、nullable共通操作。
- `GUI-TYPE-LAYOUT-002`: Flagsの数値の読み方。

## Source Evidence and Classification

Decision: 2026-10-11 HumanはレガシーUI研究の第一・第二Passを総合し、良いところを取り入れる大幅改善を選択した。既存のReact / Ant Design、日本語、bounded projection、source preservation、write safety、draft lifetimeは維持する。

Observation: 第一Passの56比較項目・操作coverageと、第二Passの24観察・訂正を合わせて評価する。未確認を不存在としない。第二Passは作成の名前入力、tags sticky、bool active editor、MessagePack KeyとPK/SKの区別を訂正した。研究は旧codeを使わずactual appで行った。

## Confirmed Decisions / finite adoption ledger

以下はAgent Decision。低risk・reversibleなpresentation改善を選び、旧機能一式や旧topologyの復元をしない。

| 統合した観察 | 採用 / 維持 / 対象外 | exact evidence |
|---|---|---|
| 第一18–21、第二1–12: Key / PK / SK / REF、型付き候補、近くの診断 | 小さい読み取り表示を通常headerへ。変更は既存定義面とMigration。候補は名前＋型、診断は同じ定義面 | 全field Key、複合key所属、参照所属、選択先の型、定義面の診断を確認 |
| 第一22–33、第二13–21: 型別操作 / 値preview / 近接編集 | bool active control、inline searchable Enum、近接Flags、小さいCustom。大きいArray/deep値はDrawer。bounded実値previewとnull共通操作 | 開閉no-dirty、操作単位Undo、Escape未確定取消、既存unknown保持、nested focus、viewport追従 |
| 第一42–43、第二7・22–23: 型定義 / Flags数値 | Custom Keyは既存表示を維持。Flagsは既存数値にbitの読み方を併記。numeric mutation拡張はしない | 64-bitをNumber化せず表示、None保護、既存Type Migration保持 |
| 第一1–17・34–40・48–56、第二24: shell / navigation / creation / writes | Recent、pane toggle、theme、sticky、source作成、履歴、安全なSave、Problems、Build / Publishの既存改善を維持 | 既存回帰suite / actual representative surface |
| 第一41・45: 名前入力なし作成 / sticky tags | 第二Passで撤回。現行改善理由にしない | 第二Passの訂正と原本hash記録 |
| 第一44・46–47: filter / Search / paste | Searchとlossless pasteは維持。タグfilter・Advanced Batch・truncate pasteは採用しない | 既存oracle |
| 第二のdraft消失 / Escape確定 / identity消失 | 採用しない。physical history、未確定typing取消、sticky identityを維持 | 既存dirty-revisit / creation / Escape / geometry回帰 |
| 全Passの未取得fault / latency / delivery実環境 | 旧版優劣を推定しない。既存external evidence gatesを維持 | 未取得を完了と呼ばない |

## Canonical result

[GUI-UNIFIED-005](../gui/table-editor/spec.md#gui-unified-005)、[GUI-DATA-EDIT-002 / 003 / 004](../gui/data-editor/spec.md#gui-data-edit-003)、[GUI-TYPE-LAYOUT-002](../gui/type-editor/spec.md#gui-type-layout-002)をownerとする。上記ledgerは両Passの採用理由とscope分類であり、canonical requirementsを複製しない。

## Open Questions / Potential ADRs

None. 既存ownership / lifetime / boundaryを変更しないためADR追加なし。

## Compatibility / Implementation Impact

persisted YAML、CLI、generated API、Save / Migration / Build / Publish semanticsは不変。Rust bounded read projectionとReactの単一active editor / overlayのみ変更する。値previewをedit authorityにしない。Enum / Flags invalid raw valueを開閉で正規化しない。scopeはこのledgerで有限とし、stretch最適化で延長しない。

## Approval Eligibility

Autonomous approval eligible: Yes
Human gate: None for this Human-selected presentation scope. 既存external evidence gapsは別件として保持。

## Approval Record

Approval mode: Agent-autonomous。Basis: 2026-10-11のHuman-selected統合改善request。Proposed確定後、別review-spec passでintent fidelity / cross-spec / terminology / testability / compatibility / ownershipを確認。Blocking Issues / Questions: None identified。Non-blocking: 小さいCustomでも複雑な値へ進んだ際はDrawerを維持し、全面Popover化しない。Approved as Proposed: Yes。Eligible: Yes。Human gate: None for this scope。既存external evidence gateは保持。canonical applicationはこのrecordとatomicに行う。
