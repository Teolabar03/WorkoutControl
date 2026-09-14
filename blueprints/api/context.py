"""Bootstrap dell'app React: sostituisce il context_processor Jinja globale
che iniettava `sessione_corrente`, `oggi` e `ai_disponibile` in ogni pagina.
"""

from datetime import date

from flask import Blueprint, g

from schemas import api_ok
from serializers import serialize_sessione
from services import ai, salute

from .sessione import sessione_in_corso

bp = Blueprint("api_context", __name__, url_prefix="/api")


@bp.get("/context")
def context_route():
    in_corso = sessione_in_corso()
    ai_configurato = ai.disponibile()
    return api_ok(
        {
            "sessione_corrente": serialize_sessione(in_corso) if in_corso else None,
            "oggi": date.today().isoformat(),
            "ai_disponibile": ai_configurato and g.utente.usa_assistente,
            # Distinto da ai_disponibile: separa "manca la chiave sul server"
            # da "questa utenza non ha l'assistente", che l'interfaccia spiega
            # in modo diverso.
            "ai_configurato": ai_configurato,
            # Finche' dal telefono non e' mai arrivato niente, la sezione
            # Salute non esiste per l'app: stessa logica di ai_disponibile,
            # che fa sparire l'assistente quando non c'e' un provider.
            "salute_collegata": salute.ci_sono_dati(),
            "nutrizione_disponibile": salute.ci_sono_pasti(),
        }
    )
