// Firebase imports - these are essential for connecting to Firestore
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
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : { apiKey: "DEMO_API_KEY", authDomain: "DEMO_PROJECT.firebaseapp.com", projectId: "DEMO_PROJECT" };
const appId = typeof __app_id !== 'undefined' ? __app_id : 'authbean-default-app';

let db, auth;
let userId;
let accountsUnsubscribe = null;
const accountsCache = new Map(); 

// --- UI Elements ---
const addAccountBtn = document.getElementById('addAccountBtn');
const accountModal = document.getElementById('accountModal');
const cancelModalBtn = document.getElementById('cancelModalBtn');
const accountForm = document.getElementById('accountForm');
const modalTitle = document.getElementById('modalTitle');
const accountIdInput = document.getElementById('accountId');
const accountNameInput = document.getElementById('accountName');
const issuerNameInput = document.getElementById('issuerName');
const secretKeyInput = document.getElementById('secretKey');
const accountsListDiv = document.getElementById('accountsList');
const noAccountsMessage = document.getElementById('noAccountsMessage');
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
            if (toast.parentNode === toastArea) { // Check if still child before removing
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
        // For debugging Firestore (after pre checks)
        // import("https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js").then(firestore => firestore.setLogLevel('debug'));

        onAuthStateChanged(auth, async (user) => {
            if (user) {
                console.log("User is signed in with UID:", user.uid);
                userId = user.uid;
                userIdDisplay.textContent = userId; 
                if (accountsUnsubscribe) accountsUnsubscribe(); 
                loadAccounts(); 
            } else {
                console.log("User is signed out. Attempting to sign in...");
                userId = null;
                userIdDisplay.textContent = "anonymous";
                accountsListDiv.innerHTML = ''; 
                showNoAccountsMessage(true);
                try {
                    if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
                        console.log("Attempting sign in with custom token...");
                        await signInWithCustomToken(auth, __initial_auth_token);
                        console.log("Successfully signed in with custom token.");
                    } else {
                        console.log("No custom token, attempting anonymous sign in...");
                        await signInAnonymously(auth);
                        console.log("Successfully signed in anonymously.");
                    }
                } catch (error) {
                    console.error("Error during sign-in:", error);
                    showToast(`Error signing in: ${error.message}`, "error");
                    userIdDisplay.textContent = "Error signing in";
                }
            }
        });
    } catch (error) {
        console.error("Firebase initialization error:", error);
        showToast(`Firebase init error: ${error.message}`, "error", 5000);
        userIdDisplay.textContent = "Firebase Init Error";
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

    if (!name) {
        showToast("Account name cannot be empty.", "error");
        return;
    }
     if (!secret) {
        showToast("Secret key cannot be empty.", "error");
        return;
    }
    if (!/^[A-Z2-7]+=*$/.test(secret) || secret.length < 16) {
        showToast("Invalid secret key. Must be Base32, typically 16+ chars.", "error");
        return;
    }
    try {
        // explicitly use window.otpauth
        new window.otpauth.TOTP({ secret: window.otpauth.Secret.fromBase32(secret) });
    } catch (e) {
        showToast("Invalid secret key. Could not initialize TOTP. " + e.message, "error");
        return;
    }

    const accountData = {
        name,
        issuer,
        secret, 
        userId, 
        updatedAt: Timestamp.now()
    };

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
        // onSnapshot handles ui cache update after db delete
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
        console.log("loadAccounts: No user ID, skipping Firestore query.");
        accountsListDiv.innerHTML = ''; 
        showNoAccountsMessage(true);
        return;
    }

    console.log(`loadAccounts: Setting up snapshot listener for user ${userId}`);
    const accountsCollectionPath = `artifacts/${appId}/users/${userId}/accounts`;
    const q = query(collection(db, accountsCollectionPath));

    if (accountsUnsubscribe) {
        console.log("loadAccounts: Unsubscribing from previous listener.");
        accountsUnsubscribe(); 
    }
    
    accountsUnsubscribe = onSnapshot(q, (snapshot) => {
        console.log(`Snapshot received: ${snapshot.docs.length} accounts.`);
        if (snapshot.empty) {
            accountsListDiv.innerHTML = '';
            showNoAccountsMessage(true);
            accountsCache.clear();
            return;
        }
        
        showNoAccountsMessage(false);
        const newAccountIds = new Set();
        
        const sortedDocs = snapshot.docs.sort((a, b) => {
            const nameA = a.data().name.toLowerCase();
            const nameB = b.data().name.toLowerCase();
            if (nameA < nameB) return -1;
            if (nameA > nameB) return 1;
            return 0;
        });

        accountsListDiv.innerHTML = ''; // wiping old list ensures fresh ui from db

        sortedDocs.forEach(docSnapshot => {
            const accountId = docSnapshot.id;
            const accountData = docSnapshot.data();
            newAccountIds.add(accountId);

            if (!accountsCache.has(accountId) || accountsCache.get(accountId).updatedAt?.toMillis() !== accountData.updatedAt?.toMillis()) {
                try {
                    // explicitly use window.otpauth
                    const totp = new window.otpauth.TOTP({
                        issuer: accountData.issuer || undefined,
                        label: accountData.name,
                        algorithm: 'SHA1',
                        digits: 6,
                        period: 30,
                        secret: window.otpauth.Secret.fromBase32(accountData.secret)
                    });
                    accountsCache.set(accountId, { ...accountData, id: accountId, totp });
                } catch (e) {
                    console.error(`Error creating TOTP for account ${accountData.name} (${accountId}):`, e.message);
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
            if (!newAccountIds.has(id)) accountsCache.delete(id);
        });
        updateAllOtps();
    }, (error) => {
        console.error("Error fetching accounts:", error);
        showToast(`Error fetching accounts: ${error.message}`, "error");
        accountsListDiv.innerHTML = '<p class="text-red-400 text-center">Could not load accounts. Please try again later.</p>';
        showNoAccountsMessage(false);
    });
}

function showNoAccountsMessage(show) {
    if (noAccountsMessage) noAccountsMessage.classList.toggle('hidden', !show);
}

function createAccountCard(account) {
    const card = document.createElement('div');
    card.className = 'account-card material-surface p-5 rounded-xl shadow-lg';
    card.dataset.accountId = account.id;

    // and here too explicitly use window.otpauth
    const otpValue = account.totp ? account.totp.generate() : "Error";
    const formattedOtp = otpValue.length === 6 ? `${otpValue.slice(0,3)} ${otpValue.slice(3)}` : otpValue;

    card.innerHTML = `
        <div class="flex justify-between items-start mb-1">
            <div>
                <h2 class="text-xl font-semibold text-gray-100">${account.name}</h2>
                <p class="text-sm text-gray-400">${account.issuer || 'No Issuer'}</p>
            </div>
            <div class="space-x-2">
                <button class="edit-btn text-blue-400 hover:text-blue-300 text-xs" title="Edit Account">Edit</button>
                <button class="delete-btn text-red-400 hover:text-red-300 text-xs" title="Delete Account">Delete</button>
            </div>
        </div>
        <div class="text-center my-3">
            <p class="otp-code">${formattedOtp}</p>
        </div>
        <div class="w-full bg-gray-700 rounded-full h-1 mb-2">
            <div class="progress-bar" style="width: 100%;"></div>
        </div>
        <button class="copy-otp-btn text-xs text-gray-400 hover:text-[#03dac6] float-right">Copy Code</button>
    `;

    card.querySelector('.edit-btn').addEventListener('click', (e) => { e.stopPropagation(); openModal(account.id); });
    card.querySelector('.delete-btn').addEventListener('click', (e) => { e.stopPropagation(); openDeleteModal(account.id, account.name); });
    card.querySelector('.copy-otp-btn').addEventListener('click', (e) => { e.stopPropagation(); copyOtpToClipboard(otpValue, card); });
    return card;
}

function createErrorAccountCard(accountName, accountId, errorMessage) {
    const card = document.createElement('div');
    card.className = 'material-surface p-5 rounded-xl shadow-lg border border-red-500';
    card.dataset.accountId = accountId;
    card.innerHTML = `
        <div class="flex justify-between items-start mb-1">
            <div><h2 class="text-xl font-semibold text-red-300">${accountName} (Error)</h2></div>
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
    textArea.style.position = "fixed"; 
    textArea.style.left = "-9999px";
    document.body.appendChild(textArea);
    textArea.focus(); textArea.select();
    try {
        document.execCommand('copy');
        showToast('OTP copied to clipboard!', 'success');
        const copyBtn = cardElement.querySelector('.copy-otp-btn');
        if(copyBtn) { copyBtn.textContent = 'Copied!'; setTimeout(() => { copyBtn.textContent = 'Copy Code'; }, 2000); }
    } catch (err) { showToast('Failed to copy OTP.', 'error'); console.error('Fallback: Oops, unable to copy', err); }
    document.body.removeChild(textArea);
}

function updateAllOtps() {
    const seconds = new Date().getSeconds();
    const period = 30; 
    const timeLeft = period - (seconds % period);
    const progressPercent = (timeLeft / period) * 100;
    
    document.querySelectorAll('.account-card').forEach(card => {
        const accountId = card.dataset.accountId;
        if (accountsCache.has(accountId)) {
            const account = accountsCache.get(accountId);
            if (account.totp) {
                const otpValue = account.totp.generate();
                const formattedOtp = otpValue.length === 6 ? `${otpValue.slice(0,3)} ${otpValue.slice(3)}` : otpValue;
                const otpElement = card.querySelector('.otp-code');
                if (otpElement && otpElement.textContent !== formattedOtp) otpElement.textContent = formattedOtp;
            } else {
                 const otpElement = card.querySelector('.otp-code'); if(otpElement) otpElement.textContent = "Error";
            }
            const progressBar = card.querySelector('.progress-bar');
            if (progressBar) progressBar.style.width = `${progressPercent}%`;
        }
    });
}

// --- Event Listeners ---
addAccountBtn.addEventListener('click', () => openModal());
cancelModalBtn.addEventListener('click', closeModal);
accountForm.addEventListener('submit', saveAccount);

cancelDeleteBtn.addEventListener('click', closeDeleteModal);
confirmDeleteBtn.addEventListener('click', deleteAccountConfirmed);

accountModal.addEventListener('click', (e) => { if (e.target === accountModal) closeModal(); });
confirmDeleteModal.addEventListener('click', (e) => { if (e.target === confirmDeleteModal) closeDeleteModal(); });

// --- Initialization ---
setInterval(updateAllOtps, 1000); 
initializeFirebase();
