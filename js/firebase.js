import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// EXACT configuration provided
const firebaseConfig = {
    apiKey: "AIzaSyBvfxlTHUoXfMzdHrQWe1xLpFH6Solf1pk",
    authDomain: "testify-8f91b.firebaseapp.com",
    projectId: "testify-8f91b",
    storageBucket: "testify-8f91b.firebasestorage.app",
    messagingSenderId: "1069450532952",
    appId: "1:1069450532952:web:1a37d8ff38e632ac0f522d",
    measurementId: "G-PPC6JF4N04"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

export { auth, db };