using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Reflection;
using System.Text;
using TMPro;
using UnityEngine;
using static UnityInventory.InventoryDemo;

namespace UnityInventory
{
    // Displays generated C# values; it does not parse or interpret MasterData sources.
    public sealed class SampleBrowser
    {
        static readonly Color Surface = new Color32(29, 38, 54, 255);
        static readonly Color Selected = new Color32(37, 73, 75, 255);
        const float CellWidth = 190, RowHeight = 44;
        readonly TMP_Text heading, guide, detail;
        readonly RectTransform content;
        readonly UnityEngine.UI.Button wholeRecord;
        readonly List<UnityEngine.UI.Button> cells = new List<UnityEngine.UI.Button>();
        PropertyInfo[] fields;
        object[] rows;
        Func<object, string> relations;
        int selectedRow;
        UnityEngine.UI.Button selectedCell;

        public string TableId { get; private set; }
        public int RowCount => rows?.Length ?? 0;
        public int ColumnCount => fields?.Length ?? 0;
        public string DetailsText => detail.text;
        public UnityEngine.UI.ScrollRect TableScroll { get; }

        public SampleBrowser(Transform root)
        {
            Vertical(root, 10);
            heading = Text(root, "", 22, 30);
            guide = Text(root, "", 16, 48);
            var body = Panel(root, "TableAndValue", Surface);
            body.AddComponent<UnityEngine.UI.LayoutElement>().flexibleHeight = 1;
            Horizontal(body.transform, 12);
            body.GetComponent<UnityEngine.UI.HorizontalLayoutGroup>().childForceExpandWidth = false;
            TableScroll = CreateTableScroll(body.transform);
            content = TableScroll.content;
            var inspector = Panel(body.transform, "ValueDetails", Surface);
            var size = inspector.AddComponent<UnityEngine.UI.LayoutElement>();
            size.minWidth = size.preferredWidth = 340;
            size.flexibleWidth = 0;
            size.flexibleHeight = 1;
            Vertical(inspector.transform, 8, 12);
            wholeRecord = Button(inspector.transform, "選択したレコード全体を表示", () => SelectRecord(selectedRow), 38);
            var detailContent = Scroll(inspector.transform, "DetailsScroll", Surface, 0, 4);
            detail = Text(detailContent, "", 16, 30);
            detail.richText = false;
            // Let TMP's preferred height grow the content, including nested arrays and long strings.
            detail.GetComponent<UnityEngine.UI.LayoutElement>().preferredHeight = -1;
        }

        public void Show<T>(string id, string title, string description, IEnumerable<T> records, Func<T, string> referenceSummary = null)
        {
            TableId = id;
            rows = records.Cast<object>().ToArray();
            fields = ValueFields(typeof(T));
            relations = referenceSummary == null ? null : value => referenceSummary((T)value);
            heading.text = title + " / " + rows.Length + "行 × " + fields.Length + "列";
            guide.text = description;
            foreach (Transform child in content)
            {
                child.gameObject.SetActive(false);
                UnityEngine.Object.Destroy(child.gameObject);
            }
            cells.Clear();
            selectedCell = null;
            content.sizeDelta = new Vector2(fields.Length * CellWidth, (rows.Length + 1) * RowHeight);
            for (var column = 0; column < fields.Length; column++)
            {
                var label = Text(content, fields[column].Name, 15, RowHeight);
                Place(label.rectTransform, column, 0);
                label.textWrappingMode = TextWrappingModes.NoWrap;
                label.overflowMode = TextOverflowModes.Ellipsis;
                label.alignment = TextAlignmentOptions.MidlineLeft;
            }
            for (var row = 0; row < rows.Length; row++)
            {
                for (var column = 0; column < fields.Length; column++)
                {
                    var r = row;
                    var c = column;
                    var button = Button(content, Summary(fields[column].GetValue(rows[row])), () => SelectCell(r, c), RowHeight - 2);
                    button.name = "Cell-" + row + "-" + column;
                    Place(button.GetComponent<RectTransform>(), column, row + 1);
                    var label = button.GetComponentInChildren<TMP_Text>();
                    label.fontSize = 15;
                    label.richText = false;
                    label.textWrappingMode = TextWrappingModes.NoWrap;
                    label.overflowMode = TextOverflowModes.Ellipsis;
                    cells.Add(button);
                }
            }
            wholeRecord.interactable = rows.Length > 0;
            if (rows.Length > 0) SelectRecord(0);
            else detail.text = "このBuild Profileに含まれるレコードはありません。";
            Canvas.ForceUpdateCanvases();
            TableScroll.normalizedPosition = new Vector2(0, 1);
        }

