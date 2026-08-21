"""Modelli SQLAlchemy per WorkoutTracker.

Convenzione: nomi di classi/colonne in inglese dove non sono termini di dominio
gia' fissati in CLAUDE.md; i testi mostrati all'utente stanno nei template.
"""

import json
from datetime import date, datetime

from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()


# Un esercizio puo' caricare peso libero, elastico o solo il corpo.
LOAD_WEIGHT = "peso"
LOAD_BAND = "elastico"
LOAD_BODYWEIGHT = "corpo_libero"

# Un esercizio si misura in ripetizioni o in secondi (es. Plank).
MEASURE_REPS = "reps"
MEASURE_TIME = "tempo"


class Impostazione(db.Model):
    """Chiave/valore per le poche preferenze globali dell'app."""

    __tablename__ = "impostazione"

    chiave = db.Column(db.String(64), primary_key=True)
    # Text e non String: l'attrezzatura e' un testo libero scritto dall'utente,
    # non un numero o un id come le altre preferenze.
    valore = db.Column(db.Text, nullable=False)

    DEFAULTS = {
        "timer_default_sec": "90",
        "analisi_n_sessioni": "10",
        # Attrezzatura disponibile in casa, in testo libero: finisce nelle
        # istruzioni dell'assistente AI perche' non consigli attrezzi che non
        # ci sono. Questo e' solo il valore iniziale, si cambia da Impostazioni.
        "attrezzatura_disponibile": (
            "Due manubri da 1.5 kg, due manubri da 0.5 kg e un elastico. "
            "Niente bilancieri, macchinari o carichi pesanti."
        ),
        # Modello locale scelto dalle Impostazioni. Vuoto vuol dire "quello di
        # OLLAMA_MODEL in .env": il predefinito resta nell'ambiente, qui finisce
        # solo una scelta esplicita.
        "ollama_modello": "",
        # Modello dell'assistente scelto dall'interfaccia, nella forma
        # "provider:id_modello" (es. "anthropic:claude-opus-5"). Vuoto vuol dire
        # "decidi tu": vale la precedenza automatica fra i provider configurati.
        "ai_modello": "",
        # Altezza in cm: serve solo a calcolare il BMI nella pagina del peso.
        # Zero vuol dire "non impostata" e il BMI semplicemente non compare.
        "altezza_cm": "0",
        # Obiettivi giornalieri disegnati come linea di riferimento sui grafici
        # della sezione Salute. Zero = nessun obiettivo, nessuna linea.
        "target_kcal": "0",
        "target_proteine_g": "0",
        "target_carboidrati_g": "0",
        "target_grassi_g": "0",
        "target_sonno_minuti": "0",
        # Gli obiettivi non sono bersagli da centrare al grammo: un giorno a
        # 2280 kcal su 2300 e' centrato quanto uno esatto. Questa percentuale li
        # trasforma in un intervallo (10 su 2300 -> 2070-2530). Una tolleranza
        # sola per tutti: sono tutte "quanto posso sbagliare", e cinque campi
        # separati sarebbero cinque modi di scrivere lo stesso 10.
        "target_tolleranza_pct": "10",
    }

    @staticmethod
    def get(chiave, default=None):
        row = db.session.get(Impostazione, chiave)
        if row is not None:
            return row.valore
        if default is not None:
            return default
        return Impostazione.DEFAULTS.get(chiave)

    @staticmethod
    def get_int(chiave, default=0):
        try:
            return int(Impostazione.get(chiave))
        except (TypeError, ValueError):
            return default

    @staticmethod
    def set(chiave, valore):
        row = db.session.get(Impostazione, chiave)
        if row is None:
            row = Impostazione(chiave=chiave)
            db.session.add(row)
        row.valore = str(valore)


class EsercizioLibreria(db.Model):
    """Catalogo degli esercizi disponibili, riusabili fra piu' schede."""

    __tablename__ = "esercizio_libreria"

    id = db.Column(db.Integer, primary_key=True)
    nome = db.Column(db.String(120), nullable=False, unique=True)
    attrezzatura = db.Column(db.String(160), nullable=False, default="")
    gruppo_muscolare = db.Column(db.String(80), nullable=False, default="")
    tipo_carico = db.Column(db.String(20), nullable=False, default=LOAD_BODYWEIGHT)
    tipo_misura = db.Column(db.String(20), nullable=False, default=MEASURE_REPS)
    # Quanti carichi si impugnano per serie: 2 per esercizi con due manubri,
    # 1 per quelli unilaterali/con un manubrio solo, 0 se non c'e' carico.
    # Serve a calcolare il volume reale (peso x carichi x ripetizioni).
    carichi_per_serie = db.Column(db.Integer, nullable=False, default=0)
    note_tecniche = db.Column(db.Text, nullable=False, default="")
    is_custom = db.Column(db.Boolean, nullable=False, default=False)
    archiviato = db.Column(db.Boolean, nullable=False, default=False)

    @property
    def usa_peso(self):
        return self.tipo_carico == LOAD_WEIGHT

    @property
    def a_tempo(self):
        return self.tipo_misura == MEASURE_TIME


