import { db } from './firebase.js';
import { ref, get, set } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

const sampleTestData = {
    "test_jee_001": {
        "id": "test_jee_001",
        "testNumber": "01",
        "subject": "Physics & Chemistry",
        "chapters": "Kinematics, Work-Energy, Chemical Bonding, Stoichiometry",
        "questionCount": 4,
        "duration": 180,
        "examinationMode": "JEE Main Pattern",
        "publishedDate": "2026-07-10",
        "status": "Live",
        "positiveMarks": 4,
        "negativeMarks": 1,
        "numericalNegativeMarks": 0
    }
};

const sampleQuestionsData = {
    "test_jee_001": {
        "q1": {
            "id": "q1",
            "index": 1,
            "type": "MCQ",
            "subject": "Physics",
            "text": "A particle moves along a straight line such that its displacement at any time t is given by s = t^3 - 6t^2 + 3t + 4 meters. Find the velocity of the particle when its acceleration becomes zero.",
            "options": ["-9 m/s", "-12 m/s", "-3 m/s", "0 m/s"],
            "correctAnswer": 0
        },
        "q2": {
            "id": "q2",
            "index": 2,
            "type": "MCQ",
            "subject": "Physics",
            "text": "A block of mass 2 kg is dropped from a height of 40 cm onto a spring of spring constant k = 1960 N/m. Find the maximum compression of the spring. (Take g = 9.8 m/s²)",
            "options": ["0.10 m", "0.20 m", "0.05 m", "0.15 m"],
            "correctAnswer": 0
        },
        "q3": {
            "id": "q3",
            "index": 3,
            "type": "NUMERICAL",
            "subject": "Chemistry",
            "text": "Calculate the total number of lone pairs of electrons present in a molecule of Xenon Difluoride (XeF2).",
            "correctAnswer": 9
        },
        "q4": {
            "id": "q4",
            "index": 4,
            "type": "NUMERICAL",
            "subject": "Chemistry",
            "text": "When 22.4 liters of H2 gas at STP is reacted completely with 11.2 liters of Cl2 gas at STP, how many moles of HCl gas are formed?",
            "correctAnswer": 1
        }
    }
};

export async function initializeProductionData() {
    try {
        const testsRef = ref(db, 'tests');
        const snapshot = await get(testsRef);
        if (!snapshot.exists()) {
            await set(ref(db, 'tests'), sampleTestData);
            await set(ref(db, 'questions'), sampleQuestionsData);
            console.log("Production exam repository initialized successfully.");
        }
    } catch (error) {
        console.error("Data seeding exception caught:", error);
    }
}