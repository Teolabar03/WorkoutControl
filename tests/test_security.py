"""API regression tests. Never use the developer's database or .env."""
import io
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import zipfile

temporary = tempfile.TemporaryDirectory(prefix="workout-tests-")
os.environ["PYTHON_DOTENV_DISABLED"] = "1"
os.environ["WORKOUT_DB_PATH"] = str(Path(temporary.name) / "test.db")
os.environ["WORKOUT_SECRET_KEY"] = "isolated-test-key"
os.environ["WORKOUT_PASSWORD"] = "test-admin-password"
os.environ["WORKOUT_USERNAME"] = "admin"
os.environ["WORKOUT_FRONTEND_ORIGIN"] = ""
os.environ["WORKOUT_COOKIE_SECURE"] = "0"
os.environ["WORKOUT_COOKIE_PATH"] = "/"
for name in ("ANTHROPIC_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY", "GEMINI_KEY", "OLLAMA_MODEL", "WORKOUT_INGEST_TOKEN"):
    os.environ.pop(name, None)

from app import app, _crea_admin_iniziale  # noqa: E402
from models import db, Workout, Utente, Conversazione, Scheda  # noqa: E402
from services.samsung_export import _tabelle, ErroreImport  # noqa: E402
import tenancy  # noqa: E402


class SecurityTests(unittest.TestCase):
    @classmethod
    def tearDownClass(cls):
        with app.app_context():
            db.session.remove()
            db.engine.dispose()
        temporary.cleanup()

    def setUp(self):
        tenancy.azzera()
        with app.app_context():
            db.drop_all()
            db.create_all()
            first, second = Workout(nome="First"), Workout(nome="Second")
            db.session.add_all([first, second])
            db.session.flush()
            self.first_id, self.second_id = first.id, second.id
            first.genera_token()
            self.token = first.ingest_token
            for name, role, workout in [("admin", "admin", first), ("one", "standard", first),
                                        ("peer", "standard", first), ("two", "standard", second),
                                        ("coach", "allenatore", first)]:
                user = Utente(username=name, ruolo=role, workout_id=workout.id, ai_abilitata=True)
                user.imposta_password("test-password")
                db.session.add(user)
            db.session.commit()
        from blueprints.api.auth import _tentativi
        _tentativi.clear()

    def login(self, name="one"):
        client = app.test_client()
        self.assertEqual(client.post("/api/auth/login", json={"username": name, "password": "test-password"}).status_code, 200)
        return client

    def test_login_and_cross_site_forms(self):
        client = app.test_client()
        self.assertEqual(client.get("/api/schede").status_code, 401)
        for content_type in ("text/plain", "application/x-www-form-urlencoded"):
            response = client.post("/api/auth/login", data='{"username":"one","password":"test-password"}', content_type=content_type)
            self.assertEqual(response.status_code, 415)
        response = client.options("/api/schede", headers={"Origin": "https://untrusted.example", "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type"})
        self.assertNotIn("Access-Control-Allow-Origin", response.headers)
        response = self.login().get("/api/schede")
        self.assertEqual(response.headers["Cache-Control"], "no-store")

    def test_workout_isolation_and_shared_data(self):
        first, second, peer = self.login(), self.login("two"), self.login("peer")
        response = first.post("/api/schede", json={"nome": "Private"})
        self.assertEqual(response.status_code, 201)
        identifier = response.json["data"]["id"]
        url = f"/api/schede/{identifier}"
        self.assertEqual(peer.get(url).status_code, 200)
        self.assertEqual(second.get("/api/schede").json["data"], [])
        for method in ("get", "patch", "delete"):
            self.assertEqual(getattr(second, method)(url, json={"nome": "Wrong"}).status_code, 404)
        self.assertEqual(first.get(url).json["data"]["nome"], "Private")

    def test_bulk_queries_are_scoped(self):
        with app.app_context():
            db.session.add_all([Scheda(nome="A", workout_id=self.first_id), Scheda(nome="B", workout_id=self.second_id)])
            db.session.commit()
            tenancy.imposta(self.first_id)
            db.session.query(Scheda).update({Scheda.nome: "Updated"})
            db.session.commit()
            db.session.query(Scheda).delete()
            db.session.commit()
            tenancy.azzera()
            self.assertEqual([(s.nome, s.workout_id) for s in db.session.query(Scheda)], [("B", self.second_id)])

    def test_roles_and_private_conversations(self):
        coach = self.login("coach")
        self.assertEqual(coach.post("/api/schede", json={"nome": "No"}).status_code, 403)
        self.assertEqual(coach.get("/api/conversazioni").status_code, 403)
        first, peer = self.login(), self.login("peer")
        self.assertEqual(first.get("/api/admin/utenti").status_code, 403)
        with app.app_context():
            user = db.session.query(Utente).filter_by(username="one").one()
            chat = Conversazione(titolo="Private chat", utente_id=user.id)
            db.session.add(chat)
            db.session.commit()
            identifier = chat.id
        self.assertEqual(first.get(f"/api/conversazioni/{identifier}").status_code, 200)
        self.assertEqual(peer.get(f"/api/conversazioni/{identifier}").status_code, 404)

    def test_password_change_revokes_other_sessions(self):
        first, second = self.login(), self.login()
        self.assertEqual(first.post("/api/auth/password", json={"attuale": "test-password", "nuova": "changed-password"}).status_code, 200)
        self.assertEqual(first.get("/api/schede").status_code, 200)
        self.assertEqual(second.get("/api/schede").status_code, 401)

    def test_rate_limit(self):
        client = app.test_client()
        for _ in range(5):
            self.assertEqual(client.post("/api/auth/login", json={"username": "one", "password": "wrong"}).status_code, 401)
        self.assertEqual(client.post("/api/auth/login", json={"username": "one", "password": "wrong"}).status_code, 429)

    def test_ingest_and_upload_limits(self):
        client = app.test_client()
        self.assertEqual(client.post("/api/health/ingest", json={}).status_code, 401)
        self.assertEqual(client.post("/api/health/ingest", json={}, headers={"Authorization": "Bearer " + self.token}).status_code, 200)
        client = self.login()
        self.assertEqual(client.post("/api/suoni", data='"' + 'x' * (2 * 1024 * 1024) + '"', content_type="application/json").status_code, 413)
        self.assertEqual(client.post("/api/salute/import", data={"file": (io.BytesIO(b"x"), "test.csv")}).status_code, 403)
        response = client.post("/api/salute/import", data={"file": (io.BytesIO(b"x"), "test.csv")}, headers={"X-Requested-With": "WorkoutControl"})
        self.assertEqual(response.status_code, 422)  # Reaches format validation.

    def test_zip_expansion_limit(self):
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
            archive.writestr("com.samsung.health.weight.test.csv", b"x" * 1024)
        buffer.seek(0)
        with patch("services.samsung_export.MAX_CSV_BYTES", 100):
            with self.assertRaises(ErroreImport):
                _tabelle(buffer, "export.zip")

    def test_first_admin_rejects_short_password(self):
        with app.app_context():
            db.session.query(Utente).delete()
            db.session.commit()
            with patch.dict(os.environ, {"WORKOUT_PASSWORD": "short"}):
                from schemas import ApiError
                with self.assertRaises(ApiError):
                    _crea_admin_iniziale(self.first_id)
            self.assertEqual(db.session.query(Utente).count(), 0)


if __name__ == "__main__":
    unittest.main()
