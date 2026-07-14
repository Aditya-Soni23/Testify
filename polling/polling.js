import { checkAuthState } from '../js/auth.js';
import { db } from '../js/firebase.js';
import { ref, get, set, onValue, update } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

let currentUserId = null;
let currentUserName = null;

document.addEventListener("DOMContentLoaded", () => {
    checkAuthState((user, dbUser) => {
        if (!user) { window.location.href = '/'; return; }
        currentUserId = user.uid;
        currentUserName = dbUser.name;
        initNavigation();
        bindStateObservers();
    });
});

function initNavigation() {
    const mappings = { 'nav-dashboard': '/dashboard/dashboard.html', 'nav-tests': '/tests/tests.html', 'nav-polling': '/polling/polling.html', 'nav-upload': '/upload/upload.html', 'nav-chat': '/chat/chat.html' };
    Object.keys(mappings).forEach(id => {
        document.getElementById(id)?.addEventListener('click', () => window.location.href = mappings[id]);
    });
}

function bindStateObservers() {
    onValue(ref(db, 'system_state/poll'), async (snapshot) => {
        const state = snapshot.exists() ? snapshot.val() : { status: "voting" };
        
        const usersSnap = await get(ref(db, 'users'));
        const totalUsersCount = usersSnap.exists() ? Object.keys(usersSnap.val()).length : 1;

        if (state.status === "uploading" || state.status === "completed") {
            renderClosedPollMetrics(state);
            return;
        }

        document.getElementById('voting-panel').classList.remove('hidden');
        onValue(ref(db, 'votes'), (votesSnap) => {
            const votes = votesSnap.exists() ? votesSnap.val() : {};
            const voteCount = Object.keys(votes).length;

            updateVoteProgressMetric(voteCount, totalUsersCount);
            renderVoterLedger(votes);

            if (voteCount >= 3 && !state.expiresAt) {
                const expirationTimestamp = Date.now() + (5 * 60 * 60 * 1000);
                update(ref(db, 'system_state/poll'), { expiresAt: expirationTimestamp });
            }

            if (state.expiresAt) {
                initializeCountdownTracker(state.expiresAt, votes, totalUsersCount);
            }
        });
    });

    document.getElementById('poll-form').addEventListener('submit', castVoteRecord);
}

function updateVoteProgressMetric(current, total) {
    const pct = Math.min((current / total) * 100, 100);
    document.getElementById('vote-progress').style.width = `${pct}%`;
    document.getElementById('vote-ratio-text').textContent = `${current} / ${total} Students Active`;
}

// FIX 1: Show the specific chapters each student voted for in the ledger row view
function renderVoterLedger(votes) {
    const ledger = document.getElementById('voters-ledger');
    ledger.innerHTML = '';
    Object.values(votes).forEach(v => {
        const row = document.createElement('div');
        row.className = 'voter-row';
        row.innerHTML = `<span><strong>${v.name}</strong> selected ${v.subject} <small style="color:var(--text-muted)">(${v.chapters || 'No Chapters'})</small></span><span style="color:var(--accent-blue)">${v.mode}</span>`;
        ledger.appendChild(row);
    });
}

async function castVoteRecord(e) {
    e.preventDefault();
    const payload = {
        uid: currentUserId,
        name: currentUserName,
        subject: document.getElementById('poll-subject').value,
        questionCount: parseInt(document.getElementById('poll-count').value),
        duration: parseInt(document.getElementById('poll-duration').value),
        mode: document.getElementById('poll-mode').value,
        chapters: document.getElementById('poll-chapters').value
    };
    await set(ref(db, `votes/${currentUserId}`), payload);
    alert('Thanks for voting!');
}

