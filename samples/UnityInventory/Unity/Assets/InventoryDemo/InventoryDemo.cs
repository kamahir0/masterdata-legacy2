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
        Transform itemList, questList;
        TMP_Text status, title, details;
        UnityEngine.UI.Button reload;
        Rarity? filter;
        int selectedId;
        bool loading;

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
            status.text = "Loading StreamingAssets/masterdata.bytes...";
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
                status.text = items.Count + " items / " + questCount + " quests loaded from MasterData";
                Debug.Log(status.text);
                RefreshItems();
                RefreshQuests();
                if (items.Count > 0)
                    SelectItem(items.Any(item => item.Id == selectedId) ? selectedId : items[0].Id);
                else
                {
                    selectedId = 0;
                    title.text = "No items";
                    details.text = "Add a record in MasterData, Build, Publish, then Reload.";
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
            var ingredients = item.Ingredients.Length == 0 ? "None" : string.Join(", ", item.Ingredients);
            details.text = item.Description + "\n\n"
                + "<color=#5AD2AE>" + item.Rarity + "</color>  /  " + item.Price + " gold\n"
                + "Tags: " + item.Tags + "\n\n"
                + "ATK " + item.Stats.Attack + "    DEF " + item.Stats.Defense + "    HP " + item.Stats.Health
                + "\n\nCrafting ingredients\n" + ingredients
                + "\n\nNote\n" + (item.Note ?? "None")
                + "\n\n<color=#9AAABD>Item code: " + item.Code.Value + " / ID " + item.Id + "</color>";
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
            status.text = quest.Name + " / reward: " + quest.RewardAmount + " x " + title.text;
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
            if (itemButtons.Count == 0) Text(itemList, "No items in this rarity.", 20, 60);
        }

        void AddItem(Item item)
        {
            var button = Button(itemList, item.Name + "   /   " + item.Rarity + "   /   " + item.Price + "g", () => SelectItem(item.Id), 60);
            button.name = "Item-" + item.Id;
            itemButtons.Add(button);
        }

        void RefreshQuests()
        {
            Clear(questList);
            foreach (var quest in database.QuestTable.All)
            {
                var captured = quest;
                Button(questList, quest.Name + "  [Lv " + quest.RecommendedLevel + "]\n"
                    + quest.RewardAmount + " x " + quest.GetRewardItem(database).Name,
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
            Text(root.transform, "MASTERDATA  /  INVENTORY", 30, 48);
            status = Text(root.transform, "Loading database...", 18, 34);
            var toolbar = Panel(root.transform, "Filters", Background);
            Layout(toolbar, 48);
            Horizontal(toolbar.transform, 8);
            Button(toolbar.transform, "All", () => Filter(null), 48);
            foreach (Rarity rarity in System.Enum.GetValues(typeof(Rarity)))
            {
                var captured = rarity;
                Button(toolbar.transform, rarity.ToString(), () => Filter(captured), 48);
            }
            reload = Button(toolbar.transform, "Reload", () => StartCoroutine(Reload()), 48);
            var body = Panel(root.transform, "Items and Details", Background);
            body.AddComponent<UnityEngine.UI.LayoutElement>().flexibleHeight = 1;
            Horizontal(body.transform, 18);
            itemList = Scroll(body.transform, "Items", Background, 8, 0);
            var detailPanel = Scroll(body.transform, "Details", Surface, 18, 24);
            title = Text(detailPanel, "Select an item", 30, 52);
            details = Text(detailPanel, "", 20, 390);
            details.lineSpacing = 4;
            Text(root.transform, "QUEST REWARDS  /  Click to follow a table reference", 18, 30);
            questList = Panel(root.transform, "Quests", Background).transform;
            Layout(questList.gameObject, 66);
            Horizontal(questList, 8);
            Text(root.transform, "Edit YAML or use MasterData  >  Save  >  Build  >  Publish  >  Reload", 16, 28);
            var events = new GameObject("EventSystem", typeof(UnityEngine.EventSystems.EventSystem), typeof(InputSystemUIInputModule));
            events.transform.SetParent(transform, false);
            events.GetComponent<InputSystemUIInputModule>().AssignDefaultActions();
        }

        static GameObject Panel(Transform parent, string name, Color color)
        {
            var panel = new GameObject(name, typeof(RectTransform), typeof(UnityEngine.UI.Image));
            panel.transform.SetParent(parent, false);
            var image = panel.GetComponent<UnityEngine.UI.Image>();
            image.color = color;
            image.raycastTarget = false;
            return panel;
        }

        static Transform Scroll(Transform parent, string name, Color color, int spacing, int padding)
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

        static TMP_Text Text(Transform parent, string text, int size, float height)
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

        static UnityEngine.UI.Button Button(Transform parent, string label, UnityEngine.Events.UnityAction action, float height)
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

        static void Vertical(Transform target, int spacing, int padding = 0)
        {
            var group = target.gameObject.AddComponent<UnityEngine.UI.VerticalLayoutGroup>();
            group.spacing = spacing;
            group.padding = new RectOffset(padding, padding, padding, padding);
            group.childControlWidth = group.childControlHeight = true;
            group.childForceExpandWidth = true;
            group.childForceExpandHeight = false;
        }

        static void Horizontal(Transform target, int spacing)
        {
            var group = target.gameObject.AddComponent<UnityEngine.UI.HorizontalLayoutGroup>();
            group.spacing = spacing;
            group.childControlWidth = group.childControlHeight = true;
            group.childForceExpandWidth = true;
            group.childForceExpandHeight = false;
        }

        static void Layout(GameObject obj, float height)
        {
            var layout = obj.AddComponent<UnityEngine.UI.LayoutElement>();
            layout.minHeight = layout.preferredHeight = height;
            layout.flexibleWidth = 1;
        }

        static void Stretch(RectTransform rect, float left, float right, float top, float bottom)
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
