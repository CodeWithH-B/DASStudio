/* ==================================================================
   config.example.js — template for the deploy-time config
   ==================================================================
   Copy this to config.js and fill in your own Firebase project, or generate
   config.js from environment variables with `node tools/build-config.js`.

   Everything in config.js is PUBLIC by design: the Firebase web config ships to
   every browser and is not a secret. Security comes from Firestore rules and
   from the API key restrictions described in README.md, not from hiding these
   values.

   NEVER put in this file:
     - an admin email or uid (grant admin with a custom claim instead)
     - a password, a service-account key, or any server credential
     - a Firestore/Storage secret
   ================================================================== */
window.DAS_CONFIG = {
  firebase: {
    apiKey: 'PASTE_WEB_API_KEY',
    authDomain: 'YOUR_PROJECT.firebaseapp.com',
    projectId: 'YOUR_PROJECT',
    storageBucket: 'YOUR_PROJECT.firebasestorage.app',
    messagingSenderId: '000000000000',
    appId: '1:000000000000:web:0000000000000000000000',
    measurementId: 'G-XXXXXXXXXX'
  },

  /* Leave false unless head/body <script> snippets come from a source you
     control end to end. With false, the panel strips <script>, <iframe>,
     <object>, <embed>, on* handlers, <base>, <meta>, <link> and javascript:
     URLs from custom code before injecting it. */
  trustedCode: false
};
