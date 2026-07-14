import { checkAuthState } from '../js/auth.js';
import { 
    fetchExamMetadata, fetchExamQuestions, syncResponseState, 
    syncAttemptMetadata, getSavedProgress, processAndSubmitExam 
} from '../js/examEngine.js';

let currentUser = null;
let testId = null;
let isReviewMode = false; // NEW: Global state for review module
let examQuestionsArray = [];
let savedResponseTrackingMap = {};
let activelySelectedQuestionIndex = 0;
let remainingExamDurationSeconds = 0;
let globalCountdownTimerInterval = null;
let tabSwitchCount = 0; 
let isExamActive = false;

document.addEventListener("DOMContentLoaded", () => {
    const URLQueryParameters = new URLSearchParams(window.location.search);
    testId = URLQueryParameters.get('id') || URLQueryParameters.get('testId');
    isReviewMode = URLQueryParameters.get('mode') === 'review'; // Check URL for review flag
    
    if (!testId) {
        alert("Fatal Error: Target evaluation contextual token signature is missing.");
        window.location.href = '../tests/tests.html';
        return;
    }

    checkAuthState((user, dbUser) => {
        if (!user) { window.location.href = '../index.html'; return; }
        currentUser = { ...user, displayName: dbUser.name, photoURL: user.photoURL };
        bootstrapEvaluationWorkspace();
    });
});

async function bootstrapEvaluationWorkspace() {
    try {
        const metadata = await fetchExamMetadata(testId);
        const questionsData = await fetchExamQuestions(testId);
        
        if (!metadata || !questionsData) return;

        examQuestionsArray = Object.keys(questionsData).map(key => ({
            id: key, ...questionsData[key]
        })).sort((a, b) => a.index - b.index);

        const progressState = await getSavedProgress(currentUser.uid, testId);
        savedResponseTrackingMap = progressState.responses || {};

        // Normal mode execution barrier
        if (!isReviewMode && progressState.metadata && progressState.metadata.status === 'Completed') {
            alert("This module examination lifecycle has already concluded.");
            window.location.href = '../tests/tests.html';
            return;
        }

        // Review Mode Auto-Start (Bypass instructions)
        if (isReviewMode) {
            document.getElementById('instructions-container').style.display = 'none';
            document.getElementById('exam-workspace').classList.remove('hidden');
            document.getElementById('exam-workspace').style.display = 'block'; 
            
            // Adjust UI for Review
            document.getElementById('workspace-test-title').textContent = `${metadata.title} [REVIEW MODE]`;
            document.getElementById('subject-tag').textContent = metadata.subject;
            document.getElementById('candidate-name').textContent = currentUser.displayName;

            const backBtn = document.createElement("button");
            backBtn.textContent = "← Back to Dashboard";

            backBtn.style.cssText = `
                position: fixed;
                top: 20px;
                left: 500px;
                z-index: 99999;
                padding: 10px 18px;
                background: #27272a;
                color: white;
                border: none;
                border-radius: 8px;
                cursor: pointer;
            `;

            backBtn.onclick = () => {
                window.location.href = "../dashboard/dashboard.html";
            };

            document.body.appendChild(backBtn);
            if (currentUser.photoURL) document.getElementById('candidate-img').src = currentUser.photoURL;
            
            // Hide live-test exclusive elements
            const timerEl = document.getElementById('time-countdown');
            if (timerEl) timerEl.parentElement.style.display = 'none';
            
            initializeInteractiveUIPanelElements();
            loadActiveQuestionIntoDisplayViewport();
            return; // Stop here, no timer needed
        }

        remainingExamDurationSeconds = progressState.metadata?.timeLeft !== undefined 
            ? progressState.metadata.timeLeft 
            : metadata.duration * 60;
        tabSwitchCount = progressState.metadata?.tabSwitches || 0;

        document.getElementById('instr-title').textContent = metadata.title || 'Examination Module';
        document.getElementById('instr-time').textContent = metadata.duration || '-';
        document.getElementById('instr-count').textContent = examQuestionsArray.length || '-';
        document.getElementById('instr-marks').textContent = (examQuestionsArray.length * (metadata.positiveMarks || 4)) || '-';

        document.getElementById('accept-rules').addEventListener('change', (e) => {
            document.getElementById('begin-exam-btn').disabled = !e.target.checked;
        });

        document.getElementById('begin-exam-btn').addEventListener('click', () => {
            document.getElementById('instructions-container').style.display = 'none';
            document.getElementById('exam-workspace').classList.remove('hidden');
            document.getElementById('exam-workspace').style.display = 'block'; 
            
            document.getElementById('workspace-test-title').textContent = metadata.title;
            document.getElementById('subject-tag').textContent = metadata.subject;
            document.getElementById('candidate-name').textContent = currentUser.displayName;
            if (currentUser.photoURL) document.getElementById('candidate-img').src = currentUser.photoURL;

            initializeInteractiveUIPanelElements();
            loadActiveQuestionIntoDisplayViewport();
            beginActiveCountdownProcessingLoop();

            isExamActive = true;
            setupAntiCheatMonitoring();
        });

    } catch (err) {
        console.error("Initialization pipeline exception:", err);
    }
}

