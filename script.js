// Import OTPAuth library as a proper ES Module
import * as otpauth from 'https://cdn.jsdelivr.net/npm/otpauth@9.2.1/dist/otpauth.esm.js';

// Firebase imports these are all good
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { 
    getAuth, 
    signInAnonymously, 
    onAuthStateChanged,
    signInWithCustomToken
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { 
    getFirestore, 
    collection, 
    doc, 
    addDoc, 
    setDoc,
    deleteDoc, 
    onSnapshot, 
    query,
    Timestamp,
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- Config and Global Variables ---
const firebaseConfig = {
    apiKey: "AIzaSyAyiQeWpzDKtKyzB1h33P3BgAh4BZw8SQ4",
    authDomain: "authbean.firebaseapp.com",
    projectId: "authbean",
    storageBucket: "authbean.appspot.com",
    messagingSenderId: "988226514837",
    appId: "1:988226514837:web:9234019855ea652103d09c",
    measurementId: "G-SFQ63NGZT6"
};
const appId = firebaseConfig.appId;

let db, auth;
let userId;
let accountsUnsubscribe = null;
const accountsCache = new Map(); 

// --- UI Elements ---
const emptyStateContainer = document.getElementById('empty-state-container');
const accountsView = document.getElementById('accounts-view');
const addAccountBtn = document.getElementById('addAccountBtn');
const addAccountBtnTop = document.getElementById('addAccountBtnTop');
const accountModal = document.getElementById('accountModal');
const cancelModalBtn = document.getElementById('cancelModalBtn');
const accountForm = document.getElementById('accountForm');
const modalTitle = document.getElementById('modalTitle');
const accountIdInput = document.getElementById('accountId');
const accountNameInput = document.getElementById('accountName');
const issuerNameInput = document.getElementById('issuerName');
const secretKeyInput = document.getElementById('secretKey');
const accountsListDiv = document.getElementById('accountsList');
const userIdDisplay = document.getElementById('userIdDisplay');

// Confirm Delete Modal Elements
const confirmDeleteModal = document.getElementById('confirmDeleteModal');
const accountNameToDeleteSpan = document.getElementById('accountNameToDelete');
const cancelDeleteBtn = document.getElementById('cancelDeleteBtn');
const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
let accountIdToDelete = null;

// --- Toast Notification Function ---
function showToast(message, type = 'success', duration = 3000) {
    const toastArea = document.getElementById('toastArea');
    const toast = document.createElement('div');
    toast.className = `toast ${type === 'success' ? 'toast-success' : (type === 'error' ? 'toast-error' : 'toast-info')}`;
    toast.textContent = message;
    
    toastArea.appendChild(toast);
    toast.offsetHeight; 
    toast.classList.add('show');

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            if (toast.parentNode === toastArea) {
                 toastArea.removeChild(toast);
            }
        }, 300); 
    }, duration);
}


// --- Firebase Initialization and Authentication ---
async function initializeFirebase() {
    try {
        const app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);

        onAuthStateChanged(auth, async (user) => {
            if (user) {
                userId = user.uid;
                userIdDisplay.textContent = userId; 
                if (accountsUnsubscribe) accountsUnsubscribe(); 
                loadAccounts(); 
            } else {
                userId = null;
                userIdDisplay.textContent = "anonymous";
                accountsView.classList.add('hidden');
                emptyStateContainer.classList.remove('hidden');
                emptyStateContainer.classList.add('flex');
                
                try {
                    if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
                        await signInWithCustomToken(auth, __initial_auth_token);
                    } else {
                        await signInAnonymously(auth);
                    }
                } catch (error) {
                    console.error("Error during sign-in:", error);
                    showToast(`Error signing in: ${error.message}`, "error");
                }
            }
        });
    } catch (error) {
        console.error("Firebase initialization error:", error);
        showToast(`Firebase init error: ${error.message}`, "error", 5000);
    }
}