class Scheda(db.Model):
    __tablename__ = "scheda"

    id = db.Column(db.Integer, primary_key=True)
    nome = db.Column(db.String(120), nullable=False)
    descrizione = db.Column(db.Text, nullable=False, default="")
    obiettivo = db.Column(db.String(80), nullable=False, default="")
    data_creazione = db.Column(db.Date, nullable=False, default=date.today)
    attiva = db.Column(db.Boolean, nullable=False, default=True)

    esercizi = db.relationship(
        "EsercizioScheda",
        back_populates="scheda",
        cascade="all, delete-orphan",
        order_by="EsercizioScheda.ordine",
    )
    sessioni = db.relationship("Sessione", back_populates="scheda")


class EsercizioScheda(db.Model):
    """Un esercizio della libreria calato in una scheda, con i suoi target."""

    __tablename__ = "esercizio_scheda"

    id = db.Column(db.Integer, primary_key=True)
    scheda_id = db.Column(
        db.Integer, db.ForeignKey("scheda.id", ondelete="CASCADE"), nullable=False
    )
    esercizio_libreria_id = db.Column(
        db.Integer, db.ForeignKey("esercizio_libreria.id"), nullable=False
    )
    ordine = db.Column(db.Integer, nullable=False, default=0)
    serie_target = db.Column(db.Integer, nullable=False, default=4)
    # Niente default: un esercizio a tempo (es. Plank) deve poter restare NULL,
    # e SQLAlchemy applicherebbe il default anche a un None passato di proposito.
    rep_target = db.Column(db.Integer, nullable=True)
    durata_target_sec = db.Column(db.Integer, nullable=True)
    peso_suggerito_kg = db.Column(db.Float, nullable=True)
    note = db.Column(db.Text, nullable=False, default="")
    # Nullable: se non impostato si usa l'impostazione globale timer_default_sec.
    timer_recupero_secondi = db.Column(db.Integer, nullable=True)

    scheda = db.relationship("Scheda", back_populates="esercizi")
    esercizio = db.relationship("EsercizioLibreria")

    @property
    def timer_effettivo(self):
        if self.timer_recupero_secondi:
            return self.timer_recupero_secondi
        return Impostazione.get_int("timer_default_sec", 90)


class Sessione(db.Model):
    __tablename__ = "sessione"

    id = db.Column(db.Integer, primary_key=True)
    data = db.Column(db.Date, nullable=False, default=date.today, index=True)
    iniziata_alle = db.Column(db.DateTime, nullable=False, default=datetime.now)
    scheda_id = db.Column(db.Integer, db.ForeignKey("scheda.id"), nullable=True)
    durata_minuti = db.Column(db.Integer, nullable=True)
    energia = db.Column(db.Integer, nullable=True)
    sonno = db.Column(db.Integer, nullable=True)
    umore = db.Column(db.Integer, nullable=True)
    note_generali = db.Column(db.Text, nullable=False, default="")
    completata = db.Column(db.Boolean, nullable=False, default=False)

    scheda = db.relationship("Scheda", back_populates="sessioni")
    serie = db.relationship(
        "SerieEseguita",
        back_populates="sessione",
        cascade="all, delete-orphan",
        order_by="SerieEseguita.id",
    )
    note_dolore = db.relationship(
        "NotaDolore", back_populates="sessione", cascade="all, delete-orphan"
    )
    esercizi_saltati = db.relationship(
        "EsercizioSaltato", back_populates="sessione", cascade="all, delete-orphan"
    )

    @property
    def nome_scheda(self):
        return self.scheda.nome if self.scheda else "Allenamento libero"

    @property
    def volume_kg(self):
        return sum(s.volume_kg for s in self.serie)


