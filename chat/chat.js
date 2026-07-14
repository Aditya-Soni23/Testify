import { checkAuthState } from '../js/auth.js';
import { db } from '../js/firebase.js';
import { ref, push, set, remove, onValue, limitToLast, query } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

let currentUserId = null;
let currentUserName = null;
let currentUserPhoto = "";
let activeReplyTargetState = null;

document.addEventListener("DOMContentLoaded", () => {
    checkAuthState((user, dbUser) => {
        if (!user) { window.location.href = '../index.html'; return; }
        currentUserId = user.uid;
        currentUserName = dbUser.name;
        currentUserPhoto = dbUser.photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${user.uid}`;
        initLayoutHandlers();
        streamGlobalChatMessages();
    });
});

function initLayoutHandlers() {
    const mappings = { 'nav-dashboard': '../dashboard/dashboard.html', 'nav-tests': '../tests/tests.html', 'nav-polling': '../polling/polling.html', 'nav-upload': '../upload/upload.html', 'nav-chat': '../chat/chat.html' };
    Object.keys(mappings).forEach(id => document.getElementById(id)?.addEventListener('click', () => window.location.href = mappings[id]));

    // Emojis Utilities Action Toggles Setup
    document.getElementById('emoji-trigger').addEventListener('click', () => {
        document.getElementById('emoji-picker-container').classList.toggle('hidden');
    });
    
    document.querySelectorAll('.emoji-opt').forEach(el => {
        el.addEventListener('click', () => {
            document.getElementById('msg-input').value += el.textContent;
            document.getElementById('emoji-picker-container').classList.add('hidden');
        });
    });

    document.getElementById('cancel-reply-btn').addEventListener('click', clearActiveReplyContext);
    document.getElementById('chat-message-form').addEventListener('submit', dispatchMessagePayload);
}

function streamGlobalChatMessages() {
    const viewport = document.getElementById('chat-messages-viewport');
    const dbQueryRef = query(ref(db, 'chat_messages'), limitToLast(60));

    onValue(dbQueryRef, (snapshot) => {
        viewport.innerHTML = '';
        if (!snapshot.exists()) return;

        snapshot.forEach((child) => {
            const id = child.key;
            const data = child.val();
            renderMessageNodeRow(id, data, viewport);
        });
        
        // Dynamic viewport scroll configuration lock
        viewport.scrollTop = viewport.scrollHeight;
    });
}

function renderMessageNodeRow(id, m, parent) {
    const row = document.createElement('div');
    const isSelf = m.uid === currentUserId;
    row.className = `msg-row ${isSelf ? 'self' : ''}`;

    let replyMarkup = '';
    if (m.replyTo) {
        replyMarkup = `<div class="reply-quote"><strong>@${m.replyTo.author}</strong>: ${m.replyTo.snippet}</div>`;
    }

    let deleteBtnMarkup = isSelf ? `<button class="msg-delete-trigger" id="drop-msg-${id}"><i class="ph ph-trash-simple"></i></button>` : '';

    const timeStr = new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    row.innerHTML = `
        <img src="${m.photo}" class="chat-avatar" alt="User Image Profile">
        <div class="msg-bubble">
            <div class="msg-meta">
                <span>${m.author}</span>
                <span>${timeStr}</span>
            </div>
            ${replyMarkup}
            <div style="color:white; font-size:0.95rem; word-break:break-word;">${escapeHtmlText(m.text)}</div>
            ${deleteBtnMarkup}
        </div>
    `;

    parent.appendChild(row);

    // Double Click Event Binding mapping listener routine for tracking nested comment tracking vectors
    row.querySelector('.msg-bubble').addEventListener('dblclick', () => initiateReplyState(m.author, m.text));
    
    if (isSelf) {
        document.getElementById(`drop-msg-${id}`).addEventListener('click', () => remove(ref(db, `chat_messages/${id}`)));
    }
}

function initiateReplyState(author, text) {
    activeReplyTargetState = { author, snippet: text.substring(0, 45) + (text.length > 45 ? "..." : "") };
    document.getElementById('reply-text-preview').textContent = `Replying to @${author}: "${activeReplyTargetState.snippet}"`;
    document.getElementById('reply-context-tracker').classList.remove('hidden');
}

function clearActiveReplyContext() {
    activeReplyTargetState = null;
    document.getElementById('reply-context-tracker').classList.add('hidden');
}

async function dispatchMessagePayload(e) {
    e.preventDefault();
    const input = document.getElementById('msg-input');
    const textVal = input.value.trim();
    if (!textVal) return;

    const payload = {
        uid: currentUserId,
        author: currentUserName,
        photo: currentUserPhoto,
        text: textVal,
        timestamp: Date.now()
    };

    if (activeReplyTargetState) {
        payload.replyTo = activeReplyTargetState;
    }

    const newMsgRef = push(ref(db, 'chat_messages'));
    await set(newMsgRef, payload);
    
    input.value = '';
    clearActiveReplyContext();
}

function escapeHtmlText(str) {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}