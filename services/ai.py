"""Assistente AI conversazionale sugli allenamenti.

Supporta tre provider, scelti automaticamente in base a quello che trova in
`.env` (mai hardcoded):

1. Anthropic (Claude) se c'e' `ANTHROPIC_API_KEY` — e' quello preferito;
2. altrimenti Gemini, se c'e' `GEMINI_API_KEY` / `GOOGLE_API_KEY` / `GEMINI_KEY`;
3. altrimenti Ollama in locale, se c'e' `OLLAMA_MODEL`.

Ollama fa anche da riserva a Gemini: quando la quota gratuita si esaurisce il
turno viene rigiocato in locale (vedi `rispondi`), cosi' la chat continua a
funzionare senza chiavi ne' quote.

Senza nessuna delle tre configurazioni la sezione chat viene nascosta
dall'interfaccia.

I dati di allenamento vengono passati al modello in forma strutturata (JSON)
dentro le istruzioni di sistema, cosi' restano stabili per tutta la
conversazione.

Oltre a leggere quel contesto, l'assistente puo' chiamare gli strumenti di
`services.ai_tools` per consultare e modificare davvero i dati (schede,
calendario, libreria, peso, diario). Il ciclo di chiamata e' scritto una volta
per provider: i due parlano protocolli diversi ma usano gli stessi schemi JSON.
"""

import json
import os
import shutil
import subprocess
import time
from datetime import date, datetime, timedelta

from models import (
    RUOLO_ASSISTENTE,
    RUOLO_UTENTE,
    Conversazione,
    Impostazione,
    MessaggioChat,
    NotaDolore,
    PesoCorporeo,
    db,
)
from services import ai_tools, stats

PROVIDER_ANTHROPIC = "anthropic"
PROVIDER_GEMINI = "gemini"
PROVIDER_OLLAMA = "ollama"

# Predefiniti per provider: valgono finche' non si sceglie un modello preciso
# dall'interfaccia (impostazione `ai_modello`) o dall'ambiente.
MODELLO_ANTHROPIC_DEFAULT = "claude-opus-5"
# `gemini-flash-latest` e' un alias che segue il modello flash corrente ed e'
# l'unico disponibile sul piano gratuito. Con un piano a pagamento si puo'
# passare a un modello piu' capace via GEMINI_MODEL.
MODELLO_GEMINI_DEFAULT = "gemini-flash-latest"

# Il modello locale non ha un default: e' la presenza di OLLAMA_MODEL a dire
# che il provider e' configurato. Quale usare e' spiegato in .env.example —
# non tutti i modelli reggono i 24 strumenti di ai_tools con la stessa
# affidabilita'.
# 127.0.0.1 e non "localhost": su Windows quel nome viene risolto prima in IPv6,
# Ollama ascolta in IPv4, e ogni chiamata paga ~2 secondi di tentativo fallito
# prima di ripiegare. Con i controlli di stato a timeout di 2 secondi, voleva
# dire dichiarare "server spento" un server acceso.
HOST_OLLAMA_DEFAULT = "http://127.0.0.1:11434"
# Il contesto va dichiarato per richiesta: senza, Ollama usa il suo default
# (4096 token) e il JSON degli allenamenti verrebbe tagliato.
NUM_CTX_OLLAMA_DEFAULT = 32768
# Tetto al tempo di una singola risposta locale.
TIMEOUT_OLLAMA_DEFAULT = 180
# Quanto lasciare il modello in memoria dopo la risposta. Deliberatamente
# breve: la macchina serve anche per altro mentre l'app e' aperta.
KEEP_ALIVE_DEFAULT = "5m"
# Il contesto di Ollama e' quello che e': meglio guardare meno allenamenti che
# far tagliare al modello l'inizio del prompt, cioe' le istruzioni. Sopra
# questa frazione di num_ctx il payload viene accorciato (vedi
# `_riduci_payload_ollama`).
QUOTA_CONTESTO_OLLAMA = 0.6
# Rapporto caratteri/token usato per la stima: prudente per un JSON fitto di
# cifre e nomi propri, dove i token sono piu' corti che nella prosa.
CARATTERI_PER_TOKEN = 3.0

ETICHETTE_PROVIDER = {
    PROVIDER_ANTHROPIC: "Claude (Anthropic)",
    PROVIDER_GEMINI: "Gemini (Google)",
    PROVIDER_OLLAMA: "Ollama (locale)",
}

# Dolori e peso corporeo vengono raccolti anche per un po' di tempo prima del
# primo allenamento della finestra: senza questo margine, chi si pesa una volta
# a settimana o ha avuto un fastidio poco prima non porterebbe nessun dato,
# e il modello non avrebbe modo di leggere una tendenza.
MARGINE_CONTESTO = timedelta(days=30)

# Limite di sicurezza sulla lunghezza della cronologia inviata al modello.
MAX_MESSAGGI_STORICI = 40

# Quanti giri di chiamate a strumenti concedere in una singola risposta: senza
# un tetto, un modello che sbaglia ripetutamente uno strumento girerebbe a
# vuoto bruciando quota.
MAX_GIRI_STRUMENTI = 12

# Per quanto tenere buono l'elenco dei modelli di un provider. Interrogarlo
# costa una chiamata di rete per Anthropic e Gemini e una `show()` per modello
# per Ollama: troppo per rifarlo a ogni apertura del menu, poco per rischiare di
# non vedere un modello appena scaricato.
TTL_CATALOGO = 600

# Verbi che segnalano una richiesta di modifica, non una domanda. Servono a
# capire se un turno finito senza chiamate a strumenti ha davvero mancato il
# bersaglio: e' la differenza fra "non ha agito perche' non c'era niente da
# fare" e "gli e' stato chiesto di fare e ha risposto a parole".
VERBI_SCRITTURA = (
    "crea",
    "creare",
    "fammi",
    "fai ",
    "aggiungi",
    "aggiorna",
    "modifica",
    "cambia",
    "elimina",
    "cancella",
    "rimuovi",
    "togli",
    "registra",
    "segna",
    "imposta",
    "duplica",
    "rinomina",
    "correggi",
    "sostituisci",
    "salva",
)

# Che attrezzatura ci sia in casa non sta nel codice: lo scrive l'utente da
# Impostazioni e prende il posto del segnaposto mentre si costruisce il prompt.
ATTREZZATURA_SEGNAPOSTO = "<<ATTREZZATURA>>"

ATTREZZATURA_NOTA = """Attrezzatura a disposizione, come l'ha descritta lei: \
{descrizione}
Non suggerire attrezzi che non compaiono in quella descrizione: dai per scontato \
che non li abbia. Dove il carico non si puo' aumentare, i progressi passano da \
ripetizioni, tempo sotto tensione, controllo dell'esecuzione, densita' e varianti \
piu' difficili, non dal semplice aumento del peso."""

ATTREZZATURA_IGNOTA = """Non sai che attrezzatura abbia: ricavala dal campo \
`attrezzatura` degli esercizi in libreria e nelle schede, e non dare per scontato \
che abbia bilancieri o macchinari. Se ti serve saperlo per rispondere, \
chiediglielo, e ricordagli che puo' scriverla in Impostazioni."""

