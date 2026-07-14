import { checkAuthState } from '../js/auth.js';
import { db } from '../js/firebase.js';
import { ref, get } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
// Commented out dbSeed to prevent it from overwriting your live dynamic tests
// import { initializeProductionData } from '../js/dbSeed.js';

document.addEventListener("DOMContentLoaded", () => {
    checkAuthState(async (user, dbUser) => {
        if (!user || !dbUser) {
            window.location.href = '/';
            return;
        }
        await renderExamDashboard(user.uid);
    });
});

async function renderExamDashboard(uid) {
    const testsContainer = document.getElementById('tests-container');
    const tableBody = document.getElementById('history-table-body');
    
    const [testsSnap, attemptsSnap, resultsSnap] = await Promise.all([
        get(ref(db, 'tests')),
        get(ref(db, `attempts/${uid}`)),
        get(ref(db, `results/${uid}`))
    ]);

    testsContainer.innerHTML = '';
    
    if (!testsSnap.exists()) {
        testsContainer.innerHTML = '<p style="color:var(--text-muted)">No Tests currently published by the community.</p>';
    } else {
        const tests = testsSnap.val();
        const attempts = attemptsSnap.exists() ? attemptsSnap.val() : {};

        Object.keys(tests).forEach(id => {
            const test = tests[id];
            // Skip invalid nodes
            if(!test || !test.title) return;

            const userAttempt = attempts[id];
            
            let visualStatus = test.status || 'Published';
            let actionMarkup = `<button class="btn btn-primary w-100 action-trigger" data-id="${id}">Start Test</button>`;
            
            if (userAttempt && userAttempt.status === 'Completed') {
                visualStatus = 'Attempted';
                actionMarkup = `<button class="btn btn-secondary w-100 action-results" data-id="${id}"><i class="ph ph-trend-up"></i> View Result</button>`;
            } else if (userAttempt && userAttempt.status === 'InProgress') {
                visualStatus = 'Live';
                actionMarkup = `<button class="btn btn-primary w-100 action-trigger" data-id="${id}"><i class="ph ph-play-pause"></i> Resume Test</button>`;
            }

            const card = document.createElement('div');
            card.className = 'test-card glass';
            card.innerHTML = `
                <div>
                    <div class="card-meta-top">
                        <span class="test-num">Test #${test.testNumber || 'N/A'}</span>
                        <span class="status-tag ${visualStatus.toLowerCase()}">${visualStatus}</span>
                    </div>
                    <h3>${test.title}</h3>
                    <p class="chapters-list">${test.chapters || 'Mixed'}</p>
                </div>
                <div>
                    <div class="stats-row">
                        <div class="stat-item"><i class="ph ph-file-text"></i> ${test.questionCount || '?'} Questions</div>
                        <div class="stat-item"><i class="ph ph-timer"></i> ${test.duration || 60} Mins</div>
                        <div class="stat-item"><i class="ph ph-info"></i> +${test.positiveMarks || 4} / -${test.negativeMarks || 1}</div>
                        <div class="stat-item"><i class="ph ph-desktop"></i> Online</div>
                    </div>
                    ${actionMarkup}
                </div>
            `;
            testsContainer.appendChild(card);
        });

        document.querySelectorAll('.action-trigger').forEach(btn => {
            btn.addEventListener('click', (e) => {
                window.location.href = `/exam/exam.html?id=${e.target.dataset.id}`;
            });
        });

        document.querySelectorAll('.action-results').forEach(btn => {
            btn.addEventListener('click', () => {
                window.location.href = `/analytics/analytics.html`;
            });
        });
    }

    // Populate Historical Attempt Tables
    tableBody.innerHTML = '';
    const results = resultsSnap.exists() ? resultsSnap.val() : {};
    
    if (Object.keys(results).length === 0) {
        tableBody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-muted);">No records found.</td></tr>`;
        return;
    }

    Object.keys(results).forEach(key => {
        const res = results[key];
        const dateFormatted = new Date(res.submittedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        const durationFormatted = `${Math.floor(res.timeTaken / 60)}m ${res.timeTaken % 60}s`;
        
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><strong>${res.testTitle}</strong><br><span style="font-size:0.8rem; color:var(--text-muted)">${res.subject || 'General'}</span></td>
            <td>${dateFormatted}</td>
            <td><span style="color:var(--accent-blue); font-weight:600">${res.marks}</span> Marks</td>
            <td>${res.accuracy}%</td>
            <td>${durationFormatted}</td>
        `;
        tableBody.appendChild(row);
    });
}