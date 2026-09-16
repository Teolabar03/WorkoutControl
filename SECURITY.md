# Sicurezza

Non pubblicare in issue o allegati password, token, `.env`, database, export
Samsung, backup o log non revisionati. Per una segnalazione riservata contatta
l'autore all'indirizzo indicato nei commit, descrivendo il problema senza
includere dati sanitari reali. Non eseguire test sulle installazioni altrui.

La versione mantenuta è quella corrente di `main`. Prima di aggiornare fai un
backup e consulta README e note della release. Le build precedenti possono
non includere le protezioni più recenti.

Password nel database sotto forma di hash, sessioni firmate e isolamento dei
workout non proteggono un file SQLite copiato o un host compromesso. Proteggi
il filesystem e i backup, usa HTTPS fuori da reti fidate e mantieni aggiornati
sistema operativo e dipendenze. Non abilitare il debugger in produzione.
