Yo!

## What's AuthBean?: The TL;DR:

It's your web-based buddy for TOTP (those 6-digit 2FA codes). Built with HTML, CSS (Tailwind for looks!), JavaScript, Firebase for cloud saves.

## Features: What's it Do?

* **TOTP Codes:** Obviously. Add accounts, get codes. Easy.
* **Cloud Sync (Firebase!):** Accounts saved to Firestore, just for you.
* **Sick Dark Theme:** Easy on the eyes.
* **One-Click Copy OTP:** Tap, copy, done.
* **OTP Timer Bar:** See when the next code drops.
* **Manage Accounts:** Add, edit, delete. You're the boss.

## Tech Stack: The Guts!

* **Frontend:** HTML, CSS, JS.
* **Style:** Tailwind CSS.
* **OTP Logic:** `otpauth.js`.
* **Backend/DB:** Firebase Firestore.
* **Auth:** Firebase Authentication (anonymous).

## Gettin' Started:

Wanna run it or chip in? Here's the quick version:

1.  **Clone Repo:**
    ```bash
    git clone https://github.com/signalbean/AuthBean.git && cd AuthBean
    ```
2.  **Firebase Setup (Don't Skip!):**
    * Go to [Firebase Console](https://console.firebase.google.com/), make a project.
    * Get your `firebaseConfig` object from project settings.
    * `script.js` needs this. For local dev, you can make a `config.js` (add to `.gitignore`) and import it, or (less ideal for public repos) paste it directly into `script.js` where the demo config is.
    * Enable Firestore (start in test mode) and Anonymous Sign-in. Path structure: `/artifacts/{appId}/users/{userId}`.
3.  **Open `index.html`:** Drag it into your browser. Done!

## How to Use AuthBean: Quick Guide:

1.  **Add Account:** Click "Add New Account," fill in Name (or let AI suggest), Issuer (optional), and the **Secret Key (Base32)** from the service. Save.
2.  **See OTPs:** They'll show up on the main screen.
3.  **Copy OTP:** Click "Copy Code."
4.  **Edit/Delete:** Buttons are on each account card.

## Wanna Help Out?: Collab Time!

Built with a dev night in mind. To contribute:
Fork -> New Branch (`feature/your idea`) -> Code it -> Commit -> Push -> Pull Request.

## Disclaimer: Heads Up!

* **Concept** It's a demo bruv, It uses real security ideas, but for Fort Knox level, get others to check it.
* **Secret Keys:** Stored in Firestore. Firebase security is good enough, but be mindful.

**Dreamin' Bout:** QR scanning, reordering, export/import, themes!

## License: Legal Bit.

Probs MIT. Use it, learn, break, fix, enjoy!
(On second thought I might need a licensefile for it lol).

---

Made with <3 & `console.log()` by **signalbean**. Peace!