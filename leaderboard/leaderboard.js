import { checkAuthState } from '../js/auth.js';
import { db } from '../js/firebase.js';
import { ref, get } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

document.addEventListener("DOMContentLoaded", () => {
    checkAuthState(async (user, dbUser) => {
        if (!user || !dbUser) {
            window.location.href = '/';
            return;
        }
        await setupLeaderboardContext();
    });
});

async function setupLeaderboardContext() {
    const filterSelect = document.getElementById('test-select-filter');
    
    const testsSnap = await get(ref(db, 'tests'));
    if (!testsSnap.exists()) return;

    const tests = testsSnap.val();
    filterSelect.innerHTML = '';
    
    Object.keys(tests).forEach(id => {
        const option = document.createElement('option');
        option.value = id;
        
        // Consistent Naming: Use Test Number format
        const testData = tests[id];
        const label = testData.testNumber ? `Test ${testData.testNumber}` : testData.title;
        option.textContent = label;
        filterSelect.appendChild(option);
    });

    filterSelect.addEventListener('change', (e) => {
        fetchAndRenderStandings(e.target.value);
    });

    // Default init loading first record
    if (Object.keys(tests).length > 0) {
        fetchAndRenderStandings(Object.keys(tests)[0]);
    }
}

async function fetchAndRenderStandings(testId) {
    const targetBody = document.getElementById('leaderboard-target-body');
    targetBody.innerHTML = `<tr><td colspan="5" style="text-align:center"><i class="ph ph-spinner ph-spin"></i> Re-sorting clusters...</td></tr>`;

    const boardSnap = await get(ref(db, `leaderboards/${testId}`));
    
    if (!boardSnap.exists()) {
        targetBody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-muted)">No attempt data exists for this specific evaluation model parameter.</td></tr>`;
        return;
    }

    const profiles = Object.values(boardSnap.val());

    // Algorithmic Sorting Engine Matrix: Score (Descending) -> Time Taken (Ascending)
    profiles.sort((a, b) => {
        if (b.marks !== a.marks) {
            return b.marks - a.marks;
        }
        return a.timeTaken - b.timeTaken;
    });

    targetBody.innerHTML = '';
    
    profiles.forEach((p, idx) => {
        const currentRank = idx + 1;
        let pillClass = 'standard';
        if (currentRank === 1) pillClass = 'gold';
        else if (currentRank === 2) pillClass = 'silver';
        else if (currentRank === 3) pillClass = 'bronze';

        // Time formatting
        const timeVal = p.timeTaken || 0;
        const durationStr = `${Math.floor(timeVal / 60)}m ${timeVal % 60}s`;
        const fallBackAvatar = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(p.name)}`;

        const row = document.createElement('tr');
        row.innerHTML = `
            <td><div class="rank-pill ${pillClass}">${currentRank}</div></td>
            <td>
                <div class="profile-cell">
                    <img src="${p.photoURL || fallBackAvatar}" class="avatar-board" alt="">
                    <span>${p.name}</span>
                </div>
            </td>
            <td><strong style="color:var(--accent-blue)">${p.marks}</strong> points</td>
            <td>${p.accuracy}%</td>
            <td>${durationStr}</td>
        `;
        targetBody.appendChild(row);
    });
}