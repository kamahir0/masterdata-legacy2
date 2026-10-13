using System.Collections;
using System.Collections.Generic;
using System.Linq;
using MasterData.UnityRuntime;
using Masterdata.Generated;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;
using TMPro;

namespace UnityInventory.Tests
{
    public sealed class InventoryTests
    {
        [UnityTest]
        public IEnumerator StreamingAssetsLoadsTypedValuesAndReferences()
        {
            LoadResult<MemoryDatabase> loaded = null;
            yield return StreamingAssetsDatabase.Load("masterdata.bytes", InventoryDemo.CreateDatabase, result => loaded = result);
            Assert.That(loaded, Is.Not.Null);
            Assert.That(loaded.Succeeded, Is.True, loaded.Error?.Message);
            var item = loaded.Database.ItemTable.FindById(2001);
            Assert.That(item.Name, Is.EqualTo("氷晶の剣"));
            Assert.That(item.Rarity, Is.EqualTo(Rarity.Rare));
            Assert.That(item.Tags, Is.EqualTo(ItemTags.Weapon | ItemTags.Crafting));
            Assert.That(item.Stats.Attack, Is.EqualTo(34));
            Assert.That(item.Ingredients.Length, Is.EqualTo(2));
            Assert.That(item.Ingredients[0], Is.EqualTo("氷の結晶"));
            Assert.That(loaded.Database.ItemTable.FindById(1001).Note, Is.Null);
            Assert.That(loaded.Database.ItemTable.FindByCode(new ItemCode("healing-potion")).Id, Is.EqualTo(1003));
            var quest = loaded.Database.QuestTable.FindById(3);
            Assert.That(quest.GetRewardItem(loaded.Database).Id, Is.EqualTo(3001));
            Assert.That(quest.RewardAmount, Is.EqualTo(1));
        }

        [UnityTest]
        public IEnumerator AllScalarCategoriesModifiersAndNestedArraysRoundTrip()
        {
            MemoryDatabase db = null;
            yield return LoadDatabase(value => db = value);
            var first = db.ModelCaseTable.FindById(1);
            var empty = db.ModelCaseTable.FindById(2);
            var boundary = db.ModelCaseTable.FindById(3);
            Assert.That(first.BoolValue, Is.True);
            Assert.That(first.IntValue, Is.EqualTo(42));
            Assert.That(first.UintValue, Is.EqualTo(42U));
            Assert.That(first.LongValue, Is.EqualTo(4200000000L));
            Assert.That(first.UlongValue, Is.EqualTo(4200000000UL));
            Assert.That(first.FloatValue, Is.EqualTo(1.25F));
            Assert.That(first.DoubleValue, Is.EqualTo(0.125D));
            Assert.That(first.StringValue, Is.EqualTo("日本語の文字列"));
            Assert.That(boundary.UintValue, Is.EqualTo(uint.MaxValue));
            Assert.That(boundary.UlongValue, Is.EqualTo(ulong.MaxValue));
            Assert.That(boundary.SessionStateValue, Is.EqualTo(SessionState.Boundary));
            Assert.That(boundary.WorldPhaseValue, Is.EqualTo(WorldPhase.Boundary));
            Assert.That(boundary.CharacterFlagsValue, Is.EqualTo(CharacterFlags.Active | CharacterFlags.HighBit));
            Assert.That(boundary.WorldFlagsValue, Is.EqualTo(WorldFlags.Active | WorldFlags.HighBit));
            Assert.That(boundary.SessionFlagsValue, Is.EqualTo(SessionFlags.Active | SessionFlags.HighBit));
            PlayerId player = 7;
            uint text = first.TextIdValue;
            WorldId world = 9L;
            long worldScalar = world;
            Assert.That(player.Value, Is.EqualTo(7));
            Assert.That(text, Is.EqualTo(1U));
            Assert.That(worldScalar, Is.EqualTo(9L));
            Assert.That(first.SessionIdValue.Value, Is.EqualTo(1UL));
            Assert.That(empty.PlayerIdOptional, Is.Null);
            Assert.That(empty.RarityOptional, Is.Null);
            Assert.That(empty.ItemTagsOptional, Is.Null);
            Assert.That(empty.CombatStatsOptional, Is.Null);
            Assert.That(empty.RewardBundleOptional, Is.Null);
            Assert.That(empty.IntValues.Length, Is.Zero);
            Assert.That(empty.ItemCodeValues.Length, Is.Zero);
            Assert.That(empty.RewardBundleValues.Length, Is.Zero);
            foreach (var property in typeof(ModelCase).GetProperties())
            {
                if (property.Name.EndsWith("Optional")) Assert.That(property.GetValue(empty), Is.Null, property.Name);
                if (property.Name.EndsWith("Values")) Assert.That(((IEnumerable)property.GetValue(empty)).Cast<object>(), Is.Empty, property.Name);
            }
            Assert.That(first.RewardBundleValues.Length, Is.EqualTo(2));
            var entry = first.RewardBundleValue.Entries[0];
            Assert.That(entry.ItemCode.Value, Is.EqualTo("frost-blade"));
            Assert.That(entry.Effects.Length, Is.EqualTo(2));
            Assert.That(entry.Effects[0].Coefficients.ToArray(), Is.EqualTo(new[] { 0.5F, 1.25F, 2F }));
            Assert.That(entry.Effects[0].Labels[0], Is.EqualTo("攻撃補正"));
            Assert.That(entry.Effects[0].Range.Meters, Is.EqualTo(2.5F));
            Assert.That(entry.Effects[1].Stats, Is.Null);
            Assert.That(entry.Effects[1].Coefficients.Length, Is.Zero);
            Assert.That(first.RewardBundleValue.Checkpoints[2].Value, Is.EqualTo(300L));
        }

