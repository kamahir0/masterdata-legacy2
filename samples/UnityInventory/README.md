# Unity Inventory Sample

MasterDataでアイテムとクエストを編集し、Build / PublishしたデータをUnityで読むsampleです。編集用ProjectとUnity Projectを同じdirectoryに置いています。

```text
UnityInventory/
├─ MasterData/
│  ├─ masterdata.toml
│  └─ sources/
│     ├─ items/       アイテム6件
│     ├─ quests/      クエスト3件、アイテムへの参照
│     └─ types/       Enum / Flags / 構造体 / Value Object
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

Unity Hubで`Unity/`をProjectとして追加し、`Assets/Scenes/Inventory.unity`を開いてPlayします。アイテムを選ぶと、Enum、Flags、構造体、リスト、nullableを読み取った詳細が表示されます。rarityで絞り込み、クエストを押すと参照先の報酬アイテムへ移動します。

## データを編集してUnityへ反映

1. MasterData Desktopで`MasterData/`を開き、アイテムの名前や価格などを編集して保存します。
2. Build後、設定済みの2つのUnity destinationへPublishします。
3. Unityのimport / compile完了を確認し、Play中の**Reload**で配布済みバイナリを読み直します。schema/typeを変えた場合はPlayを停止してcompile後に再実行します。

CLIでも同じBuild / Publishを実行できます。

```sh
cargo run --locked -p masterdata-command -- build --project samples/UnityInventory/MasterData --publish
```

生成済みC#とバイナリをcommitしてあります。編集元は`MasterData/sources/`です。Unity側の生成ファイルを直接修正する必要はありません。クラス定義から`MemoryDatabase`とserializerを生成するのは、UnityのMasterMemory / MessagePack Source Generatorです。

ロード処理は[InventoryDemo.cs](Unity/Assets/InventoryDemo/InventoryDemo.cs)の`CreateDatabase` / `Reload`を参照してください。databaseはcomponentが所有し、既存[Unity連携package](../../unity/Packages/com.kamahir0.masterdata/README.md)のStreamingAssets APIにfactoryを渡します。

依存はMasterMemory **3.0.4**、MessagePack **3.1.3**、NuGetForUnity **4.5.0**に固定しています。導入方法は[MasterMemoryの公式Unity guide](https://github.com/Cysharp/MasterMemory/tree/3.0.4#readme)、[MessagePackの公式Unity guide](https://github.com/MessagePack-CSharp/MessagePack-CSharp/tree/v3.1.3#readme)、[NuGetForUnity](https://github.com/GlitchEnzo/NuGetForUnity/tree/v4.5.0#readme)に沿っています。
