Dieser Ordner enthält ausschließlich verschlüsselte Strava-OAuth-Tokens.

Der Refresh-Workflow schreibt `.enc`-Dateien mit authentifizierter Fernet-
Verschlüsselung. Der Schlüssel wird aus den Zugangsdaten im GitHub-Secret
`STRAVA_CONFIG_JSON` abgeleitet und wird niemals eingecheckt. Der Dateiname
ordnet den Tokenstatus der jeweiligen Konfiguration zu. Nach einem Tokenwechsel
wird der verschlüsselte Status zusammen mit den Daten committet, auch wenn die
anschließende Strava-Abfrage scheitert. So funktioniert die Rotation auch nach
Workflow-Pausen, ohne flüchtige Actions-Caches oder zusätzliche GitHub-Tokens.

Hier keine API-Schlüssel, Konfigurationsdateien oder unverschlüsselten Tokens
ablegen. Lokal verwendet das Skript den ignorierten Ordner `.api-state/`.