ISTRUZIONI = """Sei l'assistente di allenamento di una persona che si allena a \
casa. Rispondi alle sue domande basandoti sui dati di allenamento che trovi qui \
sotto, e comportati come un preparatore che conosce la sua storia.

<<ATTREZZATURA>>

Note di lettura dei dati:
- `peso_kg` e' il peso del SINGOLO manubrio; `carichi_per_serie` dice quanti se \
ne impugnano, quindi il carico mosso e' peso_kg x carichi_per_serie.
- Gli esercizi con elastico o a corpo libero non hanno `peso_kg`: si valutano \
sulle ripetizioni. Gli esercizi isometrici come il Plank si misurano in secondi.
- `esercizi_saltati` elenca gli esercizi della scheda dichiarati come non \
svolti in quella seduta. E' diverso da un esercizio semplicemente assente: qui \
la persona ha detto esplicitamente di averlo saltato, a volte con il motivo. \
Se un esercizio viene saltato spesso, e' un segnale da commentare.

Strumenti:
Hai accesso completo all'app tramite gli strumenti: puoi leggere schede, \
libreria esercizi, calendario, record, peso corporeo e diario dolori, e puoi \
anche scrivere — creare e modificare schede, registrare o correggere \
allenamenti, aggiungere esercizi alla libreria, annotare peso e dolori, \
cambiare le preferenze.

Come usarli:
- I dati qui sotto sono solo gli ultimi allenamenti. Per schede, libreria e \
sedute piu' vecchie usa gli strumenti invece di dire che non li vedi.
- Prima di modificare qualcosa, leggi lo stato attuale: ti servono gli id \
(scheda_id, voce_id, sessione_id, serie_id) e ti evita di ricreare roba che \
esiste gia'.
- Fai da solo quello che l'utente ti ha chiesto, senza chiedere conferma a \
ogni passo. Chiedi prima solo se l'azione e' distruttiva (cancellare un \
allenamento o una scheda) o se la richiesta e' ambigua in un modo che \
cambierebbe il risultato.
- Descrivere una modifica non la esegue. Se ti viene chiesta una scheda nuova, \
scrivere l'elenco degli esercizi nella risposta non serve a niente: la scheda \
esiste solo se chiami `crea_scheda`. Vale per tutto — allenamenti, peso, \
dolori, libreria: prima lo strumento, poi il racconto di cosa hai fatto.
- Non inventare dati di allenamento: se non sai un peso o delle ripetizioni, \
chiedili invece di metterci un valore plausibile.
- Dopo aver modificato qualcosa, di' in una riga cosa hai cambiato.

Come rispondere:
- In italiano, in Markdown, con la risposta diretta per prima.
- Cita esercizi, numeri e date concrete presi dai dati. Niente genericita'.
- Tieni le risposte della lunghezza che serve: una domanda semplice merita una \
risposta breve, non un referto.
- Se i dati sono troppo pochi per rispondere, dillo esplicitamente invece di \
inventare una tendenza.
- Se ti segnalano un dolore, incrocialo con gli esercizi svolti nelle sedute \
vicine e di' cosa vedi. Non sei un medico: per dolori seri o persistenti \
consiglia di farsi vedere.

Sei in una conversazione: puoi fare una domanda di chiarimento se serve."""


class AIConfigError(RuntimeError):
    """Nessuna chiave API configurata."""


class AIRequestError(RuntimeError):
    """La chiamata all'API e' fallita o e' stata rifiutata.

    Porta con se' le azioni gia' eseguite prima dell'errore: gli strumenti
    scrivono davvero sul database, quindi rigiocare il turno con un altro
    provider e' sicuro solo se non era ancora stato modificato nulla.
    """

    def __init__(self, messaggio, azioni=None):
        super().__init__(messaggio)
        self.azioni = azioni or []


class AIOllamaSpentoError(AIRequestError):
    """Il server Ollama non risponde.

    Distinta dagli altri errori perche' e' l'unica a cui l'utente puo' rimediare
    da solo: l'interfaccia mostra un pulsante che lo avvia.
    """


class AIQuotaError(AIRequestError):
    """Quota del provider esaurita: si puo' ritentare in locale."""


def _chiave_anthropic():
    return os.environ.get("ANTHROPIC_API_KEY", "").strip()


def _chiave_gemini():
    for nome in ("GEMINI_API_KEY", "GOOGLE_API_KEY", "GEMINI_KEY"):
        valore = os.environ.get(nome, "").strip()
        if valore:
            return valore
    return ""


def _scelta_esplicita():
    """La coppia (provider, modello) scelta dall'interfaccia, o (None, "").

    Sta in `impostazione` nella forma "provider:id_modello". Lo split e' sul
    primo `:` soltanto: i nomi dei modelli Ollama ne contengono uno
    (`qwen3-coder:30b`).

    Letta con la rete di sicurezza per lo stesso motivo di `_modello_scelto()`:
    da qui passa `provider_attivo()`, e quindi il context processor a ogni
    richiesta HTTP.
    """
    try:
        valore = (Impostazione.get("ai_modello") or "").strip()
    except Exception:
        return None, ""
    provider, separatore, modello = valore.partition(":")
    if not separatore or provider not in ETICHETTE_PROVIDER:
        return None, ""
    return provider, modello.strip()


def _modello_anthropic():
    provider, modello = _scelta_esplicita()
    if provider == PROVIDER_ANTHROPIC and modello:
        return modello
    return os.environ.get("ANTHROPIC_MODEL", "").strip() or MODELLO_ANTHROPIC_DEFAULT


def _modello_gemini():
    provider, modello = _scelta_esplicita()
    if provider == PROVIDER_GEMINI and modello:
        return modello
    return os.environ.get("GEMINI_MODEL", "").strip() or MODELLO_GEMINI_DEFAULT


def _modello_scelto():
    """Il modello scelto dalle Impostazioni, o "" se si usa il predefinito.

    Il database qui si legge con la rete di sicurezza: da questa funzione passa
    `provider_attivo()`, e quindi il context processor a ogni richiesta. Un
    errore di database spegnerebbe l'assistente in tutta l'app, mentre
    l'ambiente da solo basta a farla funzionare.
    """
    try:
        return (Impostazione.get("ollama_modello") or "").strip()
    except Exception:
        return ""


def _modello_ollama():
    """Il modello locale da usare: prima la scelta fatta dall'interfaccia.

    `OLLAMA_MODEL` resta il valore predefinito; l'interfaccia lo sovrascrive
    senza riavviare l'app, cosi' si puo' passare al volo da un modello piccolo e
    veloce a uno grande e piu' affidabile con gli strumenti.

    Le scelte sono due perche' rispondono a domande diverse: `ai_modello` dice
    quale modello usare in assoluto, `ollama_modello` quale usare *quando tocca
    a Ollama* — cioe' anche da riserva, mentre a rispondere e' un altro
    provider. La prima vince solo quando punta davvero a Ollama.
    """
    provider, modello = _scelta_esplicita()
    if provider == PROVIDER_OLLAMA and modello:
        return modello
    return _modello_scelto() or os.environ.get("OLLAMA_MODEL", "").strip()


def _host_ollama():
    return os.environ.get("OLLAMA_HOST", "").strip() or HOST_OLLAMA_DEFAULT


def _num_ctx_ollama():
    try:
        return int(os.environ.get("OLLAMA_NUM_CTX", "").strip())
    except ValueError:
        return NUM_CTX_OLLAMA_DEFAULT


def _timeout_ollama():
    """Secondi da concedere a una singola risposta del modello locale.

    Senza un tetto, una generazione impantanata terrebbe occupato il thread di
    Flask a tempo indefinito e la chat resterebbe con i puntini per sempre.
    """
    try:
        return int(os.environ.get("OLLAMA_TIMEOUT", "").strip())
    except ValueError:
        return TIMEOUT_OLLAMA_DEFAULT


def _keep_alive_ollama():
    """Per quanto il modello resta caricato in memoria dopo la risposta.

    Va dichiarato per richiesta: la variabile d'ambiente OLLAMA_KEEP_ALIVE vale
    per tutto il server, e su questa macchina e' impostata a 30 minuti. Tenere
    occupata la VRAM (e parte della RAM) per mezz'ora dopo una domanda in chat
    e' troppo, visto che l'app si usa mentre si fa altro.
    """
    return os.environ.get("OLLAMA_KEEP_ALIVE_CHAT", "").strip() or KEEP_ALIVE_DEFAULT


def _ragiona_ollama():
    """Se lasciare "pensare" il modello locale prima di rispondere.

    Disattivato di default: sui modelli di ragionamento il pensiero puo'
    allungarsi fino a saturare il contesto, e una chat che si blocca per minuti
    e' peggio di una risposta un po' meno ragionata.
    """
    return os.environ.get("OLLAMA_THINK", "").strip() in ("1", "true", "True")


def _provider_configurato(provider):
    """Se un provider e' utilizzabile: ha una chiave, o un modello locale.

    "Configurato" non vuol dire "raggiungibile": che la chiave sia valida o che
    il server locale sia acceso si scopre alla prima chiamata. Qui si guarda
    solo cosa c'e' in `.env` e nelle impostazioni.
    """
    if provider == PROVIDER_ANTHROPIC:
        return bool(_chiave_anthropic())
    if provider == PROVIDER_GEMINI:
        return bool(_chiave_gemini())
    if provider == PROVIDER_OLLAMA:
        return bool(_modello_ollama())
    return False


def _modello_provider(provider):
    if provider == PROVIDER_ANTHROPIC:
        return _modello_anthropic()
    if provider == PROVIDER_GEMINI:
        return _modello_gemini()
    if provider == PROVIDER_OLLAMA:
        return _modello_ollama()
    return None