function initializeInteractiveUIPanelElements() {
    document.getElementById('btn-prev')?.addEventListener('click', () => {
        if (activelySelectedQuestionIndex > 0) changeQuestionIndexContext(activelySelectedQuestionIndex - 1);
    });

    document.getElementById('btn-save-next')?.addEventListener('click', async () => {
        if (!isReviewMode) {
            await commitCurrentQuestionProgressState('ANSWERED');
        }
        if (activelySelectedQuestionIndex < examQuestionsArray.length - 1) changeQuestionIndexContext(activelySelectedQuestionIndex + 1);
    });

    if (isReviewMode) {
        // Hide specific mutation buttons during review
        const markBtn = document.getElementById('btn-mark');
        const clearBtn = document.getElementById('btn-clear');
        const submitBtn = document.getElementById('btn-submit-exam');
        const saveNextBtn = document.getElementById('btn-save-next');
        
        if (markBtn) markBtn.style.display = 'none';
        if (clearBtn) clearBtn.style.display = 'none';
        if (submitBtn) submitBtn.style.display = 'none';
        if (saveNextBtn) saveNextBtn.textContent = 'Next Question';
    } else {
        document.getElementById('btn-mark')?.addEventListener('click', async () => {
            const targetQ = examQuestionsArray[activelySelectedQuestionIndex];
            const existingVal = savedResponseTrackingMap[targetQ.id]?.value;
            const targetStatus = (existingVal !== undefined && existingVal !== "") ? 'MARKED_ANSWERED' : 'MARKED';
            await commitCurrentQuestionProgressState(targetStatus);
            if (activelySelectedQuestionIndex < examQuestionsArray.length - 1) changeQuestionIndexContext(activelySelectedQuestionIndex + 1);
        });

        document.getElementById('btn-clear')?.addEventListener('click', async () => {
            const targetQ = examQuestionsArray[activelySelectedQuestionIndex];
            savedResponseTrackingMap[targetQ.id] = { value: "", status: 'VISITED' };
            await syncResponseState(currentUser.uid, testId, targetQ.id, savedResponseTrackingMap[targetQ.id]);
            loadActiveQuestionIntoDisplayViewport();
        });

        document.getElementById('btn-submit-exam')?.addEventListener('click', () => {
            const counts = { answered: 0, marked: 0, remaining: 0 };
            examQuestionsArray.forEach(q => {
                const state = savedResponseTrackingMap[q.id]?.status;
                if (state === 'ANSWERED' || state === 'MARKED_ANSWERED') counts.answered++;
                else if (state === 'MARKED') counts.marked++;
                else counts.remaining++;
            });

            document.getElementById('m-ans').textContent = counts.answered;
            document.getElementById('m-rev').textContent = counts.marked;
            document.getElementById('m-rem').textContent = counts.remaining;

            document.getElementById('submit-confirm-modal').classList.remove('hidden');
            document.getElementById('submit-confirm-modal').style.display = 'flex'; 
        });

        document.getElementById('confirm-cancel')?.addEventListener('click', () => {
            document.getElementById('submit-confirm-modal').classList.add('hidden');
            document.getElementById('submit-confirm-modal').style.display = 'none';
        });

        document.getElementById('confirm-finalize')?.addEventListener('click', async (e) => {
            isExamActive = false; // Prevent false alarms during exit
            if (globalCountdownTimerInterval) clearInterval(globalCountdownTimerInterval);
            
            e.target.innerHTML = "Processing...";
            e.target.disabled = true;
            await processAndSubmitExam(currentUser.uid, testId, currentUser.displayName, currentUser.photoURL);
            window.location.href = '../dashboard/dashboard.html'; 
        });
    }
}

