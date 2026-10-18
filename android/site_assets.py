"""Stage the offline site and derive its exact WebView resource allowlist."""
from pathlib import Path
import shutil
import sys

ROOT = Path(__file__).resolve().parent.parent

def stage_site(destination):
    destination = Path(destination)
    destination.mkdir(parents=True, exist_ok=True)
    for pattern in ("*.html", "*.css", "*.js"):
        for source in sorted(ROOT.glob(pattern)):
            shutil.copy2(source, destination / source.name)
    shutil.copytree(ROOT / "data", destination / "data")
    shutil.copy2(ROOT / "android/android-adapter.js", destination / "android-adapter.js")
    index = (destination / "index.html").read_text()
    index = index.replace('<script src="./startup.js"',
        '<script src="./android-adapter.js"></script>\n  <script src="./startup.js"', 1)
    (destination / "index.html").write_text(index)
    names = sorted(p.relative_to(destination).as_posix() for p in destination.rglob("*") if p.is_file())
    (destination.parent / "site-assets.txt").write_text("\n".join(names) + "\n")
    return names

if __name__ == "__main__":
    print("Indexed", len(stage_site(Path(sys.argv[1]))), "offline resources")