def _scelta_attiva():
    """La coppia (provider, modello) che rispondera', o (None, None).

    Vince la scelta fatta dall'interfaccia, se il provider che indica e' ancora
    configurato — una chiave tolta da `.env` non deve lasciare l'assistente
    fermo su un provider che non esiste piu'. Senza scelta esplicita vale la
    precedenza storica: Anthropic e' il provider previsto dal progetto, Gemini
    l'alternativa quando quella chiave non c'e', Ollama chiude la fila come
    riserva locale.

    Deve restare una funzione economica: `disponibile()` la chiama a ogni
    richiesta HTTP (context processor in `app.py`), quindi qui si guardano solo
    le variabili d'ambiente e due righe di `impostazione` lette per chiave
    primaria. Ne' il server Ollama ne' le API remote vengono mai interrogati:
    l'elenco dei modelli e' un'altra cosa (vedi `catalogo_modelli`).
    """
    scelto, _ = _scelta_esplicita()
    if scelto and _provider_configurato(scelto):
        return scelto, _modello_provider(scelto)

    for provider in (PROVIDER_ANTHROPIC, PROVIDER_GEMINI, PROVIDER_OLLAMA):
        if _provider_configurato(provider):
            return provider, _modello_provider(provider)
    return None, None


def provider_attivo():
    return _scelta_attiva()[0]


def etichetta_provider():
    return ETICHETTE_PROVIDER.get(provider_attivo())


def modello_attivo():
    return _scelta_attiva()[1]


def chiave_modello_attivo():
    """La scelta attiva nella forma "provider:modello", per i menu."""
    provider, modello = _scelta_attiva()
    if provider is None:
        return ""
    return f"{provider}:{modello}"


def disponibile():
    return provider_attivo() is not None


def modello_riserva():
    """Il modello locale che fa da riserva, se non e' gia' lui il titolare.

    Economica come `provider_attivo()`: legge solo l'ambiente, non tocca il
    server. Serve a dire nell'interfaccia che una riserva c'e', non che sia
    accesa.
    """
    if provider_attivo() in (None, PROVIDER_OLLAMA):
        return None
    return _modello_ollama() or None


# --- Catalogo dei modelli ------------------------------------------------

# {provider: (scadenza, voci)}. In processo e non nel database: e' una copia di
# comodo di un dato che sta altrove, non un'impostazione.
_CACHE_CATALOGO = {}


def svuota_cache_catalogo(provider=None):
    """Butta la cache dell'elenco modelli, tutta o di un provider solo.

    Da chiamare dopo un cambio di modello o quando l'utente chiede
    esplicitamente di rileggere l'elenco: senza, un modello appena scaricato
    resterebbe invisibile fino alla scadenza del TTL.
    """
    if provider is None:
        _CACHE_CATALOGO.clear()
    else:
        _CACHE_CATALOGO.pop(provider, None)


def _dati_modello(oggetto):
    """Un modello restituito da un SDK come dizionario semplice.

    Gli SDK restituiscono oggetti tipizzati che pero' non espongono come
    attributi i campi aggiunti dopo la loro versione. Passando dal dizionario
    si legge anche quello che la libreria installata non conosce ancora.
    """
    for metodo in ("to_dict", "model_dump", "dict"):
        funzione = getattr(oggetto, metodo, None)
        if callable(funzione):
            try:
                return funzione()
            except Exception:
                continue
    return {}


def _modelli_anthropic():
    """I modelli Anthropic a cui la chiave ha accesso, o None se irraggiungibile."""
    if not _chiave_anthropic():
        return []
    try:
        import anthropic

        # Il client va tenuto in una variabile per tutta l'iterazione: l'elenco
        # e' impaginato e lo scorre pagina per pagina: se il client viene
        # raccolto nel frattempo, la connessione si chiude a meta'.
        client = anthropic.Anthropic()
        # Il tetto e' solo una difesa contro un account con un catalogo
        # sterminato.
        elencati = list(client.models.list(limit=100))
    except Exception:
        return None

    voci = []
    for modello in elencati:
        dati = _dati_modello(modello)
        identificativo = dati.get("id") or getattr(modello, "id", None)
        if not identificativo:
            continue
        contesto = dati.get("max_input_tokens")
        voci.append(
            {
                "id": identificativo,
                "etichetta": dati.get("display_name") or identificativo,
                "note": f"{round(contesto / 1000)}k contesto" if contesto else "",
                "strumenti": True,
            }
        )
    return voci


# Fra i modelli che Google elenca ce ne sono parecchi che dichiarano
# `generateContent` ma non servono a conversare: sintesi vocale, immagini,
# musica, robotica, uso del computer. Sceglierne uno in chat darebbe un errore
# solo al primo messaggio, quindi si tolgono qui dal menu.
ESCLUSI_GEMINI = (
    "-tts",
    "image",
    "nano-banana",
    "lyria",
    "robotics",
    "computer-use",
    "embedding",
    "imagen",
    "veo",
)


def _modelli_gemini():
    """I modelli Gemini utilizzabili in chat, o None se irraggiungibile."""
    if not _chiave_gemini():
        return []
    try:
        from google import genai

        # Come per Anthropic: il client deve sopravvivere all'iterazione, o
        # l'elenco si interrompe con "client has been closed" alla seconda
        # pagina.
        client = genai.Client(api_key=_chiave_gemini())
        elencati = list(client.models.list())
    except Exception:
        return None

    voci = []
    for modello in elencati:
        dati = _dati_modello(modello)
        nome = dati.get("name") or getattr(modello, "name", "") or ""
        identificativo = nome.split("/")[-1]
        if not identificativo:
            continue
        if any(escluso in identificativo for escluso in ESCLUSI_GEMINI):
            continue
        # Il campo cambia nome fra le versioni della libreria: se non c'e', il
        # modello si tiene comunque — meglio una voce di troppo che nasconderne
        # una buona per un metadato mancante.
        azioni = dati.get("supported_actions") or dati.get(
            "supported_generation_methods"
        )
        if azioni and "generateContent" not in azioni:
            continue
        voci.append(
            {
                "id": identificativo,
                "etichetta": dati.get("display_name") or identificativo,
                "note": "",
                "strumenti": True,
            }
        )
    return voci


def _modelli_locali():
    """I modelli Ollama utilizzabili, nella forma comune del catalogo."""
    utilizzabili = modelli_utilizzabili_ollama()
    if utilizzabili is None:
        return None
    voci = []
    for modello in utilizzabili:
        note = []
        if modello.get("dimensione_gb"):
            note.append(f"{modello['dimensione_gb']} GB")
        if not modello.get("strumenti"):
            note.append("senza strumenti")
        if modello.get("ragionamento"):
            note.append("ragionamento, sconsigliato")
        voci.append(
            {
                "id": modello["nome"],
                "etichetta": modello["nome"],
                "note": " · ".join(note),
                "strumenti": bool(modello.get("strumenti")),
            }
        )
    return voci


_ELENCHI = {
    PROVIDER_ANTHROPIC: _modelli_anthropic,
    PROVIDER_GEMINI: _modelli_gemini,
    PROVIDER_OLLAMA: _modelli_locali,
}


def _voci_provider(provider):
    """L'elenco di un provider, dalla cache o dal provider stesso.

    None vuol dire "non risponde". Quel caso non si mette in cache: e' una
    condizione temporanea (server locale spento, rete assente) e va ritentata
    subito dopo, non fra dieci minuti.
    """
    scadenza, voci = _CACHE_CATALOGO.get(provider, (0, None))
    if time.monotonic() < scadenza:
        return voci

    voci = _ELENCHI[provider]()
    if voci is None:
        return None
    _CACHE_CATALOGO[provider] = (time.monotonic() + TTL_CATALOGO, voci)
    return voci


