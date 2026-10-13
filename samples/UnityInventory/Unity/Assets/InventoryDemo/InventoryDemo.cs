using System.Collections;
using System.Collections.Generic;
using System.Linq;
using MasterData.UnityRuntime;
using Masterdata.Generated;
using TMPro;
using UnityEngine;
using UnityEngine.InputSystem.UI;

namespace UnityInventory
{
    public sealed class InventoryDemo : MonoBehaviour
    {
        static readonly Color Background = new Color32(18, 24, 36, 255);
        static readonly Color Surface = new Color32(29, 38, 54, 255);
        static readonly Color Accent = new Color32(90, 210, 174, 255);
        MemoryDatabase database;
        readonly List<Item> items = new List<Item>();
        readonly List<UnityEngine.UI.Button> itemButtons = new List<UnityEngine.UI.Button>();
        readonly Dictionary<string, UnityEngine.UI.Button> sampleTabs = new Dictionary<string, UnityEngine.UI.Button>();
        Transform itemList, questList;
        TMP_Text status, title, details;
        UnityEngine.UI.Button reload;
        Rarity? filter;
        int selectedId;
        bool loading;
        Transform inventoryView, browserView;
        string activeSample = "inventory";
        public SampleBrowser Browser { get; private set; }

        public MemoryDatabase Database => database;
        public string Status => status.text;
        public int VisibleItemCount => itemButtons.Count;
        public int SelectedItemId => selectedId;

        void Awake()
        {
            Application.targetFrameRate = 30;
            BuildView();
        }

        IEnumerator Start()
        {
            yield return Reload();
        }

        public static MemoryDatabase CreateDatabase(byte[] bytes)
        {
            var resolver = MessagePack.Resolvers.CompositeResolver.Create(
                MasterMemoryResolver.Instance, MessagePack.Resolvers.StandardResolver.Instance);
            return new MemoryDatabase(bytes, formatterResolver: resolver);
        }

        public IEnumerator Reload()
        {
            if (loading) yield break;
            loading = true;
            reload.interactable = false;
            status.text = "マスターデータを読み込んでいます…";
            yield return StreamingAssetsDatabase.Load("masterdata.bytes", CreateDatabase, result =>
            {
                if (!result.Succeeded)
                {
                    status.text = result.Error.Code + ": " + result.Error.Message;
                    Debug.LogError(status.text);
                    return;
                }
                database = result.Database;
                items.Clear();
                foreach (var item in database.ItemTable.All) items.Add(item);
                var questCount = 0;
                foreach (var quest in database.QuestTable.All) questCount++;
                status.text = "読み込み完了：アイテム " + items.Count + "件 / クエスト " + questCount + "件";
                Debug.Log(status.text);
                RefreshItems();
                RefreshQuests();
                ShowSample(activeSample);
                if (items.Count > 0)
                    SelectItem(items.Any(item => item.Id == selectedId) ? selectedId : items[0].Id);
                else
                {
                    selectedId = 0;
                    title.text = "アイテムがありません";
                    details.text = "MasterDataでレコードを追加し、ビルド・配布後に再読み込みしてください。";
                }
            });
            loading = false;
            reload.interactable = true;
        }

        public void Filter(Rarity? rarity)
        {
            filter = rarity;
            if (database != null) RefreshItems();
        }

        public void SelectItem(int id)
        {
            if (database == null) return;
            var item = database.ItemTable.FindById(id);
            selectedId = id;
            title.text = item.Name;
            var ingredients = item.Ingredients.Length == 0 ? "なし（空配列）" : string.Join("、", item.Ingredients);
            details.text = item.Description + "\n\n"
                + "<color=#5AD2AE>" + RarityLabel(item.Rarity) + "</color>  /  " + item.Price + " ゴールド\n"
                + "分類（Flags）：" + item.Tags + "\n\n"
                + "攻撃 " + item.Stats.Attack + "    防御 " + item.Stats.Defense + "    体力 " + item.Stats.Health
                + "\n\n作成に必要な素材\n" + ingredients
                + "\n\n備考\n" + (item.Note ?? "なし（null）")
                + "\n\n<color=#9AAABD>アイテムコード：" + item.Code.Value + " / ID " + item.Id + "</color>";
            foreach (var button in itemButtons)
                button.GetComponent<UnityEngine.UI.Image>().color = button.name == "Item-" + id ? new Color32(37, 73, 75, 255) : Surface;
        }

