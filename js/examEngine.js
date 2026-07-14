import { db } from './firebase.js';
import { ref, get, set, update } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

export async function fetchExamMetadata(testId) {
    const snapshot = await get(ref(db, `tests/${testId}`));
    return snapshot.exists() ? snapshot.val() : null;
}

export async function fetchExamQuestions(testId) {
    const snapshot = await get(ref(db, `questions/${testId}`));
    return snapshot.exists() ? snapshot.val() : null;
}

export async function syncResponseState(uid, testId, questionId, responseObj) {
    // FIX: Core Data Sanitization Step. Firebase will reject any object payload containing undefined properties.
    const sanitizedObj = { ...responseObj };
    if (sanitizedObj.value === undefined) sanitizedObj.value = "";
    if (sanitizedObj.status === undefined) sanitizedObj.status = "NOT_VISITED";

    const responseRef = ref(db, `responses/${uid}/${testId}/${questionId}`);
    await set(responseRef, sanitizedObj);
}

export async function syncAttemptMetadata(uid, testId, metadata) {
    const attemptRef = ref(db, `attempts/${uid}/${testId}`);
    // Ensure critical runtime integers are initialized safely 
    const sanitizedMeta = { ...metadata };
    if (sanitizedMeta.timeLeft === undefined) sanitizedMeta.timeLeft = 0;
    if (sanitizedMeta.status === undefined) sanitizedMeta.status = "In-Progress";
    
    await update(attemptRef, sanitizedMeta);
}

export async function getSavedProgress(uid, testId) {
    const attemptSnap = await get(ref(db, `attempts/${uid}/${testId}`));
    const responseSnap = await get(ref(db, `responses/${uid}/${testId}`));
    
    return {
        metadata: attemptSnap.exists() ? attemptSnap.val() : null,
        responses: responseSnap.exists() ? responseSnap.val() : {}
    };
}

export async function processAndSubmitExam(uid, testId, userName, userPhoto) {
    const testMeta = await fetchExamMetadata(testId) || {};
    const questions = await fetchExamQuestions(testId) || {};
    const progress = await getSavedProgress(uid, testId);
    const userResponses = progress.responses || {};

    let totalScore = 0;
    let correctCount = 0;
    let wrongCount = 0;
    let skippedCount = 0;
    let positiveMarksGained = 0;
    let negativeMarksLost = 0;

    const positiveValue = testMeta.positiveMarks || 4;
    const negativeValue = testMeta.negativeMarks || 1;

    Object.keys(questions).forEach(qId => {
        const q = questions[qId];
        const response = userResponses[qId];

        // Strict parsing evaluation logic to qualify skipped criteria status mappings
        if (!response || response.status === 'NOT_VISITED' || response.status === 'VISITED' || response.value === undefined || response.value === "") {
            skippedCount++;
        } else {
            let isCorrect = false;
            const normalizedType = String(q.type).toUpperCase();

            if (normalizedType === 'MCQ') {
                isCorrect = parseInt(response.value) === parseInt(q.correctAnswer);
            } 
            // FIX 3: Multi-Correct Evaluation Vector Architecture
            else if (normalizedType === 'MCQ-MULTI' || normalizedType === 'MCQ_MULTI') {
                const userSelectionArray = Array.isArray(response.value) 
                    ? response.value 
                    : String(response.value).split(',').map(Number);
                
                const correctSelectionArray = Array.isArray(q.correctAnswer)
                    ? q.correctAnswer
                    : String(q.correctAnswer).split(',').map(Number);

                // Sort arrays to verify exact index alignment matches
                userSelectionArray.sort((a, b) => a - b);
                correctSelectionArray.sort((a, b) => a - b);

                isCorrect = userSelectionArray.length === correctSelectionArray.length && 
                            userSelectionArray.every((val, index) => parseInt(val) === parseInt(correctSelectionArray[index]));
            } 
            else if (normalizedType === 'NUMERICAL') {
                isCorrect = parseFloat(response.value) === parseFloat(q.correctAnswer);
            }

            if (isCorrect) {
                correctCount++;
                totalScore += positiveValue;
                positiveMarksGained += positiveValue;
            } else {
                wrongCount++;
                const lossValue = (normalizedType === 'NUMERICAL') ? (testMeta.numericalNegativeMarks || 0) : negativeValue;
                totalScore -= lossValue;
                negativeMarksLost += lossValue;
            }
        }
    });

    const totalQuestions = Object.keys(questions).length || 1;
    const accuracy = (correctCount + wrongCount > 0) ? Math.round((correctCount / (correctCount + wrongCount)) * 100) : 0;
    const percentage = Math.round((totalScore / (totalQuestions * positiveValue)) * 100);
    
    const timeSpentSeconds = (testMeta.duration * 60) - (progress.metadata?.timeLeft || 0);

    // FIX: Added string/numeric fallbacks to prevent the object parsing engine from crashing on submission
    const resultPayload = {
        testId: testId || "unknown-id",
        testTitle: testMeta.title || "Collaborative Examination Module",
        subject: testMeta.subject || "Mixed Electives",
        submittedAt: new Date().toISOString(),
        correct: correctCount,
        wrong: wrongCount,
        skipped: skippedCount,
        marks: totalScore,
        positiveMarksGained,
        negativeMarksLost,
        percentage,
        accuracy,
        timeTaken: Math.max(0, timeSpentSeconds)
    };

    const leaderboardPayload = {
        uid,
        name: userName || "Anonymous Candidate",
        photoURL: userPhoto || '',
        marks: totalScore,
        accuracy,
        timeTaken: Math.max(0, timeSpentSeconds),
        submittedAt: new Date().toISOString()
    };

    await set(ref(db, `results/${uid}/${testId}`), resultPayload);
    await set(ref(db, `leaderboards/${testId}/${uid}`), leaderboardPayload);
    await update(ref(db, `attempts/${uid}/${testId}`), { status: 'Completed', timeLeft: 0 });

    return resultPayload;
}