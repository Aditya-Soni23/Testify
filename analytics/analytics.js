import { checkAuthState } from '../js/auth.js';
import { db } from '../js/firebase.js';
import { ref, get } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

let currentUser = null;
let accuracyChartInstance = null;

document.addEventListener("DOMContentLoaded", () => {
    checkAuthState(async (user) => {
        if (!user) { window.location.href = '/'; return; }
        currentUser = user;
        
        // Navigation setup
        document.getElementById('nav-dashboard').onclick = () => window.location.href = '/dashboard/dashboard.html';
        document.getElementById('nav-tests').onclick = () => window.location.href = '/tests/tests.html';
        
        await loadAvailableTests();
    });

    // Main Dropdown Listener
    document.getElementById('test-selector').addEventListener('change', (e) => {
        if(e.target.value) loadAnalytics(e.target.value);
    });

    // Review Button Listener (Fixed ID)
    document.getElementById('trigger-review-btn')?.addEventListener('click', () => {
        const selectedTestId = document.getElementById('test-selector').value; 
        if(!selectedTestId) {
            alert("Please select an exam to review first.");
            return;
        }
        window.location.href = `/exam/exam.html?id=${selectedTestId}&mode=review`;
    });

});

async function loadAvailableTests() {
    const select = document.getElementById('test-selector');
    const snapshot = await get(ref(db, 'tests'));
    
    if (snapshot.exists()) {
        select.innerHTML = '<option value="">Select an Examination...</option>';
        snapshot.forEach(child => {
            const data = child.val();
            // Consistent Naming: Use Test Number format
            const label = data.testNumber ? `Test ${data.testNumber}` : data.title;
            select.innerHTML += `<option value="${child.key}">${label}</option>`;
        });
    } else {
        select.innerHTML = '<option value="">No tests available</option>';
    }
}

async function loadAnalytics(testId) {
    const errorState = document.getElementById('analytics-error');
    const contentState = document.getElementById('analytics-content');
    
    const resultSnap = await get(ref(db, `results/${currentUser.uid}/${testId}`));
    const testMetaSnap = await get(ref(db, `tests/${testId}`));
    
    if (!resultSnap.exists()) {
        if (contentState) contentState.classList.add('hidden');
        if (errorState) errorState.classList.remove('hidden');
        return;
    }

    const result = resultSnap.val();
    const testMeta = testMetaSnap.val();
    const totalQuestions = result.correct + result.wrong + result.skipped;
    const maxMarks = totalQuestions * (testMeta.positiveMarks || 4);

    if (errorState) errorState.classList.add('hidden');
    if (contentState) contentState.classList.remove('hidden');

    // Update Dashboard via Helper
    updateAnalyticsDashboard(result, maxMarks);
}

function updateAnalyticsDashboard(result, maxMarks) {
    // Basic Stats
    if(document.getElementById('stat-marks')) document.getElementById('stat-marks').innerText = result.marks;
    if(document.getElementById('stat-total-marks')) document.getElementById('stat-total-marks').innerText = maxMarks;
    if(document.getElementById('stat-accuracy')) document.getElementById('stat-accuracy').innerText = `${result.accuracy}%`;
    if(document.getElementById('stat-correct')) document.getElementById('stat-correct').innerText = result.correct;
    if(document.getElementById('stat-wrong')) document.getElementById('stat-wrong').innerText = result.wrong;
    if(document.getElementById('stat-skipped')) document.getElementById('stat-skipped').innerText = result.skipped;
    
    // Time Taken Display
    const timeVal = result.timeTaken || 0;
    const timeDisplay = `${Math.floor(timeVal / 60)}m ${timeVal % 60}s`;
    
    const timeEl = document.getElementById('stat-time');
    if(timeEl) timeEl.innerText = timeDisplay;
    
    renderChart(result);
}

function renderChart(result) {
    const ctx = document.getElementById('accuracyChart')?.getContext('2d');
    if (!ctx) return;
    
    if(accuracyChartInstance) accuracyChartInstance.destroy();

    accuracyChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Correct', 'Wrong', 'Skipped'],
            datasets: [{
                data: [result.correct, result.wrong, result.skipped],
                backgroundColor: ['#10b981', '#ef4444', '#3f3f46'],
                borderColor: '#18181b',
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { position: 'bottom', labels: { color: '#a1a1aa' } }
            }
        }
    });
}