class SerieEseguita(db.Model):
    """Una singola serie registrata durante una sessione."""

    __tablename__ = "serie_eseguita"

    id = db.Column(db.Integer, primary_key=True)
    sessione_id = db.Column(
        db.Integer, db.ForeignKey("sessione.id", ondelete="CASCADE"), nullable=False
    )
    esercizio_scheda_id = db.Column(
        db.Integer, db.ForeignKey("esercizio_scheda.id"), nullable=True
    )
    esercizio_libreria_id = db.Column(
        db.Integer, db.ForeignKey("esercizio_libreria.id"), nullable=False, index=True
    )
    numero_serie = db.Column(db.Integer, nullable=False, default=1)
    # Peso del singolo manubrio/carico, non il totale sollevato.
    peso_kg = db.Column(db.Float, nullable=True)
    ripetizioni = db.Column(db.Integer, nullable=True)
    durata_secondi = db.Column(db.Integer, nullable=True)
    note = db.Column(db.Text, nullable=False, default="")
    is_pr = db.Column(db.Boolean, nullable=False, default=False)
    registrata_alle = db.Column(db.DateTime, nullable=False, default=datetime.now)

    sessione = db.relationship("Sessione", back_populates="serie")
    esercizio = db.relationship("EsercizioLibreria")
    esercizio_scheda = db.relationship("EsercizioScheda")

    @property
    def volume_kg(self):
        """Carico totale mosso: peso x numero di manubri x ripetizioni.

        Vale 0 per elastici e corpo libero, dove il carico non e' misurabile
        in kg: quegli esercizi si seguono con le ripetizioni, non col volume.
        """
        if not self.peso_kg or not self.ripetizioni:
            return 0.0
        carichi = max(self.esercizio.carichi_per_serie, 1)
        return self.peso_kg * carichi * self.ripetizioni


class EsercizioSaltato(db.Model):
    """Esercizio della scheda dichiarato esplicitamente come non svolto.

    Diverso dall'assenza di serie: qui l'utente ha detto "questo l'ho saltato".
    E' un'informazione utile per l'aderenza alla scheda e per l'assistente AI,
    che altrimenti non distinguerebbe un esercizio saltato da uno non ancora
    registrato.
    """

    __tablename__ = "esercizio_saltato"

    id = db.Column(db.Integer, primary_key=True)
    sessione_id = db.Column(
        db.Integer, db.ForeignKey("sessione.id", ondelete="CASCADE"), nullable=False
    )
    esercizio_scheda_id = db.Column(
        db.Integer, db.ForeignKey("esercizio_scheda.id"), nullable=True
    )
    esercizio_libreria_id = db.Column(
        db.Integer, db.ForeignKey("esercizio_libreria.id"), nullable=False
    )
    motivo = db.Column(db.String(200), nullable=False, default="")

    sessione = db.relationship("Sessione", back_populates="esercizi_saltati")
    esercizio = db.relationship("EsercizioLibreria")
    esercizio_scheda = db.relationship("EsercizioScheda")


class PesoCorporeo(db.Model):
    __tablename__ = "peso_corporeo"

    id = db.Column(db.Integer, primary_key=True)
    data = db.Column(db.Date, nullable=False, unique=True, index=True)
    valore_kg = db.Column(db.Float, nullable=False)
    note = db.Column(db.Text, nullable=False, default="")


# Da dove arriva un dato di salute: scritto a mano nell'app o sincronizzato da
# Samsung Health via Health Connect (vedi services/salute.py).
ORIGINE_MANUALE = "manuale"
ORIGINE_SAMSUNG = "samsung_health"


class SonnoNotte(db.Model):
    """Una dormita importata da Health Connect.

    `inizio` e' unico perche' fa da chiave di deduplica: l'app ponte rispedisce
    a ogni sincronizzazione una finestra mobile di 48 ore, quindi la stessa
    notte arriva piu' volte e va aggiornata in loco invece che riscritta.
    """

    __tablename__ = "sonno_notte"

    id = db.Column(db.Integer, primary_key=True)
    inizio = db.Column(db.DateTime, nullable=False, unique=True, index=True)
    fine = db.Column(db.DateTime, nullable=False)
    # Giorno del risveglio, non dell'addormentamento: e' quello in cui la
    # dormita "conta" per l'allenamento e per i grafici.
    data = db.Column(db.Date, nullable=False, index=True)
    durata_minuti = db.Column(db.Integer, nullable=False, default=0)
    minuti_profondo = db.Column(db.Integer, nullable=True)
    minuti_rem = db.Column(db.Integer, nullable=True)
    minuti_leggero = db.Column(db.Integer, nullable=True)
    minuti_sveglio = db.Column(db.Integer, nullable=True)
    origine = db.Column(db.String(40), nullable=False, default=ORIGINE_SAMSUNG)

    @property
    def ore(self):
        return round(self.durata_minuti / 60, 2)