def catalogo_modelli():
    """I modelli selezionabili, raggruppati per provider configurato.

    Un provider che non risponde compare lo stesso, con il suo modello
    predefinito e `raggiungibile` a False: poterlo scegliere comunque e' meglio
    che vederlo sparire dal menu per un errore di rete, e l'interfaccia puo'
    dirlo. Costa chiamate di rete: da usare per costruire i menu, mai nel
    percorso di una risposta.
    """
    gruppi = []
    for provider in (PROVIDER_ANTHROPIC, PROVIDER_GEMINI, PROVIDER_OLLAMA):
        if not _provider_configurato(provider):
            continue

        voci = _voci_provider(provider)
        raggiungibile = voci is not None
        voci = [dict(v) for v in voci or []]

        # Il modello in uso deve essere sempre selezionabile, anche quando
        # l'elenco non e' arrivato o non lo contiene (un alias come
        # `gemini-flash-latest` non e' detto che compaia fra i modelli veri).
        predefinito = _modello_provider(provider)
        if predefinito and predefinito not in [v["id"] for v in voci]:
            voci.insert(
                0,
                {
                    "id": predefinito,
                    "etichetta": predefinito,
                    "note": "in uso",
                    "strumenti": True,
                },
            )

        for voce in voci:
            voce["chiave"] = f"{provider}:{voce['id']}"

        gruppi.append(
            {
                "provider": provider,
                "etichetta": ETICHETTE_PROVIDER[provider],
                "raggiungibile": raggiungibile,
                "modelli": voci,
            }
        )
    return gruppi


def chiavi_valide(gruppi=None):
    """Le chiavi "provider:modello" accettabili come scelta."""
    gruppi = catalogo_modelli() if gruppi is None else gruppi
    return {voce["chiave"] for gruppo in gruppi for voce in gruppo["modelli"]}


# --- Costruzione del contesto -------------------------------------------


def _serie_dict(serie):
    dati = {"n": serie.numero_serie}
    if serie.peso_kg is not None:
        dati["peso_kg"] = serie.peso_kg
    if serie.ripetizioni is not None:
        dati["ripetizioni"] = serie.ripetizioni
    if serie.durata_secondi is not None:
        dati["durata_secondi"] = serie.durata_secondi
    if serie.note:
        dati["note"] = serie.note
    if serie.is_pr:
        dati["nuovo_pr"] = True
    return dati


def costruisci_payload(n_sessioni):
    """Raccoglie gli ultimi N allenamenti piu' dolori e peso corporeo."""
    sessioni = stats.sessioni_completate(limite=n_sessioni)
    if not sessioni:
        return None, []

    piu_vecchia = min(s.data for s in sessioni)
    inizio_contesto = piu_vecchia - MARGINE_CONTESTO

    sessioni_json = []
    for sessione in reversed(sessioni):
        per_esercizio = {}
        for serie in sessione.serie:
            voce = per_esercizio.setdefault(
                serie.esercizio.nome,
                {
                    "esercizio": serie.esercizio.nome,
                    "gruppo_muscolare": serie.esercizio.gruppo_muscolare,
                    "tipo_carico": serie.esercizio.tipo_carico,
                    "carichi_per_serie": serie.esercizio.carichi_per_serie,
                    "serie": [],
                },
            )
            voce["serie"].append(_serie_dict(serie))

        voce_sessione = {
            "id": sessione.id,
            "data": sessione.data.isoformat(),
            "scheda": sessione.nome_scheda,
            "durata_minuti": sessione.durata_minuti,
            "stato": {
                "energia_1_5": sessione.energia,
                "sonno_1_5": sessione.sonno,
                "umore_1_5": sessione.umore,
            },
            "note_generali": sessione.note_generali or None,
            "volume_carico_kg": round(sessione.volume_kg, 1),
            "esercizi": list(per_esercizio.values()),
        }
        if sessione.esercizi_saltati:
            voce_sessione["esercizi_saltati"] = [
                {
                    "esercizio": saltato.esercizio.nome,
                    "gruppo_muscolare": saltato.esercizio.gruppo_muscolare,
                    "motivo": saltato.motivo or None,
                }
                for saltato in sessione.esercizi_saltati
            ]
        sessioni_json.append(voce_sessione)

    dolori = (
        db.session.query(NotaDolore)
        .filter(NotaDolore.data >= inizio_contesto)
        .order_by(NotaDolore.data.asc())
        .all()
    )
    pesi = (
        db.session.query(PesoCorporeo)
        .filter(PesoCorporeo.data >= inizio_contesto)
        .order_by(PesoCorporeo.data.asc())
        .all()
    )

    payload = {
        "generato_il": date.today().isoformat(),
        "numero_sessioni": len(sessioni_json),
        "periodo_allenamenti": {
            "dal": piu_vecchia.isoformat(),
            "al": max(s.data for s in sessioni).isoformat(),
        },
        "nota_contesto": (
            "Il diario dolori e il peso corporeo coprono anche i 30 giorni "
            "precedenti al primo allenamento elencato, per dare contesto sulla "
            "tendenza."
        ),
        "sessioni": sessioni_json,
        "diario_dolori": [
            {
                "data": d.data.isoformat(),
                "zona": d.zona_corporea,
                "gravita_1_5": d.gravita,
                "descrizione": d.descrizione,
                "sessione_id": d.sessione_id,
            }
            for d in dolori
        ],
        "peso_corporeo": [
            {"data": p.data.isoformat(), "kg": p.valore_kg, "note": p.note or None}
            for p in pesi
        ],
    }
    return payload, [s.id for s in sessioni]


def _istruzioni():
    """Le istruzioni di sistema, con l'attrezzatura scelta nelle Impostazioni."""
    descrizione = (Impostazione.get("attrezzatura_disponibile") or "").strip()
    blocco = (
        ATTREZZATURA_NOTA.format(descrizione=descrizione)
        if descrizione
        else ATTREZZATURA_IGNOTA
    )
    return ISTRUZIONI.replace(ATTREZZATURA_SEGNAPOSTO, blocco)


def _testo_sistema(payload):
    """Istruzioni + dati di allenamento, in un unico testo."""
    return (
        _istruzioni()
        + "\n\n# Dati di allenamento\n\n```json\n"
        + json.dumps(payload, ensure_ascii=False, indent=2)
        + "\n```"
    )


def _riduci_payload_ollama(payload, num_ctx):
    """Taglia gli allenamenti piu' vecchi finche' il contesto non ci sta.

    Ollama non avvisa quando il prompt supera `num_ctx`: taglia dall'inizio,
    che e' esattamente dove stanno le istruzioni. Il risultato sarebbe un
    modello che non sa piu' cosa deve fare, con i dati intatti. Meglio
    rispondere su meno allenamenti e dirlo: il numero effettivo finisce in
    `n_sessioni_contesto` e viene mostrato sotto la risposta.

    La misura e' una stima sui caratteri, non un conteggio di token: non serve
    la precisione, serve stare lontani dal limite.
    """
    sessioni = payload.get("sessioni")
    if not sessioni:
        return payload

    massimo = int(num_ctx * QUOTA_CONTESTO_OLLAMA * CARATTERI_PER_TOKEN)
    if len(_testo_sistema(payload)) <= massimo:
        return payload

    # Quello che resta alle sessioni una volta pagato il costo fisso:
    # istruzioni, diario dolori e peso corporeo.
    spazio = massimo - len(_testo_sistema(dict(payload, sessioni=[])))

    tenute = []
    for sessione in reversed(sessioni):  # dalla piu' recente all'indietro
        costo = len(json.dumps(sessione, ensure_ascii=False, indent=2))
        # Almeno una sessione va tenuta comunque: senza dati la risposta non
        # varrebbe niente, e il modello preferisce un prompt lungo a un prompt
        # vuoto.
        if tenute and costo > spazio:
            break
        spazio -= costo
        tenute.append(sessione)
    tenute.reverse()

    def con(sessioni_tenute):
        date_tenute = [s["data"] for s in sessioni_tenute]
        return dict(
            payload,
            sessioni=sessioni_tenute,
            numero_sessioni=len(sessioni_tenute),
            periodo_allenamenti={"dal": min(date_tenute), "al": max(date_tenute)},
        )

    # La stima qui sopra misura ogni sessione da sola, mentre dentro il payload
    # ogni riga porta due livelli di rientro in piu': tende quindi a tenerne
    # qualcuna di troppo. L'ultimo taglio si fa sul testo vero.
    ridotto = con(tenute)
    while len(tenute) > 1 and len(_testo_sistema(ridotto)) > massimo:
        tenute = tenute[1:]
        ridotto = con(tenute)
    return ridotto


# --- Conversazioni --------------------------------------------------------


def conversazioni():
    return (
        db.session.query(Conversazione)
        .order_by(Conversazione.data_ultimo_messaggio.desc())
        .all()
    )


