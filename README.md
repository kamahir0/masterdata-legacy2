# MasterData

human-readable YAMLをcanonical sourceとする、MasterMemory / Unity向けDesktop-first master-data authoring environment。

Rustの共有coreを使うCLI / Desktopと、生成したデータを読むUnity連携packageを含みます。編集元はProject直下の固定`sources/`に置きます。

## Unity込みのsample

[Unity Inventory Sample](samples/UnityInventory/README.md)に、編集用MasterData Project、Unity Project、表示シーン、生成済みC#とバイナリがあります。アイテム、クエスト、Enum / Flags / 構造体 / リスト / nullable / テーブル参照を試せます。

## 開発

現在地点は[Development State](docs/execution-state.md)、実装対象と完了条件は[Current Objective](docs/current-objective.md)、操作規約は[Execution Workflow](docs/execution-workflow.md)を参照してください。Clean-roomのsource authority境界は[Handoff](docs/rewrite-preparation/clean-room-handoff.md)に保持しています。

境界検査は`python3 tools/check-clean-slate.py`（Python 3.11以上 / PyYAML）。製品の検証はRust / Desktop / native .NETとUnityの実行結果で確認します。