class PastoNutrizione(db.Model):
    """Un pasto registrato in Samsung Health e importato via Health Connect.

    Si tengono i singoli pasti e non il totale del giorno: i totali si calcolano
    al volo (services/salute.py) e restano corretti anche quando un pasto arriva
    in ritardo o viene corretto a posteriori.
    """

    __tablename__ = "pasto_nutrizione"

    id = db.Column(db.Integer, primary_key=True)
    inizio = db.Column(db.DateTime, nullable=False, index=True)
    data = db.Column(db.Date, nullable=False, index=True)
    nome = db.Column(db.String(160), nullable=False, default="")
    kcal = db.Column(db.Float, nullable=True)
    proteine_g = db.Column(db.Float, nullable=True)
    carboidrati_g = db.Column(db.Float, nullable=True)
    grassi_g = db.Column(db.Float, nullable=True)
    fibre_g = db.Column(db.Float, nullable=True)
    zuccheri_g = db.Column(db.Float, nullable=True)
    origine = db.Column(db.String(40), nullable=False, default=ORIGINE_SAMSUNG)

    # Stessa logica di SonnoNotte: orario piu' nome identificano il pasto fra
    # una sincronizzazione e l'altra, cosi' i reinvii aggiornano invece di
    # duplicare.
    __table_args__ = (db.UniqueConstraint("inizio", "nome", name="uq_pasto_origine"),)


class MisuraSalute(db.Model):
    """Una misura di salute qualsiasi arrivata dal telefono.

    Health Connect espone una trentina di tipi di dato — passi, battito,
    saturazione, idratazione, composizione corporea — e l'app ponte li spedisce
    tutti insieme. Sonno, alimentazione e peso hanno tabelle proprie perche'
    hanno una logica di dominio (le fasi, i macro, il BMI); tutto il resto e'
    "un numero a un istante" e la forma non cambia fra i passi e il battito,
    quindi sta qui, in una tabella sola, distinto dalla colonna `tipo`.

    Il vantaggio e' che un tipo nuovo non richiede una migrazione: basta
    aggiungerlo al catalogo METRICHE in services/salute.py.

    `valore_secondario` esiste per la pressione, l'unico tipo a due numeri
    (sistolica e diastolica) che valga la pena tenere.
    """

    __tablename__ = "misura_salute"

    id = db.Column(db.Integer, primary_key=True)
    # La chiave del catalogo, cioe' il nome del record type di Health Connect
    # ("steps", "heart_rate"): si tiene quello e non un id numerico, cosi' il
    # dato resta leggibile anche guardando il database a mano.
    tipo = db.Column(db.String(60), nullable=False, index=True)
    inizio = db.Column(db.DateTime, nullable=False, index=True)
    # Solo per le misure che coprono un intervallo (passi, distanza, calorie):
    # per un battito istantaneo resta vuota.
    fine = db.Column(db.DateTime, nullable=True)
    data = db.Column(db.Date, nullable=False, index=True)
    valore = db.Column(db.Float, nullable=False)
    valore_secondario = db.Column(db.Float, nullable=True)
    origine = db.Column(db.String(40), nullable=False, default=ORIGINE_SAMSUNG)

    # Stessa deduplica di SonnoNotte e PastoNutrizione: l'app ponte rispedisce
    # una finestra di 48 ore a ogni sincronizzazione, quindi la stessa misura
    # arriva piu' volte e va aggiornata in loco invece che riscritta.
    __table_args__ = (
        db.UniqueConstraint("tipo", "inizio", name="uq_misura_tipo_inizio"),
    )


# Su cosa si misura il record di un esercizio.
PR_WEIGHT = "peso"
PR_REPS = "reps"
PR_TIME = "tempo"