// --- Modal Handling ---
function openModal(accountId = null) {
    accountForm.reset();
    if (accountId && accountsCache.has(accountId)) {
        const account = accountsCache.get(accountId);
        modalTitle.textContent = 'Edit Account';
        accountIdInput.value = accountId;
        accountNameInput.value = account.name;
        issuerNameInput.value = account.issuer || '';
        secretKeyInput.value = account.secret; 
        secretKeyInput.disabled = true; 
    } else {
        modalTitle.textContent = 'Add New Account';
        accountIdInput.value = '';
        secretKeyInput.disabled = false;
    }
    accountModal.classList.remove('hidden');
    accountModal.style.opacity = "0"; 
    setTimeout(() => accountModal.style.opacity = "1", 10); 
}

function closeModal() {
    accountModal.style.opacity = "0";
    setTimeout(() => accountModal.classList.add('hidden'), 300); 
}

function openDeleteModal(id, name) {
    accountIdToDelete = id;
    accountNameToDeleteSpan.textContent = name;
    confirmDeleteModal.classList.remove('hidden');
    confirmDeleteModal.style.opacity = "0";
    setTimeout(() => confirmDeleteModal.style.opacity = "1", 10);
}

function closeDeleteModal() {
    confirmDeleteModal.style.opacity = "0";
    setTimeout(() => {
        confirmDeleteModal.classList.add('hidden');
        accountIdToDelete = null;
    }, 300);
}

// --- Firestore Operations ---
async function saveAccount(event) {
    event.preventDefault();
    if (!userId) {
        showToast("User not authenticated. Cannot save account.", "error");
        return;
    }

    const id = accountIdInput.value;
    const name = accountNameInput.value.trim();
    const issuer = issuerNameInput.value.trim();
    const secret = secretKeyInput.value.trim().replace(/\s+/g, '').toUpperCase();

    if (!name || !secret) {
        showToast("Account name and secret key cannot be empty.", "error");
        return;
    }
    if (!/^[A-Z2-7]+=*$/.test(secret) || secret.length < 16) {
        showToast("Invalid secret key. Must be Base32, typically 16+ chars.", "error");
        return;
    }
    try {
        new otpauth.TOTP({ secret: otpauth.Secret.fromBase32(secret) });
    } catch (e) {
        showToast("Invalid secret key. Could not initialize TOTP. " + e.message, "error");
        return;
    }

    const accountData = { name, issuer, secret, userId, updatedAt: Timestamp.now() };

    try {
        const accountsCollectionPath = `artifacts/${appId}/users/${userId}/accounts`;
        if (id) { 
            const existingAccount = accountsCache.get(id);
            if (existingAccount) {
                 accountData.secret = existingAccount.secret; 
            } else {
                showToast("Error finding original account data for update.", "error");
                return;
            }
            const accountRef = doc(db, accountsCollectionPath, id);
            await setDoc(accountRef, accountData, { merge: true });
            showToast('Account updated successfully!');
        } else { 
            accountData.createdAt = Timestamp.now();
            await addDoc(collection(db, accountsCollectionPath), accountData);
            showToast('Account added successfully!');
        }
        closeModal();
    } catch (error) {
        console.error('Error saving account:', error);
        showToast(`Error saving account: ${error.message}`, 'error');
    }
}

async function deleteAccountConfirmed() {
    if (!userId || !accountIdToDelete) {
        showToast("Error: Missing user or account ID for deletion.", "error");
        closeDeleteModal();
        return;
    }
    try {
        const accountRef = doc(db, `artifacts/${appId}/users/${userId}/accounts`, accountIdToDelete);
        await deleteDoc(accountRef);
        showToast('Account deleted successfully!');
    } catch (error) {
        console.error('Error deleting account:', error);
        showToast(`Error deleting account: ${error.message}`, 'error');
    }
    closeDeleteModal();
}

