"""Starts the Cockpit Editor on Windows, Linux or macOS: installs numpy and Pillow into .venv here when they are missing,
then runs server.py and opens the browser. If the editor already runs, it only opens the page."""
import os, socket, subprocess, sys, webbrowser

HERE = os.path.dirname(os.path.abspath(__file__))
URL = "http://127.0.0.1:8729"
VENV = os.path.join(HERE, ".venv")
VPY = os.path.join(VENV, "Scripts", "python.exe") if os.name == "nt" else os.path.join(VENV, "bin", "python")


def already_running():
    try:
        socket.create_connection(("127.0.0.1", 8729), timeout=0.5).close()
        return True
    except OSError:
        return False


def has_deps(py):
    return subprocess.run([py, "-c", "import numpy, PIL"], capture_output=True).returncode == 0


def make_venv():
    print("First start: installing numpy and Pillow into", VENV, "(one minute)...")
    if subprocess.run([sys.executable, "-m", "venv", VENV]).returncode != 0 or not os.path.exists(VPY):
        return False
    return subprocess.run([VPY, "-m", "pip", "install", "--disable-pip-version-check", "-q", "-r",
                           os.path.join(HERE, "requirements.txt")]).returncode == 0


def main():
    if sys.version_info < (3, 8):
        sys.exit("The Cockpit Editor needs Python 3.8 or newer.")
    if already_running():
        print("The editor is already running:", URL)
        webbrowser.open(URL)
        return 0
    py = sys.executable if has_deps(sys.executable) else VPY if os.path.exists(VPY) and has_deps(VPY) else None
    if not py:
        if not make_venv():
            print("\nCould not install numpy and Pillow automatically. Install them, then start the editor again:")
            if sys.platform.startswith("linux"):
                print("  Ubuntu / Debian / Mint:  sudo apt install python3-numpy python3-pil   (or python3-venv)")
                print("  Fedora:                  sudo dnf install python3-numpy python3-pillow")
                print("  Arch:                    sudo pacman -S python-numpy python-pillow")
            else:
                print(f"  {os.path.basename(sys.executable)} -m pip install numpy pillow")
            return 1
        py = VPY
    return subprocess.call([py, os.path.join(HERE, "server.py")] + sys.argv[1:])


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        sys.exit(0)
