"""Regressioni sui dati: vincoli SQLite, isolamento dei workout, cancellazioni.

Coprono i difetti emersi dalla revisione del 20 settembre 2026. L'ambiente
isolato (database temporaneo, .env disattivato) arriva da `contesto`, che va
importato prima di qualunque cosa tocchi l'app.
"""
import unittest
from datetime import date

from contesto import app, db

from sqlalchemy import text

import tenancy
from models import (
    PR,
    EsercizioLibreria,
    EsercizioScheda,
    Scheda,
    SerieEseguita,
    Sessione,
    Utente,
    Workout,
)


class DatiTests(unittest.TestCase):
    def setUp(self):
        tenancy.azzera()
        with app.app_context():
            db.drop_all()
            db.create_all()
            primo, secondo = Workout(nome="Primo"), Workout(nome="Secondo")
            db.session.add_all([primo, secondo])
            db.session.flush()
            self.primo_id, self.secondo_id = primo.id, secondo.id
            primo.genera_token()
            self.token = primo.ingest_token
            utente = Utente(username="uno", ruolo="standard", workout_id=primo.id)
            utente.imposta_password("test-password")
            db.session.add(utente)
            db.session.commit()
        from blueprints.api.auth import _tentativi
        _tentativi.clear()

    def tearDown(self):
        tenancy.azzera()

    def _allenamento_con_voce(self):
        """Un esercizio in libreria, una scheda che lo prevede, una serie fatta."""
        esercizio = EsercizioLibreria(nome="Panca")
        scheda = Scheda(nome="Petto")
        db.session.add_all([esercizio, scheda])
        db.session.flush()
        voce = EsercizioScheda(
            scheda_id=scheda.id, esercizio_libreria_id=esercizio.id, ordine=1
        )
        sessione = Sessione(data=date.today(), scheda_id=scheda.id)
        db.session.add_all([voce, sessione])
        db.session.flush()
        serie = SerieEseguita(
            sessione_id=sessione.id,
            esercizio_libreria_id=esercizio.id,
            esercizio_scheda_id=voce.id,
            numero_serie=1,
            peso_kg=20,
            ripetizioni=10,
        )
        db.session.add(serie)
        db.session.commit()
        return scheda, voce, sessione, serie, esercizio

    def test_pragma_sqlite_attivi(self):
        """WAL, attesa sul lock e vincoli: senza, scritture concorrenti e
        cancellazioni si comportano in modo diverso da quello che il codice
        assume."""
        with app.app_context():
            self.assertEqual(db.session.execute(text("PRAGMA journal_mode")).scalar(), "wal")
            self.assertEqual(db.session.execute(text("PRAGMA foreign_keys")).scalar(), 1)
            self.assertGreaterEqual(db.session.execute(text("PRAGMA busy_timeout")).scalar(), 5000)

    def test_workout_del_payload_non_sposta_la_riga(self):
        """Un workout_id che arrivasse dall'esterno non deve valere: dentro una
        richiesta il workout lo decide il login."""
        with app.app_context():
            tenancy.imposta(self.primo_id)
            scheda = Scheda(nome="Iniettata", workout_id=self.secondo_id)
            db.session.add(scheda)
            db.session.commit()
            identificativo = scheda.id
            tenancy.azzera()
            self.assertEqual(db.session.get(Scheda, identificativo).workout_id, self.primo_id)

    def test_togliere_un_esercizio_dalla_scheda_conserva_lo_storico(self):
        with app.app_context():
            tenancy.imposta(self.primo_id)
            _, voce, _, serie, _ = self._allenamento_con_voce()
            voce_id, serie_id = voce.id, serie.id

            from services.ai_tools import rimuovi_esercizio_da_scheda

            rimuovi_esercizio_da_scheda(voce_id)

            self.assertIsNone(db.session.get(EsercizioScheda, voce_id))
            rimasta = db.session.get(SerieEseguita, serie_id)
            self.assertIsNotNone(rimasta, "la serie gia' registrata non va cancellata")
            self.assertIsNone(rimasta.esercizio_scheda_id)

    def test_eliminare_un_allenamento_che_ha_prodotto_un_pr(self):
        with app.app_context():
            tenancy.imposta(self.primo_id)
            _, _, sessione, _, esercizio = self._allenamento_con_voce()
            sessione_id = sessione.id
            db.session.add(
                PR(
                    esercizio_libreria_id=esercizio.id,
                    valore=26.6,
                    peso_kg=20,
                    ripetizioni=10,
                    data=date.today(),
                    sessione_id=sessione_id,
                )
            )
            db.session.commit()

            from services.ai_tools import elimina_allenamento

            elimina_allenamento(sessione_id)

            self.assertIsNone(db.session.get(Sessione, sessione_id))
            self.assertEqual(
                db.session.query(PR).filter(PR.sessione_id == sessione_id).count(), 0
            )

    def test_ogni_strumento_punta_alla_propria_funzione(self):
        """Il registro degli strumenti si costruisce con un decoratore: basta
        infilare una funzione di appoggio fra il decoratore e la sua funzione
        perche' un nome finisca a puntare al codice sbagliato, in silenzio."""
        from services.ai_tools import STRUMENTI

        self.assertGreater(len(STRUMENTI), 20)
        for nome, voce in STRUMENTI.items():
            self.assertEqual(
                voce["funzione"].__name__,
                nome,
                f"lo strumento «{nome}» esegue {voce['funzione'].__name__}",
            )

    def test_freno_sui_token_di_ingest_sbagliati(self):
        """L'ingest e' l'unica porta senza login: i tentativi si contano."""
        client = app.test_client()
        for _ in range(5):
            risposta = client.post(
                "/api/health/ingest", json={}, headers={"Authorization": "Bearer sbagliato"}
            )
            self.assertEqual(risposta.status_code, 401)
        risposta = client.post(
            "/api/health/ingest", json={}, headers={"Authorization": "Bearer sbagliato"}
        )
        self.assertEqual(risposta.status_code, 429)

    def test_il_freno_dell_ingest_non_blocca_il_login(self):
        """Contatori separati: chi sbaglia il token non deve chiudere fuori
        l'utente che sta facendo il login dallo stesso indirizzo."""
        client = app.test_client()
        for _ in range(6):
            client.post(
                "/api/health/ingest", json={}, headers={"Authorization": "Bearer sbagliato"}
            )
        risposta = client.post(
            "/api/auth/login", json={"username": "uno", "password": "test-password"}
        )
        self.assertEqual(risposta.status_code, 200)


if __name__ == "__main__":
    unittest.main()