// --- Account Display and OTP Generation ---
function loadAccounts() {
    if (!userId) {
        accountsView.classList.add('hidden');
        emptyStateContainer.classList.remove('hidden');
        emptyStateContainer.classList.add('flex');
        return;
    }

    const accountsCollectionPath = `artifacts/${appId}/users/${userId}/accounts`;
    const q = query(collection(db, accountsCollectionPath));

    if (accountsUnsubscribe) { accountsUnsubscribe(); }
    
    accountsUnsubscribe = onSnapshot(q, (snapshot) => {
        if (snapshot.empty) {
            accountsView.classList.add('hidden');
            emptyStateContainer.classList.remove('hidden');
            emptyStateContainer.classList.add('flex');
            accountsCache.clear();
            return;
        }
        
        emptyStateContainer.classList.add('hidden');
        emptyStateContainer.classList.remove('flex');
        accountsView.classList.remove('hidden');
        
        const newAccountIds = new Set();
        const sortedDocs = snapshot.docs.sort((a, b) => a.data().name.toLowerCase().localeCompare(b.data().name.toLowerCase()));
        accountsListDiv.innerHTML = ''; 

        sortedDocs.forEach(docSnapshot => {
            const accountId = docSnapshot.id;
            const accountData = docSnapshot.data();
            newAccountIds.add(accountId);

            if (!accountsCache.has(accountId) || accountsCache.get(accountId).updatedAt?.toMillis() !== accountData.updatedAt?.toMillis()) {
                try {
                    const totp = new otpauth.TOTP({
                        issuer: accountData.issuer || undefined,
                        label: accountData.name,
                        algorithm: 'SHA1',
                        digits: 6,
                        period: 30,
                        secret: otpauth.Secret.fromBase32(accountData.secret)
                    });
                    accountsCache.set(accountId, { ...accountData, id: accountId, totp });
                } catch (e) {
                    console.error(`Error creating TOTP for account ${accountData.name}:`, e);
                    const errorCard = createErrorAccountCard(accountData.name, accountId, e.message);
                    accountsListDiv.appendChild(errorCard);
                    return; 
                }
            }
            const cachedAccount = accountsCache.get(accountId);
             if (cachedAccount) {
                const accountCard = createAccountCard(cachedAccount);
                accountsListDiv.appendChild(accountCard);
            }
        });

        accountsCache.forEach((_, id) => {
            if (!newAccountIds.has(id)) {
                accountsCache.delete(id);
            }
        });
        updateAllOtps();
    }, (error) => {
        console.error("Error fetching accounts:", error);
        showToast(`Error fetching accounts: ${error.message}`, "error");
    });
}

function createAccountCard(account) {
    const card = document.createElement('div');
    // this class name is what we use to find all cards for the progress bar
    card.className = 'auth-card surface-card p-5 rounded-xl shadow-lg'; 
    card.dataset.accountId = account.id;

    const otpValue = account.totp ? account.totp.generate() : "Error";
    const formattedOtp = otpValue.length === 6 ? `${otpValue.slice(0,3)} ${otpValue.slice(3)}` : otpValue;

    card.innerHTML = `
        <div class="flex justify-between items-start mb-1">
            <div>
                <h2 class="text-xl font-semibold">${account.name}</h2>
                <p class="text-sm text-gray-400">${account.issuer || 'No Issuer'}</p>
            </div>
            <div class="space-x-2">
                <button class="edit-btn text-accent-brand hover:text-main-brand text-xs" title="Edit Account">Edit</button>
                <button class="delete-btn text-red-400 hover:text-red-300 text-xs" title="Delete Account">Delete</button>
            </div>
        </div>
        <div class="text-center my-3">
            <p class="otp-code font-bold">${formattedOtp}</p>
        </div>
        <div class="w-full bg-gray-500/30 rounded-full h-1 mb-2 overflow-hidden">
            <div class="progress-bar h-full" style="width: 100%;"></div>
        </div>
        <button class="copy-otp-btn text-xs text-gray-400 hover:text-accent-brand float-right">Copy Code</button>
    `;

    card.querySelector('.edit-btn').addEventListener('click', (e) => { e.stopPropagation(); openModal(account.id); });
    card.querySelector('.delete-btn').addEventListener('click', (e) => { e.stopPropagation(); openDeleteModal(account.id, account.name); });
    card.querySelector('.copy-otp-btn').addEventListener('click', (e) => { e.stopPropagation(); copyOtpToClipboard(otpValue, card); });
    return card;
}

