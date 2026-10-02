#!/usr/bin/env python3
"""Build the offline Android app using only JDK and official SDK build tools."""
from pathlib import Path
import argparse
import hashlib
import json
import os
import shutil
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parent.parent
ANDROID = ROOT / "android"
VERSION = json.loads((ANDROID / "version.json").read_text())

def run(*args):
    subprocess.run([str(arg) for arg in args], check=True, cwd=ROOT)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--unsigned", action="store_true", help="Skip signing; suitable for CI.")
    args = parser.parse_args()
    sdk = os.environ.get("ANDROID_SDK_ROOT") or os.environ.get("ANDROID_HOME")
    if not sdk:
        raise SystemExit("Set ANDROID_SDK_ROOT to an installed Android SDK.")
    tools = Path(sdk) / "build-tools" / VERSION["buildTools"]
    platform = Path(sdk) / "platforms" / ("android-" + str(VERSION["compileSdk"])) / "android.jar"
    java_home = os.environ.get("JAVA_HOME")
    javac = Path(java_home) / "bin/javac" if java_home else shutil.which("javac")
    if not javac or not Path(javac).is_file():
        raise SystemExit("Install JDK 17 (a JRE alone does not include javac).")
    if not platform.is_file() or not (tools / "aapt2").is_file():
        raise SystemExit("Install SDK platform android-36 and build-tools 35.0.0.")
    work = ANDROID / "build"
    output = Path(os.environ.get("ROBOTICS_OUTPUT_DIR", str(work / "outputs"))).resolve()
    if work.exists():
        shutil.rmtree(work)
    for directory in [work, output, work / "assets/site", work / "classes", work / "dex", work / "gen"]:
        directory.mkdir(parents=True, exist_ok=True)
    assets = work / "assets/site"
    for name in ["index.html", "privacy.html", "style.css", "app.js", "core.js", "data"]:
        source = ROOT / name
        if source.is_dir():
            shutil.copytree(source, assets / name)
        else:
            shutil.copy2(source, assets / name)
    shutil.copy2(ANDROID / "android-adapter.js", assets / "android-adapter.js")
    index = (assets / "index.html").read_text()
    index = index.replace('<script type="module"', '<script src="./android-adapter.js"></script>\n  <script type="module"', 1)
    (assets / "index.html").write_text(index)
    run(tools / "aapt2", "compile", "--dir", ANDROID / "res", "-o", work / "resources.zip")
    unsigned = output / ("robotics-tickets-" + VERSION["versionName"] + "-unsigned.apk")
    run(tools / "aapt2", "link", "-I", platform, "--manifest", ANDROID / "AndroidManifest.xml",
        "--java", work / "gen", "--min-sdk-version", VERSION["minSdk"],
        "--target-sdk-version", VERSION["targetSdk"], "--version-code", VERSION["versionCode"],
        "--version-name", VERSION["versionName"], "-A", work / "assets",
        "-o", work / "resources.apk", work / "resources.zip")
    sources = sorted((ANDROID / "src").rglob("*.java")) + sorted((work / "gen").rglob("*.java"))
    run(javac, "--release", "8", "-encoding", "UTF-8", "-classpath", platform,
        "-d", work / "classes", *sources)
    run(tools / "d8", "--release", "--min-api", VERSION["minSdk"], "--lib", platform,
        "--output", work / "dex", *sorted((work / "classes").rglob("*.class")))
    unaligned = work / "unaligned.apk"
    shutil.copy2(work / "resources.apk", unaligned)
    with zipfile.ZipFile(unaligned, "a", compression=zipfile.ZIP_DEFLATED) as archive:
        for dex in sorted((work / "dex").glob("*.dex")):
            archive.write(dex, dex.name)
    run(tools / "zipalign", "-f", "-P", "16", "4", unaligned, unsigned)
    run(tools / "zipalign", "-c", "-P", "16", "4", unsigned)
    if args.unsigned:
        print("Unsigned APK (sign before installing):", unsigned)
        return
    key = os.environ.get("ROBOTICS_KEYSTORE")
    password = os.environ.get("ROBOTICS_PASSWORD_FILE")
    alias = os.environ.get("ROBOTICS_KEY_ALIAS", "robotics-release")
    if not key or not password or not Path(key).is_file() or not Path(password).is_file():
        raise SystemExit("Unsigned APK built. Set ROBOTICS_KEYSTORE and ROBOTICS_PASSWORD_FILE to sign a release.")
    signed = output / ("robotics-tickets-" + VERSION["versionName"] + ".apk")
    run(tools / "apksigner", "sign", "--ks", key, "--ks-key-alias", alias,
        "--ks-pass", "file:" + password,
        "--v1-signing-enabled", "true", "--v2-signing-enabled", "true",
        "--v3-signing-enabled", "true", "--out", signed, unsigned)
    run(tools / "apksigner", "verify", "--verbose", "--print-certs", signed)
    run(tools / "zipalign", "-c", "-P", "16", "4", signed)
    checksum = hashlib.sha256(signed.read_bytes()).hexdigest()
    signed.with_suffix(".apk.sha256").write_text(checksum + "  " + signed.name + "\n")
    print("Release APK:", signed)

if __name__ == "__main__":
    main()