def conversazione_corrente():
    """L'ultima conversazione usata, creandone una se non ne esiste nessuna."""
    ultima = (
        db.session.query(Conversazione)
        .order_by(Conversazione.data_ultimo_messaggio.desc())
        .first()
    )
    if ultima is None:
        ultima = nuova_conversazione()
    return ultima


def nuova_conversazione():
    conversazione = Conversazione()
    db.session.add(conversazione)
    db.session.commit()
    return conversazione


def _titolo_da(testo):
    pulito = " ".join(testo.split())
    return pulito[:60] + ("…" if len(pulito) > 60 else "")


def _estrai_testo(risposta):
    parti = [b.text for b in risposta.content if b.type == "text" and b.text]
    return "\n".join(parti).strip()


def _risultato_json(valore):
    """Il risultato di uno strumento come testo, per rispedirlo al modello."""
    return json.dumps(valore, ensure_ascii=False, default=str)


# {modello: parametri}. Le capacita' di un modello non cambiano, quindi si
# chiedono una volta sola per processo.
_CACHE_CAPACITA_ANTHROPIC = {}


def _capacita_anthropic(modello, client):
    """Come costruire la richiesta per questo modello: effort, riserva, tetto.

    I parametri buoni per Claude Opus 5 non valgono per tutti: `effort` non
    esiste sui modelli piu' piccoli e il fallback lato server vale solo per chi
    dichiara dei modelli di riserva. Mandarli a chi non li supporta e' un 400,
    quindi la richiesta si costruisce su quello che l'API dichiara invece che
    su quello che sappiamo del modello predefinito.

    Se l'interrogazione fallisce si torna al minimo comune: una richiesta senza
    fronzoli che ogni modello accetta. Meglio una risposta meno raffinata che
    un errore.
    """
    if modello in _CACHE_CAPACITA_ANTHROPIC:
        return _CACHE_CAPACITA_ANTHROPIC[modello]

    parametri = {"effort": False, "riserva": False, "max_tokens": 8000}
    try:
        dettaglio = client.models.retrieve(
            modello,
            # Senza questa beta l'elenco dei modelli di riserva non viene
            # pubblicato, e il fallback resterebbe spento anche dove esiste.
            extra_headers={"anthropic-beta": "server-side-fallback-2026-06-01"},
        )
    except Exception:
        # Non si mette in cache: puo' essere un problema momentaneo di rete.
        return parametri

    dati = _dati_modello(dettaglio)
    capacita = dati.get("capabilities") or {}
    effort = capacita.get("effort") or {}
    parametri["effort"] = bool((effort.get("high") or {}).get("supported"))
    parametri["riserva"] = bool(dati.get("allowed_fallback_models"))
    # Il tetto e' quello del modello, ma non serve tutto: una risposta in chat
    # non arriva a 128k token, e su Claude Opus 5 il ragionamento attinge dallo
    # stesso budget, quindi un margine largo evita risposte troncate a meta'.
    parametri["max_tokens"] = min(dati.get("max_tokens") or 8000, 16000)

    _CACHE_CAPACITA_ANTHROPIC[modello] = parametri
    return parametri


def _rispondi_anthropic(testo_sistema, messaggi, strumenti):
    try:
        import anthropic
    except ImportError as exc:  # pragma: no cover - dipendenza dichiarata
        raise AIConfigError(
            "Il pacchetto `anthropic` non e' installato: pip install -r requirements.txt"
        ) from exc

    client = anthropic.Anthropic()
    conversazione = [{"role": m["ruolo"], "content": m["testo"]} for m in messaggi]
    strumenti_api = [
        {
            "name": s["nome"],
            "description": s["descrizione"],
            "input_schema": s["schema"],
        }
        for s in strumenti
    ]
    azioni = []
    modello = _modello_anthropic()
    # Chi ha risposto davvero: con il fallback attivo puo' essere un altro
    # modello. Tenuto separato da `modello`, che resta quello richiesto — la
    # richiesta successiva dello stesso turno deve continuare a partire da li',
    # o cambierebbe modello a meta' conversazione buttando la cache.
    servito = modello
    parametri = _capacita_anthropic(modello, client)

    extra = {}
    if parametri["effort"]:
        extra["output_config"] = {"effort": "high"}
    if parametri["riserva"]:
        # Se i filtri di sicurezza rifiutano la richiesta, l'API la rigioca da
        # sola su un modello di riserva invece di restituire un rifiuto.
        extra["betas"] = ["server-side-fallback-2026-07-01"]
        extra["fallbacks"] = "default"

    for _ in range(MAX_GIRI_STRUMENTI):
        try:
            # Streaming lato server con get_final_message(): protegge dai timeout
            # su risposte lunghe senza dover gestire i singoli eventi.
            with client.beta.messages.stream(
                model=modello,
                max_tokens=parametri["max_tokens"],
                # Blocco unico con cache_control: nella stessa conversazione il
                # contesto non cambia, quindi dal secondo messaggio in poi viene
                # letto dalla cache.
                system=[
                    {
                        "type": "text",
                        "text": testo_sistema,
                        "cache_control": {"type": "ephemeral"},
                    }
                ],
                tools=strumenti_api,
                messages=conversazione,
                **extra,
            ) as stream:
                risposta = stream.get_final_message()
        except anthropic.APIStatusError as exc:
            raise AIRequestError(
                f"Errore API ({exc.status_code}): {exc.message}", azioni
            ) from exc
        except anthropic.APIConnectionError as exc:
            raise AIRequestError(
                "Impossibile raggiungere l'API di Anthropic. Controlla la connessione.",
                azioni,
            ) from exc

        # Va controllato prima di leggere `content`: su un rifiuto il contenuto
        # e' vuoto o parziale.
        if risposta.stop_reason == "refusal":
            raise AIRequestError(
                "La richiesta e' stata rifiutata dai filtri di sicurezza del modello.",
                azioni,
            )

        servito = risposta.model or servito
        chiamate = [b for b in risposta.content if b.type == "tool_use"]
        if not chiamate:
            return _estrai_testo(risposta), servito, azioni

        # I blocchi vanno rimandati indietro come sono arrivati (thinking
        # compreso), altrimenti il turno successivo viene rifiutato.
        conversazione.append({"role": "assistant", "content": risposta.content})

        risultati = []
        for chiamata in chiamate:
            risultato, azione, errore = ai_tools.esegui(chiamata.name, chiamata.input)
            if azione:
                azioni.append(azione)
            risultati.append(
                {
                    "type": "tool_result",
                    "tool_use_id": chiamata.id,
                    "content": _risultato_json(
                        {"errore": errore} if errore else risultato
                    ),
                    "is_error": bool(errore),
                }
            )
        conversazione.append({"role": "user", "content": risultati})

    raise AIRequestError(
        "L'assistente ha fatto troppe operazioni di fila senza concludere. "
        "Riprova con una richiesta piu' circoscritta.",
        azioni,
    )