function loadActiveQuestionIntoDisplayViewport() {
    const currentQuestion = examQuestionsArray[activelySelectedQuestionIndex];
    if (!currentQuestion) return;

    if (!isReviewMode && (!savedResponseTrackingMap[currentQuestion.id] || savedResponseTrackingMap[currentQuestion.id].status === 'NOT_VISITED')) {
        savedResponseTrackingMap[currentQuestion.id] = { 
            value: savedResponseTrackingMap[currentQuestion.id]?.value || "", 
            status: 'VISITED' 
        };
        syncResponseState(currentUser.uid, testId, currentQuestion.id, savedResponseTrackingMap[currentQuestion.id]);
    }

    document.getElementById('active-q-index').textContent = (activelySelectedQuestionIndex + 1);
    document.getElementById('active-q-type').textContent = currentQuestion.type;
    document.getElementById('question-text-body').textContent = currentQuestion.text;

    const mcqWrapperBlock = document.getElementById('interaction-options-wrapper');
    if (!mcqWrapperBlock) return;
    mcqWrapperBlock.innerHTML = ''; 

    const normalizedType = String(currentQuestion.type).toUpperCase();
    
    if (normalizedType.includes('MCQ')) {
        let activeSelectedIndices = [];
        const savedVal = savedResponseTrackingMap[currentQuestion.id]?.value;
        if (savedVal !== undefined && savedVal !== "") {
            activeSelectedIndices = Array.isArray(savedVal) ? savedVal : String(savedVal).split(',').map(Number);
        }

        const correctArr = Array.isArray(currentQuestion.correctAnswer) ? currentQuestion.correctAnswer : String(currentQuestion.correctAnswer).split(',').map(Number);

        currentQuestion.options?.forEach((optionText, idx) => {
            const optionBtn = document.createElement('button');
            const isUserSelection = activeSelectedIndices.includes(idx);
            
            let isCorrectSelection = false;
            if (normalizedType.includes('MULTI')) {
                isCorrectSelection = correctArr.includes(idx);
            } else {
                isCorrectSelection = parseInt(currentQuestion.correctAnswer) === idx;
            }

            // Default Styling
            let borderStyle = isUserSelection ? '2px solid #3b82f6' : '1px solid rgba(255,255,255,0.1)';
            let bgStyle = isUserSelection ? 'rgba(59, 130, 246, 0.2)' : 'rgba(255,255,255,0.05)';
            let textColor = isUserSelection ? '#3b82f6' : '#888';

            // Review Mode Overrides (Green for correct, Red for wrong user choice)
            if (isReviewMode) {
                if (isCorrectSelection) {
                    borderStyle = '2px solid #34c759'; // True Positive
                    bgStyle = 'rgba(52, 199, 89, 0.2)';
                    textColor = '#34c759';
                } else if (isUserSelection && !isCorrectSelection) {
                    borderStyle = '2px solid #ff3b30'; // False Positive
                    bgStyle = 'rgba(255, 59, 48, 0.2)';
                    textColor = '#ff3b30';
                } else {
                    borderStyle = '1px solid rgba(255,255,255,0.1)';
                    bgStyle = 'rgba(255,255,255,0.02)';
                    textColor = '#555';
                }
            }

            optionBtn.style.display = 'flex';
            optionBtn.style.alignItems = 'center';
            optionBtn.style.gap = '15px';
            optionBtn.style.padding = '12px 20px';
            optionBtn.style.marginBottom = '10px';
            optionBtn.style.width = '100%';
            optionBtn.style.color = '#ffffff'; 
            optionBtn.style.textAlign = 'left';
            optionBtn.style.borderRadius = '8px';
            optionBtn.style.transition = 'all 0.2s ease';
            optionBtn.style.border = borderStyle;
            optionBtn.style.background = bgStyle;
            optionBtn.style.cursor = isReviewMode ? 'default' : 'pointer';

            const visualMarker = normalizedType.includes('MULTI') ? '▢' : '○';
            const markerFilled = normalizedType.includes('MULTI') ? '▣' : '●';
            
            optionBtn.innerHTML = `
                <span style="font-size: 1.2rem; color: ${textColor};">
                    ${isUserSelection ? markerFilled : visualMarker}
                </span> 
                <span><strong>${String.fromCharCode(65 + idx)}.</strong> ${optionText}</span>
            `;

            if (!isReviewMode) {
                optionBtn.addEventListener('click', () => {
                    if (normalizedType.includes('MULTI')) {
                        if (activeSelectedIndices.includes(idx)) {
                            activeSelectedIndices = activeSelectedIndices.filter(i => i !== idx);
                        } else {
                            activeSelectedIndices.push(idx);
                        }
                        savedResponseTrackingMap[currentQuestion.id].value = activeSelectedIndices.sort((a, b) => a - b);
                    } else {
                        savedResponseTrackingMap[currentQuestion.id].value = idx;
                    }
                    loadActiveQuestionIntoDisplayViewport(); 
                });
            }
            mcqWrapperBlock.appendChild(optionBtn);
        });
    } else if (normalizedType === 'NUMERICAL') {
        const numInput = document.createElement('input');
        numInput.type = 'number';
        numInput.step = 'any';
        numInput.placeholder = 'Enter your numerical answer...';
        numInput.style.padding = '15px';
        numInput.style.width = '100%';
        numInput.style.fontSize = '1.2rem';
        numInput.style.color = '#fff';
        numInput.style.border = '1px solid rgba(255,255,255,0.2)';
        numInput.style.background = 'rgba(0,0,0,0.2)';
        numInput.style.borderRadius = '8px';
        numInput.style.marginTop = '1rem';

        const savedVal = savedResponseTrackingMap[currentQuestion.id]?.value;
        if (savedVal !== undefined && savedVal !== "") {
            numInput.value = savedVal;
        }

        if (isReviewMode) {
            numInput.disabled = true;
            const correctAnsLabel = document.createElement('div');
            correctAnsLabel.style.color = '#34c759';
            correctAnsLabel.style.marginTop = '15px';
            correctAnsLabel.style.padding = '10px';
            correctAnsLabel.style.background = 'rgba(52, 199, 89, 0.1)';
            correctAnsLabel.style.border = '1px solid #34c759';
            correctAnsLabel.style.borderRadius = '8px';
            correctAnsLabel.innerHTML = `<strong>Correct Answer Configuration:</strong> ${currentQuestion.correctAnswer}`;
            mcqWrapperBlock.appendChild(numInput);
            mcqWrapperBlock.appendChild(correctAnsLabel);
        } else {
            numInput.addEventListener('input', (e) => {
                savedResponseTrackingMap[currentQuestion.id].value = e.target.value;
            });
            mcqWrapperBlock.appendChild(numInput);
        }
    }

    renderSidebarQuestionNavigationGrid();
    refreshNavigationMetricsCounters();
}

