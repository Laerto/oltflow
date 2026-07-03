# Winbox një-klik — handler për panelin OLTFlow

Ky handler bën që **klikimi mbi IP-në e Mikrotik-ut në panel** të hapë **Winbox tashmë të loguar** (pa copy/paste, pa shkruar user/password).

## Pse duhet

Ruterat e klientëve pas ONU-ve bridge kanë hapur **vetëm Winbox (porta 8291)** — SSH/API/WebFig janë të mbyllura. Prandaj një terminal brenda shfletuesit s'është i mundur; zgjidhja është të hapim **Winbox desktop** me një klik, i loguar automatikisht.

Paneli gjeneron një link `winbox://IP?u=USER&p=PASS`. Ky handler e regjistron skemën `winbox://` në PC dhe e përkthen në komandën zyrtare të Winbox-it:

```
winbox.exe <host> <user> <password>
```

## Instalimi (një herë për çdo PC support-i)

1. Kopjo dosjen `winbox-handler` në PC (p.sh. te Desktop).
2. Sigurohu që përdor **Winbox 4** (regjistron `winbox://`). Winbox 3 nuk mbështetet.
3. Kliko dy herë **`install.bat`**. Nuk kërkon admin.
4. Sigurohu që **`winbox.exe` është në PATH**, ose vendos një kopje te:
   `%LOCALAPPDATA%\OLTFlow\winbox.exe`

Gati. Në panel, kliko IP-në e Mikrotik-ut → shfletuesi pyet një herë "Open Winbox launcher?" → prano (mund ta kujtojë) → Winbox hapet i loguar.

## Konfigurimi i kredencialeve (në server)

Krediencialet e përbashkëta vendosen te `.env` i serverit dhe **nuk** shkojnë kurrë te përdoruesit `viewer` — vetëm `support`/`admin`:

```
MIKROTIK_WINBOX_USER=admin
MIKROTIK_WINBOX_PASSWORD=fjalekalimi_i_perbashket
MIKROTIK_WINBOX_PORT=8291
```

Pas ndryshimit të `.env`, rindiz web-in: `docker restart oltflow-web`.

## Çregjistrimi

```
reg delete "HKCU\Software\Classes\winbox" /f
```

## Zgjidhje problemesh

- **S'ndodh asgjë kur klikoj:** `install.bat` s'u ekzekutua në atë PC, ose përdor Winbox 3.
- **Hapet Winbox por s'logohet:** kontrollo `MIKROTIK_WINBOX_USER/PASSWORD` te `.env` dhe se je në `support/admin`.
- **"winbox.exe not found":** vendos `winbox.exe` në PATH ose te `%LOCALAPPDATA%\OLTFlow\`.
- **Fallback:** nëse handler-i s'është i instaluar, ikona e kopjimit pranë IP-së e kopjon IP-në për ta ngjitur manualisht te "Connect To".
