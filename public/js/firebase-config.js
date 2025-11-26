// public/js/firebase-config.js (UPDATED: Firestore removed)

import { initializeApp } from "https://www.gstatic.com/firebase/9.6.10/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebase/9.6.10/firebase-auth.js";

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyDCpJ1pfkHQXwjOlG7FHeh3XxtxwFkLscI",
    authDomain: "newapplicatioon.firebaseapp.com",
    projectId: "newapplicatioon",
    storageBucket: "newapplicatioon.firebasestorage.app",
    messagingSenderId: "197141078730",
    appId: "1:197141078730:web:5440a7bfd71e2a9a92ca33",
    measurementId: "G-F1FE2F770S"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// Export Auth functions only
export { 
    auth, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    onAuthStateChanged,
    signOut 
};