function initializeCountdownTracker(targetTime, votes, totalUsers) {
    const badge = document.getElementById('poll-timer-container');
    badge.classList.remove('hidden');

    const timer = setInterval(async () => {
        const delta = targetTime - Date.now();
        if (delta <= 0) {
            clearInterval(timer);
            badge.classList.add('hidden');
            await aggregateAndClosePoll(votes);
        } else {
            const hrs = String(Math.floor(delta / 3600000)).padStart(2, '0');
            const mins = String(Math.floor((delta % 3600000) / 60000)).padStart(2, '0');
            const secs = String(Math.floor((delta % 60000) / 1000)).padStart(2, '0');
            document.getElementById('countdown-timer').textContent = `${hrs}:${mins}:${secs}`;
        }
    }, 1000);
}

async function aggregateAndClosePoll(votes) {
    if (Object.keys(votes).length === 0) return;

    const metrics = { subject: {}, duration: {}, questionCount: {}, mode: {} };
    let chapterTokens = [];

    Object.values(votes).forEach(v => {
        metrics.subject[v.subject] = (metrics.subject[v.subject] || 0) + 1;
        metrics.duration[v.duration] = (metrics.duration[v.duration] || 0) + 1;
        metrics.questionCount[v.questionCount] = (metrics.questionCount[v.questionCount] || 0) + 1;
        metrics.mode[v.mode] = (metrics.mode[v.mode] || 0) + 1;

        v.chapters.split(',').forEach(ch => {
            const clean = ch.trim().replace(/\s+/g, ' ').toLowerCase();
            if (clean) chapterTokens.push(clean);
        });
    });

    const getMax = (obj) => Object.keys(obj).reduce((a, b) => obj[a] > obj[b] ? a : b);
    
    const chapterFreq = {};
    chapterTokens.forEach(c => chapterFreq[c] = (chapterFreq[c] || 0) + 1);
    
    // FIX 2: Exclude chapters that match with no one else (Frequency must be strictly > 1)
    let matchingChapters = Object.keys(chapterFreq).filter(c => chapterFreq[c] > 1);
    
    // Fallback: If absolutely zero overlap exists between any students, preserve high scores so test parameters don't break
    if (matchingChapters.length === 0) {
        matchingChapters = Object.keys(chapterFreq);
    }
    
    const sortedChapters = matchingChapters.sort((a, b) => chapterFreq[b] - chapterFreq[a]);
    
    const uniquelySelectedChapters = sortedChapters.slice(0, 3).map(c => 
        c.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
    );

    const winningStateObj = {
        status: "uploading",
        subject: getMax(metrics.subject),
        duration: parseInt(getMax(metrics.duration)),
        questionCount: parseInt(getMax(metrics.questionCount)),
        mode: getMax(metrics.mode),
        chapters: uniquelySelectedChapters.join(', ') || 'General Review',
        currentUploadCount: 0
    };

    await set(ref(db, 'system_state/poll'), winningStateObj);
}

function renderClosedPollMetrics(state) {
    document.getElementById('voting-panel').innerHTML = `
        <div class="glass" style="padding:2rem; border-color:var(--accent-purple)">
            <h2 style="color:white; margin-top:0"><i class="ph ph-lock"></i> Polling Concluded</h2>
            <p style="color:var(--text-muted)">The Voting has been completed! Please proceed to contribute Questions......</p>
            <div style="margin:1.5rem 0; display:flex; flex-direction:column; gap:0.5rem;">
                <div><strong>Subject Target:</strong> ${state.subject}</div>
                <div><strong>Exam Pattern:</strong> ${state.mode}</div>
                <div><strong>Questions:</strong> ${state.questionCount} Questions</div>
                <div><strong>Duration:</strong> ${state.duration} Minutes</div>
                <div><strong>Syllabus:</strong> <span style="color:var(--accent-blue)">${state.chapters}</span></div>
            </div>
            
            <div style="margin-top: 1.5rem;">
                <button class="btn btn-primary w-100" onclick="window.location.href='/upload/upload.html'">Proceed contribute Questions</button>
            </div>
        </div>
    `;
}