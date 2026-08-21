"""Import dello storico dall'export "Scarica dati personali" di Samsung Health.

Serve a recuperare il passato, che dalla sincronizzazione col telefono non
arriva: HC Webhook spedisce una finestra mobile di 48 ore e nient'altro. E'
anche l'unica via per l'alimentazione, che Samsung Health non sempre riversa su
Health Connect.

I dati finiscono nelle stesse tabelle dell'ingest, passando dalle stesse
funzioni di `services/salute.py`: la deduplica vale quindi anche qui, e
reimportare due volte lo stesso export non raddoppia niente.

Formato dell'export, verificato su un file vero (Samsung Health 7.6):

- Un CSV per tipo di dato, chiamato `<dataset>.<timestamp>.csv`.
- **La prima riga non e' l'intestazione**: e' una riga di metadati
  (`com.samsung.shealth.sleep,7006003,11`). Le colonne stanno sulla seconda.
- Gli orari degli eventi sono in **UTC**, con il fuso in una colonna
  `time_offset` a parte (`UTC+0200`). Si vede dal riepilogo passi giornaliero,
  creato alle 22:00 UTC del giorno prima, cioe' allo scoccare della mezzanotte
  locale. Senza ricombinarli, ogni orario risulterebbe spostato di due ore.
"""

import csv
import io
import zipfile
from datetime import datetime, timedelta

from models import ORIGINE_SAMSUNG, Impostazione, db
from services.ai_tools import registra_peso_corporeo
from services.salute import registra_pasto, registra_sonno

# Nomi dei dataset che ci interessano. Il resto dell'export (battito, passi,
# stress: la stragrande maggioranza dei file) non viene nemmeno aperto.
DATASET_SONNO = "com.samsung.shealth.sleep"
DATASET_FASI = "com.samsung.health.sleep_stage"
DATASET_PESO = "com.samsung.health.weight"
DATASET_PASTI = "com.samsung.health.nutrition"

# Prefisso delle colonne del sonno, che nell'export sono qualificate per intero.
COL_SONNO = "com.samsung.health.sleep."

# Codici delle fasi di sonno di Samsung Health.
FASI_CODICI = {"40001": "sveglio", "40002": "leggero", "40003": "profondo", "40004": "rem"}


class ErroreImport(Exception):
    """Errore previsto: torna all'utente come messaggio, non come crash."""


def _decimale(valore):
    if valore in (None, ""):
        return None
    try:
        return float(valore)
    except (TypeError, ValueError):
        return None


def _offset(valore):
    """"UTC+0200" -> timedelta(hours=2). Fuso ignoto: nessuno spostamento."""
    testo = (valore or "").strip().upper()
    if not testo.startswith("UTC") or len(testo) < 8:
        return timedelta(0)
    segno = -1 if testo[3] == "-" else 1
    try:
        ore, minuti = int(testo[4:6]), int(testo[6:8])
    except ValueError:
        return timedelta(0)
    return segno * timedelta(hours=ore, minutes=minuti)


def _momento(valore, offset):
    """Un orario dell'export come datetime naive in ora locale."""
    if not valore:
        return None
    try:
        utc = datetime.strptime(str(valore)[:19], "%Y-%m-%d %H:%M:%S")
    except ValueError:
        return None
    return utc + offset


def _leggi_csv(dati):
    """Le righe di un CSV dell'export, saltando la riga di metadati iniziale."""
    testo = dati.decode("utf-8-sig", errors="replace").splitlines()
    if len(testo) < 2:
        return []
    return list(csv.DictReader(testo[1:]))


def _tabelle(contenuto, nome_file):
    """I soli dataset che ci servono, da uno ZIP o da un singolo CSV."""
    if nome_file.lower().endswith(".csv"):
        for dataset in (DATASET_SONNO, DATASET_FASI, DATASET_PESO, DATASET_PASTI):
            # Il confronto e' sul nome del dataset perche' il file porta in coda
            # il timestamp dell'export, diverso a ogni scaricamento.
            if nome_file.split("/")[-1].startswith(dataset + "."):
                return {dataset: _leggi_csv(contenuto.read())}
        raise ErroreImport(
            "Questo CSV non e' fra quelli che servono (sonno, peso o alimentazione)."
        )

    try:
        archivio = zipfile.ZipFile(contenuto)
    except zipfile.BadZipFile:
        raise ErroreImport("Il file non e' uno ZIP valido ne' un CSV dell'export.")

    tabelle = {}
    for voce in archivio.infolist():
        base = voce.filename.split("/")[-1]
        if not base.lower().endswith(".csv"):
            continue
        for dataset in (DATASET_SONNO, DATASET_FASI, DATASET_PESO, DATASET_PASTI):
            # startswith col punto: senza, "...sleep." pescherebbe anche
            # "...sleep_data." e "...sleep_stage.", che hanno colonne diverse.
            if base.startswith(dataset + "."):
                tabelle[dataset] = _leggi_csv(archivio.read(voce))
    if not tabelle:
        raise ErroreImport(
            "Nello ZIP non c'e' nessuno dei file attesi. Assicurati che sia "
            "l'export di Samsung Health (cartella samsunghealth_...)."
        )
    return tabelle


