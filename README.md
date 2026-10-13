# Vinted Scanner Web (local)

Scanner d'annonces Vinted avec interface web — dérivé de
michelepinto/VintedScanner (GPL-3.0), sans Telegram.

## Lancer
    py -m venv venv
    venv\Scripts\activate
    pip install -r requirements.txt
    uvicorn app.main:app --host 127.0.0.1 --port 8000

Puis http://127.0.0.1:8000 (API doc : /docs).

## Données
`scanner.db` (SQLite) est créé automatiquement à la racine du projet.
Supprimez-le pour repartir de zéro.

## Avertissement
API Vinted non documentée : peut changer sans préavis ; espacez les scans
(interval >= 300 s conseillé) pour éviter le blocage anti-bot (403).