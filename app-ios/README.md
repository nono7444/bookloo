# Bookloo pour iPhone

Appli iOS (Expo) pour un serveur Bookloo auto-hébergé, dans le style de Lumio :
fond noir, barre d'onglets flottante en verre (Liquid Glass sur iOS 26).

- **Onglets** : Accueil, Recherche, Bibliothèque, Kiosque, Réglages.
- Les pages viennent du serveur (recherche, fiches, liseuse BD / livres, écoute des livres audio) ;
  l'appli retire le bandeau du site et passe en plein écran pendant la lecture.
- **Réglages** : adresse du serveur, compte et clés de service, nouveautés, administration, déconnexion.
- Le serveur doit être en **https** (cookie de session sécurisé).

Build : `.github/workflows/ios.yml` à chaque push touchant `app-ios/` → IPA non signée dans une Release,
et source FlareStore / SideStore : `https://github.com/nono7444/bookloo/releases/latest/download/altstore.json`.
