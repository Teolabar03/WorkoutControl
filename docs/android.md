# Android e aggiornamenti

L'APK è un client: richiede un'installazione del backend raggiungibile in
HTTPS con certificato valido. Al primo avvio inserisci l'indirizzo completo
del tuo server, compreso l'eventuale prefisso. L'APK non include il database
e non avvia Python sul telefono. Per un server locale HTTP usa il browser;
per l'APK configura prima HTTPS.

## Build locale

Servono Node.js 22.12+, JDK 21 e Android SDK (o Android Studio).

```sh
cd frontend
npm ci
npm run build
cd ../mobile
npm ci
npx cap sync android
cd android
```

Su Windows esegui `gradlew.bat assembleDebug`; su Linux/macOS
`chmod +x gradlew && ./gradlew assembleDebug`. L'APK è in
`mobile/android/app/build/outputs/apk/debug/`.

Gli aggiornamenti automatici sono disabilitati nelle build locali senza
`VITE_UPDATE_REPOSITORY` e `VITE_UPDATE_PUBLIC_KEY`. Un fork non eredita quindi
gli aggiornamenti del progetto originale. Per distribuirlo come app distinta
cambia anche l'application ID e usa una tua chiave di firma Android.

## Pubblicare dal proprio repository

La CI `.github/workflows/android.yml` produce APK firmato, bundle web e manifest.
Configura in GitHub Settings → Secrets and variables → Actions:

| Tipo | Nome | Valore |
|---|---|---|
| Secret | `ANDROID_KEYSTORE` | Keystore Android codificato base64 |
| Secret | `ANDROID_KEYSTORE_PASS` | Password del keystore e della chiave |
| Secret | `ANDROID_KEY_ALIAS` | Alias della chiave nel keystore |
| Variable | `ANDROID_CERT_SHA256` | Impronta SHA-256 del certificato Android, ottenuta con `keytool -list -v` |
| Secret | `UPDATE_SIGNING_KEY` | Chiave privata RSA PEM, almeno 2048 bit, dedicata ai manifest |
| Variable | `UPDATE_PUBLIC_KEY` | Chiave pubblica corrispondente, formato DER/SPKI codificato base64 |

Con OpenSSL, in una cartella privata esterna al repository:

```sh
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:3072 -out update-signing.pem
openssl pkey -in update-signing.pem -pubout -outform DER -out update-public.der
openssl base64 -A -in update-public.der -out update-public.base64
```

Conserva un backup privato del keystore, delle password e della chiave RSA.
Non inserirli nel repository. La chiave pubblica e l'impronta non sono segreti.
La CI ricava il repository da `github.repository` e include solo la chiave
pubblica nella build. Senza configurazione interrompe la pubblicazione.

Il client verifica firma del manifest, repository e URL consentiti, SHA-256
del bundle, versione crescente e versione minima dell'APK. La firma protegge
il manifest anche se un asset viene sostituito senza la chiave privata;
non protegge dalla compromissione dell'intera CI che custodisce la chiave.

Prima di introdurre un nuovo plugin o altra modifica nativa, aumenta
`min_apk_version_code` in `mobile/update-policy.json` al numero della prima
build APK compatibile. I client precedenti non installeranno quel bundle;
potranno installare l'APK proposto nelle Impostazioni. Il numero della build
è `github.run_number`, cresce a ogni esecuzione e non deve essere azzerato.

Le vecchie versioni del client precedenti a questi controlli richiedono un
aggiornamento iniziale fidato. Per passare a una diversa chiave pubblica serve
una transizione firmata con la vecchia chiave oppure un nuovo APK verificato.
Non cancellare o ricreare il workflow perdendo il contatore delle versioni.

L'aggiornamento del backend è separato: la CI Android non configura né aggiorna
automaticamente i server di chi scarica l'app. Mantieni backend e client
compatibili e consulta le note delle release prima di aggiornare.
