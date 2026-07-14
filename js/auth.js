import { auth } from './firebase.js';
import { GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getUserData, createUserData } from './database.js';
import { showToast } from './utils.js';

const provider = new GoogleAuthProvider();

export async function handleGoogleLogin() {
    try {
        const result = await signInWithPopup(auth, provider);
        const user = result.user;
        
        // Check if user already exists in DB
        const dbUser = await getUserData(user.uid);
        
        if (dbUser && dbUser.name) {
            // User exists, redirect
            showToast('Welcome back!', 'success');
            window.location.href = '/dashboard/dashboard.html';
        } else {
            // New user: Prompt for real name
            triggerNamePrompt(user);
        }
    } catch (error) {
        console.error("Login Error:", error);
        showToast(error.message, 'error');
    }
}

function triggerNamePrompt(firebaseUser) {
    const modal = document.getElementById('name-modal');
    const form = document.getElementById('name-form');
    const input = document.getElementById('real-name-input');
    
    // Pre-fill with Google name if available
    if(firebaseUser.displayName) {
        input.value = firebaseUser.displayName;
    }
    
    modal.classList.remove('hidden');

    form.onsubmit = async (e) => {
        e.preventDefault();
        const realName = input.value.trim();
        
        if (realName.length < 3) {
            showToast('Please enter your full real name.', 'error');
            return;
        }

        try {
            const btn = document.getElementById('save-name-btn');
            btn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> Saving...';
            btn.disabled = true;

            await createUserData(firebaseUser.uid, firebaseUser.email, firebaseUser.photoURL, realName);
            
            showToast('Profile created successfully!', 'success');
            window.location.href = '/dashboard/dashboard.html';
        } catch (error) {
            showToast('Error saving profile.', 'error');
            btn.innerHTML = 'Save & Continue';
            btn.disabled = false;
        }
    };
}

export function checkAuthState(callback) {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            const dbUser = await getUserData(user.uid);
            callback(user, dbUser);
        } else {
            callback(null, null);
        }
    });
}

export function logoutUser() {
    signOut(auth).then(() => {
        window.location.href = '/';
    }).catch((error) => {
        showToast('Error logging out.', 'error');
    });
}