        public void SelectQuest(int id)
        {
            if (database == null) return;
            var quest = database.QuestTable.FindById(id);
            var reward = quest.GetRewardItem(database);
            if (filter.HasValue && filter.Value != reward.Rarity) Filter(null);
            SelectItem(reward.Id);
            status.text = quest.Name + " / 報酬：" + title.text + " × " + quest.RewardAmount;
        }

        void RefreshItems()
        {
            Clear(itemList);
            itemButtons.Clear();
            if (filter.HasValue)
            {
                foreach (var item in database.ItemTable.FindByRarity(filter.Value)) AddItem(item);
            }
            else
            {
                foreach (var item in items) AddItem(item);
            }
            if (itemButtons.Count == 0) Text(itemList, "該当するアイテムはありません。", 20, 60);
        }

        void AddItem(Item item)
        {
            var button = Button(itemList, item.Name + "   /   " + RarityLabel(item.Rarity) + "   /   " + item.Price + "g", () => SelectItem(item.Id), 48);
            button.name = "Item-" + item.Id;
            itemButtons.Add(button);
        }

        void RefreshQuests()
        {
            Clear(questList);
            foreach (var quest in database.QuestTable.All)
            {
                var captured = quest;
                Button(questList, quest.Name + "  [推奨Lv " + quest.RecommendedLevel + "]\n"
                    + quest.GetRewardItem(database).Name + " × " + quest.RewardAmount,
                    () => SelectQuest(captured.Id), 66);
            }
        }

        void BuildView()
        {
            var canvas = new GameObject("Inventory Canvas", typeof(RectTransform), typeof(Canvas),
                typeof(UnityEngine.UI.CanvasScaler), typeof(UnityEngine.UI.GraphicRaycaster));
            canvas.transform.SetParent(transform, false);
            canvas.GetComponent<Canvas>().renderMode = RenderMode.ScreenSpaceOverlay;
            var scaler = canvas.GetComponent<UnityEngine.UI.CanvasScaler>();
            scaler.uiScaleMode = UnityEngine.UI.CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(1200, 800);
            scaler.matchWidthOrHeight = 0.5f;
            var background = Panel(canvas.transform, "Background", Background);
            Stretch(background.GetComponent<RectTransform>(), 0, 0, 0, 0);
            var root = Panel(background.transform, "Content", Background);
            Stretch(root.GetComponent<RectTransform>(), 36, 36, 28, 28);
            Vertical(root.transform, 12);
            Text(root.transform, "MasterData モデルケース", 28, 44);
            status = Text(root.transform, "マスターデータを読み込んでいます…", 16, 28);
            var tabs = Panel(root.transform, "Samples", Background);
            Layout(tabs, 44);
            Horizontal(tabs.transform, 8);
            foreach (var tab in new[] { ("inventory", "アイテム・報酬"), ("player", "128行の表"), ("model-case", "70列・型・ネスト"),
                ("reference-case", "複合キー・参照"), ("localized-text", "言語別の文言"), ("announcement", "タグ・Profile") })
            {
                var captured = tab.Item1;
                sampleTabs.Add(captured, Button(tabs.transform, tab.Item2, () => ShowSample(captured), 44));
            }
            var actions = Panel(root.transform, "Actions", Background);
            Layout(actions, 40);
            Horizontal(actions.transform, 8);
            Text(actions.transform, "セルを選ぶと、値やネストした内容を右側で確認できます。", 16, 40);
            reload = Button(actions.transform, "再読み込み", () => StartCoroutine(Reload()), 40);
            reload.GetComponent<UnityEngine.UI.LayoutElement>().flexibleWidth = 0;
            reload.GetComponent<UnityEngine.UI.LayoutElement>().preferredWidth = 150;
            inventoryView = Panel(root.transform, "InventoryView", Background).transform;
            inventoryView.gameObject.AddComponent<UnityEngine.UI.LayoutElement>().flexibleHeight = 1;
            Vertical(inventoryView, 12);
            browserView = Panel(root.transform, "BrowserView", Background).transform;
            browserView.gameObject.AddComponent<UnityEngine.UI.LayoutElement>().flexibleHeight = 1;
            Browser = new SampleBrowser(browserView);
            browserView.gameObject.SetActive(false);
            var toolbar = Panel(inventoryView, "Filters", Background);
            Layout(toolbar, 48);
            Horizontal(toolbar.transform, 8);
            Button(toolbar.transform, "すべて", () => Filter(null), 48);
            foreach (Rarity rarity in System.Enum.GetValues(typeof(Rarity)))
            {
                var captured = rarity;
                Button(toolbar.transform, RarityLabel(rarity), () => Filter(captured), 48);
            }
            var body = Panel(inventoryView, "Items and Details", Background);
            body.AddComponent<UnityEngine.UI.LayoutElement>().flexibleHeight = 1;
            Horizontal(body.transform, 18);
            itemList = Scroll(body.transform, "Items", Background, 6, 0);
            var detailPanel = Scroll(body.transform, "Details", Surface, 18, 24);
            title = Text(detailPanel, "アイテムを選択", 30, 52);
            details = Text(detailPanel, "", 20, 390);
            details.GetComponent<UnityEngine.UI.LayoutElement>().preferredHeight = -1;
            details.GetComponent<UnityEngine.UI.LayoutElement>().minHeight = 0;
            details.lineSpacing = 4;
            Text(inventoryView, "クエスト報酬：選ぶと参照先のアイテムへ移動します", 18, 30);
            questList = Panel(inventoryView, "Quests", Background).transform;
            Layout(questList.gameObject, 66);
            Horizontal(questList, 8);
            Text(root.transform, "MasterDataで編集 → 保存 → ビルド → 配布 → この画面で再読み込み", 16, 28);
            var events = new GameObject("EventSystem", typeof(UnityEngine.EventSystems.EventSystem), typeof(InputSystemUIInputModule));
            events.transform.SetParent(transform, false);
            events.GetComponent<InputSystemUIInputModule>().AssignDefaultActions();
        }