function createErrorAccountCard(accountName, accountId, errorMessage) {
    const card = document.createElement('div');
    card.className = 'auth-card surface-card p-5 rounded-xl shadow-lg border border-red-500';
    card.dataset.accountId = accountId;
    card.innerHTML = `
        <div class="flex justify-between items-start mb-1">
            <div><h2 class="text-xl font-semibold text-red-400">${accountName} (Error)</h2></div>
             <button class="delete-btn text-red-400 hover:text-red-300 text-xs" title="Delete Account">Delete</button>
        </div>
        <div class="text-center my-3">
            <p class="text-sm text-red-400">Could not generate OTP.</p>
            <p class="text-xs text-gray-500">${errorMessage}</p>
        </div>
    `;
    card.querySelector('.delete-btn').addEventListener('click', (e) => { e.stopPropagation(); openDeleteModal(accountId, accountName); });
    return card;
}

function copyOtpToClipboard(otp, cardElement) {
    const textArea = document.createElement("textarea");
    textArea.value = otp.replace(/\s/g, ''); 
    document.body.appendChild(textArea);
    textArea.focus(); textArea.select();
    try {
        document.execCommand('copy');
    showToast('OTP copied to clipboard!', 'success');
    const copyBtn = cardElement.querySelector('.copy-otp-btn');
    if(copyBtn) {
        copyBtn.textContent = 'Copied! ✔️';
        copyBtn.disabled = true; 
        setTimeout(() => {
            copyBtn.textContent = 'Copy Code';
            copyBtn.disabled = false;
        }, 2000);
    }
} catch (err) { showToast('Failed to copy OTP.', 'error'); }
document.body.removeChild(textArea);
}

function updateAllOtps() {
    const seconds = new Date().getSeconds();
    const period = 30; 
    const timeLeft = period - (seconds % period);
    const progressPercent = (timeLeft / period) * 100;
    
    // updated selector to be specific to the account cards
    document.querySelectorAll('.auth-card').forEach(card => {
        const accountId = card.dataset.accountId;
        if (accountsCache.has(accountId)) {
            const account = accountsCache.get(accountId);
            if (account.totp) {
                const otpValue = account.totp.generate();
                const formattedOtp = otpValue.length === 6 ? `${otpValue.slice(0,3)} ${otpValue.slice(3)}` : otpValue;
                const otpElement = card.querySelector('.otp-code');
                if (otpElement && otpElement.textContent !== formattedOtp) otpElement.textContent = formattedOtp;
            }
            // this is the fix for the progress bar
            const progressBar = card.querySelector('.progress-bar');
            if (progressBar) {
                progressBar.style.width = `${progressPercent}%`;
            }
        }
    });
}

// --- Event Listeners ---
addAccountBtn.addEventListener('click', () => openModal());
addAccountBtnTop.addEventListener('click', () => openModal());
cancelModalBtn.addEventListener('click', closeModal);
accountForm.addEventListener('submit', saveAccount);

cancelDeleteBtn.addEventListener('click', closeDeleteModal);
confirmDeleteBtn.addEventListener('click', deleteAccountConfirmed);

accountModal.addEventListener('click', (e) => { if (e.target === accountModal) closeModal(); });
confirmDeleteModal.addEventListener('click', (e) => { if (e.target === confirmDeleteModal) closeDeleteModal(); });

// --- Initialization ---
setInterval(updateAllOtps, 1000); 
initializeFirebase();
