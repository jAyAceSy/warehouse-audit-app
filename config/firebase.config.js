/* ============================================================
   FIREBASE PROJECT CONFIG
   This is the client-side Firebase config object. Firebase web `apiKey` values are not secrets —
   they identify your project, they don't grant access on their own. Actual data protection comes
   entirely from the Security Rules published to your Realtime Database (see
   firebase-security-rules.json at the repo root). It's fine for this file to be visible in a
   public repo or in page source.

   To point this app at a different Firebase project (e.g. a throwaway test project), replace the
   values below with the config object from Firebase Console → Project Settings → Your apps.
   See firebase-config.example.json at the repo root for the expected shape.
============================================================ */
export const firebaseConfig = {
  apiKey: "AIzaSyCIn6xmk3I7k2PrmO0WSosc94mMB_VRvw0",
  authDomain: "warehouse-audit-app-v2.firebaseapp.com",
  databaseURL: "https://warehouse-audit-app-v2-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "warehouse-audit-app-v2",
  storageBucket: "warehouse-audit-app-v2.firebasestorage.app",
  messagingSenderId: "428158367845",
  appId: "1:428158367845:web:d19653d22dc10113dd2e8c"
};