def _rispondi_gemini(testo_sistema, messaggi, strumenti):
    try:
        from google import genai
        from google.genai import errors as genai_errors
        from google.genai import types
    except ImportError as exc:  # pragma: no cover - dipendenza dichiarata
        raise AIConfigError(
            "Il pacchetto `google-genai` non e' installato: "
            "pip install -r requirements.txt"
        ) from exc

    modello = _modello_gemini()
    client = genai.Client(api_key=_chiave_gemini())

    # Gemini chiama "model" il ruolo che Anthropic chiama "assistant".
    contents = [
        types.Content(
            role="model" if m["ruolo"] == RUOLO_ASSISTENTE else "user",
            parts=[types.Part(text=m["testo"])],
        )
        for m in messaggi
    ]

    config = types.GenerateContentConfig(
        system_instruction=testo_sistema,
        max_output_tokens=8000,
        tools=[
            types.Tool(
                function_declarations=[
                    types.FunctionDeclaration(
                        name=s["nome"],
                        description=s["descrizione"],
                        parameters_json_schema=s["schema"],
                    )
                    for s in strumenti
                ]
            )
        ],
        # Gli strumenti li eseguiamo noi nel ciclo qui sotto: senza questo
        # flag la libreria proverebbe a chiamarli da sola.
        automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
    )

    azioni = []
    for _ in range(MAX_GIRI_STRUMENTI):
        try:
            risposta = client.models.generate_content(
                model=modello, contents=contents, config=config
            )
        except genai_errors.ClientError as exc:
            codice = getattr(exc, "code", None)
            if codice == 429:
                raise AIQuotaError(
                    f"Quota Gemini esaurita per il modello «{modello}». Attendi "
                    "qualche minuto, oppure imposta GEMINI_MODEL su un modello "
                    "incluso nel tuo piano.",
                    azioni,
                ) from exc
            if codice == 404:
                raise AIRequestError(
                    f"Il modello «{modello}» non e' disponibile per la tua chiave. "
                    "Cambia GEMINI_MODEL in .env.",
                    azioni,
                ) from exc
            raise AIRequestError(f"Errore Gemini: {exc}", azioni) from exc
        except genai_errors.APIError as exc:
            raise AIRequestError(f"Errore Gemini: {exc}", azioni) from exc

        chiamate = _chiamate_gemini(risposta)
        if not chiamate:
            testo = _testo_gemini(risposta)
            if not testo:
                motivo = _motivo_blocco_gemini(risposta)
                if motivo:
                    raise AIRequestError(motivo, azioni)
            return testo, modello, azioni

        contents.append(
            types.Content(role="model", parts=_parti_gemini(risposta))
        )
        risposte_strumenti = []
        for chiamata in chiamate:
            risultato, azione, errore = ai_tools.esegui(
                chiamata.name, dict(chiamata.args or {})
            )
            if azione:
                azioni.append(azione)
            risposte_strumenti.append(
                types.Part.from_function_response(
                    name=chiamata.name,
                    response={"errore": errore} if errore else {"risultato": risultato},
                )
            )
        contents.append(types.Content(role="user", parts=risposte_strumenti))

    raise AIRequestError(
        "L'assistente ha fatto troppe operazioni di fila senza concludere. "
        "Riprova con una richiesta piu' circoscritta.",
        azioni,
    )


def _modelli_ollama(timeout=2):
    """I modelli installati sul server, o None se non risponde.

    Di ognuno serve anche la dimensione: e' il dato che decide se entra nella
    memoria della scheda video, e arriva gia' dentro la stessa risposta — non
    costa una seconda chiamata.
    """
    try:
        import ollama

        risposta = ollama.Client(host=_host_ollama(), timeout=timeout).list()
    except Exception:
        return None
    modelli = []
    for m in risposta.models:
        dimensione = getattr(m, "size", None)
        modelli.append(
            {
                "nome": m.model,
                # In GB come li conta Ollama (10^9, non 2^30): cosi' il numero
                # mostrato coincide con quello di `ollama list`.
                "dimensione_gb": round(dimensione / 1e9, 1) if dimensione else None,
            }
        )
    return modelli


def _nomi_modelli(modelli):
    return [m["nome"] for m in modelli or []]


def _capacita_ollama(nome, timeout=2):
    """Cosa sa fare un modello secondo Ollama: `completion`, `tools`, ...

    Serve a non proporre come assistente un modello che non e' conversazionale:
    un `nomic-embed-text` scelto per sbaglio darebbe un errore solo al primo
    messaggio in chat. La risposta e' metadato puro, non carica niente in
    memoria.
    """
    try:
        import ollama

        dettaglio = ollama.Client(host=_host_ollama(), timeout=timeout).show(nome)
    except Exception:
        return set()
    return set(getattr(dettaglio, "capabilities", None) or [])


# Famiglie che ragionano e basta: senza il pensiero non sanno fare altro. Qui
# il pensiero e' disattivato di proposito (vedi OLLAMA_THINK), quindi di loro
# resta solo l'ingombro e la lentezza. Vanno distinte dai modelli ibridi come
# qwen3.5, che senza pensiero funzionano benissimo: la capacita' `thinking`
# dichiarata da Ollama non basta, perche' la dichiarano entrambi. Il nome si',
# ed e' lo stesso criterio con cui sono sconsigliate in .env.example.
FAMIGLIE_RAGIONAMENTO = ("deepseek-r1", "qwq", "marco-o1", "openthinker", "phi4-reasoning")


def _e_di_ragionamento(nome):
    minuscolo = nome.lower()
    return any(famiglia in minuscolo for famiglia in FAMIGLIE_RAGIONAMENTO)


def modelli_utilizzabili_ollama(modelli=None):
    """I modelli installati che possono fare da assistente, o None se il server
    non risponde.

    Ognuno con la dimensione — quella che deve entrare nella scheda video — e
    con l'indicazione se regge gli strumenti: senza, l'assistente puo' solo
    rispondere a domande, e le modifiche all'app non le fara' mai.

    `modelli` evita di richiedere l'elenco a chi ce l'ha gia' in mano.
    """
    if modelli is None:
        modelli = _modelli_ollama()
    if modelli is None:
        return None

    utilizzabili = []
    for modello in modelli:
        capacita = _capacita_ollama(modello["nome"])
        # Un server che non risponde a `show` lascia l'insieme vuoto: in quel
        # caso il modello si tiene comunque, meglio proporne uno in piu' che
        # nasconderne uno buono per un metadato mancante.
        if capacita and "completion" not in capacita:
            continue
        utilizzabili.append(
            dict(
                modello,
                strumenti="tools" in capacita,
                ragionamento=_e_di_ragionamento(modello["nome"]),
            )
        )
    return utilizzabili


def ollama_attivo():
    return _modelli_ollama() is not None


def modello_ollama():
    """Il modello locale attivo, qualunque sia il provider in uso."""
    return _modello_ollama()


def scarica_modello_ollama(modello):
    """Toglie subito dalla memoria un modello caricato. Best-effort.

    E' quello che fa `ollama stop`: una richiesta con keep_alive a zero. Serve
    al cambio di modello dalle Impostazioni — senza, il precedente resterebbe a
    occupare la scheda video per tutto il keep_alive del server (mezz'ora, su
    questa macchina) pur non servendo piu' a nessuno.

    Non solleva mai: se il server e' spento o il modello non era caricato, non
    c'e' niente da liberare e il salvataggio deve andare avanti lo stesso.
    """
    if not modello:
        return
    try:
        import ollama

        ollama.Client(host=_host_ollama(), timeout=5).generate(
            model=modello, keep_alive=0
        )
    except Exception:
        pass


def stato_ollama():
    """Fotografia del provider locale, per mostrarla nelle impostazioni.

    Interroga il server (timeout basso) ma non carica nessun modello: elencare
    i modelli installati non costa memoria. Da non chiamare a ogni richiesta
    HTTP — `disponibile()` resta la funzione economica per quello.
    """
    modello = _modello_ollama()
    stato = {
        "configurato": bool(modello),
        "modello": modello,
        "host": _host_ollama(),
        "server_attivo": False,
        "modello_presente": False,
        "modelli_disponibili": [],
        # Da dove viene il modello attivo: al selettore serve distinguere "sto
        # usando il predefinito di .env" da "l'ho scelto io".
        "modello_scelto": _modello_scelto(),
        "modello_predefinito": os.environ.get("OLLAMA_MODEL", "").strip(),
        # I tre limiti che decidono quanta memoria e quanto tempo si spende:
        # vale la pena averli sotto gli occhi accanto allo stato.
        "keep_alive": _keep_alive_ollama(),
        "timeout": _timeout_ollama(),
        "num_ctx": _num_ctx_ollama(),
    }
    if not modello:
        return stato

    modelli = _modelli_ollama()
    if modelli is None:
        return stato

    stato["server_attivo"] = True
    stato["modello_presente"] = modello in _nomi_modelli(modelli)
    # Nell'elenco vanno solo quelli che possono davvero fare da assistente: e'
    # una lista da cui si sceglie, non l'inventario di `ollama list`.
    stato["modelli_disponibili"] = modelli_utilizzabili_ollama(modelli) or []
    return stato


def _eseguibile_ollama():
    """Dove sta `ollama.exe`. `OLLAMA_EXE` ha la precedenza su tutto."""
    indicato = os.environ.get("OLLAMA_EXE", "").strip()
    if indicato:
        return indicato if os.path.isfile(indicato) else None

    trovato = shutil.which("ollama")
    if trovato:
        return trovato

    # Percorso dell'installer ufficiale su Windows: `ollama` non finisce nel
    # PATH dei processi avviati prima dell'installazione.
    locale = os.environ.get("LOCALAPPDATA")
    if locale:
        standard = os.path.join(locale, "Programs", "Ollama", "ollama.exe")
        if os.path.isfile(standard):
            return standard
    return None


