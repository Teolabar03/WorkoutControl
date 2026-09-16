"""Installazione guidata: eseguire con Python 3.11 o successivo."""
import argparse
import getpass
import os
from pathlib import Path
import shutil
import sqlite3
import subprocess
import sys
import venv

ROOT = Path(__file__).resolve().parent


def run(command, **kwargs):
    subprocess.run(command, check=True, cwd=ROOT, **kwargs)


def configure():
    from dotenv import dotenv_values, set_key

    env_path = ROOT / ".env"
    if not env_path.exists():
        shutil.copyfile(ROOT / ".env.example", env_path)
        env_path.chmod(0o600)
    values = {**dotenv_values(env_path), **os.environ}
    db_path = Path(values.get("WORKOUT_DB_PATH") or ROOT / "instance/workout.db")
    if not db_path.is_absolute():
        db_path = ROOT / "instance" / db_path
    has_users = False
    if db_path.is_file():
        with sqlite3.connect(db_path.as_uri() + "?mode=ro", uri=True) as connection:
            if connection.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='utente'").fetchone():
                has_users = bool(connection.execute("SELECT 1 FROM utente LIMIT 1").fetchone())
    if has_users:
        print("Utenze già presenti: account e password conservati.")
        return
    password = values.get("WORKOUT_PASSWORD", "")
    if not password:
        if "--non-interactive" in sys.argv:
            raise ValueError("Prima installazione: imposta WORKOUT_PASSWORD nell'ambiente o in .env.")
        username = input("Nome del primo amministratore [admin]: ").strip() or "admin"
        if len(username) > 80:
            raise ValueError("Nome utente troppo lungo (massimo 80 caratteri).")
        password = getpass.getpass("Password (almeno 8 caratteri): ")
        if password != getpass.getpass("Ripeti la password: "):
            raise ValueError("Le password non corrispondono.")
        if len(password) < 8:
            raise ValueError("La password deve avere almeno 8 caratteri.")
        set_key(str(env_path), "WORKOUT_USERNAME", username)
        set_key(str(env_path), "WORKOUT_PASSWORD", password)
    if len(password) < 8:
        raise ValueError("WORKOUT_PASSWORD deve avere almeno 8 caratteri.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--non-interactive", action="store_true", help="Non richiede input; la prima password deve essere già configurata.")
    parser.add_argument("--configure", action="store_true", help=argparse.SUPPRESS)
    args = parser.parse_args()
    if sys.version_info < (3, 11):
        raise ValueError("Serve Python 3.11 o successivo.")
    if args.configure:
        configure()
        return
    npm = shutil.which("npm.cmd" if os.name == "nt" else "npm")
    node = shutil.which("node")
    if not npm or not node:
        raise ValueError("Installa Node.js 22.12+ (con npm) e riapri il terminale.")
    node_version = subprocess.check_output([node, "--version"], text=True).strip().lstrip("v")
    if tuple(map(int, node_version.split(".")[:2])) < (22, 12):
        raise ValueError("Serve Node.js 22.12 o successivo.")
    environment = ROOT / ".venv"
    python = environment / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
    if not python.exists():
        print("Creo l'ambiente Python isolato...", flush=True)
        venv.EnvBuilder(with_pip=True).create(environment)
    run([str(python), "-m", "pip", "install", "-r", "requirements.txt"])
    run([str(python), str(Path(__file__)), "--configure", *(["--non-interactive"] if args.non_interactive else [])])
    run([npm, "--prefix", "frontend", "ci"])
    run([npm, "--prefix", "frontend", "run", "build"])
    run([str(python), "-c", "import app; print('Database e amministratore pronti.')"])
    print("Installazione completata. Windows: avvia.bat. Linux/macOS: .venv/bin/python app.py")
    print("Apri http://127.0.0.1:8456 e accedi con il tuo amministratore.")


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, subprocess.CalledProcessError) as exc:
        print(f"Installazione interrotta: {exc}", file=sys.stderr)
        sys.exit(1)