def _minuti_per_notte(righe_fasi):
    """Minuti per fase, raggruppati per dormita.

    Le fasi stanno in un file separato e si agganciano alla dormita con
    `sleep_id`, che corrisponde al `datauuid` del record di sonno.
    """
    per_notte = {}
    for riga in righe_fasi:
        offset = _offset(riga.get("time_offset"))
        inizio = _momento(riga.get("start_time"), offset)
        fine = _momento(riga.get("end_time"), offset)
        fase = FASI_CODICI.get((riga.get("stage") or "").strip())
        if not fase or inizio is None or fine is None or fine <= inizio:
            continue
        conteggi = per_notte.setdefault(riga.get("sleep_id"), {})
        minuti = round((fine - inizio).total_seconds() / 60)
        conteggi[fase] = conteggi.get(fase, 0) + minuti
    return per_notte


def _importa_sonno(tabelle):
    fasi = _minuti_per_notte(tabelle.get(DATASET_FASI, []))
    n = 0
    for riga in tabelle.get(DATASET_SONNO, []):
        offset = _offset(riga.get(COL_SONNO + "time_offset"))
        inizio = _momento(riga.get(COL_SONNO + "start_time"), offset)
        fine = _momento(riga.get(COL_SONNO + "end_time"), offset)
        durata = _decimale(riga.get("sleep_duration"))
        if registra_sonno(
            inizio,
            fine,
            int(durata) if durata else None,
            fasi.get(riga.get(COL_SONNO + "datauuid")),
        ) is not None:
            n += 1
    return n


def _importa_peso(tabelle):
    """Il peso, piu' l'altezza se non e' ancora stata impostata a mano."""
    n = 0
    altezza = None
    for riga in tabelle.get(DATASET_PESO, []):
        offset = _offset(riga.get("time_offset"))
        momento = _momento(riga.get("start_time"), offset)
        kg = _decimale(riga.get("weight"))
        if momento is None or not kg or kg <= 0:
            continue
        registra_peso_corporeo(
            valore_kg=kg, data=momento.date().isoformat(), note=riga.get("comment") or ""
        )
        n += 1
        altezza = _decimale(riga.get("height")) or altezza

    # Solo se manca: l'altezza scritta a mano nell'app ha la precedenza, perche'
    # e' una scelta esplicita dell'utente e questa e' solo una comodita'.
    if altezza and not Impostazione.get_int("altezza_cm", 0):
        Impostazione.set("altezza_cm", round(altezza))
        db.session.commit()
        return n, round(altezza)
    return n, None


def _importa_pasti(tabelle):
    """I pasti dal riepilogo `nutrition`, non dai singoli alimenti.

    Su un export vero le due fonti danno le stesse calorie, ma `nutrition` ha
    anche i macronutrienti ed e' gia' un record per pasto: e' quello che serve,
    senza doverli risommare.
    """
    n = 0
    for riga in tabelle.get(DATASET_PASTI, []):
        offset = _offset(riga.get("time_offset"))
        inizio = _momento(riga.get("start_time"), offset)
        if inizio is None:
            continue
        if registra_pasto(
            inizio,
            nome=riga.get("title") or "",
            kcal=_decimale(riga.get("calorie")),
            proteine_g=_decimale(riga.get("protein")),
            carboidrati_g=_decimale(riga.get("carbohydrate")),
            grassi_g=_decimale(riga.get("total_fat")),
            fibre_g=_decimale(riga.get("dietary_fiber")),
            zuccheri_g=_decimale(riga.get("sugar")),
            origine=ORIGINE_SAMSUNG,
        ) is not None:
            n += 1
    return n


def importa_export(contenuto, nome_file=""):
    """Importa uno ZIP (o un singolo CSV) dell'export di Samsung Health."""
    tabelle = _tabelle(contenuto, nome_file)
    conteggi = {
        "sonno": _importa_sonno(tabelle),
        "pasti": _importa_pasti(tabelle),
    }
    conteggi["peso"], altezza = _importa_peso(tabelle)
    db.session.commit()
    if altezza:
        conteggi["altezza_cm"] = altezza
    return conteggi
