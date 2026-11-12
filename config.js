/* Deploy-time configuration. Loaded BEFORE script.js.
   Everything here is PUBLIC by design (Firebase web config is shipped to every
   browser; security comes from Firestore rules, not from hiding these).
   NEVER add: admin email, admin uid, passwords, service-account keys. */
window.DAS_CONFIG = {
  firebase: {
    apiKey: 'AIzaSyCsldPssXQmCyWySmC5giR7GUCWjhdlBeQ',
    authDomain: 'dasstudio-49f08.firebaseapp.com',
    projectId: 'dasstudio-49f08',
    storageBucket: 'dasstudio-49f08.firebasestorage.app',
    messagingSenderId: '209248553216',
    appId: '1:209248553216:web:efa6f9373f0629c405cbe5',
    measurementId: 'G-L8H2T2D4VX'
  },
  /* leave false unless custom head/body <script> snippets come from a trusted
     source (see MIGRATION.md). */
  trustedCode: false
};
