package it.workoutcontrol.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;

import androidx.annotation.RequiresApi;
import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;

/**
 * Canali di notifica con un suono caricato dall'utente (frontend/src/lib/notifiche.ts).
 *
 * Su Android il suono di una notifica lo decide il canale, e il plugin
 * LocalNotifications sa crearne solo con suoni impacchettati nell'APK
 * (res/raw). I suoni scelti in Impostazioni arrivano invece a runtime.
 *
 * Da Android 10 il file va nella libreria multimediale, in
 * Notifications/WorkoutControl, come i suoni di notifica di sistema. Un file
 * esposto dal FileProvider dell'app non basta: sul Galaxy A55 (One UI, Android
 * 16) il canale lo accetta ma a notifica arrivata vibra senza suonare, e senza
 * lasciare errori nel log. Un URI content://media lo legge invece qualunque
 * lettore di sistema. Scrivere lì i propri file non richiede permessi.
 * Prima di Android 10 serviva un permesso di scrittura: lì resta il
 * FileProvider.
 *
 * Le impostazioni di un canale restano fissate alla creazione, suono compreso,
 * e un canale eliminato e ricreato con lo stesso id torna con il suono vecchio:
 * per questo ogni suono ha il suo canale, chiamato con l'impronta del file e
 * con un prefisso da cambiare ogni volta che cambia il modo di esporre il file.
 */
@CapacitorPlugin(name = "SuoniNotifica")
public class SuoniNotificaPlugin extends Plugin {

    /** Il canale di base, creato dal frontend: deve restare fuori dalla pulizia. */
    private static final String CANALE_BASE = "recupero";
    /** Radice comune a tutte le versioni: la pulizia toglie anche i canali delle precedenti. */
    private static final String RADICE_CANALI = "recupero-suono-";
    /** v2: file nella libreria multimediale invece che nel FileProvider. */
    private static final String PREFISSO_CANALE = RADICE_CANALI + "v2-";
    private static final String CARTELLA = "suoni";
    private static final String CARTELLA_MEDIA = Environment.DIRECTORY_NOTIFICATIONS + "/WorkoutControl/";

    @PluginMethod
    public void preparaCanale(PluginCall call) {
        String contenuto = call.getString("contenuto");
        String nome = call.getString("nome", "Suono");
        String estensione = call.getString("estensione", "mp3");
        if (contenuto == null || contenuto.isEmpty()) {
            call.reject("Suono vuoto.");
            return;
        }

        // Prima di Android 8 i canali non esistono e il suono sarebbe della
        // singola notifica: non vale la pena gestirlo, resta quello di base.
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            risolvi(call, CANALE_BASE);
            return;
        }