class PR(db.Model):
    """Record personale per esercizio.

    `tipo` dipende dall'esercizio: peso massimo per i manubri, ripetizioni
    massime per elastico/corpo libero, secondi massimi per gli isometrici.
    """

    __tablename__ = "pr"

    id = db.Column(db.Integer, primary_key=True)
    esercizio_libreria_id = db.Column(
        db.Integer, db.ForeignKey("esercizio_libreria.id"), nullable=False, index=True
    )
    tipo = db.Column(db.String(20), nullable=False, default=PR_WEIGHT)
    # Per tipo == PR_WEIGHT, il 1RM stimato (Epley): serve solo a confrontare i
    # record fra loro, non e' un peso realmente sollevato. Per gli altri tipi
    # e' il valore vero e proprio (secondi o ripetizioni).
    valore = db.Column(db.Float, nullable=False)
    # Peso realmente sollevato quando tipo == PR_WEIGHT: e' quello mostrato in
    # etichetta, perche' l'utente deve vedere il peso vero, non il 1RM stimato.
    peso_kg = db.Column(db.Float, nullable=True)
    # Ripetizioni a cui e' stato fatto il record (contesto utile).
    ripetizioni = db.Column(db.Integer, nullable=True)
    data = db.Column(db.Date, nullable=False, default=date.today)
    sessione_id = db.Column(db.Integer, db.ForeignKey("sessione.id"), nullable=True)

    esercizio = db.relationship("EsercizioLibreria")
    sessione = db.relationship("Sessione")

    @property
    def etichetta(self):
        if self.tipo == PR_WEIGHT:
            reps = f" x {self.ripetizioni}" if self.ripetizioni else ""
            return f"{self.peso_kg:g} kg{reps}"
        if self.tipo == PR_TIME:
            return f"{self.valore:g} sec"
        return f"{self.valore:g} rip."


class NotaDolore(db.Model):
    """Diario recupero/dolori, separato dalle note della singola serie."""

    __tablename__ = "nota_dolore"

    id = db.Column(db.Integer, primary_key=True)
    data = db.Column(db.Date, nullable=False, default=date.today, index=True)
    sessione_id = db.Column(
        db.Integer, db.ForeignKey("sessione.id", ondelete="CASCADE"), nullable=True
    )
    zona_corporea = db.Column(db.String(80), nullable=False)
    descrizione = db.Column(db.Text, nullable=False, default="")
    gravita = db.Column(db.Integer, nullable=False, default=1)

    sessione = db.relationship("Sessione", back_populates="note_dolore")


RUOLO_UTENTE = "user"
RUOLO_ASSISTENTE = "assistant"


class Conversazione(db.Model):
    """Una chat con l'assistente AI.

    Le conversazioni restano salvate: i consigli si rileggono nel tempo invece
    di andare persi a fine sessione.
    """

    __tablename__ = "conversazione"

    id = db.Column(db.Integer, primary_key=True)
    titolo = db.Column(db.String(160), nullable=False, default="Nuova conversazione")
    data_creazione = db.Column(db.DateTime, nullable=False, default=datetime.now)
    data_ultimo_messaggio = db.Column(
        db.DateTime, nullable=False, default=datetime.now, index=True
    )

    messaggi = db.relationship(
        "MessaggioChat",
        back_populates="conversazione",
        cascade="all, delete-orphan",
        order_by="MessaggioChat.id",
    )

    @property
    def anteprima(self):
        for messaggio in self.messaggi:
            if messaggio.ruolo == RUOLO_UTENTE:
                testo = messaggio.contenuto.strip().replace("\n", " ")
                return testo[:70] + ("…" if len(testo) > 70 else "")
        return "Nessun messaggio"


class MessaggioChat(db.Model):
    __tablename__ = "messaggio_chat"

    id = db.Column(db.Integer, primary_key=True)
    conversazione_id = db.Column(
        db.Integer,
        db.ForeignKey("conversazione.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    ruolo = db.Column(db.String(20), nullable=False)
    contenuto = db.Column(db.Text, nullable=False)
    data = db.Column(db.DateTime, nullable=False, default=datetime.now)
    # Quanti allenamenti erano nel contesto quando e' stata data la risposta.
    n_sessioni_contesto = db.Column(db.Integer, nullable=True)
    # Modello che ha prodotto la risposta, per sapere a posteriori con quale
    # provider e' stato generato un consiglio.
    modello = db.Column(db.String(80), nullable=True)
    # Elenco JSON delle modifiche fatte dall'assistente con gli strumenti
    # (schede create, allenamenti corretti...), per averne traccia in chat.
    azioni = db.Column(db.Text, nullable=True)
    # Nota dell'app, non del modello: dice che qualcosa non e' andato come
    # previsto pur avendo prodotto una risposta (turno rigiocato in locale
    # perche' il provider remoto ha fallito, oppure nessuna modifica eseguita
    # quando ne era stata chiesta una). Senza, quei casi passano inosservati.
    avviso = db.Column(db.Text, nullable=True)

    conversazione = db.relationship("Conversazione", back_populates="messaggi")

    @property
    def elenco_azioni(self):
        if not self.azioni:
            return []
        try:
            return json.loads(self.azioni)
        except ValueError:
            return []
