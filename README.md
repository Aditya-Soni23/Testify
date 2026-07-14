# Testify - Collaborative Examination Platform

Testify is a premium SaaS-level collaborative examination platform built with React, Firebase, and Tailwind CSS. It revolutionizes the examination process by allowing students to upload questions, democratically poll for the best ones, and participate in strict, real-time proctored tests with deep analytics.

## ✨ Features

- **Democratic Question Bank:** Students upload up to 5 questions (MCQ/Numerical) with optional image attachments.
- **Global Polling System:** Real-time voting engine with a global 5-hour synchronized timer.
- **Automated Exam Generation:** Automatically compiles the top-voted questions into a final test paper.
- **Anti-Cheat Mechanics:** OCR-based copy/paste prevention, randomized question layouts, and strict single-attempt locking.
- **Deep Analytics:** Real-time post-exam analytics showing accuracy, subject distributions, and a global leaderboard.
- **Hidden Admin Panel:** Root-level command center restricted to administrator emails for full database and UI control (Maintenance modes, broadcasts, user management).
- **Production-Ready UI:** Glassmorphism, tailored animations, and a seamless tutorial onboarding flow.

## 🛠️ Technology Stack

- **Frontend:** React.js, Tailwind CSS, Framer Motion, React Router, React Hot Toast
- **Backend:** Firebase Realtime Database, Firebase Authentication (Google Auth), Firebase Storage
- **Security:** Strict Firebase Security Rules restricting read/writes and enforcing single attempts.

## 📂 Architecture & Database Structure