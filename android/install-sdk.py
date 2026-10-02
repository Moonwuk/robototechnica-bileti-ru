#!/usr/bin/env python3
"""Install the two pinned official SDK packages required by this project."""
from pathlib import Path
import argparse
import hashlib
import os
import tempfile
import urllib.request
import zipfile

PACKAGES = [
    ("platform-36_r02.zip", "2c1a80dd4d9f7d0e6dd336ec603d9b5c55a6f576", "platforms", "android-36"),
    ("build-tools_r35_linux.zip", "2cfaa0bbb2336e9ec18ed3ecea84fa2e2af607bc", "build-tools", "35.0.0"),
]

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--sdk-dir", required=True)
    args = parser.parse_args()
    root = Path(args.sdk_dir).resolve()
    root.mkdir(parents=True, exist_ok=True)
    for name, expected, folder, installed_name in PACKAGES:
        destination = root / folder
        destination.mkdir(exist_ok=True)
        target = destination / installed_name
        if target.exists():
            continue
        with tempfile.TemporaryDirectory(prefix="sdk-download-", dir=root) as temporary:
            archive = Path(temporary) / name
            print("Downloading official Android SDK:", name, flush=True)
            urllib.request.urlretrieve("https://dl.google.com/android/repository/" + name, archive)
            checksum = hashlib.sha1()
            with archive.open("rb") as stream:
                while block := stream.read(1024 * 1024):
                    checksum.update(block)
            if checksum.hexdigest() != expected:
                raise SystemExit("Official SDK archive checksum mismatch: " + name)
            with zipfile.ZipFile(archive) as sdk:
                top = sdk.namelist()[0].split("/")[0]
                sdk.extractall(destination)
                for entry in sdk.infolist():
                    file = destination / entry.filename
                    mode = entry.external_attr >> 16
                    if file.is_file() and mode:
                        file.chmod(mode)
            extracted = destination / top
            if extracted != target:
                extracted.rename(target)
        print("Installed:", target, flush=True)
    for name in ["aapt2", "d8", "zipalign", "apksigner"]:
        tool = root / "build-tools/35.0.0" / name
        tool.chmod(tool.stat().st_mode | 0o100)
    if os.environ.get("GITHUB_ENV"):
        with open(os.environ["GITHUB_ENV"], "a") as environment:
            environment.write("ANDROID_SDK_ROOT=" + str(root) + "\n")
    print("Android SDK ready:", root)

if __name__ == "__main__":
    main()
