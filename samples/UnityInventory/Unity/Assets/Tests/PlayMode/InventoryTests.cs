using System.Collections;
using MasterData.UnityRuntime;
using Masterdata.Generated;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;

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
            Assert.That(item.Name, Is.EqualTo("Frost Blade"));
            Assert.That(item.Rarity, Is.EqualTo(Rarity.Rare));
            Assert.That(item.Tags, Is.EqualTo(ItemTags.Weapon | ItemTags.Crafting));
            Assert.That(item.Stats.Attack, Is.EqualTo(34));
            Assert.That(item.Ingredients.Length, Is.EqualTo(2));
            Assert.That(item.Ingredients[0], Is.EqualTo("Frost Crystal"));
            Assert.That(loaded.Database.ItemTable.FindById(1001).Note, Is.Null);
            Assert.That(loaded.Database.ItemTable.FindByCode(new ItemCode("healing-potion")).Id, Is.EqualTo(1003));
            var quest = loaded.Database.QuestTable.FindById(3);
            Assert.That(quest.GetRewardItem(loaded.Database).Id, Is.EqualTo(3001));
            Assert.That(quest.RewardAmount, Is.EqualTo(1));
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
