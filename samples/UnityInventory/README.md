# Unity モデルケース

MasterDataで編集し、Build / PublishしたデータをUnityで読むsampleです。編集用ProjectとUnity Projectを同じdirectoryに置き、通常のアイテム例に加えて、型・参照・配列・多段ネスト・縦横スクロールのモデルケースを用意しています。

```text
UnityInventory/
├─ MasterData/
│  ├─ masterdata.toml
│  └─ sources/
│     ├─ items/       アイテム6件
│     ├─ quests/      クエスト3件、アイテムへの参照
│     ├─ players/     128行、縦スクロール
│     ├─ model-cases/ 70列、型とmodifier、配列、多段ネスト
│     ├─ localized-texts/ 複合主キー・複合副キー
│     ├─ reference-cases/ unique / nonunique / Nullable / 複合参照
│     ├─ announcements/ 3つのdata fileとRecord Tag / Build Profile
│     └─ types/       Enum / Flags / 構造体 / Value Object、計19型
└─ Unity/
   ├─ Assets/Scenes/Inventory.unity
   ├─ Assets/MasterData/Generated/
   └─ Assets/StreamingAssets/masterdata.bytes
```

## 初回の準備

Unity **6000.6.4f1**、Python 3、Rust toolchain、**.NET 8 SDK**を使用します。repo rootで次を実行します。

```sh
python3 samples/UnityInventory/prepare.py
```

固定バージョンのNuGet依存をsample内へ復元し、MasterDataをBuild / Publishします。依存のダウンロードにはネットワーク接続が必要です。Unity Editorはこのcommandでは起動しません。

Unity Hubで`Unity/`をProjectとして追加し、`Assets/Scenes/Inventory.unity`を開いてPlayします。画面上のタブでモデルケースを切り替えます。表は縦横にスクロールでき、セルを選ぶと右側に実際に読み込んだ値を表示します。「選択したレコード全体を表示」で配列や構造体の内部まで確認できます。

## モデルケース

| 表・型 | 確認すること |
| --- | --- |
| `item` / `quest` | 日本語の名前・説明、Enum、Flagsの組み合わせ、Value Object、構造体、空／非空配列、Nullable、報酬の参照先への移動 |
| `player` | 128行の縦スクロール、NullableのValue Object参照、`Rarity × Level`のnonunique複合副キー |
| `model-case` | 70列の横スクロール。1行目は通常値、2行目はnull・空配列・FlagsのNone、3行目は数値の境界値と長文 |
| primitive 8型 | `bool` / `int` / `uint` / `long` / `ulong` / `float` / `double` / `string`のRequired・Nullable・Array |
| Value Object 5型 | `ItemCode` / `PlayerId` / `TextId` / `WorldId` / `SessionId`で全underlying、Required・Nullable・Array、暗黙変換の両方向の4通りの設定 |
| Enum / Flags | それぞれ`int` / `uint` / `long` / `ulong`のRequired・Nullable・Array。FlagsのNone・組み合わせ・符号ビットを含むhighest bit |
| `CombatStats` / `RewardBundle` | Required・Nullable・Arrayの構造体。`RewardBundle[] → Entries: RewardEntry[] → Effects: Effect[] → Stats: CombatStats? / Coefficients: float[] / Labels: string[]`という多段ネスト |
| `Distance` | floatの1フィールドを持つ構造体。`Effect.Range`で、Value Objectとは異なるmappingの入力例を示す |
| `localized-text` / `reference-case` | 複合主キー、逆順のunique複合副キー、single／multiとRequired／Nullableの参照、複合Nullable参照の値あり／全null、helper名の明示指定 |
| `announcement` | 同じ論理tableのdataを複数fileに分け、Record Tagで配布対象を切り替える |

MasterData Desktopでも各表を開き、末尾行・末尾列のセルや、ネストした型を編集できます。正しい入力例のsampleであり、無効な値・循環する型・失敗回復やMigrationの全操作を網羅するtest fixtureではありません。型の対応範囲と制約は[Type System](../../docs/specs/type-system/README.md)、機能全体の仕様は[canonical domain](../../docs/specs/README.md)を参照してください。

## タグとBuild Profile

Profileを指定しない準備では全件を配布します。次の例は同じUnity destinationへproductionのデータを配布します。

```sh
python3 samples/UnityInventory/prepare.py --profile production
```

| Profile | `announcement`の表示 |
| --- | --- |
| 指定なし | 共通・開発用・イベントの3件 |
| `production` | 共通の1件 |
| `development` | 共通・開発用の2件 |
| `event` | 共通・イベントの2件 |
| `empty` | 全表0件。schemaと生成APIを保ったまま空のデータを配布 |

参照先を含むほかの表は、`empty`以外のProfileでは残ります。配布後にUnityの「再読み込み」を押して件数の変化を確認し、`prepare.py`をProfile指定なしで実行すれば全件に戻せます。

## 日本語フォント

表示には既存のTMPを使用し、Noto Sans JPを同梱しています。Latinの静的フォントに、日本語のDynamic fallback（1024 atlas、multi-atlas、Clear Dynamic Data On Build）を設定しています。OSフォントや利用文字の手動登録に依存せず、編集で追加した日本語も表示できます。

フォントは[google/fontsの固定revision](https://github.com/google/fonts/tree/66a36c8c94b1a5d992ee4e7f392fccfe4945767c/ofl/notosansjp)をfontTools 4.60.1の`varLib.instancer`で`wght=400`に固定したRegularのTTFです。[SIL Open Font License](Unity/Assets/Fonts/OFL.txt)を同梱しています。フォント設定の再生成は`UnityInventory.Editor.SampleSetup.ConfigureJapaneseFont`で行います。

## データを編集してUnityへ反映

1. MasterData Desktopで`MasterData/`を開き、アイテムの名前や価格などを編集して保存します。
2. Build後、設定済みの2つのUnity destinationへPublishします。
3. Unityのimport / compile完了を確認し、Play中の**再読み込み**で配布済みバイナリを読み直します。schema/typeを変えた場合はPlayを停止してcompile後に再実行します。

CLIでも同じBuild / Publishを実行できます。

```sh
cargo run --locked -p masterdata-command -- build --project samples/UnityInventory/MasterData --publish
```

生成済みC#とバイナリをcommitしてあります。編集元は`MasterData/sources/`です。Unity側の生成ファイルを直接修正する必要はありません。クラス定義から`MemoryDatabase`とserializerを生成するのは、UnityのMasterMemory / MessagePack Source Generatorです。

ロード処理は[InventoryDemo.cs](Unity/Assets/InventoryDemo/InventoryDemo.cs)の`CreateDatabase` / `Reload`を参照してください。databaseはcomponentが所有し、既存[Unity連携package](../../unity/Packages/com.kamahir0.masterdata/README.md)のStreamingAssets APIにfactoryを渡します。

依存はMasterMemory **3.0.4**、MessagePack **3.1.3**、NuGetForUnity **4.5.0**に固定しています。導入方法は[MasterMemoryの公式Unity guide](https://github.com/Cysharp/MasterMemory/tree/3.0.4#readme)、[MessagePackの公式Unity guide](https://github.com/MessagePack-CSharp/MessagePack-CSharp/tree/v3.1.3#readme)、[NuGetForUnity](https://github.com/GlitchEnzo/NuGetForUnity/tree/v4.5.0#readme)に沿っています。