def avvia_ollama(attesa_massima=40):
    """Avvia il server Ollama e aspetta che risponda.

    Restituisce (ok, messaggio). Lancia `ollama serve` direttamente invece
    dell'app con l'icona nella tray: quest'ultima, almeno fino alla 0.32.7, ogni
    tanto non riesce ad avviare il server e resta li' senza dirlo.
    """
    modelli = _modelli_ollama()
    if modelli is not None:
        return True, "Ollama era gia' in esecuzione."

    eseguibile = _eseguibile_ollama()
    if eseguibile is None:
        return False, (
            "Non trovo `ollama.exe`. Installalo, oppure indica il percorso "
            "con OLLAMA_EXE in .env."
        )

    try:
        # Il server deve sopravvivere a questa richiesta HTTP, quindi va
        # staccato dal processo Flask: senza DETACHED_PROCESS morirebbe con lui.
        # (DETACHED_PROCESS gia' evita la finestra di console: CREATE_NO_WINDOW
        # insieme a questo verrebbe ignorato.)
        opzioni = {}
        if os.name == "nt":
            opzioni["creationflags"] = subprocess.DETACHED_PROCESS
        subprocess.Popen(
            [eseguibile, "serve"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            **opzioni,
        )
    except OSError as exc:
        return False, f"Avvio di Ollama non riuscito: {exc}"

    scadenza = time.monotonic() + attesa_massima
    while time.monotonic() < scadenza:
        modelli = _modelli_ollama()
        if modelli is not None:
            break
        time.sleep(1)
    else:
        return False, (
            f"Ollama e' stato avviato ma non risponde entro {attesa_massima} "
            "secondi. Controlla %LOCALAPPDATA%\\Ollama\\server.log."
        )

    # Il server puo' rispondere pur non vedendo i modelli: succede quando viene
    # avviato senza OLLAMA_MODELS e cerca nel percorso predefinito invece che
    # dove stanno davvero. Meglio dirlo subito che far fallire la chat dopo.
    modello = _modello_ollama()
    nomi = _nomi_modelli(modelli)
    if modello and modello not in nomi:
        disponibili = ", ".join(nomi) if nomi else "nessuno"
        return False, (
            f"Ollama risponde ma non trova il modello «{modello}» "
            f"(disponibili: {disponibili}). O il modello non e' stato scaricato "
            f"(`ollama pull {modello}`), oppure il server sta cercando nella "
            "cartella sbagliata: deve vedere la variabile d'ambiente "
            "OLLAMA_MODELS. Se e' stato avviato a mano da un terminale aperto "
            "prima che la variabile fosse impostata, chiudilo e riprova da qui."
        )

    # "Pronto" vuol dire che il modello c'e', non che sia gia' in memoria: il
    # primo caricamento dal disco puo' valere piu' di un minuto sui modelli
    # grandi, e senza avviso sembra che la chat si sia piantata.
    return True, (
        f"Ollama avviato con «{modello}». La prima risposta puo' richiedere "
        "un minuto: il modello va caricato in memoria."
    )


def _chiede_una_modifica(messaggi):
    """Se l'ultima richiesta dell'utente era di fare qualcosa, non di sapere.

    Euristica dichiaratamente grossolana: serve solo a decidere se vale la pena
    spendere una generazione in piu' per sollecitare un modello che ha risposto
    a parole. Un falso positivo costa un giro, un falso negativo lascia le cose
    come stanno oggi.
    """
    for messaggio in reversed(messaggi):
        if messaggio["ruolo"] != RUOLO_UTENTE:
            continue
        testo = messaggio["testo"].lower()
        return any(verbo in testo for verbo in VERBI_SCRITTURA)
    return False


SOLLECITO_STRUMENTI = (
    "Non hai chiamato nessuno strumento, quindi nell'app non e' cambiato "
    "niente. Se la richiesta comportava una modifica ai dati, eseguila ora "
    "chiamando gli strumenti (crea_scheda, aggiorna_scheda, "
    "aggiungi_esercizio_a_scheda, registra_allenamento...). Non riscrivere la "
    "modifica a parole: falla. Se invece non c'era niente da modificare, "
    "ripeti la risposta di prima."
)


def _rispondi_ollama(testo_sistema, messaggi, strumenti):
    """Un turno con il modello locale.

    Restituisce (testo, modello, azioni, avviso). L'avviso e' valorizzato
    quando il turno e' andato a buon fine ma il risultato non e' quello che
    l'utente aveva chiesto — tipicamente una modifica raccontata invece che
    eseguita: senza, resterebbe indistinguibile da una risposta riuscita.
    """
    try:
        import ollama
    except ImportError as exc:  # pragma: no cover - dipendenza dichiarata
        raise AIConfigError(
            "Il pacchetto `ollama` non e' installato: pip install -r requirements.txt"
        ) from exc

    import httpx  # dipendenza di `ollama`: e' da qui che arrivano rete e timeout

    modello = _modello_ollama()
    host = _host_ollama()
    timeout = _timeout_ollama()
    client = ollama.Client(host=host, timeout=timeout)

    # Ollama non ha un campo `system` separato: le istruzioni sono il primo
    # messaggio della conversazione.
    conversazione = [{"role": "system", "content": testo_sistema}]
    conversazione += [
        {
            "role": "assistant" if m["ruolo"] == RUOLO_ASSISTENTE else "user",
            "content": m["testo"],
        }
        for m in messaggi
    ]

    strumenti_api = [
        {
            "type": "function",
            "function": {
                "name": s["nome"],
                "description": s["descrizione"],
                "parameters": s["schema"],
            },
        }
        for s in strumenti
    ]

    azioni = []
    sollecitato = False
    for _ in range(MAX_GIRI_STRUMENTI):
        try:
            risposta = client.chat(
                model=modello,
                messages=conversazione,
                tools=strumenti_api,
                think=_ragiona_ollama(),
                keep_alive=_keep_alive_ollama(),
                options={"num_ctx": _num_ctx_ollama()},
            )
        except ollama.ResponseError as exc:
            if getattr(exc, "status_code", None) == 404:
                raise AIRequestError(
                    f"Il modello «{modello}» non e' installato in Ollama: "
                    f"esegui `ollama pull {modello}`.",
                    azioni,
                ) from exc
            raise AIRequestError(f"Errore Ollama: {exc}", azioni) from exc
        except ConnectionError as exc:
            # La libreria traduce httpx.ConnectError in ConnectionError: e' il
            # server spento, l'unico caso a cui l'utente puo' rimediare da solo.
            raise AIOllamaSpentoError(
                f"Ollama non risponde su {host}.", azioni
            ) from exc
        except httpx.TimeoutException as exc:
            raise AIRequestError(
                f"Il modello locale «{modello}» non ha risposto entro "
                f"{timeout} secondi. Di solito vuol dire che e' troppo grande "
                "per la scheda video e sta girando sulla CPU, oppure che il "
                "contesto e' troppo ampio: riduci il numero di allenamenti, "
                "usa un modello piu' piccolo o alza OLLAMA_TIMEOUT.",
                azioni,
            ) from exc

        messaggio = risposta.message
        chiamate = messaggio.tool_calls or []
        if not chiamate:
            testo = (messaggio.content or "").strip()

            # I modelli piccoli sbagliano soprattutto qui: gli si chiede di
            # creare una scheda e la scrivono nella risposta invece di chiamare
            # `crea_scheda`. Un sollecito esplicito li recupera spesso, e costa
            # una generazione sola — quindi si tenta una volta, e solo quando
            # c'era davvero qualcosa da fare.
            if not azioni and not sollecitato and _chiede_una_modifica(messaggi):
                sollecitato = True
                conversazione.append({"role": "assistant", "content": testo})
                conversazione.append({"role": "user", "content": SOLLECITO_STRUMENTI})
                continue

            avviso = None
            if sollecitato and not azioni:
                avviso = (
                    f"Il modello locale «{modello}» non ha eseguito nessuna "
                    "modifica: ha solo descritto cosa farebbe. Prova a "
                    "riformulare la richiesta o a scegliere un modello piu' "
                    "affidabile con gli strumenti."
                )
            return testo, modello, azioni, avviso

        # Il messaggio dell'assistente va riaccodato com'e' arrivato, altrimenti
        # il modello non ritrova le chiamate a cui i risultati si riferiscono.
        conversazione.append(messaggio)

        for chiamata in chiamate:
            risultato, azione, errore = ai_tools.esegui(
                chiamata.function.name, dict(chiamata.function.arguments or {})
            )
            if azione:
                azioni.append(azione)
            conversazione.append(
                {
                    "role": "tool",
                    "tool_name": chiamata.function.name,
                    "content": _risultato_json(
                        {"errore": errore} if errore else risultato
                    ),
                }
            )

    raise AIRequestError(
        "L'assistente ha fatto troppe operazioni di fila senza concludere. "
        "Riprova con una richiesta piu' circoscritta.",
        azioni,
    )


def _turno_ollama(payload, messaggi, strumenti):
    """Un turno con il modello locale, col contesto tagliato su misura.

    Restituisce anche il payload davvero inviato: e' da li' che esce il numero
    di allenamenti mostrato sotto la risposta, e deve dire quanti ne ha visti
    il modello, non quanti ne erano stati chiesti.
    """
    payload = _riduci_payload_ollama(payload, _num_ctx_ollama())
    testo, modello, azioni, avviso = _rispondi_ollama(
        _testo_sistema(payload), messaggi, strumenti
    )
    return payload, testo, modello, azioni, avviso


def _parti_gemini(risposta):
    for candidato in risposta.candidates or []:
        contenuto = getattr(candidato, "content", None)
        parti = getattr(contenuto, "parts", None)
        if parti:
            return list(parti)
    return []


def _chiamate_gemini(risposta):
    return [
        parte.function_call
        for parte in _parti_gemini(risposta)
        if getattr(parte, "function_call", None)
    ]


def _testo_gemini(risposta):
    """Concatena le parti testuali, senza affidarsi a `.text`.

    `.text` restituisce None (con warning) quando la risposta e' stata
    bloccata o non contiene parti di testo.
    """
    pezzi = []
    for candidato in risposta.candidates or []:
        contenuto = getattr(candidato, "content", None)
        for parte in getattr(contenuto, "parts", None) or []:
            if getattr(parte, "text", None):
                pezzi.append(parte.text)
    return "\n".join(pezzi).strip()


def _motivo_blocco_gemini(risposta):
    feedback = getattr(risposta, "prompt_feedback", None)
    if feedback is not None and getattr(feedback, "block_reason", None):
        return (
            "Gemini ha bloccato la richiesta "
            f"({feedback.block_reason}). Riformula la domanda."
        )
    for candidato in risposta.candidates or []:
        motivo = str(getattr(candidato, "finish_reason", "") or "")
        if "SAFETY" in motivo:
            return "Gemini ha bloccato la risposta per motivi di sicurezza."
        if "MAX_TOKENS" in motivo:
            return (
                "La risposta e' stata troncata prima di produrre testo: prova a "
                "fare una domanda piu' circoscritta."
            )
    return None


def rispondi(conversazione, domanda, n_sessioni, sostituisci_da=None):
    """Aggiunge la domanda alla conversazione e salva la risposta del modello.

    Solleva `AIConfigError` se non c'e' nessuna chiave e `AIRequestError` se la
    chiamata fallisce; in quel caso la domanda non viene salvata, cosi' l'utente
    puo' semplicemente riprovare.

    `sostituisci_da` e' l'id del primo messaggio da rimpiazzare: serve a
    correggere un messaggio gia' inviato. Quei messaggi vengono esclusi dalla
    cronologia mandata al modello e cancellati **solo a risposta ottenuta**,
    nella stessa transazione che salva quella nuova. L'ordine conta: cancellare
    prima vorrebbe dire che una chiamata fallita — un timeout del modello
    locale, per dirne una — lascia l'utente senza il vecchio messaggio e senza
    il nuovo.
    """
    domanda = (domanda or "").strip()
    if not domanda:
        raise AIRequestError("Scrivi un messaggio.")

    provider = provider_attivo()
    if provider is None:
        raise AIConfigError(
            "Nessuna chiave API configurata. Copia .env.example in .env e "
            "inserisci ANTHROPIC_API_KEY oppure GEMINI_API_KEY."
        )

    payload, _ = costruisci_payload(n_sessioni)
    if payload is None:
        payload = {
            "numero_sessioni": 0,
            "nota": "Nessun allenamento completato: non ci sono ancora dati.",
        }

    # I messaggi che stiamo sostituendo non fanno parte della cronologia: il
    # modello deve vedere la conversazione come sara' dopo la correzione, non
    # com'era prima.
    da_sostituire = [
        m
        for m in conversazione.messaggi
        if sostituisci_da is not None and m.id >= sostituisci_da
    ]
    precedenti = [m for m in conversazione.messaggi if m not in da_sostituire]

    messaggi = [
        {"ruolo": m.ruolo, "testo": m.contenuto}
        for m in precedenti[-MAX_MESSAGGI_STORICI:]
    ]
    messaggi.append({"ruolo": RUOLO_UTENTE, "testo": domanda})

    strumenti = ai_tools.definizioni()
    avviso = None
    if provider == PROVIDER_ANTHROPIC:
        testo, modello, azioni = _rispondi_anthropic(
            _testo_sistema(payload), messaggi, strumenti
        )
    elif provider == PROVIDER_GEMINI:
        try:
            testo, modello, azioni = _rispondi_gemini(
                _testo_sistema(payload), messaggi, strumenti
            )
        except AIRequestError as exc:
            # Quando il provider remoto non risponde il turno si rigioca in
            # locale, ma solo se non aveva ancora scritto niente: ripartire da
            # capo dopo una scrittura la duplicherebbe.
            if not _modello_ollama() or exc.azioni:
                raise
            try:
                payload, testo, modello, azioni, avviso = _turno_ollama(
                    payload, messaggi, strumenti
                )
                # Il cambio di modello va detto. Restava visibile solo nel nome
                # sotto la risposta, ed e' una differenza che conta: il modello
                # locale e' meno capace e piu' incerto con gli strumenti.
                avviso = " ".join(
                    filter(
                        None,
                        [
                            f"{ETICHETTE_PROVIDER[PROVIDER_GEMINI]} non ha "
                            f"risposto ({exc}): ha risposto il modello locale "
                            f"«{modello}».",
                            avviso,
                        ],
                    )
                )
            except AIRequestError as locale:
                # Il fallimento vero e' il primo: il secondo dice solo perche'
                # non si e' potuto rimediare, e i due messaggi vanno insieme.
                # Il tipo pero' e' quello del secondo quando e' il server locale
                # spento: e' la sola condizione a cui l'utente puo' rimediare,
                # e l'interfaccia ci attacca il pulsante di avvio.
                spento = isinstance(locale, AIOllamaSpentoError)
                tipo = type(locale) if spento else type(exc)
                raise tipo(
                    f"{exc} — riserva locale non disponibile: {locale}"
                ) from locale
    else:
        payload, testo, modello, azioni, avviso = _turno_ollama(
            payload, messaggi, strumenti
        )

    if not testo and not azioni:
        raise AIRequestError("Il modello ha restituito una risposta vuota.")
    if not testo:
        # Ha fatto il lavoro ma non l'ha raccontato: meglio una riga di
        # riepilogo che una bolla vuota.
        testo = "Fatto:\n" + "\n".join(f"- {a}" for a in azioni)

    # Da qui in poi si scrive: la risposta c'e', quindi la sostituzione puo'
    # avvenire senza rischiare di lasciare un buco.
    adesso = datetime.now()
    for vecchio in da_sostituire:
        db.session.delete(vecchio)

    db.session.add(
        MessaggioChat(
            conversazione_id=conversazione.id,
            ruolo=RUOLO_UTENTE,
            contenuto=domanda,
            data=adesso,
        )
    )
    messaggio_ai = MessaggioChat(
        conversazione_id=conversazione.id,
        ruolo=RUOLO_ASSISTENTE,
        contenuto=testo,
        data=adesso,
        n_sessioni_contesto=payload.get("numero_sessioni"),
        modello=modello,
        # Le modifiche fatte restano allegate al messaggio: rileggendo la
        # conversazione mesi dopo si vede ancora cosa aveva cambiato.
        azioni=json.dumps(azioni, ensure_ascii=False) if azioni else None,
        avviso=avviso,
    )
    db.session.add(messaggio_ai)

    # Il titolo viene dalla prima domanda: se e' proprio quella a essere stata
    # corretta, va rifatto anche lui.
    if not precedenti or conversazione.titolo == "Nuova conversazione":
        conversazione.titolo = _titolo_da(domanda)
    conversazione.data_ultimo_messaggio = adesso

    db.session.commit()
    return messaggio_ai