        public UnityEngine.UI.Button CellButton(int row, int column) => cells[row * fields.Length + column];

        public void SelectCell(int row, int column)
        {
            selectedRow = row;
            if (selectedCell != null) selectedCell.GetComponent<UnityEngine.UI.Image>().color = Surface;
            selectedCell = CellButton(row, column);
            selectedCell.GetComponent<UnityEngine.UI.Image>().color = Selected;
            detail.text = "行 " + (row + 1) + " / " + fields[column].Name + "\n型：" + TypeName(fields[column].PropertyType)
                + "\n\n" + Tree(fields[column].GetValue(rows[row])) + RelationText(row);
            ResetDetailsScroll();
        }

        void SelectRecord(int row)
        {
            selectedRow = row;
            detail.text = "行 " + (row + 1) + " / レコード全体\n\n" + Tree(rows[row]) + RelationText(row);
            ResetDetailsScroll();
        }

        void ResetDetailsScroll()
        {
            Canvas.ForceUpdateCanvases();
            detail.GetComponentInParent<UnityEngine.UI.ScrollRect>().verticalNormalizedPosition = 1;
        }

        string RelationText(int row) => relations == null ? "" : "\n\n" + relations(rows[row]);

        static PropertyInfo[] ValueFields(Type type)
        {
            return type.GetProperties().Where(field => field.GetCustomAttribute<MessagePack.KeyAttribute>() != null)
                .OrderBy(field => field.GetCustomAttribute<MessagePack.KeyAttribute>().IntKey).ToArray();
        }

        static string TypeName(Type type)
        {
            var underlying = Nullable.GetUnderlyingType(type);
            if (underlying != null) return TypeName(underlying) + "?";
            if (type.IsGenericType && type.GetGenericTypeDefinition() == typeof(System.Collections.Immutable.ImmutableArray<>))
                return TypeName(type.GetGenericArguments()[0]) + "[]";
            return type.Name;
        }

        static string Summary(object value)
        {
            if (value == null) return "null";
            if (value is string text) return text.Replace("\n", "（改行）");
            if (value is IEnumerable sequence) return "配列（" + sequence.Cast<object>().Count() + "件）";
            var scalar = NominalValue(value.GetType());
            if (scalar != null) return Convert.ToString(scalar.GetValue(value), CultureInfo.InvariantCulture);
            if (ValueFields(value.GetType()).Length > 0) return value.GetType().Name + " {…}";
            return Convert.ToString(value, CultureInfo.InvariantCulture);
        }

        static PropertyInfo NominalValue(Type type)
        {
            var value = type.GetProperty("Value");
            return value != null && typeof(IComparable<>).MakeGenericType(type).IsAssignableFrom(type) ? value : null;
        }

        static string Tree(object value)
        {
            var result = new StringBuilder();
            AppendValue(result, value, 0);
            return result.ToString();
        }

