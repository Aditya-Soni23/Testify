import { checkAuthState, logoutUser } from '../js/auth.js';
import { db } from '../js/firebase.js';
import { ref, onValue, query, limitToLast } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

document.addEventListener("DOMContentLoaded", () => {
    // 1. Auth & Initial setup
    checkAuthState((user, dbUser) => {
        if (!user) { window.location.href = '../index.html'; return; } 
        
        document.getElementById('user-greeting').innerHTML = `Good day, <span>${dbUser.name.split(' ')[0]}</span>`;
        initNavigationRoutes();
        listenToSystemStatesLifecycle();
    });

    // 2. Global Logout Event
    document.getElementById('logout-btn')?.addEventListener('click', () => logoutUser());

    // 3. Announcements listener
    onValue(ref(db, 'announcements/current'), (snapshot) => {
        const banner = document.getElementById('global-announcement');
        const text = document.getElementById('announcement-text');
        if (snapshot.exists() && snapshot.val().active) {
            text.innerHTML = `<i class="ph ph-megaphone"></i> ${snapshot.val().message}`;
            banner.classList.add('active');
        } else {
            banner.classList.remove('active');
        }
    });

    // 4. Mobile Menu Toggle Logic (Safely inside DOMContentLoaded)
    const mobileBtn = document.getElementById('mobile-menu-btn');
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('sidebar-overlay');

    function toggleSidebar() {
        sidebar.classList.toggle('active-mobile');
        overlay.classList.toggle('active-mobile');
    }

    if (mobileBtn && overlay && sidebar) {
        mobileBtn.addEventListener('click', toggleSidebar);
        overlay.addEventListener('click', toggleSidebar);
    }
}); // <-- This closes DOMContentLoaded cleanly!

function initNavigationRoutes() {
    const mappings = { 
        'nav-dashboard': 'dashboard.html', 
        'nav-tests': '../tests/tests.html', 
        'nav-polling': '../polling/polling.html', 
        'nav-upload': '../upload/upload.html', 
        'nav-chat': '../chat/chat.html', 
        'nav-tutorial': '../tutorial/tutorial.html' 
    };
    Object.keys(mappings).forEach(id => {
        const navItem = document.getElementById(id);
        if (navItem) {
            navItem.addEventListener('click', () => {
                // Ensure mobile sidebar slides away before we change page
                document.querySelector('.sidebar')?.classList.remove('active-mobile');
                document.getElementById('sidebar-overlay')?.classList.remove('active-mobile');
                
                window.location.href = mappings[id];
            });
        }
    });
}

function listenToSystemStatesLifecycle() {
    const statusPanel = document.getElementById('lifecycle-status-panel');

    onValue(ref(db, 'system_state/poll'), (snapshot) => {
        const state = snapshot.exists() ? snapshot.val() : { status: "voting" };

        if (state.status === 'voting') {
            statusPanel.innerHTML = `
                <div style="border-left:4px solid var(--accent-purple); padding-left:1rem;">
                    <h4 style="margin:0; color:white;">Status: Voting window is live!</h4>
                    <p style="font-size:0.85rem; color:var(--text-muted); margin-top:0.25rem;">Students are deciding configuration parameters.</p>
                    <button class="btn" onclick="window.location.href='../polling/polling.html'" style="width:auto; padding:0.4rem 0.8rem; font-size:0.8rem; background:var(--accent-purple); color:white; margin-top:0.5rem; border:none; border-radius:4px; cursor:pointer;">Cast Vote</button>
                </div>
            `;
        } else if (state.status === 'uploading') {
            statusPanel.innerHTML = `
                <div style="border-left:4px solid var(--accent-blue); padding-left:1rem;">
                    <h4 style="margin:0; color:white;">Status: Questions uploading window is live!</h4>
                    <p style="font-size:0.85rem; color:var(--text-muted); margin-top:0.25rem;">Target Profile Configuration: ${state.subject} [${state.mode}]</p>
                    <button class="btn" onclick="window.location.href='../upload/upload.html'" style="width:auto; padding:0.4rem 0.8rem; font-size:0.8rem; background:var(--accent-blue); color:white; margin-top:0.5rem; border:none; border-radius:4px; cursor:pointer;">Contribute Questions</button>
                </div>
            `;
        } else {
            statusPanel.innerHTML = `
                <div style="border-left:4px solid var(--success); padding-left:1rem;">
                    <h4 style="margin:0; color:white;">Status: Exam Module Compiled & Live</h4>
                    <p style="font-size:0.85rem; color:var(--text-muted); margin-top:0.25rem;">Waiting.......</p>
                    <button class="btn" onclick="window.location.href='../tests/tests.html'" style="width:auto; padding:0.4rem 0.8rem; font-size:0.8rem; background:var(--success); color:white; margin-top:0.5rem; border:none; border-radius:4px; cursor:pointer;">Test Portal/button>
                </div>
            `;
        }
    });

    // Mirror recent message string onto shortcut layout box component
    onValue(query(ref(db, 'chat_messages'), limitToLast(1)), (chatSnap) => {
        const preview = document.getElementById('chat-shortcut-preview');
        if (chatSnap.exists()) {
            chatSnap.forEach(msg => {
                const data = msg.val();
                preview.innerHTML = `<strong>@${data.author}</strong>: "${data.text.substring(0,35)}..."`;
            });
        }
    });
}