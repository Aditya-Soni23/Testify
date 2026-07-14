import { db } from './firebase.js';
import { ref, get, set, child } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

/**
 * Checks if a user exists in the Realtime Database.
 */
export async function getUserData(uid) {
    try {
        const dbRef = ref(db);
        const snapshot = await get(child(dbRef, `users/${uid}`));
        if (snapshot.exists()) {
            return snapshot.val();
        } else {
            return null;
        }
    } catch (error) {
        console.error("Database Get Error:", error);
        throw error;
    }
}

/**
 * Creates a new user entry in the Realtime Database.
 */
export async function createUserData(uid, email, photoURL, fullName) {
    try {
        await set(ref(db, 'users/' + uid), {
            uid: uid,
            email: email,
            photoURL: photoURL,
            name: fullName,
            createdAt: new Date().toISOString()
        });
    } catch (error) {
        console.error("Database Set Error:", error);
        throw error;
    }
}