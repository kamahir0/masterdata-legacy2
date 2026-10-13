#!/usr/bin/env python3
"""Restore the sample's pinned Unity dependencies, then Build and Publish."""
import os
from pathlib import Path
import subprocess

sample = Path(__file__).resolve().parent
repository = sample.parents[1]
tools = sample / ".tools"
nuget = tools / ("nugetforunity.exe" if os.name == "nt" else "nugetforunity")
if not nuget.exists():
    subprocess.run([
        "dotnet", "tool", "install", "NuGetForUnity.Cli", "--version", "4.5.0",
        "--framework", "net8.0", "--tool-path", str(tools),
    ], check=True, timeout=180)
subprocess.run([str(nuget), "restore", str(sample / "Unity")], check=True, timeout=180)
subprocess.run([
    "cargo", "run", "--locked", "-p", "masterdata-command", "--", "build",
    "--project", str(sample / "MasterData"), "--publish",
], cwd=repository, check=True, timeout=360)
print("準備完了: Unity/ を開き、Assets/Scenes/Inventory.unity で Play してください。")
