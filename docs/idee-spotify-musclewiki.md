# Idee: Spotify e MuscleWiki

Appunti del 5 ottobre 2026, nulla e' ancora implementato. Le regole di Spotify e
MuscleWiki cambiano spesso: ricontrollale prima di iniziare.

## 1. Spotify

### Vincoli di Spotify (stato a ottobre 2026)

- **Development Mode**: massimo **5 utenti**, aggiunti a mano in *Settings → User
  Management* della dashboard. L'Extended Quota Mode e' riservata alle aziende.
- Chi possiede l'app sviluppatore deve avere **Premium**, altrimenti l'app non funziona.
- I comandi di riproduzione (`/v1/me/player/*`: play, pausa, avanti, indietro,
  volume) e il Web Playback SDK richiedono **Premium** anche per chi li usa.
  Con un account gratuito la risposta e' 403.
- Dal 27/11/2024 le app nuove non hanno piu' le anteprime da 30 secondi
  (`preview_url` e' nullo), ne' `recommendations`, `audio-features` e `related-artists`.
- **Redirect URI**:
  - va scritto identico a quello registrato, carattere per carattere;
  - deve essere HTTPS;
  - `localhost` non e' accettato, in locale si usa `http://127.0.0.1:<porta>/`;
  - un IP pubblico nudo non va bene, quindi l'istanza sulla VPS da browser
    richiederebbe un dominio vero;
  - nell'APK si puo' usare uno schema dell'app (es. `workoutcontrol://spotify`),
    con un intent-filter in `AndroidManifest.xml`.
- Flusso di login: **Authorization Code con PKCE**, che non mette nessun client
  secret ne' sul server ne' nell'APK.

### Codice gia' pronto da riusare: `../Game_SongGuesser`

Il gioco musicale in `Sviluppo/Altro/Game_SongGuesser` (React + TS + Vite, lo
stesso stack del frontend) ha gia' tutto il pezzo Spotify:

| File | Cosa contiene |
|---|---|
| `src/auth/pkce.ts` | verifier, challenge e state del PKCE |
| `src/auth/spotifyAuth.ts` | `beginLogin`, scambio del codice, refresh del token |
| `src/auth/tokenStore.ts`, `src/auth/useAuth.ts` | dove si salvano i token e l'hook React per usarli |
| `src/api/spotifyClient.ts` | `spotifyFetch` con il token e la gestione degli errori |
| `src/api/player.ts` | `play` su un dispositivo, `transferPlayback` |
| `src/api/playlists.ts`, `src/api/user.ts` | playlist e profilo dell'utente |
| `src/audio/useSpotifyPlayer.ts` | Web Playback SDK |
| `src/config.ts` | client ID da `.env` (`VITE_SPOTIFY_CLIENT_ID`), redirect URI, scope |
| `README.md` | come registrare l'app nella dashboard |

Nel gioco le chiavi in `sessionStorage`/`localStorage` hanno il prefisso `sg:`:
vanno rinominate. Per questo uso bastano gli scope `user-read-playback-state`,
`user-modify-playback-state`, `playlist-read-private`. `streaming` serve solo al
Web Playback SDK.

### Opzioni, dalla piu' semplice

1. **Tasti multimediali, solo nell'APK (consigliata come primo passo).**
   - Un plugin Capacitor, sul modello di `SuoniNotificaPlugin.java`, che chiama
     `AudioManager.dispatchMediaKeyEvent` con `KEYCODE_MEDIA_PLAY_PAUSE`,
     `KEYCODE_MEDIA_NEXT` e `KEYCODE_MEDIA_PREVIOUS`.
   - Comanda qualunque app stia suonando (Spotify, YouTube Music...).
   - Non servono account sviluppatore, Premium o login.
   - Pulsanti nella sessione attiva; nel browser vanno nascosti, perche' da li'
     non funziona.
2. **API Spotify nell'APK.**
   - Brano in corso con copertina, comandi, scelta di una playlist,
     eventualmente una playlist associata alla scheda.
   - Si riusa il codice di SongGuesser; il redirect e' lo schema dell'app.
   - Il token resta sul dispositivo; il server Flask non ha bisogno di toccarlo.
3. **Web Playback SDK** (la musica suona dentro la webapp): sconsigliata.
   - Richiede HTTPS con un dominio.
   - Si interrompe con lo schermo spento.
   - Va in conflitto con l'audio del timer di recupero.

## 2. MuscleWiki

- Esiste un'**API ufficiale a pagamento** su api.musclewiki.com. Secondo una
  ricerca fatta il 5/10/2026 il piano gratuito e' solo di prova e quelli a
  pagamento partono da circa 30 $/mese: **prezzi da verificare** sul sito.
- I video si possono solo riprodurre dai loro link: non si possono scaricare,
  salvare sul server o ripubblicare.
- **Leggere i dati dal sito in automatico (scraping) e' vietato** dai termini d'uso.

### Opzioni

1. **Link per esercizio (consigliata).**
   - Un campo `link_guida` in `EsercizioLibreria`, con migrazione all'avvio come
     le altre colonne.
   - Un pulsante "Vedi su MuscleWiki" nella libreria, nella scheda e nella
     sessione attiva, che apre la pagina esterna.
   - Gratis e lecito. Per la libreria di base i link li compila `seed.py`, per
     gli esercizi custom li inserisce l'utente.
2. **Immagini da [free-exercise-db](https://github.com/yuhonas/free-exercise-db).**
   - Oltre 800 esercizi con foto, licenza Unlicense (dominio pubblico).
   - Si possono salvare nel progetto e funzionano offline.
   - Bisogna abbinarle a mano agli esercizi della libreria (nomi in inglese).
   - Alternativa: [wger](https://github.com/wger-project/wger), con dati in
     CC-BY-SA che obbligano a citare la fonte.
3. **API MuscleWiki a pagamento**: ha senso solo se si vogliono i loro video
   dentro l'app e va bene l'abbonamento.
   - ExerciseDB su RapidAPI ha un problema simile: e' proprietaria e a
     pagamento per un uso reale.

## Ordine proposto

1. Link MuscleWiki per esercizio: poco lavoro, utile subito.
2. Tasti multimediali nell'APK.
3. Eventualmente l'API Spotify riusando SongGuesser, e le immagini di
   free-exercise-db.