async function commitCurrentQuestionProgressState(targetStatus) {
    if (isReviewMode) return; // Block writes during review

    const currentQ = examQuestionsArray[activelySelectedQuestionIndex];
    const targetValue = savedResponseTrackingMap[currentQ.id]?.value;
    
    let resolvedStatus = targetStatus;
    if (targetValue === undefined || targetValue === "" || (Array.isArray(targetValue) && targetValue.length === 0)) {
        if (targetStatus === 'ANSWERED') resolvedStatus = 'VISITED';
        if (targetStatus === 'MARKED_ANSWERED') resolvedStatus = 'MARKED';
    }

    savedResponseTrackingMap[currentQ.id] = { value: targetValue !== undefined ? targetValue : "", status: resolvedStatus };
    await syncResponseState(currentUser.uid, testId, currentQ.id, savedResponseTrackingMap[currentQ.id]);
    renderSidebarQuestionNavigationGrid();
    refreshNavigationMetricsCounters();
}

function changeQuestionIndexContext(newTargetIndex) {
    activelySelectedQuestionIndex = newTargetIndex;
    loadActiveQuestionIntoDisplayViewport();
}

function renderSidebarQuestionNavigationGrid() {
    const gridContainer = document.getElementById('palette-nodes-container');
    if (!gridContainer) return;
    gridContainer.innerHTML = '';

    const styleMap = {
        'NOT_VISITED': { bg: '#e0e0e0', color: '#000', border: 'none' }, 
        'VISITED': { bg: '#ff3b30', color: '#fff', border: 'none' }, 
        'ANSWERED': { bg: '#34c759', color: '#fff', border: 'none' }, 
        'MARKED': { bg: '#5856d6', color: '#fff', border: 'none' }, 
        'MARKED_ANSWERED': { bg: '#5856d6', color: '#fff', border: '2px solid #34c759' } 
    };

    examQuestionsArray.forEach((q, idx) => {
        const gridCell = document.createElement('button');
        gridCell.textContent = idx + 1;
        
        let styles;

        // Review Mode Status Calculation (Green/Red/Gray based on accuracy)
        if (isReviewMode) {
            const currentResponse = savedResponseTrackingMap[q.id]?.value;
            if (currentResponse === undefined || currentResponse === "" || (Array.isArray(currentResponse) && currentResponse.length === 0)) {
                styles = { bg: '#8e8e93', color: '#fff', border: 'none' }; // Unattempted (Gray)
            } else {
                let isCorrect = false;
                const normalizedType = String(q.type).toUpperCase();
                
                if (normalizedType.includes('MULTI')) {
                    const userArr = Array.isArray(currentResponse) ? currentResponse : String(currentResponse).split(',').map(Number);
                    const correctArr = Array.isArray(q.correctAnswer) ? q.correctAnswer : String(q.correctAnswer).split(',').map(Number);
                    userArr.sort(); correctArr.sort();
                    isCorrect = userArr.length === correctArr.length && userArr.every((val, i) => val === correctArr[i]);
                } else if (normalizedType === 'NUMERICAL') {
                    isCorrect = parseFloat(currentResponse) === parseFloat(q.correctAnswer);
                } else {
                    isCorrect = parseInt(currentResponse) === parseInt(q.correctAnswer);
                }
                // Green if correct, Red if wrong
                styles = { bg: isCorrect ? '#34c759' : '#ff3b30', color: '#fff', border: 'none' };
            }
        } else {
            // Live Test State Fetch
            const state = savedResponseTrackingMap[q.id] ? savedResponseTrackingMap[q.id].status : 'NOT_VISITED';
            styles = styleMap[state] || styleMap['NOT_VISITED'];
        }
        
        gridCell.style.width = '42px';
        gridCell.style.height = '42px';
        gridCell.style.borderRadius = '50%';
        gridCell.style.display = 'flex';
        gridCell.style.alignItems = 'center';
        gridCell.style.justifyContent = 'center';
        gridCell.style.fontWeight = 'bold';
        gridCell.style.cursor = 'pointer';
        gridCell.style.border = styles.border;
        gridCell.style.background = styles.bg;
        gridCell.style.color = styles.color;
        gridCell.style.margin = '4px'; 

        if (idx === activelySelectedQuestionIndex) {
            gridCell.style.outline = '3px solid #fff';
            gridCell.style.outlineOffset = '2px';
            gridCell.style.transform = 'scale(1.15)';
        }

        gridCell.addEventListener('click', () => changeQuestionIndexContext(idx));
        gridContainer.appendChild(gridCell);
    });
}

