# Plantaroo iOS — Setup & Launch Checklist

The native app lives in `app/` (Expo + React Native + TypeScript). The Firebase
project is the **same** as the web app (`plantaroo-204ca`), so accounts and data
sync across web + mobile. Everything in this list is a console/account step that
only you (the account owner) can do — the code is already written for all of it.

---

## 0. Install & run locally
```bash
cd app
npm install --legacy-peer-deps        # ALWAYS --legacy-peer-deps (Expo 54 + React 19)
npx expo start --dev-client           # or: npm run start
npm run typecheck                     # tsc --noEmit
```
A bare `npx expo start` (Expo Go) will **not** work — the app uses native modules
(Apple auth, notifications, image picker). You need a **dev build** (step 4) or a
simulator build.

---

## 1. Firebase — enable Apple + (optional) Google
Console → project **plantaroo-204ca** → Authentication → Sign-in method:
- [ ] **Apple** → Enable → Save. (No Service ID needed for native iOS.)
- [ ] **Google** → already enabled for the web app; reuse it.
- [ ] Authentication → Settings → Authorized domains already covers the web app.

Firestore rules are already deployed (`firestore.rules`, per-user isolation). The
app writes under `users/{uid}/...` exactly like the web app.

## 2. Google Sign-In client IDs (only if you want Google on mobile)
Apple Sign-In works without this. For Google:
- [ ] Google Cloud Console → project **plantaroo-204ca** → APIs & Services →
      Credentials → Create OAuth client ID:
  - **iOS** client (bundle id `com.jamalkhan.plantaroo`) → copy the client id.
  - **Web** client → copy the client id (used as `clientId` for the id-token flow).
- [ ] In `app/app.json` → `extra`, replace:
  - `googleIosClientId` → the iOS client id (`...apps.googleusercontent.com`)
  - `googleWebClientId` → the web client id
- [ ] In `app/app.json` → `ios.infoPlist.CFBundleURLTypes`, replace
      `com.googleusercontent.apps.PASTE_REVERSED_IOS_CLIENT_ID` with the **reversed**
      iOS client id (everything before `.apps.googleusercontent.com`, prefixed with
      `com.googleusercontent.apps.`).

## 3. Apple Developer + App Store Connect
- [ ] Enrol / confirm the Apple Developer Program ($99/yr). Team id `AK6GDSF62K`
      (same as Liftaroo) is already in `eas.json`.
- [ ] App Store Connect → create the app record with bundle id
      `com.jamalkhan.plantaroo`. Put the resulting **App ID** into
      `eas.json → submit.production.ios.ascAppId`.
- [ ] In the app record, set category (e.g. Lifestyle), age rating, price = Free.

## 4. EAS — project id, build, submit
```bash
cd app
npm i -g eas-cli         # already installed per the hub
eas login
eas init                 # creates/links the EAS project
```
- [ ] `eas init` prints a **projectId** — paste it into `app.json` in BOTH
      `extra.eas.projectId` and the `updates.url` (`https://u.expo.dev/<projectId>`).
- [ ] Build: `eas build -p ios --profile production` (cloud build, no Mac needed).
- [ ] Submit: `eas submit -p ios` → lands in **TestFlight** first.
- [ ] Test on a real device via TestFlight before submitting for review (Apple
      auth, notifications and the camera behave differently than the simulator).
- OTA JS updates after that: `eas update --branch production -m "..."`.

## 5. App Store review must-haves (all already implemented in-app)
- [x] **Sign in with Apple** (guideline 4.8) — `usesAppleSignIn: true`, native button.
- [x] **In-app account deletion** (5.1.1) — Settings → Delete account (wipes
      Firestore subtree + deletes the Auth user).
- [x] **Privacy manifest** — declared in `app.json → ios.privacyManifests`.
- [x] **Permission strings** — camera/photos via the `expo-image-picker` plugin.
- [x] **No ATT / tracking** — we don't track; do not add `NSUserTrackingUsageDescription`.
- [ ] **Privacy Policy URL** — host `app/legal/privacy.html` at
      `https://jamasha.com/plantaroo/privacy` (drop it into the jamasha Netlify site)
      and put that URL in App Store Connect → App Privacy.
- [ ] **App Privacy "nutrition label"** in App Store Connect: declare Email
      (App Functionality), Photos/User Content (App Functionality), User ID — all
      **not used for tracking**.
- [ ] **Reviewer sign-in**: Apple reviewers can use their own Apple ID via Sign in
      with Apple, so no demo account is strictly required. Add a note in App Review
      Information saying the app is free, single-user, no purchases.
- [ ] **Screenshots**: 6.9" iPhone (1290×2796). `ios.supportsTablet` is `false`,
      so no iPad screenshots are required.

## 6. Known follow-up (not blocking first submission)
- [ ] **Apple token revocation on account deletion** — Apple *recommends* revoking
      the Sign-in-with-Apple token (`/auth/revoke`) when a user deletes their
      account. That needs a tiny backend endpoint with the authorization code; the
      existing Render API (`server/`) is a natural home. `deleteAccount()` in
      `src/lib/auth.ts` already deletes data + the Auth user; add the revoke call
      there once the endpoint exists.

---

### Bundle / identity quick reference
- iOS bundle id: `com.jamalkhan.plantaroo`
- Apple Team id: `AK6GDSF62K`
- Firebase project: `plantaroo-204ca`
- Apple ID (submit): `jkhan626@gmail.com`