        static void AppendValue(StringBuilder result, object value, int indent)
        {
            if (value == null) { result.Append("null"); return; }
            if (value is string text) { result.Append('"').Append(text).Append('"'); return; }
            var scalar = NominalValue(value.GetType());
            if (scalar != null)
            {
                result.Append(value.GetType().Name).Append('(');
                AppendValue(result, scalar.GetValue(value), indent);
                result.Append(')');
                return;
            }
            var padding = new string(' ', indent * 2);
            if (value is IEnumerable sequence)
            {
                var elements = sequence.Cast<object>().ToArray();
                if (elements.Length == 0) { result.Append("[]（空配列）"); return; }
                result.Append("配列（").Append(elements.Length).Append("件） [\n");
                for (var i = 0; i < elements.Length; i++)
                {
                    result.Append(padding).Append("  [").Append(i).Append("] ");
                    AppendValue(result, elements[i], indent + 1);
                    result.Append('\n');
                }
                result.Append(padding).Append(']');
                return;
            }
            var members = ValueFields(value.GetType());
            if (members.Length == 0)
            {
                result.Append(Summary(value));
                return;
            }
            result.Append(value.GetType().Name).Append(" {\n");
            foreach (var member in members)
            {
                result.Append(padding).Append("  ").Append(member.Name).Append(": ");
                AppendValue(result, member.GetValue(value), indent + 1);
                result.Append('\n');
            }
            result.Append(padding).Append('}');
        }

        static void Place(RectTransform rect, int column, int row)
        {
            rect.anchorMin = rect.anchorMax = new Vector2(0, 1);
            rect.pivot = new Vector2(0, 1);
            rect.anchoredPosition = new Vector2(column * CellWidth + 6, -row * RowHeight);
            rect.sizeDelta = new Vector2(CellWidth - 8, RowHeight - 2);
        }

        static UnityEngine.UI.ScrollRect CreateTableScroll(Transform parent)
        {
            var root = Panel(parent, "TableScroll", Surface);
            var size = root.AddComponent<UnityEngine.UI.LayoutElement>();
            size.flexibleWidth = size.flexibleHeight = 1;
            var viewport = Panel(root.transform, "Viewport", Surface);
            viewport.GetComponent<UnityEngine.UI.Image>().raycastTarget = true;
            Stretch(viewport.GetComponent<RectTransform>(), 0, 20, 0, 20);
            viewport.AddComponent<UnityEngine.UI.RectMask2D>();
            var content = new GameObject("Content", typeof(RectTransform));
            content.transform.SetParent(viewport.transform, false);
            var rect = content.GetComponent<RectTransform>();
            rect.anchorMin = rect.anchorMax = new Vector2(0, 1);
            rect.pivot = new Vector2(0, 1);
            var scroll = root.AddComponent<UnityEngine.UI.ScrollRect>();
            scroll.viewport = viewport.GetComponent<RectTransform>();
            scroll.content = rect;
            scroll.movementType = UnityEngine.UI.ScrollRect.MovementType.Clamped;
            scroll.inertia = false;
            scroll.horizontalScrollbar = Scrollbar(root.transform, false);
            scroll.verticalScrollbar = Scrollbar(root.transform, true);
            return scroll;
        }

        static UnityEngine.UI.Scrollbar Scrollbar(Transform parent, bool vertical)
        {
            var track = Panel(parent, vertical ? "VerticalScrollbar" : "HorizontalScrollbar", new Color32(18, 24, 36, 255));
            var rect = track.GetComponent<RectTransform>();
            rect.anchorMin = vertical ? new Vector2(1, 0) : Vector2.zero;
            rect.anchorMax = vertical ? Vector2.one : new Vector2(1, 0);
            rect.offsetMin = vertical ? new Vector2(-16, 20) : new Vector2(0, 0);
            rect.offsetMax = vertical ? Vector2.zero : new Vector2(-20, 16);
            var slide = Panel(track.transform, "SlidingArea", Color.clear);
            Stretch(slide.GetComponent<RectTransform>(), 2, 2, 2, 2);
            var handle = Panel(slide.transform, "Handle", new Color32(90, 210, 174, 255));
            handle.GetComponent<RectTransform>().sizeDelta = Vector2.zero;
            handle.GetComponent<UnityEngine.UI.Image>().raycastTarget = true;
            var bar = track.AddComponent<UnityEngine.UI.Scrollbar>();
            bar.handleRect = handle.GetComponent<RectTransform>();
            bar.targetGraphic = handle.GetComponent<UnityEngine.UI.Image>();
            bar.direction = vertical ? UnityEngine.UI.Scrollbar.Direction.BottomToTop : UnityEngine.UI.Scrollbar.Direction.LeftToRight;
            return bar;
        }
    }
}