        [UnityTest]
        public IEnumerator CompositeOptionalAndNonuniqueReferencesResolveThroughGeneratedHelpers()
        {
            MemoryDatabase db = null;
            yield return LoadDatabase(value => db = value);
            var first = db.ReferenceCaseTable.FindById(1);
            var absent = db.ReferenceCaseTable.FindById(2);
            Assert.That(first.ResolveTitle(db).Text, Is.EqualTo("銅の剣"));
            Assert.That(first.GetOptionalTitle(db).Text, Is.EqualTo("Bronze Sword"));
            Assert.That(first.GetRarityItems(db).Count, Is.EqualTo(3));
            Assert.That(first.GetOptionalRarityItems(db).Count, Is.EqualTo(3));
            Assert.That(first.GetItem(db).Id, Is.EqualTo(1001));
            Assert.That(first.GetOptionalItem(db).Id, Is.EqualTo(1003));
            Assert.That(absent.GetOptionalTitle(db), Is.Null);
            Assert.That(absent.GetOptionalItem(db), Is.Null);
            Assert.That(absent.GetOptionalRarityItems(db).Count, Is.Zero);
            Assert.That(db.LocalizedTextTable.FindByLanguageAndTextId((Language.English, new TextId(3))).Text, Is.EqualTo("Dawnbringer"));
            Assert.That(db.PlayerTable.FindById(new PlayerId(1)).GetFavoriteItem(db).Id, Is.EqualTo(1001));
            Assert.That(db.PlayerTable.FindById(new PlayerId(2)).GetFavoriteItem(db), Is.Null);
            Assert.That(db.PlayerTable.FindByRarityAndLevel((Rarity.Common, 1)).Count, Is.EqualTo(3));
        }

