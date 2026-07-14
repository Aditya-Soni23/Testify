import { checkAuthState } from '../js/auth.js';
import { db } from '../js/firebase.js';
import { ref, get, push, remove, onValue, update, runTransaction } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";



let currentUserId = null;
let currentUserName = null;
let globalTargetLimit = 0;
let currentActiveState = {};
let editingQId = null; 

document.addEventListener("DOMContentLoaded", () => {
    checkAuthState((user, dbUser) => {
        if (!user) { window.location.href = '../index.html'; return; }
        currentUserId = user.uid;
        currentUserName = dbUser.name;
        initInterfaceUtilities();
        bindDataPipelineStreams();
    });
});
function initInterfaceUtilities() {
    const mappings = { 'nav-dashboard': '../dashboard/dashboard.html', 'nav-tests': '../tests/tests.html', 'nav-polling': '../polling/polling.html', 'nav-upload': '../upload/upload.html', 'nav-chat': '../chat/chat.html' };
    Object.keys(mappings).forEach(id => document.getElementById(id)?.addEventListener('click', () => window.location.href = mappings[id]));

    document.getElementById('tab-manual').addEventListener('click', () => toggleTabs('manual'));
    document.getElementById('tab-ocr').addEventListener('click', () => toggleTabs('ocr'));

    document.getElementById('q-correct').addEventListener('input', (e) => {
        const type = document.getElementById('q-type').value;
        let val = e.target.value;
        
        if (type === 'MCQ') {
            val = val.replace(/[^a-dA-D]/g, '').toUpperCase();
            if (val.length > 1) val = val[0]; 
        } else if (type === 'MCQ-Multi') {
            val = val.replace(/[^a-dA-D]/g, '').toUpperCase();
            val = Array.from(new Set(val.split(''))).sort().join(''); 
        } else {
            val = val.replace(/[^0-9.-]/g, ''); 
        }
        e.target.value = val;
    });

    // BUG 2 FIX: Enforce hard display overrides to guarantee numerical options hide
    document.getElementById('q-type').addEventListener('change', (e) => {
        const mcqBlock = document.getElementById('mcq-options-block');
        document.getElementById('q-correct').value = ''; 
        
        if (e.target.value === 'Numerical') {
            mcqBlock.style.display = 'none'; // Hard hide
            document.querySelectorAll('#mcq-options-block input').forEach(el => {
                el.removeAttribute('required');
                el.value = ''; // Clear stale data
            });
        } else {
            mcqBlock.style.display = 'block'; // Hard show
            document.querySelectorAll('#mcq-options-block input').forEach(el => el.setAttribute('required', 'true'));
        }
    });

    document.getElementById('question-form').addEventListener('submit', validateAndInjectQuestion);
    document.getElementById('cancel-edit-btn').addEventListener('click', resetFormState);

    document.getElementById('ocr-trigger').addEventListener('click', () => document.getElementById('ocr-file-input').click());
    document.getElementById('ocr-file-input').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        const statusText = document.getElementById('ocr-status-text');
        statusText.innerHTML = '<i class="ph ph-spinner ph-spin"></i> Extracting text...';
        
        try {
            const result = await Tesseract.recognize(file, 'eng');
            document.getElementById('q-text').value = result.data.text;
            statusText.innerHTML = 'Extracted! Switch to Manual Definition to edit.';
            setTimeout(() => toggleTabs('manual'), 1000);
        } catch(err) {
            statusText.innerHTML = 'OCR Failed. Please try typing manually.';
        }
        e.target.value = ''; 
    });
}

function toggleTabs(target) {
    if (target === 'manual') {
        document.getElementById('tab-manual').classList.add('active');
        document.getElementById('tab-ocr').classList.remove('active');
        document.getElementById('question-form').classList.remove('hidden');
        document.getElementById('ocr-module-panel').classList.add('hidden');
    } else {
        document.getElementById('tab-manual').classList.remove('active');
        document.getElementById('tab-ocr').classList.add('active');
        document.getElementById('question-form').classList.add('hidden');
        document.getElementById('ocr-module-panel').classList.remove('hidden');
    }
}

