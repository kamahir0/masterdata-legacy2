# Development State

Stage: correction-ready
Candidate: df30f26c52f4a594463778ebca9e264d7e8c0636
Work base: ba18eeaf90cf2956bd8eeb8863fa88316835058c

## Active work

In progress: Human-selected [両Pass統合改善](spec-changes/0058-contextual-table-authoring.md)のcanonical application / 実装 / Rust回帰 / actual WebView authoring 19項目 / geometry 9項目がPASS。Remaining: 固定Candidateのactual表示、required CI、production app更新。既存external evidence gatesは保持。

## Blocking findings

Concrete correction closed: 複合previewのglobal翻訳を除去し、生成countだけ日本語化。literal値保持をRust / 表示4 testsとauthoring19項目で再検証PASS（GUI-SHELL-LANGUAGE-001）。既知製品Blockingなし。最終Candidateのrequired CI / actual表示 / packageへ進む。

Product correction closed: actual Flags表示で発見したsigned highest bitの補助表示欠落（GUI-TYPE-LAYOUT-002）をshared Rust read projectionで補正。focused Rust 8 tests / workspace clippy / Type WebView 13項目 / frontend build / integrity PASS。new Candidateのactual表示 / CIへ進む。

Closed correction: nullableのkeyboard / selected表示 / 非重複、近接editorのoutside dismissal focusを修正し、authoring 19項目 / declaration 11項目、frontend build / integrityのfocused再検証がPASS。既知製品Blockingなし。new Candidateでactual表示とrequired CIへ進む。

Evidence gaps: macOS actual first-accepted <150ms証明 / held-drag Escape（CGEvent permission不足、設定変更禁止）、Windows x64 actual OS interaction / performance、Unity actual Editor / runtime。実IMEのconcrete Blockingは修正・再検証済みで他の既知製品Blockingは未検出。Cutover-ready / objective-complete未達。

## Human decision needed

[exact gaps / evidence / choices](evidence/clean-room-candidate.md#human-gates--verdict)。Windows / Unity実行環境は未提供。macOS CGEvent使用は明示authorization済みだが、`CGPreflightPostEventAccess()`がfalseで送信前に停止した。Human条件どおりpermission設定を変更しない。残scopeは有限ledgerの既存evidenceと実際に発見したcontract defectだけ。main merge / cutoverはscope外。
