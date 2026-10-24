"""Builds the release downloads: one per OS, each a CockpitEditor/ folder with that OS's launcher and INSTALL.md.

    python3 tools/package_release.py        -> dist/CockpitEditor-<version>-windows.zip, -macos.zip, -linux.tar.gz
                                               and dist/release-notes.md (the CHANGELOG section for <version>)

Only files tracked by git go in (no local saves, .venv or jets.local.json)."""
import io, os, re, subprocess, sys, tarfile, zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VERSION = re.search(r'VERSION = "([^"]+)"', open(os.path.join(ROOT, "server.py"), encoding="utf8").read()).group(1)
DIST = os.path.join(ROOT, "dist")
LAUNCHERS = {"windows": "Cockpit Editor.bat", "macos": "Cockpit Editor.command", "linux": "Cockpit Editor.sh"}
LEAVE_OUT = ("install/", "tools/", ".gitignore", ".gitattributes", "jets.local.example.json")


def tracked():
    out = subprocess.run(["git", "ls-files", "-z"], cwd=ROOT, capture_output=True, check=True).stdout.decode("utf8")
    return sorted(f for f in out.split("\0") if f)


def contents(system):
    files = [f for f in tracked() if not f.startswith(LEAVE_OUT) and (f not in LAUNCHERS.values() or f == LAUNCHERS[system])]
    return [(f, f) for f in files] + [(f"install/{system}/INSTALL.md", "INSTALL.md")]


def main():
    os.makedirs(DIST, exist_ok=True)
    for system in LAUNCHERS:
        items = contents(system)
        if system == "linux":
            path = os.path.join(DIST, f"CockpitEditor-{VERSION}-linux.tar.gz")
            with tarfile.open(path, "w:gz") as tar:
                for src, name in items:
                    data = open(os.path.join(ROOT, src), "rb").read()
                    info = tarfile.TarInfo(f"CockpitEditor/{name}")
                    info.size, info.mode, info.mtime = len(data), 0o755 if name.endswith(".sh") else 0o644, 1767225600
                    tar.addfile(info, io.BytesIO(data))
        else:
            path = os.path.join(DIST, f"CockpitEditor-{VERSION}-{system}.zip")
            with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
                for src, name in items:
                    info = zipfile.ZipInfo(f"CockpitEditor/{name}", date_time=(2026, 1, 1, 0, 0, 0))
                    info.compress_type = zipfile.ZIP_DEFLATED
                    info.create_system = 3   # unix permissions, so macOS keeps the launcher runnable
                    info.external_attr = (0o100755 if name.endswith((".command", ".sh")) else 0o100644) << 16
                    z.writestr(info, open(os.path.join(ROOT, src), "rb").read())
        print(f"{path}  {os.path.getsize(path) // 1024} KB, {len(items)} files")
    log = open(os.path.join(ROOT, "CHANGELOG.md"), encoding="utf8").read()
    m = re.search(rf"^## {re.escape(VERSION)}\n(.*?)(?=^## |\Z)", log, re.S | re.M)
    if not m:
        sys.exit(f"CHANGELOG.md has no '## {VERSION}' section")
    open(os.path.join(DIST, "release-notes.md"), "w", encoding="utf8").write(m.group(1).strip() + "\n")
    print(os.path.join(DIST, "release-notes.md"))


if __name__ == "__main__":
    main()
