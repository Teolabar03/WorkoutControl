"""Blueprint dell'API JSON (`/api/*`) consumata dal frontend React.

Ogni modulo qui dentro registra un blueprint con url_prefix già sotto
`/api`; `register_all(app)` li registra tutti in un colpo solo da `app.py`.
I moduli vengono importati dentro la funzione (non in cima al file) perché
durante la Fase 1 vengono aggiunti uno alla volta.
"""


def register_all(app):
    from . import (
        auth,
        calendario,
        chat,
        context,
        diario,
        impostazioni,
        peso,
        schede,
        sessione,
        statistiche,
    )

    app.register_blueprint(auth.bp)
    app.register_blueprint(schede.bp)
    app.register_blueprint(calendario.bp)
    app.register_blueprint(peso.bp)
    app.register_blueprint(diario.bp)
    app.register_blueprint(statistiche.bp)
    app.register_blueprint(statistiche.bp_pr)
    app.register_blueprint(sessione.bp)
    app.register_blueprint(impostazioni.bp)
    app.register_blueprint(chat.bp)
    app.register_blueprint(context.bp)
