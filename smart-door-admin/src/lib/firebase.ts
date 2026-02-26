import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getStorage, type FirebaseStorage } from "firebase/storage";
import { getDatabase, type Database } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyB44ufKVY86OCFAyinUfPIvWBf1HYFAa7c",
  authDomain: "mobile-embeded-system.firebaseapp.com",
  databaseURL: "https://mobile-embeded-system-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "mobile-embeded-system",
  storageBucket: "mobile-embeded-system.firebasestorage.app",
  messagingSenderId: "502012695941",
  appId: "1:502012695941:web:09184a55817d514682a0ec",
  measurementId: "G-84HRSFFM5T"
};

let app: FirebaseApp | undefined;
let auth: Auth | undefined;
let db: Firestore | undefined;
let storage: FirebaseStorage | undefined;
let rtdb: Database | undefined;

export function isFirebaseConfigured(): boolean {
  return true;
}

if (isFirebaseConfigured()) {
  if (!getApps().length) {
    app = initializeApp(firebaseConfig);
  } else {
    app = getApps()[0];
  }
  auth = getAuth(app);
  db = getFirestore(app);
  storage = getStorage(app);
  rtdb = getDatabase(app);
}

export { app, auth, db, storage, rtdb };