function bindDataPipelineStreams() {
    onValue(ref(db, 'system_state/poll'), (snapshot) => {
        if (!snapshot.exists() || (snapshot.val().status !== 'uploading' && snapshot.val().status !== 'compiling')) {
            document.body.innerHTML = `
<div style="
    display:flex;
    flex-direction:column;
    justify-content:center;
    align-items:center;
    width:100vw;
    height:100vh;
    margin:0;
    font-family:sans-serif;
    color:white;
    text-align:center;
">
    <h2>Window Closed!</h2>
    <p>Move on to the next Polling or Write the Test!</p>

    <a href="../tests/tests.html" style="text-decoration:none;">
        <button style="
            margin-top:20px;
            padding:12px 28px;
            border:none;
            border-radius:8px;
            background:#4DA3FF;
            color:white;
            font-size:16px;
            cursor:pointer;
        ">
            Go to Test
        </button>
    </a>
</div>
`;
            return;
        }

        currentActiveState = snapshot.val();
        globalTargetLimit = currentActiveState.questionCount;
        document.getElementById('target-spec-label').textContent = `${currentActiveState.subject} | ${currentActiveState.mode} | Target: [${currentActiveState.chapters}]`;
        
        // BUG 1 FIX: Safely check for "main" inside "JEE Main"
        const qTypeSelect = document.getElementById('q-type');
        const mcqMultiOpt = Array.from(qTypeSelect.options).find(opt => opt.value === 'MCQ-Multi');
        const safeModeStr = currentActiveState.mode ? currentActiveState.mode.toLowerCase() : '';
        
        if (safeModeStr.includes('main')) {
            if (mcqMultiOpt) mcqMultiOpt.style.display = 'none';
            if (qTypeSelect.value === 'MCQ-Multi') {
                qTypeSelect.value = 'MCQ';
                qTypeSelect.dispatchEvent(new Event('change'));
            }
        } else {
            if (mcqMultiOpt) mcqMultiOpt.style.display = 'block';
        }
        
        onValue(ref(db, 'questions_pool'), (poolSnap) => {
            const pool = poolSnap.exists() ? poolSnap.val() : {};
            processSystemCalculations(pool);
        });
    });
}

function processSystemCalculations(pool) {
    let globalCounter = 0;
    let personalCounter = 0;
    const personalFeed = document.getElementById('personal-questions-feed');
    personalFeed.innerHTML = '';

    Object.keys(pool).forEach(userId => {
        Object.keys(pool[userId]).forEach(qId => {
            globalCounter++;
            if (userId === currentUserId) {
                personalCounter++;
                renderQuestionItemRow(qId, pool[userId][qId], personalFeed);
            }
        });
    });

    document.getElementById('my-count-badge').textContent = personalCounter;
    
    const completionPct = Math.min((globalCounter / globalTargetLimit) * 100, 100);
    document.getElementById('upload-progress-fill').style.width = `${completionPct}%`;
    document.getElementById('progress-numeric-lbl').textContent = `${globalCounter} / ${globalTargetLimit} Questions Uploaded`;
    
    if (globalCounter >= globalTargetLimit && currentActiveState.status === 'uploading') {
        const pollStatusRef = ref(db, 'system_state/poll');
        runTransaction(pollStatusRef, (currentPollData) => {
            if (currentPollData && currentPollData.status === 'uploading') {
                currentPollData.status = 'compiling'; 
                return currentPollData;
            }
            return; 
        }).then((result) => {
            if (result.committed) {
                executeAutoTestCompilation(pool);
            }
        }).catch((err) => console.error("Lock sequence failed:", err));
    }
}

function renderQuestionItemRow(id, q, container) {
    const item = document.createElement('div');
    item.className = 'q-box-item';
    item.style.padding = '1rem';
    item.style.background = 'rgba(255,255,255,0.05)';
    item.style.marginBottom = '0.5rem';
    item.style.borderRadius = '8px';
    
    let answerDisplay;
    if (q.type === 'MCQ') {
        answerDisplay = String.fromCharCode(65 + parseInt(q.correctAnswer));
    } else if (q.type === 'MCQ-Multi') {
        answerDisplay = Array.isArray(q.correctAnswer) 
            ? q.correctAnswer.map(idx => String.fromCharCode(65 + parseInt(idx))).join('') 
            : q.correctAnswer;
    } else {
        answerDisplay = q.correctAnswer;
    }

    item.innerHTML = `
        <div style="font-size:0.9rem; font-weight:600; color:white;">${q.text.substring(0,50)}...</div>
        <div style="font-size:0.75rem; color:var(--text-muted); margin-top:0.25rem;">Type: ${q.type} | Ans: ${answerDisplay}</div>
        <div class="q-actions" style="margin-top: 0.5rem; display: flex; gap: 0.5rem;">
            <button class="btn btn-secondary" style="padding: 0.2rem 0.5rem; font-size: 0.8rem;" id="edit-${id}">Edit</button>
            <button class="btn btn-danger" style="padding: 0.2rem 0.5rem; font-size: 0.8rem;" id="del-${id}">Drop</button>
        </div>
    `;
    container.appendChild(item);
    
    document.getElementById(`edit-${id}`).addEventListener('click', () => {
        editingQId = id;
        document.getElementById('q-text').value = q.text;
        document.getElementById('q-type').value = q.type;
        document.getElementById('q-chapter').value = q.chapter;
        document.getElementById('q-correct').value = answerDisplay;
        
        if (q.type === 'MCQ' || q.type === 'MCQ-Multi') {
            document.getElementById('opt-a').value = q.options[0];
            document.getElementById('opt-b').value = q.options[1];
            document.getElementById('opt-c').value = q.options[2];
            document.getElementById('opt-d').value = q.options[3];
            document.getElementById('mcq-options-block').classList.remove('hidden');
        } else {
            document.getElementById('mcq-options-block').classList.add('hidden');
        }
        
        document.getElementById('submit-btn').textContent = "Update Record";
        document.getElementById('cancel-edit-btn').classList.remove('hidden');
        document.getElementById('tab-manual').click();
    });

    document.getElementById(`del-${id}`).addEventListener('click', () => remove(ref(db, `questions_pool/${currentUserId}/${id}`)));
}

