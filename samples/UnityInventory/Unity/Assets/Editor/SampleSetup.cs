using System.IO;
using TMPro;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

namespace UnityInventory.Editor
{
    public static class SampleSetup
    {
        public const string Scene = "Assets/Scenes/Inventory.unity";

        public static void Create()
        {
            TMP_PackageResourceImporter.ImportResources(true, false, false);
            // Package import completes on later Editor ticks; an immediate quit leaves fonts missing.
            deadline = EditorApplication.timeSinceStartup + 120;
            EditorApplication.update += Complete;
        }

        static double deadline;

        static void Complete()
        {
            if (!File.Exists("Assets/TextMesh Pro/Resources/TMP Settings.asset"))
            {
                if (EditorApplication.timeSinceStartup < deadline) return;
                EditorApplication.update -= Complete;
                Debug.LogError("TMP resource import timed out.");
                EditorApplication.Exit(1);
                return;
            }
            if (EditorApplication.isCompiling || EditorApplication.isUpdating) return;
            EditorApplication.update -= Complete;
            PlayerSettings.companyName = "MasterData";
            PlayerSettings.productName = "MasterData Inventory Sample";
            PlayerSettings.defaultScreenWidth = 1200;
            PlayerSettings.defaultScreenHeight = 800;
            PlayerSettings.fullScreenMode = FullScreenMode.Windowed;
            PlayerSettings.SetApplicationIdentifier(UnityEditor.Build.NamedBuildTarget.Standalone,
                "com.kamahir0.masterdata.sample.inventory");
            PlayerSettings.runInBackground = true;
            if (!AssetDatabase.IsValidFolder("Assets/Scenes")) AssetDatabase.CreateFolder("Assets", "Scenes");
            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            var camera = new GameObject("Main Camera", typeof(Camera));
            camera.tag = "MainCamera";
            camera.GetComponent<Camera>().clearFlags = CameraClearFlags.SolidColor;
            camera.GetComponent<Camera>().backgroundColor = new Color32(18, 24, 36, 255);
            new GameObject("Inventory Demo", typeof(InventoryDemo));
            EditorSceneManager.SaveScene(scene, Scene);
            EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene(Scene, true) };
            AssetDatabase.DeleteAsset("Assets/Scenes/SampleScene.unity");
            AssetDatabase.DeleteAsset("Assets/Editor/InstallSamplePackages.cs");
            AssetDatabase.SaveAssets();
            Debug.Log("Sample scene and resources saved.");
            EditorApplication.Exit(0);
        }

        [MenuItem("Samples/MasterData Inventory/Open Demo")]
        public static void Open()
        {
            if (EditorSceneManager.SaveCurrentModifiedScenesIfUserWantsTo())
                EditorSceneManager.OpenScene(Scene);
        }
    }
}
