// Import MeshJS library from a CDN
import { Mesh, toHex } from "https://cdn.jsdelivr.net/npm/@meshsdk/core@1.5.5/dist/mesh.min.js";

// --- CONFIGURATION ---
const BACKEND_API_URL = "http://62.169.22.209:8001/api/v1/authorize-test"; // Placeholder: Sẽ được Systeme thay thế
const T_AND_C_URL = "https://scavenger.prod.gd.midnighttge.io/TandC";

// --- DOM ELEMENTS ---
const connectView = document.getElementById('connect-view');
const authorizeView = document.getElementById('authorize-view');
const finalView = document.getElementById('final-view');
const walletListContainer = document.getElementById('wallet-list');
const authorizeBtn = document.getElementById('authorize-btn');
const loader = document.getElementById('loader');
const statusMessage = document.getElementById('status-message');
const connectedWalletInfo = document.getElementById('connected-wallet-info');

// --- STATE MANAGEMENT ---
let appState = {
    wallet: null,
    sessionId: null,
    isLoading: false,
    error: null,
};

// --- UI RENDERER ---
function render() {
    loader.classList.toggle('hidden', !appState.isLoading);
    authorizeBtn.disabled = appState.isLoading;

    statusMessage.textContent = appState.error || '';
    statusMessage.className = `status-message ${appState.error ? 'error' : ''}`;
    
    if (appState.error) {
        if (!appState.wallet) {
            connectView.classList.remove('hidden');
            authorizeView.classList.add('hidden');
            finalView.classList.add('hidden');
        }
    } else if (appState.wallet) {
        connectView.classList.add('hidden');
        authorizeView.classList.remove('hidden');
        finalView.classList.add('hidden');
        connectedWalletInfo.textContent = `Connected with ${appState.wallet.name}. Click below to sign the session message.`;
    } else {
        connectView.classList.remove('hidden');
        authorizeView.classList.add('hidden');
        finalView.classList.add('hidden');
    }
}

// --- LOGIC ---
function getSessionIdFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get('session_id');
}

async function handleConnectWallet(walletName) {
    appState.isLoading = true;
    appState.error = null;
    render();

    try {
        const connectedWallet = await Mesh.connect(walletName);
        appState.wallet = connectedWallet;
    } catch (error) {
        console.error("Connection failed:", error);
        appState.error = "Wallet connection was cancelled or failed.";
    } finally {
        appState.isLoading = false;
        render();
    }
}

async function handleAuthorize() {
    if (!appState.wallet || !appState.sessionId) {
        appState.error = "Wallet not connected or Session ID is missing.";
        render();
        return;
    }

    appState.isLoading = true;
    appState.error = null;
    render();

    try {
        // 1. Fetch the message to sign
        const tcResponse = await fetch(T_AND_C_URL);
        if (!tcResponse.ok) throw new Error("Could not fetch Terms & Conditions.");
        const messageToSign = await tcResponse.text();

        // 2. Request signature from the user's wallet
        const usedAddresses = await appState.wallet.getUsedAddresses();
        if (usedAddresses.length === 0) throw new Error("No addresses found in the wallet.");
        const signingAddress = usedAddresses[0];

        const { key, signature } = await appState.wallet.signData(signingAddress, toHex(messageToSign));

        // 3. Prepare and send payload to our backend
        const payload = {
            sessionId: appState.sessionId,
            credentials: {
                address: signingAddress,
                publicKey: key,
                signature: signature,
            }
        };

        console.log("Sending payload to backend:", JSON.stringify(payload, null, 2));

        const relayResponse = await fetch(BACKEND_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        if (!relayResponse.ok) {
            const errorBody = await relayResponse.text();
            throw new Error(`Backend error: ${relayResponse.status} - ${errorBody}`);
        }

        // 4. Update UI to final success state
        authorizeView.classList.add('hidden');
        finalView.classList.remove('hidden');
        statusMessage.textContent = "";

    } catch (error) {
        console.error("Authorization process failed:", error);
        appState.error = error.message || "Signing was cancelled or an error occurred.";
    } finally {
        appState.isLoading = false;
        render();
    }
}

function displayAvailableWallets() {
    const wallets = Mesh.getWallets();
    if (wallets.length === 0) {
        walletListContainer.innerHTML = '<p>No Cardano wallet extensions found. Please install one and refresh the page.</p>';
        return;
    }

    walletListContainer.innerHTML = ''; // Clear previous list
    wallets.forEach(wallet => {
        const button = document.createElement('button');
        button.innerHTML = `<img src="${wallet.icon}" alt="${wallet.name} icon"> ${wallet.name}`;
        button.onclick = () => handleConnectWallet(wallet.name);
        walletListContainer.appendChild(button);
    });
}

// --- INITIALIZATION ---
function initialize() {
    appState.sessionId = getSessionIdFromUrl();
    if (!appState.sessionId) {
        statusMessage.textContent = "CRITICAL ERROR: No 'session_id' found in URL.";
        statusMessage.className = "status-message error";
        return;
    }

    displayAvailableWallets();
    authorizeBtn.addEventListener('click', handleAuthorize);
    render();
}

initialize();