function resetFormState() {
    editingQId = null;
    document.getElementById('question-form').reset();
    document.getElementById('submit-btn').textContent = "Submit";
    document.getElementById('cancel-edit-btn').classList.add('hidden');
}

async function validateAndInjectQuestion(e) {
    e.preventDefault();

    const currentOwnCount = parseInt(document.getElementById('my-count-badge').textContent);
    if (!editingQId && currentOwnCount >= 5) {
        alert("Security Rule Alert: Sorry (5 questions max per account).");
        return;
    }

    const payload = {
        text: document.getElementById('q-text').value,
        type: document.getElementById('q-type').value,
        chapter: document.getElementById('q-chapter').value || 'General',
        difficulty: document.getElementById('q-diff').value,
        solution: document.getElementById('q-sol').value || '',
        author: currentUserName,
        timestamp: Date.now()
    };

    const rawAnswer = document.getElementById('q-correct').value.trim();
    const map = { 'A': 0, 'B': 1, 'C': 2, 'D': 3 };

    if (payload.type === 'MCQ') {
        payload.correctAnswer = map[rawAnswer.toUpperCase()];
        payload.options = [
            document.getElementById('opt-a').value,
            document.getElementById('opt-b').value,
            document.getElementById('opt-c').value,
            document.getElementById('opt-d').value
        ];
    } else if (payload.type === 'MCQ-Multi') {
        payload.correctAnswer = rawAnswer.toUpperCase().split('').map(char => map[char]);
        payload.options = [
            document.getElementById('opt-a').value,
            document.getElementById('opt-b').value,
            document.getElementById('opt-c').value,
            document.getElementById('opt-d').value
        ];
    } else {
        payload.correctAnswer = parseFloat(rawAnswer) || 0;
    }

    // Swapped .set() for .update() 
    if (editingQId) {
        await update(ref(db, `questions_pool/${currentUserId}/${editingQId}`), payload);
    } else {
        const newRecordRef = push(ref(db, `questions_pool/${currentUserId}`));
        await update(newRecordRef, payload);
    }
    
    resetFormState();
}

async function executeAutoTestCompilation(pool) {
    const compiledQuestionsObject = {};
    let idx = 0;
    
    Object.values(pool).forEach(userNodes => {
        Object.values(userNodes).forEach(q => {
            compiledQuestionsObject[`q_${idx}`] = {
                index: idx,
                text: q.text,
                options: q.options || null,
                correctAnswer: q.correctAnswer !== undefined ? q.correctAnswer : "",
                type: q.type,
                subject: currentActiveState.subject || 'General',
                chapter: q.chapter || 'General'
            };
            idx++;
        });
    });

    const runtimeTestIdentifier = "collaborative-test-" + Date.now();
    
    const testsSnap = await get(ref(db, 'tests'));
    let nextTestNum = 1;
    if (testsSnap.exists()) {
        nextTestNum = Object.keys(testsSnap.val()).length + 1;
    }
    const paddedTestNum = String(nextTestNum).padStart(2, '0');

    const finalIntegratedTestPayload = {
        title: `Collaborative Exam: ${currentActiveState.subject || 'Mixed'}`,
        chapters: currentActiveState.chapters || 'Various',
        duration: currentActiveState.duration || 60,
        questionCount: globalTargetLimit,
        positiveMarks: 4,
        negativeMarks: 1,
        status: 'Published', 
        testNumber: paddedTestNum 
    };

    const operationsUpdateMap = {};
    operationsUpdateMap[`tests/${runtimeTestIdentifier}`] = finalIntegratedTestPayload;
    operationsUpdateMap[`questions/${runtimeTestIdentifier}`] = compiledQuestionsObject; 
    
    // THE FIX: Instead of "completed", we automatically reset the global engine back to "voting"
    operationsUpdateMap['system_state/poll'] = { status: "voting", lastPublishedId: runtimeTestIdentifier };
    
    // Clear out the temporary pipeline data so the next cycle starts fresh
    operationsUpdateMap['votes'] = null;
    operationsUpdateMap['questions_pool'] = null;

    await update(ref(db), operationsUpdateMap);
    
    alert("Test is live!");
    // Redirects user to tests, while the polling window silently resets in the background
    window.location.href = '../tests/tests.html';
}