function refreshNavigationMetricsCounters() {
    if (isReviewMode) {
        // Hide legend in review mode, as colors mean Correct/Wrong, not status
        const legendBox = document.querySelector('.legend-box');
        if (legendBox) legendBox.style.display = 'none';
        return;
    }

    const counts = { not_visited: 0, visited: 0, answered: 0, marked: 0, marked_answered: 0 };
    
    examQuestionsArray.forEach(q => {
        const stateNode = savedResponseTrackingMap[q.id];
        if (stateNode && stateNode.status) counts[stateNode.status.toLowerCase()]++;
        else counts.not_visited++;
    });

    const elNotVis = document.getElementById('count-not-visited');
    const elVis = document.getElementById('count-visited');
    const elAns = document.getElementById('count-answered');
    const elMark = document.getElementById('count-marked');
    const elMarkAns = document.getElementById('count-marked-answered');
    
    if (elNotVis) elNotVis.textContent = counts.not_visited;
    if (elVis) elVis.textContent = counts.visited;
    if (elAns) elAns.textContent = counts.answered;
    if (elMark) elMark.textContent = counts.marked;
    if (elMarkAns) elMarkAns.textContent = counts.marked_answered;
}

/* ==========================================================================
   ANTI-CHEAT: TAB SWITCH & WINDOW BLUR MONITORING
   ========================================================================== */