        static string RarityLabel(Rarity rarity) => rarity == Rarity.Common ? "一般" : rarity == Rarity.Rare ? "希少" : "伝説";

        public void ShowSample(string sample)
        {
            if (database == null) return;
            activeSample = sample;
            foreach (var tab in sampleTabs)
                tab.Value.GetComponent<UnityEngine.UI.Image>().color = tab.Key == sample ? new Color32(37, 73, 75, 255) : Surface;
            inventoryView.gameObject.SetActive(sample == "inventory");
            browserView.gameObject.SetActive(sample != "inventory");
            switch (sample)
            {
                case "player":
                    Browser.Show("player", "128行の表", "下へスクロールして末尾まで確認できます。空配列、NullableのValue Object参照、複合副キーも含みます。", database.PlayerTable.All);
                    break;
                case "model-case":
                    Browser.Show("model-case", "70列の型・配列・ネスト", "横へスクロールして列を選択してください。1行目は通常値、2行目はnull・空配列、3行目は境界値と長文です。", database.ModelCaseTable.All);
                    break;
                case "localized-text":
                    Browser.Show("localized-text", "言語別の文言", "TextId × Languageの複合主キー。逆順の複合副キーと、Languageのnonunique副キーも持っています。", database.LocalizedTextTable.All);
                    break;
                case "reference-case":
                    Browser.Show("reference-case", "複合キー・参照", "セルを選ぶと値と参照の解決結果を確認できます。2行目ではNullable参照がすべて未設定です。", database.ReferenceCaseTable.All, References);
                    break;
                case "announcement":
                    Browser.Show("announcement", "タグ・Build Profile", "全件は3件、productionは1件、developmentとeventは各2件。prepare.py --profile で配布し直すと件数が変わります。", database.AnnouncementTable.All);
                    break;
            }
        }

        string References(ReferenceCase row)
        {
            return "参照の解決結果\n複合主キー → " + row.ResolveTitle(database).Text
                + "\nNullable複合副キー → " + (row.GetOptionalTitle(database)?.Text ?? "なし（null）")
                + "\nnonunique副キー → " + row.GetRarityItems(database).Count + "件"
                + "\nNullable nonunique副キー → " + row.GetOptionalRarityItems(database).Count + "件"
                + "\nunique副キー → " + row.GetItem(database).Name
                + "\nNullable unique副キー → " + (row.GetOptionalItem(database)?.Name ?? "なし（null）");
        }

        internal static GameObject Panel(Transform parent, string name, Color color)
        {
            var panel = new GameObject(name, typeof(RectTransform), typeof(UnityEngine.UI.Image));
            panel.transform.SetParent(parent, false);
            var image = panel.GetComponent<UnityEngine.UI.Image>();
            image.color = color;
            image.raycastTarget = false;
            return panel;
        }