        try {
            byte[] dati = Base64.decode(contenuto, Base64.DEFAULT);
            String impronta = impronta(dati);
            String canale = PREFISSO_CANALE + impronta;
            String sicura = estensione.toLowerCase().replaceAll("[^a-z0-9]", "");
            String nomeFile = "workoutcontrol-" + impronta + "." + (sicura.isEmpty() ? "mp3" : sicura);
            Context context = getContext();

            Uri uri = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
                    ? uriDaLibreria(context, dati, nomeFile, mime(sicura))
                    : uriDaFileProvider(context, dati, nomeFile);

            NotificationManager manager = context.getSystemService(NotificationManager.class);
            if (manager.getNotificationChannel(canale) == null) {
                // Stessi parametri del canale di base (importanza alta e
                // vibrazione): cambia solo il suono.
                NotificationChannel nuovo = new NotificationChannel(
                        canale, "Timer di recupero · " + nome, NotificationManager.IMPORTANCE_HIGH);
                nuovo.setDescription("Avvisa quando finisce il recupero fra le serie.");
                nuovo.enableVibration(true);
                AudioAttributes attributi = new AudioAttributes.Builder()
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                        .build();
                nuovo.setSound(uri, attributi);
                manager.createNotificationChannel(nuovo);
            }

            pulisci(context, manager, canale, nomeFile);
            risolvi(call, canale);
        } catch (IllegalArgumentException | SecurityException | IOException | NoSuchAlgorithmException e) {
            call.reject("Impossibile preparare il suono: " + e.getMessage(), e);
        }
    }

    /** Il file nella libreria multimediale, riusando quello già scritto se c'è. */
    @RequiresApi(Build.VERSION_CODES.Q)
    private Uri uriDaLibreria(Context context, byte[] dati, String nomeFile, String mime) throws IOException {
        ContentResolver resolver = context.getContentResolver();
        Uri collezione = MediaStore.Audio.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY);

        try (Cursor cursore = resolver.query(
                collezione,
                new String[] {MediaStore.Audio.Media._ID},
                MediaStore.Audio.Media.DISPLAY_NAME + "=? AND " + MediaStore.Audio.Media.RELATIVE_PATH + "=?",
                new String[] {nomeFile, CARTELLA_MEDIA},
                null)) {
            if (cursore != null && cursore.moveToFirst()) {
                return ContentUris.withAppendedId(collezione, cursore.getLong(0));
            }
        }

        ContentValues valori = new ContentValues();
        valori.put(MediaStore.Audio.Media.DISPLAY_NAME, nomeFile);
        valori.put(MediaStore.Audio.Media.MIME_TYPE, mime);
        valori.put(MediaStore.Audio.Media.RELATIVE_PATH, CARTELLA_MEDIA);
        valori.put(MediaStore.Audio.Media.IS_NOTIFICATION, 1);
        // Nascosto agli altri finché non è scritto per intero.
        valori.put(MediaStore.Audio.Media.IS_PENDING, 1);
        Uri uri = resolver.insert(collezione, valori);
        if (uri == null) {
            throw new IOException("La libreria multimediale ha rifiutato il suono.");
        }

        try (OutputStream out = resolver.openOutputStream(uri)) {
            if (out == null) throw new IOException("Impossibile scrivere il suono.");
            out.write(dati);
        } catch (IOException e) {
            resolver.delete(uri, null, null);
            throw e;
        }

        valori.clear();
        valori.put(MediaStore.Audio.Media.IS_PENDING, 0);
        resolver.update(uri, valori, null, null);
        return uri;
    }

    /** Solo Android 8 e 9: lì scrivere nella libreria richiederebbe un permesso. */
    private Uri uriDaFileProvider(Context context, byte[] dati, String nomeFile) throws IOException {
        File cartella = new File(context.getFilesDir(), CARTELLA);
        if (!cartella.isDirectory() && !cartella.mkdirs()) {
            throw new IOException("Impossibile creare la cartella dei suoni.");
        }
        File file = new File(cartella, nomeFile);
        if (!file.isFile() || file.length() != dati.length) {
            try (FileOutputStream out = new FileOutputStream(file)) {
                out.write(dati);
            }
        }
        Uri uri = FileProvider.getUriForFile(context, context.getPackageName() + ".fileprovider", file);
        // Il suono lo riproduce SystemUI, non l'app.
        context.grantUriPermission("com.android.systemui", uri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
        return uri;
    }

    /** Toglie canali e file dei suoni che non sono più quello in uso. */
    private void pulisci(Context context, NotificationManager manager, String canale, String nomeFile) {
        for (NotificationChannel esistente : manager.getNotificationChannels()) {
            String id = esistente.getId();
            if (id.startsWith(RADICE_CANALI) && !id.equals(canale)) {
                manager.deleteNotificationChannel(id);
            }
        }

        // Anche i file della versione precedente, che stavano qui su ogni
        // versione di Android.
        File[] file = new File(context.getFilesDir(), CARTELLA).listFiles();
        if (file != null) {
            for (File vecchio : file) {
                if (!vecchio.getName().equals(nomeFile)) {
                    //noinspection ResultOfMethodCallIgnored
                    vecchio.delete();
                }
            }
        }

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return;
        ContentResolver resolver = context.getContentResolver();
        Uri collezione = MediaStore.Audio.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY);
        // Senza permessi di lettura la query restituisce solo i file scritti da
        // questa app: non si rischia di cancellare suoni altrui.
        try (Cursor cursore = resolver.query(
                collezione,
                new String[] {MediaStore.Audio.Media._ID},
                MediaStore.Audio.Media.RELATIVE_PATH + "=? AND " + MediaStore.Audio.Media.DISPLAY_NAME + "<>?",
                new String[] {CARTELLA_MEDIA, nomeFile},
                null)) {
            while (cursore != null && cursore.moveToNext()) {
                resolver.delete(ContentUris.withAppendedId(collezione, cursore.getLong(0)), null, null);
            }
        } catch (SecurityException ignorata) {
            // Un file che l'app non possiede più (reinstallazione): resta lì.
        }
    }

    private static String mime(String estensione) {
        switch (estensione) {
            case "ogg": return "audio/ogg";
            case "wav": return "audio/x-wav";
            case "m4a": return "audio/mp4";
            case "aac": return "audio/aac";
            default: return "audio/mpeg";
        }
    }

    private static String impronta(byte[] dati) throws NoSuchAlgorithmException {
        byte[] digest = MessageDigest.getInstance("SHA-256").digest(dati);
        StringBuilder esadecimale = new StringBuilder();
        // 12 byte bastano a distinguere i pochi suoni di un'installazione.
        for (int i = 0; i < 12; i++) {
            esadecimale.append(String.format("%02x", digest[i]));
        }
        return esadecimale.toString();
    }

    private static void risolvi(PluginCall call, String canale) {
        JSObject risultato = new JSObject();
        risultato.put("canale", canale);
        call.resolve(risultato);
    }
}