        [UnityTest]
        public IEnumerator TableCellsRemainClickableAfterVerticalAndHorizontalScrolling()
        {
            InventoryDemo demo = null;
            yield return OpenDemo(value => demo = value);
            demo.ShowSample("player");
            yield return null;
            var browser = demo.Browser;
            Assert.That(browser.RowCount, Is.EqualTo(128));
            Assert.That(browser.TableScroll.viewport.rect.height, Is.GreaterThan(100));
            Assert.That(browser.TableScroll.viewport.rect.width, Is.GreaterThan(100));
            Assert.That(browser.CellButton(127, 0).GetComponentInChildren<TMP_Text>().text, Is.EqualTo("128"));
            AssertScrollbarsInsideTracks(browser.TableScroll);
            Assert.That(browser.TableScroll.content.rect.height, Is.GreaterThan(browser.TableScroll.viewport.rect.height));
            var last = browser.CellButton(127, 1);
            var originalY = last.transform.position.y;
            browser.TableScroll.verticalNormalizedPosition = 0;
            Canvas.ForceUpdateCanvases();
            yield return null;
            Assert.That(last.transform.position.y, Is.GreaterThan(originalY));
            PressVisibleCell(last);
            Assert.That(browser.DetailsText, Does.Contain("冒険者128"));
            demo.ShowSample("model-case");
            yield return null;
            Assert.That(browser.ColumnCount, Is.EqualTo(70));
            Assert.That(browser.TableScroll.content.rect.width, Is.GreaterThan(browser.TableScroll.viewport.rect.width));
            last = browser.CellButton(0, 69);
            var originalX = last.transform.position.x;
            browser.TableScroll.horizontalNormalizedPosition = 1;
            Canvas.ForceUpdateCanvases();
            yield return null;
            Assert.That(last.transform.position.x, Is.LessThan(originalX));
            PressVisibleCell(last);
            Assert.That(browser.DetailsText, Does.Contain("RewardBundleValues"));
            Assert.That(browser.DetailsText, Does.Contain("攻撃補正"));
            Assert.That(browser.DetailsText, Does.Contain("Coefficients"));
            Assert.That(browser.DetailsText, Does.Contain("ItemCode(\"frost-blade\")"));
            AssertScrollbarsInsideTracks(browser.TableScroll);
            demo.ShowSample("reference-case");
            browser.SelectCell(1, 1);
            Assert.That(browser.DetailsText, Does.Contain("なし（null）"));
            Assert.That(browser.DetailsText, Does.Contain("0件"));
            var previous = demo.Database;
            yield return demo.Reload();
            Assert.That(demo.Database, Is.Not.SameAs(previous));
            Assert.That(browser.TableId, Is.EqualTo("reference-case"));
            Assert.That(browser.RowCount, Is.EqualTo(3));
        }

        [UnityTest]
        public IEnumerator BundledJapaneseFontCoversTheVisibleSampleText()
        {
            InventoryDemo demo = null;
            yield return OpenDemo(value => demo = value);
            var japanese = TMP_Settings.fallbackFontAssets.Single(font => font.name == "NotoSansJP SDF");
            Assert.That(japanese.sourceFontFile, Is.Not.Null, "日本語フォントを同梱し、OSフォントへ依存しない。");
            Assert.That(japanese.atlasPopulationMode, Is.EqualTo(AtlasPopulationMode.Dynamic));
            foreach (var tab in new[] { "inventory", "player", "model-case", "reference-case", "localized-text", "announcement" })
            {
                demo.ShowSample(tab);
                yield return null;
                foreach (var label in demo.GetComponentsInChildren<TMP_Text>())
                {
                    var text = new string(label.text.Where(character => !char.IsControl(character)).Distinct().ToArray());
                    Assert.That(japanese.HasCharacters(text, out uint[] missing, false, true), Is.True,
                        label.name + ": " + (missing == null ? "" : string.Join(",", missing)));
                }
            }
        }