        internal static Transform Scroll(Transform parent, string name, Color color, int spacing, int padding)
        {
            var view = Panel(parent, name, color);
            var layout = view.AddComponent<UnityEngine.UI.LayoutElement>();
            layout.flexibleWidth = layout.flexibleHeight = 1;
            var viewport = Panel(view.transform, "Viewport", color);
            viewport.GetComponent<UnityEngine.UI.Image>().raycastTarget = true;
            Stretch(viewport.GetComponent<RectTransform>(), 0, 0, 0, 0);
            viewport.AddComponent<UnityEngine.UI.Mask>().showMaskGraphic = false;
            var content = new GameObject("Content", typeof(RectTransform));
            content.transform.SetParent(viewport.transform, false);
            var rect = content.GetComponent<RectTransform>();
            rect.anchorMin = new Vector2(0, 1);
            rect.anchorMax = Vector2.one;
            rect.pivot = new Vector2(0.5f, 1);
            rect.sizeDelta = Vector2.zero;
            Vertical(content.transform, spacing, padding);
            content.AddComponent<UnityEngine.UI.ContentSizeFitter>().verticalFit = UnityEngine.UI.ContentSizeFitter.FitMode.PreferredSize;
            var scroll = view.AddComponent<UnityEngine.UI.ScrollRect>();
            scroll.viewport = viewport.GetComponent<RectTransform>();
            scroll.content = rect;
            scroll.horizontal = false;
            scroll.movementType = UnityEngine.UI.ScrollRect.MovementType.Clamped;
            return content.transform;
        }

        internal static TMP_Text Text(Transform parent, string text, int size, float height)
        {
            var obj = new GameObject("Text", typeof(RectTransform), typeof(TextMeshProUGUI));
            obj.transform.SetParent(parent, false);
            var label = obj.GetComponent<TextMeshProUGUI>();
            label.text = text;
            label.fontSize = size;
            label.color = new Color32(228, 237, 246, 255);
            label.raycastTarget = false;
            label.textWrappingMode = TextWrappingModes.Normal;
            Layout(obj, height);
            return label;
        }

        internal static UnityEngine.UI.Button Button(Transform parent, string label, UnityEngine.Events.UnityAction action, float height)
        {
            var obj = Panel(parent, label, Surface);
            obj.GetComponent<UnityEngine.UI.Image>().raycastTarget = true;
            Layout(obj, height);
            var button = obj.AddComponent<UnityEngine.UI.Button>();
            button.targetGraphic = obj.GetComponent<UnityEngine.UI.Image>();
            button.onClick.AddListener(action);
            var text = Text(obj.transform, label, 18, height);
            text.alignment = TextAlignmentOptions.MidlineLeft;
            Stretch(text.GetComponent<RectTransform>(), 16, 12, 4, 4);
            return button;
        }

        internal static void Vertical(Transform target, int spacing, int padding = 0)
        {
            var group = target.gameObject.AddComponent<UnityEngine.UI.VerticalLayoutGroup>();
            group.spacing = spacing;
            group.padding = new RectOffset(padding, padding, padding, padding);
            group.childControlWidth = group.childControlHeight = true;
            group.childForceExpandWidth = true;
            group.childForceExpandHeight = false;
        }

        internal static void Horizontal(Transform target, int spacing)
        {
            var group = target.gameObject.AddComponent<UnityEngine.UI.HorizontalLayoutGroup>();
            group.spacing = spacing;
            group.childControlWidth = group.childControlHeight = true;
            group.childForceExpandWidth = true;
            group.childForceExpandHeight = false;
        }

        internal static void Layout(GameObject obj, float height)
        {
            var layout = obj.AddComponent<UnityEngine.UI.LayoutElement>();
            layout.minHeight = layout.preferredHeight = height;
            layout.flexibleWidth = 1;
        }

        internal static void Stretch(RectTransform rect, float left, float right, float top, float bottom)
        {
            rect.anchorMin = Vector2.zero;
            rect.anchorMax = Vector2.one;
            rect.offsetMin = new Vector2(left, bottom);
            rect.offsetMax = new Vector2(-right, -top);
        }

        static void Clear(Transform parent)
        {
            foreach (Transform child in parent)
            {
                child.gameObject.SetActive(false);
                Destroy(child.gameObject);
            }
        }
    }
}
