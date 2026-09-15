"""Suoni personalizzati per l'avviso di fine recupero.

Un suono e' un file audio breve caricato da Impostazioni e salvato nel database
del workout. Viaggia in base64 dentro JSON in entrambe le direzioni: nell'APK le
richieste passano da CapacitorHttp, dove l'upload multipart non e' affidabile, e
per file da qualche decina di KB un secondo canale non vale la complicazione.

Chi lo riproduce cambia con la piattaforma: da browser lo suona il frontend con
l'AudioContext, nell'APK lo suona Android attraverso il canale della notifica
(vedi frontend/src/lib/notifiche.ts).
"""

import base64
import binascii

from models import Impostazione, SuonoNotifica, db
from services.ai_tools import ErroreStrumento

# Resta sotto il limite predefinito di nginx (1 MB) anche gonfiato del 33% dal
# base64. Un avviso di fine recupero dura pochi secondi: 500 KB sono larghi.
MAX_SUONO_BYTE = 500 * 1024
MAX_NOME = 80

CHIAVE_IMPOSTAZIONE = "suono_recupero"

# Formati che sanno riprodurre sia i browser sia il lettore delle notifiche di
# Android, con l'estensione con cui l'APK salva il file su disco.
FORMATI = {
    "audio/mpeg": "mp3",
    "audio/mp3": "mp3",
    "audio/ogg": "ogg",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/wave": "wav",
    "audio/mp4": "m4a",
    "audio/x-m4a": "m4a",
    "audio/aac": "aac",
}


def serializza(suono, contenuto=False):
    dati = {
        "id": suono.id,
        "nome": suono.nome,
        "mime": suono.mime,
        "estensione": FORMATI.get(suono.mime, "mp3"),
        "byte": len(suono.dati),
        "data_creazione": suono.data_creazione.isoformat(),
    }
    if contenuto:
        dati["contenuto"] = base64.b64encode(suono.dati).decode("ascii")
    return dati


def trova(suono_id):
    return db.session.query(SuonoNotifica).filter_by(id=suono_id).first()


def elenco():
    return [serializza(s) for s in db.session.query(SuonoNotifica).order_by(SuonoNotifica.nome)]


def crea(nome, mime, contenuto):
    nome = str(nome or "").strip()[:MAX_NOME]
    if not nome:
        raise ErroreStrumento("Il suono deve avere un nome.")

    mime = str(mime or "").strip().lower()
    if mime not in FORMATI:
        raise ErroreStrumento("Formato non supportato: usa MP3, OGG, WAV o M4A.")

    try:
        dati = base64.b64decode(str(contenuto or ""), validate=True)
    except (binascii.Error, ValueError):
        raise ErroreStrumento("Il contenuto del file non e' valido.")
    if not dati:
        raise ErroreStrumento("Il file e' vuoto.")
    if len(dati) > MAX_SUONO_BYTE:
        raise ErroreStrumento(f"File troppo grande: massimo {MAX_SUONO_BYTE // 1024} KB.")

    suono = SuonoNotifica(nome=nome, mime=mime, dati=dati)
    db.session.add(suono)
    db.session.commit()
    return serializza(suono)


def elimina(suono):
    # Un suono eliminato mentre e' quello scelto riporta al suono di base,
    # invece di lasciare nell'impostazione un id che non porta a niente.
    if Impostazione.get(CHIAVE_IMPOSTAZIONE) == str(suono.id):
        Impostazione.set(CHIAVE_IMPOSTAZIONE, "")
    db.session.delete(suono)
    db.session.commit()


def id_suono_recupero():
    """L'id del suono scelto, o None per il suono di base."""
    valore = Impostazione.get(CHIAVE_IMPOSTAZIONE) or ""
    if not valore.isdigit():
        return None
    suono_id = int(valore)
    return suono_id if trova(suono_id) is not None else None


def imposta_suono_recupero(valore):
    if valore in (None, "", 0):
        Impostazione.set(CHIAVE_IMPOSTAZIONE, "")
    else:
        try:
            suono_id = int(valore)
        except (TypeError, ValueError):
            raise ErroreStrumento("Suono non valido.")
        if trova(suono_id) is None:
            raise ErroreStrumento("Suono non trovato.")
        Impostazione.set(CHIAVE_IMPOSTAZIONE, suono_id)
    db.session.commit()