function setupAntiCheatMonitoring() {
    if (isReviewMode) return;

    document.addEventListener("visibilitychange", async () => {
        // Only trigger if the tab becomes hidden while the exam is running
        if (document.hidden && isExamActive && remainingExamDurationSeconds > 0) {
            tabSwitchCount++;
            
            // Immediately sync the violation to Firebase so they can't refresh to reset it
            await syncAttemptMetadata(currentUser.uid, testId, {
                timeLeft: remainingExamDurationSeconds,
                status: 'In-Progress',
                tabSwitches: tabSwitchCount
            });

            if (tabSwitchCount === 1) {
                alert("⚠️ WARNING: Tab switching detected!\n\nYou are not allowed to leave the test window or switch tabs. If you leave this window one more time, your examination will be AUTOMATICALLY SUBMITTED.");
            } else if (tabSwitchCount >= 2) {
                isExamActive = false; // Disable to prevent double-triggering during submit
                alert("🚫 VIOLATION DETECTED: Multiple tab switches recorded.\n\nYour examination is being automatically submitted now.");
                
                // Show processing state and auto-submit
                if (globalCountdownTimerInterval) clearInterval(globalCountdownTimerInterval);
                await processAndSubmitExam(currentUser.uid, testId, currentUser.displayName, currentUser.photoURL);
                window.location.href = '../dashboard/dashboard.html';
            }
        }
    });
}

function beginActiveCountdownProcessingLoop() {
    if (isReviewMode) return;  

    if (globalCountdownTimerInterval) clearInterval(globalCountdownTimerInterval);
    globalCountdownTimerInterval = setInterval(async () => {
        remainingExamDurationSeconds--;
        
        // ---> NEW: Sync remaining time to Firebase every 5 seconds <---
        if (remainingExamDurationSeconds % 5 === 0) {
            syncAttemptMetadata(currentUser.uid, testId, { 
                timeLeft: remainingExamDurationSeconds, 
                status: 'In-Progress',
                tabSwitches: tabSwitchCount
            });
        }

        if (remainingExamDurationSeconds <= 0) {
            clearInterval(globalCountdownTimerInterval);
            isExamActive = false; // Stop anti-cheat triggers
            alert("Time Limit Constraint Hit. Your exam will now be submitted.");
            await processAndSubmitExam(currentUser.uid, testId, currentUser.displayName, currentUser.photoURL);
            window.location.href = `../dashboard/dashboard.html`;
            return;
        }
        
        const hours = String(Math.floor(remainingExamDurationSeconds / 3600)).padStart(2, '0');
        const minutes = String(Math.floor((remainingExamDurationSeconds % 3600) / 60)).padStart(2, '0');
        const seconds = String(Math.floor(remainingExamDurationSeconds % 60)).padStart(2, '0');
        
        const displayField = document.getElementById('time-countdown');
        if (displayField) displayField.textContent = `${hours}:${minutes}:${seconds}`;
    }, 1000);
}