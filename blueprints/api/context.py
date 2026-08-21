"""Bootstrap dell'app React: sostituisce il context_processor Jinja globale
che iniettava `sessione_corrente`, `oggi` e `ai_disponibile` in ogni pagina.
"""

from datetime import date

from flask import Blueprint

from schemas import api_ok
from serializers import serialize_sessione
from services import ai, salute

from .sessione import sessione_in_corso

bp = Blueprint("api_context", __name__, url_prefix="/api")


@bp.get("/context")
def context_route():
    in_corso = sessione_in_corso()
    return api_ok(
        {
            "sessione_corrente": serialize_sessione(in_corso) if in_corso else None,
            "oggi": date.today().isoformat(),
            "ai_disponibile": ai.disponibile(),
            # Finche' dal telefono non e' mai arrivato niente, la sezione
            # Salute non esiste per l'app: stessa logica di ai_disponibile,
            # che fa sparire l'assistente quando non c'e' un provider.
            "salute_collegata": salute.ci_sono_dati(),
        }
    )