        static IEnumerator LoadDatabase(System.Action<MemoryDatabase> accept)
        {
            LoadResult<MemoryDatabase> loaded = null;
            yield return StreamingAssetsDatabase.Load("masterdata.bytes", InventoryDemo.CreateDatabase, result => loaded = result);
            Assert.That(loaded, Is.Not.Null);
            Assert.That(loaded.Succeeded, Is.True, loaded.Error?.Message);
            accept(loaded.Database);
        }

        static IEnumerator OpenDemo(System.Action<InventoryDemo> accept)
        {
            yield return SceneManager.LoadSceneAsync("Inventory", LoadSceneMode.Single);
            var demo = Object.FindFirstObjectByType<InventoryDemo>();
            var deadline = Time.realtimeSinceStartup + 15;
            while (demo.Database == null)
            {
                Assert.That(Time.realtimeSinceStartup, Is.LessThan(deadline), demo.Status);
                yield return null;
            }
            accept(demo);
        }

        static void PressVisibleCell(UnityEngine.UI.Button button)
        {
            var rect = button.GetComponent<RectTransform>();
            var events = UnityEngine.EventSystems.EventSystem.current;
            var pointer = new UnityEngine.EventSystems.PointerEventData(events)
            {
                position = RectTransformUtility.WorldToScreenPoint(null, rect.TransformPoint(rect.rect.center))
            };
            var hits = new List<UnityEngine.EventSystems.RaycastResult>();
            events.RaycastAll(pointer, hits);
            Assert.That(hits, Is.Not.Empty, "スクロールしたセルが画面内でhitできる。");
            Assert.That(hits[0].gameObject.GetComponentInParent<UnityEngine.UI.Button>(), Is.SameAs(button));
            UnityEngine.EventSystems.ExecuteEvents.ExecuteHierarchy(hits[0].gameObject, pointer,
                UnityEngine.EventSystems.ExecuteEvents.pointerClickHandler);
        }

        static void AssertScrollbarsInsideTracks(UnityEngine.UI.ScrollRect scroll)
        {
            foreach (var bar in new[] { scroll.horizontalScrollbar, scroll.verticalScrollbar })
            {
                var track = bar.GetComponent<RectTransform>();
                var corners = new Vector3[4];
                bar.handleRect.GetWorldCorners(corners);
                foreach (var corner in corners)
                    Assert.That(track.rect.Contains(track.InverseTransformPoint(corner)), Is.True,
                        "スクロールバーのつまみが表や説明に重ならない。");
            }
        }

        [UnityTest]
        public IEnumerator SceneSupportsFilteringReferenceNavigationAndExplicitReload()
        {
            yield return SceneManager.LoadSceneAsync("Inventory", LoadSceneMode.Single);
            var demo = Object.FindFirstObjectByType<InventoryDemo>();
            Assert.That(demo, Is.Not.Null);
            var deadline = Time.realtimeSinceStartup + 15;
            while (demo.Database == null)
            {
                Assert.That(Time.realtimeSinceStartup, Is.LessThan(deadline), demo.Status);
                yield return null;
            }
            Assert.That(demo.VisibleItemCount, Is.EqualTo(6));
            demo.Filter(Rarity.Rare);
            Assert.That(demo.VisibleItemCount, Is.EqualTo(2));
            demo.SelectItem(2001);
            Assert.That(demo.SelectedItemId, Is.EqualTo(2001));
            demo.SelectQuest(3);
            Assert.That(demo.SelectedItemId, Is.EqualTo(3001));
            Assert.That(demo.VisibleItemCount, Is.EqualTo(6), "Reference navigation must show its destination even across filters.");
            var previous = demo.Database;
            yield return demo.Reload();
            Assert.That(demo.Database, Is.Not.SameAs(previous));
            Assert.That(demo.SelectedItemId, Is.EqualTo(3001));
            Assert.That(demo.VisibleItemCount, Is.EqualTo(6));
            Assert.That(Object.FindObjectsByType<UnityEngine.EventSystems.EventSystem>(FindObjectsSortMode.None).Length, Is.EqualTo(1));
        }
    }
}
