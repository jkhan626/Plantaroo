# Plantaroo — Legal & Support URLs (for App Store Connect)

All three pages are live on the Plantaroo GitHub Pages site and are linked inside the app
(Sign-in screen + Settings → About). Source HTML lives in `app/legal/`.

| Page | URL | Where it goes in App Store Connect |
|------|-----|-----------------------------------|
| **Privacy Policy** | https://jkhan626.github.io/Plantaroo/privacy.html | App Privacy → **Privacy Policy URL** (required) |
| **Support** | https://jkhan626.github.io/Plantaroo/support.html | App Information → **Support URL** (required) |
| **Terms of Service** | https://jkhan626.github.io/Plantaroo/terms.html | (Optional) App Information → **Marketing URL**, or reference in the EULA |

To edit any page: change the file in `app/legal/`, then re-publish it to the `main` branch
(GitHub Pages serves `main` root). They are hosted at the repo root as
`privacy.html` / `support.html` / `terms.html`.
