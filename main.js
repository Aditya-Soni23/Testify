import { handleGoogleLogin, checkAuthState } from './js/auth.js';
import { db } from './js/firebase.js';
import { ref, get, onValue } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// Global Maintenance Check
onValue(ref(db, 'system_state/maintenance'), (snapshot) => {
    if (snapshot.exists() && snapshot.val() === true) {
        if (!window.location.href.includes('maintenance.html')) {
            window.location.href = './maintenance/maintenance.html';
        }
    }
});

// Elements
const loginBtns = [document.getElementById('nav-login-btn'), document.getElementById('hero-login-btn')];
const logoBtn = document.querySelector('.logo');

// Setup Event Listeners
loginBtns.forEach(btn => {
    if(btn) btn.addEventListener('click', handleGoogleLogin);
});

// Hidden Admin Easter Egg (5 Clicks)
let clickCount = 0;
let clickTimer;
if (logoBtn) {
    logoBtn.addEventListener('click', () => {
        clickCount++;
        clearTimeout(clickTimer);
        clickTimer = setTimeout(() => clickCount = 0, 2000); // Reset after 2 seconds
        
        if (clickCount >= 5) {
            checkAuthState((user) => {
                if (user && user.email === 'adityasonihyderabad@gmail.com') {
                    window.location.href = './admin/admin.html';
                } else {
                    alert("Unauthorized. Admin access sequence locked.");
                }
            });
            clickCount = 0;
        }
    });
}

document.addEventListener("DOMContentLoaded", () => {
    // --- PWA SERVICE WORKER REGISTRATION ---
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js')
                .then(reg => console.log('Service Worker Registered Successfully. Scope:', reg.scope))
                .catch(err => console.error('Service Worker Registration Failed:', err));
        });
    }

    // Existing Auth State Check
    checkAuthState((user, dbUser) => {
        if (user && dbUser && dbUser.name) {
            if (!window.location.href.includes('dashboard')) {
                window.location.href = './dashboard/dashboard.html';
            }
        }
    });
});