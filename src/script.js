// --- Importations Firebase ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, onSnapshot, collection, query, where, getDocs, updateDoc, deleteDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

// --- Configuration et Initialisation de Firebase ---
const firebaseConfig = {
    apiKey: "AIzaSyA1AoHpUpvD12YUzLe91SWNpxmPRPB36aQ",
    authDomain: "easyplayapp-97e15.firebaseapp.com",
    projectId: "easyplayapp-97e15",
    storageBucket: "easyplayapp-97e15.firebasestorage.app",
    messagingSenderId: "741324257784",
    appId: "1:741324257784:web:06a85e1f10b8dc804afe0d",
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);


(function() {
    // --- Constantes et Variables Globales ---

    const APP_CONTAINER = document.getElementById('app-container');

    // Les clés de localStorage sont réactivées pour le mode invité (Guest Mode).
    // La persistance Firestore est toujours utilisée pour les utilisateurs connectés.
    const TEAM_DATA_KEY = 'volleyTeamsData';
    const BRASSAGE_PHASES_KEY = 'volleyBrassagePhases';
    const ELIMINATION_PHASES_KEY = 'volleyEliminationPhases';
    const SECONDARY_GROUPS_SELECTION_KEY = 'volleySecondaryGroupsSelection'; // Non utilisé, à supprimer si non pertinent
    const POOL_GENERATION_BASIS_KEY = 'volleyPoolGenerationBasis'; // Réactivé
    const SECONDARY_GROUPS_PREVIEW_KEY = 'volleySecondaryGroupsPreview';
    const ELIMINATED_TEAMS_KEY = 'volleyEliminatedTeams';

    const PHASE_TYPE_INITIAL = 'initial_brassage';
    const PHASE_TYPE_SECONDARY_BRASSAGE = 'secondary_brassage';
    const PHASE_TYPE_ELIMINATION_SEEDING = 'elimination_seeding'; // Phase spéciale pour le regroupement éliminatoire

    // Données du tournoi (chargées du tournoi actif ou de localStorage en mode invité)
    let allTeams = [];
    let allBrassagePhases = [];
    let eliminationPhases = {};
    let currentSecondaryGroupsPreview = {};
    let eliminatedTeams = new Set();
    let poolGenerationBasis = 'initialLevels'; // Default value, will be loaded or set
	let currentUserPrivateDataUnsubscribe = null;
	let currentTournamentUnsubscribe = null;

    let currentDisplayedPhaseId = null; // ID de la phase de brassage actuellement affichée

    // Variables pour la gestion des tournois et de l'utilisateur
    let currentTournamentId = null; // ID du tournoi actuellement sélectionné/actif
    let currentTournamentData = null; // Données complètes du tournoi actif (pour ownerId, collaborators)
    let allUserTournaments = []; // Liste des tournois auxquels l'utilisateur a accès

    // Map pour suivre les occurrences de matchs dans les différentes phases
    // Clé: chaîne canonique représentant la paire d'équipes (ex: "team1_id-team2_id" triée)
    // Valeur: Set d'IDs de phases où cette paire a joué
    let matchOccurrenceMap = new Map();

    // Variable pour le mode invité
    const GUEST_MODE_MAX_TEAMS = 9;
    let isGuestMode = true;


    // --- Cache des éléments DOM de la modale ---
    const actionModal = document.getElementById('actionModal');
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');
    const modalCancelBtn = document.getElementById('modalCancelBtn');
    let modalConfirmBtn = document.getElementById('modalConfirmBtn');

    // --- Cache des éléments DOM de la navigation et de l'authentification ---
    const authInfoDiv = document.getElementById('auth-info');
    const userEmailSpan = document.getElementById('user-email');
    const currentTournamentNameSpan = document.getElementById('current-tournament-name');
    const selectTournamentBtn = document.getElementById('select-tournament-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const navLinks = {
        home: document.getElementById('nav-home'), // Added home for consistency, ensure ID exists in HTML
        equipes: document.getElementById('nav-equipes'),
        brassages: document.getElementById('nav-brassages'),
        eliminatoires: document.getElementById('nav-eliminatoires'),
        classements: document.getElementById('nav-classements'),
        collaborators: document.getElementById('nav-collaborators')
    };

    // --- Fonctions Utilitaires ---

    /**
     * Échappe les caractères HTML spéciaux.
     * @param {string} text Le texte à échapper.
     * @returns {string} Le texte échappé.
     */
    function escapeHtml(text) {
        const s = String(text);
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;',
            '`': '&#96;',
            '$': '&#36;'
        };
        return s.replace(/[&<>"'`$]/g, function(m) { return map[m]; });
    }

    /**
     * Affiche un message temporaire (toast) à l'utilisateur.
     * @param {string} message - Le message à afficher.
     * @param {string} type - Le type de message ('success', 'error', 'info').
     * @param {number} duration - Durée d'affichage en ms (par défaut 3000ms).
     */
    function showToast(message, type = 'info', duration = 3000) {
        let toastContainer = document.getElementById('toast-container');
        if (!toastContainer) {
            toastContainer = document.createElement('div');
            toastContainer.id = 'toast-container';
            toastContainer.className = 'fixed top-4 right-4 z-[100] flex flex-col space-y-2';
            document.body.appendChild(toastContainer);
        }

        const toast = document.createElement('div');
        toast.className = `p-4 rounded-lg shadow-md text-white flex items-center space-x-2 transition-opacity duration-300 ease-out opacity-0`;

        let bgColor = '';
        let icon = '';
        switch (type) {
            case 'success':
                bgColor = 'bg-green-500';
                icon = '<i class="fas fa-check-circle"></i>';
                break;
            case 'error':
                bgColor = 'bg-red-500';
                icon = '<i class="fas fa-times-circle"></i>';
                break;
            case 'info':
            default:
                bgColor = 'bg-blue-500';
                icon = '<i class="fas fa-info-circle"></i>';
                break;
        }

        toast.classList.add(bgColor);
        toast.innerHTML = `${icon} <span>${message}</span>`;

        toastContainer.appendChild(toast);

        // Animate in
        setTimeout(() => {
            toast.classList.remove('opacity-0');
            toast.classList.add('opacity-100');
        }, 10);

        // Animate out and remove
        setTimeout(() => {
            toast.classList.remove('opacity-100');
            toast.classList.add('opacity-0');
            toast.addEventListener('transitionend', () => toast.remove());
        }, duration);
    }

    /**
     * Affiche une modale générique.
     * @param {string} title Le titre de la modale.
     * @param {HTMLElement} bodyContent Le contenu HTML à afficher dans le corps de la modale.
     * @param {Function} confirmCallback La fonction à appeler si l'utilisateur confirme.
     * @param {boolean} isDelete Indique si la modale est pour une suppression (bouton rouge).
     * @param {boolean} showCancelBtn Indique si le bouton annuler doit être affiché (par défaut true).
     */
    function showModal(title, bodyContent, confirmCallback, isDelete = false, showCancelBtn = true) {
        modalTitle.textContent = title;
        modalBody.innerHTML = '';
        modalBody.appendChild(bodyContent);
        actionModal.classList.remove('hidden');

        // Réaffecter modalConfirmBtn pour s'assurer que les anciens écouteurs sont retirés
        const oldConfirmBtn = modalConfirmBtn;
        const newConfirmBtn = oldConfirmBtn.cloneNode(true);
        oldConfirmBtn.parentNode.replaceChild(newConfirmBtn, oldConfirmBtn);
        modalConfirmBtn = newConfirmBtn; // Met à jour la référence

        if (isDelete) {
            modalConfirmBtn.classList.remove('bg-blue-600', 'hover:bg-blue-700', 'focus:ring-blue-500');
            modalConfirmBtn.classList.add('bg-red-600', 'hover:bg-red-700', 'focus:ring-red-500');
        } else {
            modalConfirmBtn.classList.remove('bg-red-600', 'hover:bg-red-700', 'focus:ring-red-500');
            modalConfirmBtn.classList.add('bg-blue-600', 'hover:bg-blue-700', 'focus:ring-blue-500');
        }

        modalConfirmBtn.onclick = () => {
            confirmCallback(); // Exécuter la logique de confirmation spécifique
            hideModal(); // Puis masquer la modale
        };

        if (showCancelBtn) {
            modalCancelBtn.classList.remove('hidden');
            modalCancelBtn.onclick = () => {
                hideModal();
            };
        } else {
            modalCancelBtn.classList.add('hidden');
            modalCancelBtn.onclick = null; // Clear event listener
        }
    }

    /**
     * Cache la modale générique.
     */
    function hideModal() {
        actionModal.classList.add('hidden');
        modalBody.innerHTML = '';
        modalConfirmBtn.onclick = null; // Supprimer l'écouteur pour éviter les effets secondaires
        modalCancelBtn.onclick = null; // Supprimer l'écouteur pour éviter les effets secondaires
    }

    /**
     * Mélange un tableau (algorithme de Fisher-Yates).
     * @param {Array} array Le tableau à mélanger.
     * @returns {Array} Le tableau mélangé.
     */
    function shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }

    // NEW: Fonction globale pour mettre à jour l'UI des radios de génération de poules
    // Déplacée ici pour être accessible globalement.
    function updatePoolGenerationBasisUI() {
        const initialLevelsRadio = document.getElementById('basisInitialLevels');
        const previousResultsRadio = document.getElementById('basisPreviousResults');
        const numberOfGlobalPhasesInput = document.getElementById('numberOfGlobalPhases');
        const basisHelpText = document.getElementById('basisHelpText');

        if (!initialLevelsRadio || !previousResultsRadio || !numberOfGlobalPhasesInput || !basisHelpText) {
            // Ces éléments n'existent pas sur toutes les pages, c'est normal.
            // Ne pas lancer d'erreur si on n'est pas sur la page "Brassages".
            return;
        }

        // Lire directement à partir de la variable globale poolGenerationBasis
        // La variable poolGenerationBasis est mise à jour par les event listeners sur les radios
        // et chargée depuis Firestore/localStorage.
        const selectedBasis = poolGenerationBasis;

        if (selectedBasis === 'initialLevels') {
            initialLevelsRadio.checked = true;
            previousResultsRadio.checked = false;
            numberOfGlobalPhasesInput.readOnly = false; // Permettre plusieurs phases pour les niveaux initiaux
            basisHelpText.textContent = "Crée des phases en utilisant les niveaux initiaux des équipes. Vous pouvez créer plusieurs phases de brassage initiales si nécessaire.";
        } else { // selectedBasis === 'previousResults'
            initialLevelsRadio.checked = false;
            previousResultsRadio.checked = true;
            numberOfGlobalPhasesInput.value = 1; // Forcer à 1 pour les résultats précédents
            numberOfGlobalPhasesInput.readOnly = true; // Une seule phase à la fois pour les résultats précédents
            basisHelpText.textContent = "Crée une phase en utilisant les résultats cumulés des brassages précédents. Une seule phase peut être créée à la fois avec cette méthode.";
        }
        // Assurez-vous que l'historique des phases et la visibilité des boutons sont mis à jour
        // renderPhaseHistory(); // Non appelé ici pour éviter des boucles ou des erreurs si pas sur la bonne page
    }


    // --- Fonctions de Persistance (Firestore et LocalStorage) ---

    /**
     * Référence au document Firestore pour les données privées de l'utilisateur (ex: tournoi actif).
     * @returns {import("https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js").DocumentReference|null} La référence du document ou null si Firebase n'est pas prêt.
     */
    function getUserPrivateDataRef() {
        if (window.db && window.userId) {
            // CORRECTION : Le chemin pointe maintenant vers la collection "users_private",
            // conformément à vos règles de sécurité Firestore.
            return window.doc(window.db, 'users_private', window.userId);
        }
        return null;
    }

    /**
     * Référence au document Firestore pour un tournoi spécifique.
     * @param {string} tournamentId L'ID du tournoi.
     * @returns {import("https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js").DocumentReference|null} La référence du document ou null si Firebase n'est pas prêt.
     */
    function getTournamentDataRef(tournamentId) {
        if (window.db && tournamentId) {
            return window.doc(window.db, 'tournaments', tournamentId);
        }
        // console.error("Firebase ou Tournament ID non initialisé pour les données du tournoi."); // Trop verbeux
        return null;
    }

    /**
     * Sauvegarde toutes les données du tournoi actif dans Firestore si connecté, ou dans LocalStorage si en mode invité.
     * Cette fonction est appelée chaque fois que des données sont modifiées.
     */
    async function saveAllData() {
    if (isGuestMode) {
        saveDataToLocalStorage();
        showToast("Données sauvegardées localement.", "success");
        handleLocationHash();
        return;
    }
    if (!window.userId || !currentTournamentId) return;
    const tournamentDocRef = getTournamentDataRef(currentTournamentId);
    if (!tournamentDocRef) return;
    try {
        const dataToSave = {
            name: currentTournamentData.name,
            date: currentTournamentData.date,
            numTeamsAllowed: currentTournamentData.numTeamsAllowed,
            ownerId: currentTournamentData.ownerId,
            poolGenerationBasis: poolGenerationBasis,
            allTeams: allTeams,
            allBrassagePhases: allBrassagePhases,
            eliminationPhases: eliminationPhases,
            currentSecondaryGroupsPreview: currentSecondaryGroupsPreview,
            eliminatedTeams: Array.from(eliminatedTeams),
            currentDisplayedPhaseId: currentDisplayedPhaseId
        };
        await window.setDoc(tournamentDocRef, dataToSave);
    } catch (e) {
        console.error("Erreur lors de la sauvegarde des données du tournoi dans Firestore:", e);
        showToast("Erreur lors de la sauvegarde des données du tournoi.", "error");
    }
}

    /**
     * Charge toutes les données du tournoi actif depuis Firestore.
     * Met également en place un listener en temps réel.
     */
	async function loadAllData() {
        // La fonction de nettoyage est maintenant appelée par onAuthStateChanged dans index.html AVANT ce code.
        
        if (!window.userId) {
            console.log("Utilisateur non connecté. Tentative de chargement des données en mode invité.");
            isGuestMode = true;
            loadDataFromLocalStorage();
            handleLocationHash(); // Va afficher la page d'accueil
            return;
        }

        isGuestMode = false;
        const userPrivateDataRef = getUserPrivateDataRef();
        if (!userPrivateDataRef) {
            showToast("Erreur: Impossible de charger les données utilisateur, Firebase non prêt.", "error");
            return;
        }

        // CORRECTION : On assigne la fonction de désinscription à notre variable globale
        currentUserPrivateDataUnsubscribe = window.onSnapshot(userPrivateDataRef, async (docSnap) => {
            if (docSnap.exists() && docSnap.data().activeTournamentId) {
                const activeTournamentIdFromUser = docSnap.data().activeTournamentId;
                if (currentTournamentId !== activeTournamentIdFromUser) {
                    await fetchAndListenToTournamentData(activeTournamentIdFromUser);
                }
            } else {
                currentTournamentId = null;
                currentTournamentData = null;
                allTeams = [];
                allBrassagePhases = [];
                eliminationPhases = {};
                updateTournamentDisplay();
                updateNavLinksVisibility();
                handleLocationHash();
            }
        }, (error) => {
            console.error("Erreur lors de l'écoute des données privées de l'utilisateur:", error);
        });

        await fetchUserTournamentsList();
    }
    /**
     * Sauvegarde les données du tournoi dans le localStorage pour le mode invité.
     */
    function saveDataToLocalStorage() {
        const dataToSave = {
            allTeams: allTeams,
            allBrassagePhases: allBrassagePhases,
            eliminationPhases: eliminationPhases,
            currentSecondaryGroupsPreview: currentSecondaryGroupsPreview,
            eliminatedTeams: Array.from(eliminatedTeams),
            currentDisplayedPhaseId: currentDisplayedPhaseId,
            poolGenerationBasis: poolGenerationBasis // Save basis for guest mode too
        };
        localStorage.setItem('guestTournamentData', JSON.stringify(dataToSave));
        localStorage.setItem(POOL_GENERATION_BASIS_KEY, poolGenerationBasis); // Also save basis separately for robustness

        // For guest mode, simulate currentTournamentData and currentTournamentId
        // This is a "dummy" tournament data for UI display in guest mode
        currentTournamentId = 'guest_mode_tournament';
        currentTournamentData = {
            name: "Tournoi Invité",
            date: new Date().toISOString().split('T')[0],
            numTeamsAllowed: GUEST_MODE_MAX_TEAMS,
            ownerId: 'guest',
            collaboratorIds: [],
            collaboratorEmails: []
        };
        updateTournamentDisplay();
        updateNavLinksVisibility();
        rebuildMatchOccurrenceMap(); // Rebuild map after saving data
    }

    /**
     * Charge les données du tournoi depuis le localStorage pour le mode invité.
     */
    function loadDataFromLocalStorage() {
        const storedData = localStorage.getItem('guestTournamentData');
        if (storedData) {
            try {
                const data = JSON.parse(storedData);
                allTeams = data.allTeams || [];
                allBrassagePhases = data.allBrassagePhases || [];
                eliminationPhases = data.eliminationPhases || {};
                currentSecondaryGroupsPreview = data.currentSecondaryGroupsPreview || {};
                eliminatedTeams = new Set(data.eliminatedTeams || []);
                currentDisplayedPhaseId = data.currentDisplayedPhaseId || null;
                poolGenerationBasis = data.poolGenerationBasis || localStorage.getItem(POOL_GENERATION_BASIS_KEY) || 'initialLevels'; // Load basis
                console.log("Données chargées depuis localStorage (mode invité).");
            } catch (e) {
                console.error("Erreur lors du chargement des données depuis localStorage:", e);
                // Fallback to empty data on error
                clearGuestData();
            }
        } else {
            console.log("Aucune donnée trouvée dans localStorage pour le mode invité. Initialisation vide.");
            clearGuestData();
        }
        rebuildMatchOccurrenceMap(); // Rebuild map after loading data
        // For guest mode, simulate currentTournamentData and currentTournamentId
        currentTournamentId = 'guest_mode_tournament';
        currentTournamentData = {
            name: "Tournoi Invité",
            date: new Date().toISOString().split('T')[0],
            numTeamsAllowed: GUEST_MODE_MAX_TEAMS,
            ownerId: 'guest',
            collaboratorIds: [],
            collaboratorEmails: []
        };
        updateTournamentDisplay();
        updateNavLinksVisibility();
    }

    /**
     * Efface toutes les données locales pour le mode invité.
     */
    function clearGuestData() {
        allTeams = [];
        allBrassagePhases = [];
        eliminationPhases = {};
        currentSecondaryGroupsPreview = {};
        eliminatedTeams = new Set();
        currentDisplayedPhaseId = null;
        poolGenerationBasis = 'initialLevels';
        localStorage.removeItem('guestTournamentData');
        localStorage.removeItem(POOL_GENERATION_BASIS_KEY); // Also remove basis
        rebuildMatchOccurrenceMap();
        updateTournamentDisplay();
        updateNavLinksVisibility();
    }

	/**
     * Récupère et met en place un listener en temps réel pour les données d'un tournoi spécifique.
     * @param {string} tournamentId L'ID du tournoi à charger.
     */
	async function fetchAndListenToTournamentData(tournamentId) {
        if (!tournamentId) return;
        if (currentTournamentUnsubscribe) currentTournamentUnsubscribe(); // Nettoie l'écouteur précédent

        const tournamentDocRef = getTournamentDataRef(tournamentId);
        currentTournamentId = tournamentId;

        // CORRECTION : On assigne la nouvelle fonction de désinscription
        currentTournamentUnsubscribe = window.onSnapshot(tournamentDocRef, (docSnap) => {
            if (docSnap.exists()) {
                currentTournamentData = docSnap.data();
                allTeams = currentTournamentData.allTeams || [];
                allBrassagePhases = currentTournamentData.allBrassagePhases || [];
                eliminationPhases = currentTournamentData.eliminationPhases || {};
                currentSecondaryGroupsPreview = currentTournamentData.currentSecondaryGroupsPreview || {};
                eliminatedTeams = new Set(currentTournamentData.eliminatedTeams || []);
                currentDisplayedPhaseId = currentTournamentData.currentDisplayedPhaseId || null;
                poolGenerationBasis = currentTournamentData.poolGenerationBasis || 'initialLevels';
                
                rebuildMatchOccurrenceMap();
                updateTournamentDisplay();
                updateNavLinksVisibility();
                handleLocationHash();
            } else {
                showToast("Le tournoi actif n'est plus accessible.", "error");
                loadDataFromLocalStorage();
                handleLocationHash();
            }
        }, (error) => {
            console.error("Erreur lors de l'écoute des données du tournoi:", error);
        });
    }

    /**
     * Récupère la liste de tous les tournois de l'utilisateur (propriétaire ou collaborateur).
     */
    async function fetchUserTournamentsList() {
    if (!window.userId || !window.db || isGuestMode) {
        allUserTournaments = [];
        return;
    }
    try {
        const tournamentsCollectionRef = window.collection(window.db, 'tournaments');
        const q = window.query(tournamentsCollectionRef, window.where('ownerId', '==', window.userId));
        const querySnapshot = await window.getDocs(q);
        allUserTournaments = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        console.log("Liste des tournois de l'utilisateur mise à jour:", allUserTournaments.length);

        if (!currentTournamentId && allUserTournaments.length > 0) {
            await selectTournament(allUserTournaments[0].id);
        } else if (!currentTournamentId && allUserTournaments.length === 0) {
            handleLocationHash();
        }
    } catch (error) {
        console.error("Erreur lors de la récupération de la liste des tournois:", error);
        showToast("Erreur lors du chargement de la liste de vos tournois.", "error");
        allUserTournaments = [];
    }
}

    /**
     * Sélectionne un tournoi comme tournoi actif pour l'utilisateur.
     * @param {string} tournamentId L'ID du tournoi à activer.
     */
    async function selectTournament(tournamentId) {
        if (!window.userId) {
            showToast("Vous devez être connecté pour sélectionner un tournoi.", "error");
            return;
        }
        if (currentTournamentId === tournamentId) {
            showToast("Ce tournoi est déjà sélectionné.", "info");
            return;
        }

        const userPrivateDataRef = getUserPrivateDataRef();
        if (!userPrivateDataRef) {
            showToast("Erreur: Impossible de sélectionner le tournoi, Firebase non prêt.", "error");
            return;
        }

        try {
            await window.setDoc(userPrivateDataRef, { activeTournamentId: tournamentId }, { merge: true });
            console.log(`Tournoi ${tournamentId} défini comme actif.`);
            showToast("Tournoi sélectionné avec succès !", "success");
            // La redirection vers #home a été retirée. La logique de rechargement
            // des données est maintenant gérée par la fonction appelante si nécessaire.
        } catch (error) {
            console.error("Erreur lors de la définition du tournoi actif:", error);
            showToast("Erreur lors de la sélection du tournoi.", "error");
        }
    }

    /**
     * Crée un nouveau tournoi.
     * @param {string} name Nom du tournoi.
     * @param {string} date Date du tournoi.
     * @param {number} numTeams Nombre d'équipes du tournoi.
     */
    async function createNewTournament(name, date, numTeams) {
        if (!window.userId) {
            showToast("Vous devez être connecté pour créer un tournoi.", "error");
            return;
        }

        if (!name.trim() || !date || isNaN(numTeams) || numTeams <= 0) {
            showToast("Veuillez remplir tous les champs du tournoi (Nom, Date, Nombre d'équipes).", "error");
            return;
        }

        try {
            const newTournamentDocRef = window.doc(window.collection(window.db, 'tournaments'));
            const newTournamentId = newTournamentDocRef.id;

            const initialTournamentData = {
                name: name.trim(),
                date: date,
                numTeamsAllowed: numTeams,
                ownerId: window.userId,
                createdAt: window.serverTimestamp ? window.serverTimestamp() : Date.now(),
                poolGenerationBasis: 'initialLevels',
                allTeams: [],
                allBrassagePhases: [],
                eliminationPhases: {},
                currentSecondaryGroupsPreview: {},
                eliminatedTeams: [],
                currentDisplayedPhaseId: null
            };

            await window.setDoc(newTournamentDocRef, initialTournamentData);
            showToast("Tournoi créé avec succès !", "success");

            // --- DÉBUT DE LA CORRECTION ---
            // 1. Sélectionne le nouveau tournoi sans rediriger
            await selectTournament(newTournamentId);
            
            // 2. Recharge la liste des tournois pour inclure le nouveau
            await fetchUserTournamentsList();
            
            // 3. Redessine la page du tableau de bord avec la liste à jour
            renderTournamentDashboard();
            // --- FIN DE LA CORRECTION ---

        } catch (error) {
            console.error("Erreur lors de la création du tournoi:", error);
            showToast("Erreur lors de la création du tournoi.", "error");
        }
    }
	

    /**
     * Supprime un tournoi. Seul le propriétaire peut le faire.
     * @param {string} tournamentId L'ID du tournoi à supprimer.
     */
    async function deleteTournament(tournamentId) {
        if (!window.userId) {
            showToast("Vous devez être connecté pour supprimer un tournoi.", "error");
            return;
        }

        const tournamentRef = getTournamentDataRef(tournamentId);
        if (!tournamentRef) {
            showToast("Erreur: Impossible de supprimer le tournoi, référence non valide.", "error");
            return;
        }

        try {
            const docSnap = await window.getDoc(tournamentRef);
            if (!docSnap.exists()) {
                showToast("Le tournoi n'existe pas.", "error");
                return;
            }

            const data = docSnap.data();
            if (data.ownerId !== window.userId) {
                showToast("Vous n'êtes pas le propriétaire de ce tournoi et ne pouvez pas le supprimer.", "error");
                return;
            }

            const messageContent = document.createElement('p');
            messageContent.textContent = `Êtes-vous sûr de vouloir supprimer le tournoi "${escapeHtml(data.name)}" ? Cette action est irréversible.`;
            messageContent.className = 'text-gray-700';

            showModal('Confirmer la suppression du tournoi', messageContent, async () => {
                await window.deleteDoc(tournamentRef);
                showToast(`Tournoi "${escapeHtml(data.name)}" supprimé.`, "success");

                // Si le tournoi supprimé était le tournoi actif, le désélectionner
                if (currentTournamentId === tournamentId) {
                    currentTournamentId = null;
                    currentTournamentData = null;
                    const userPrivateDataRef = getUserPrivateDataRef();
                    if (userPrivateDataRef) {
                        await window.setDoc(userPrivateDataRef, { activeTournamentId: null }, { merge: true });
                    }
                }
                // La liste des tournois sera mise à jour par fetchUserTournamentsList via onSnapshot
                // handleLocationHash() sera appelé après la mise à jour de la liste
            }, true); // Bouton rouge pour la suppression
        } catch (error) {
            console.error("Erreur lors de la suppression du tournoi:", error);
            showToast("Erreur lors de la suppression du tournoi.", "error");
        }
    }

    /**
     * Ajoute un collaborateur à un tournoi par son UID.
     * Cette fonction est celle qui respecte les règles de sécurité Firestore.
     * @param {string} tournamentId L'ID du tournoi.
     * @param {string} collaboratorUid L'UID du collaborateur à ajouter.
     */
    async function addCollaboratorByUid(tournamentId, collaboratorUid) {
        if (!window.userId) {
            showToast("Vous devez être connecté pour ajouter un collaborateur.", "error");
            return;
        }

        const tournamentRef = getTournamentDataRef(tournamentId);
        if (!tournamentRef) {
            showToast("Erreur: Impossible d'ajouter un collaborateur, référence au tournoi non valide.", "error");
            return;
        }

        try {
            const docSnap = await window.getDoc(tournamentRef);
            if (!docSnap.exists()) {
                showToast("Le tournoi n'existe pas.", "error");
                return;
            }

            const data = docSnap.data();
            if (data.ownerId !== window.userId) {
                showToast("Vous n'êtes pas le propriétaire de ce tournoi et ne pouvez pas ajouter de collaborateurs.", "error");
                return;
            }

            let currentCollaboratorIds = data.collaboratorIds || [];
            if (currentCollaboratorIds.includes(collaboratorUid)) {
                showToast("Cet UID est déjà un collaborateur.", "info");
                return;
            }

            currentCollaboratorIds.push(collaboratorUid);
            await window.updateDoc(tournamentRef, {
                collaboratorIds: currentCollaboratorIds
            });
            showToast(`Collaborateur (UID: ${collaboratorUid}) ajouté avec succès !`, "success");
            // Le rendu sera mis à jour par le listener du tournoi
        } catch (error) {
            console.error("Erreur lors de l'ajout du collaborateur par UID:", error);
            showToast("Erreur lors de l'ajout du collaborateur.", "error");
        }
    }

    /**
     * Ajoute un collaborateur à un tournoi par son email (pour affichage/gestion, pas pour sécurité directe).
     * @param {string} tournamentId L'ID du tournoi.
     * @param {string} collaboratorEmail L'email du collaborateur à ajouter.
     */
    async function addCollaboratorByEmailForDisplay(tournamentId, collaboratorEmail) {
        if (!window.userId) {
            showToast("Vous devez être connecté pour ajouter un collaborateur.", "error");
            return;
        }
        if (!collaboratorEmail.trim()) {
            showToast("L'adresse e-mail ne peut pas être vide.", "error");
            return;
        }

        const tournamentRef = getTournamentDataRef(tournamentId);
        if (!tournamentRef) {
            showToast("Erreur: Impossible d'ajouter un collaborateur, référence au tournoi non valide.", "error");
            return;
        }

        try {
            const docSnap = await window.getDoc(tournamentRef);
            if (!docSnap.exists()) {
                showToast("Le tournoi n'existe pas.", "error");
                return;
            }

            const data = docSnap.data();
            if (data.ownerId !== window.userId) {
                showToast("Vous n'êtes pas le propriétaire de ce tournoi et ne pouvez pas ajouter de collaborateurs.", "error");
                return;
            }

            let currentCollaboratorEmails = data.collaboratorEmails || [];
            if (currentCollaboratorEmails.includes(collaboratorEmail.trim())) {
                showToast("Cette adresse e-mail est déjà dans la liste des collaborateurs.", "info");
                return;
            }
            if (data.ownerId === window.userId && window.auth.currentUser.email === collaboratorEmail.trim()) {
                 showToast("Vous êtes déjà le propriétaire de ce tournoi.", "info");
                 return;
            }

            currentCollaboratorEmails.push(collaboratorEmail.trim());
            await window.updateDoc(tournamentRef, {
                collaboratorEmails: currentCollaboratorEmails
            });
            showToast(`Adresse e-mail "${escapeHtml(collaboratorEmail)}" ajoutée à la liste des collaborateurs.`, "success");
            showToast("Rappel: Pour un accès réel, l'UID de cet utilisateur doit être ajouté aux règles de sécurité via une fonction backend.", "info", 5000);
            // Le rendu sera mis à jour par le listener du tournoi
        } catch (error) {
            console.error("Erreur lors de l'ajout du collaborateur par email:", error);
            showToast("Erreur lors de l'ajout du collaborateur par email.", "error");
        }
    }

    /**
     * Supprime un collaborateur d'un tournoi par son UID.
     * @param {string} tournamentId L'ID du tournoi.
     * @param {string} collaboratorUid L'UID du collaborateur à supprimer.
     */
    async function removeCollaboratorByUid(tournamentId, collaboratorUid) {
        if (!window.userId) {
            showToast("Vous devez être connecté pour gérer les collaborateurs.", "error");
            return;
        }

        const tournamentRef = getTournamentDataRef(tournamentId);
        if (!tournamentRef) {
            showToast("Erreur: Impossible de supprimer le collaborateur, référence au tournoi non valide.", "error");
            return;
        }

        try {
            const docSnap = await window.getDoc(tournamentRef);
            if (!docSnap.exists()) {
                showToast("Le tournoi n'existe pas.", "error");
                return;
            }

            const data = docSnap.data();
            if (data.ownerId !== window.userId) {
                showToast("Vous n'êtes pas le propriétaire de ce tournoi et ne pouvez pas supprimer de collaborateurs.", "error");
                return;
            }
            if (collaboratorUid === window.userId) {
                showToast("Vous ne pouvez pas vous retirer vous-même en tant que propriétaire.", "error");
                return;
            }

            let currentCollaboratorIds = data.collaboratorIds || [];
            const updatedCollaboratorIds = currentCollaboratorIds.filter(uid => uid !== collaboratorUid);

            if (updatedCollaboratorIds.length === currentCollaboratorIds.length) {
                showToast("Cet UID n'est pas un collaborateur de ce tournoi.", "info");
                return;
            }

            await window.updateDoc(tournamentRef, {
                collaboratorIds: updatedCollaboratorIds
            });
            showToast(`Collaborateur (UID: ${collaboratorUid}) supprimé.`, "success");
            // Le rendu sera mis à jour par le listener du tournoi
        } catch (error) {
            console.error("Erreur lors de la suppression du collaborateur par UID:", error);
            showToast("Erreur lors de la suppression du collaborateur.", "error");
        }
    }

    /**
     * Supprime un collaborateur d'un tournoi par son email (pour affichage/gestion).
     * @param {string} tournamentId L'ID du tournoi.
     * @param {string} collaboratorEmail L'email du collaborateur à supprimer.
     */
    async function removeCollaboratorByEmailForDisplay(tournamentId, collaboratorEmail) {
        if (!window.userId) {
            showToast("Vous devez être connecté pour gérer les collaborateurs.", "error");
            return;
        }

        const tournamentRef = getTournamentDataRef(tournamentId);
        if (!tournamentRef) {
            showToast("Erreur: Impossible de supprimer le collaborateur, référence au tournoi non valide.", "error");
            return;
        }

        try {
            const docSnap = await window.getDoc(tournamentRef);
            if (!docSnap.exists()) {
                showToast("Le tournoi n'existe pas.", "error");
                return;
            }

            const data = docSnap.data();
            if (data.ownerId !== window.userId) {
                showToast("Vous n'êtes pas le propriétaire de ce tournoi et ne pouvez pas supprimer de collaborateurs.", "error");
                return;
            }
            if (data.ownerId === window.userId && window.auth.currentUser.email === collaboratorEmail.trim()) {
                 showToast("Vous êtes le propriétaire, vous ne pouvez pas vous retirer de la liste des collaborateurs.", "error");
                 return;
            }

            let currentCollaboratorEmails = data.collaboratorEmails || [];
            const updatedCollaboratorEmails = currentCollaboratorEmails.filter(email => email !== collaboratorEmail.trim());

            if (updatedCollaboratorEmails.length === currentCollaboratorEmails.length) {
                showToast("Cette adresse e-mail n'est pas dans la liste des collaborateurs.", "info");
                return;
            }

            await window.updateDoc(tournamentRef, {
                collaboratorEmails: updatedCollaboratorEmails
            });
            showToast(`Adresse e-mail "${escapeHtml(collaboratorEmail)}" supprimée de la liste.`, "success");
            // Le rendu sera mis à jour par le listener du tournoi
        } catch (error) {
            console.error("Erreur lors de la suppression du collaborateur par email:", error);
            showToast("Erreur lors de la suppression du collaborateur.", "error");
        }
    }

    
	/**
     * Met à jour l'affichage du nom, de la date et du nombre d'équipes du tournoi
     * actif dans la barre de navigation.
     */
    function updateTournamentDisplay() {
        const nameSpan = document.getElementById('current-tournament-name');
        if (!nameSpan) return;

        if (currentTournamentData && currentTournamentId) {
            let nameDisplay = "Tournoi: " + escapeHtml(currentTournamentData.name);
            if (isGuestMode) {
                nameDisplay += ' (Invité)';
            }
            
            // --- DÉBUT DE LA MODIFICATION ---
            // Formate la date au format JJ-MM-AAAA
            let dateDisplay = 'Date non définie';
            if (currentTournamentData.date) {
                // Sépare la date AAAA-MM-JJ en parties
                const dateParts = currentTournamentData.date.split('-'); 
                // Recombine dans le bon ordre si le format est correct
                if (dateParts.length === 3) {
                    dateDisplay = `Date: ${dateParts[2]}-${dateParts[1]}-${dateParts[0]}`;
                } else {
                    // Si le format est inattendu, on affiche la date telle quelle
                    dateDisplay = `Date: ${escapeHtml(currentTournamentData.date)}`; 
                }
            }
            // --- FIN DE LA MODIFICATION ---
            
            const numTeamsAllowed = currentTournamentData.numTeamsAllowed || GUEST_MODE_MAX_TEAMS;
            const teamsDisplay = `Équipes: ${allTeams.length} / ${numTeamsAllowed}`;

            // Construit le nouveau HTML avec la date formatée
            nameSpan.innerHTML = `
                <p class="font-bold">${nameDisplay}</p>
                <p class="text-xs mt-1">${dateDisplay}</p>
                <p class="text-xs">${teamsDisplay}</p>
            `;
            
            nameSpan.classList.remove('hidden');
        } else {
            nameSpan.textContent = 'Aucun tournoi sélectionné';
            nameSpan.classList.add('italic');
        }
    }

    /**
     * Met à jour la visibilité des liens de navigation en fonction de l'état d'authentification
     * et de la sélection d'un tournoi.
     */
       function updateNavLinksVisibility() {
        const isLoggedIn = !!window.userId;
        const tournamentSelected = !!currentTournamentId;
        // NEW: Get the reference to the new login/signup button container
        const authCtaContainer = document.getElementById('auth-cta-container');

        // Auth info (user email, logout, change tournament)
        authInfoDiv.classList.toggle('hidden', !isLoggedIn); // Hidden if not logged in

        // NEW: Login/Signup CTA button
        if (authCtaContainer) { // Ensure the element exists before trying to access its classList
            authCtaContainer.classList.toggle('hidden', isLoggedIn); // Hidden if logged in
        }

        userEmailSpan.textContent = (isLoggedIn && window.auth.currentUser) ? window.auth.currentUser.email : '';

        // Nav links visibility (unchanged from previous version)
        if (navLinks.home) {
            navLinks.home.classList.remove('hidden');
        }
        if (navLinks.equipes) navLinks.equipes.classList.toggle('hidden', !tournamentSelected);
        if (navLinks.brassages) navLinks.brassages.classList.toggle('hidden', !tournamentSelected);
        if (navLinks.eliminatoires) navLinks.eliminatoires.classList.toggle('hidden', !tournamentSelected);
        if (navLinks.classements) navLinks.classements.classList.toggle('hidden', !tournamentSelected);

        // Collaborators link only visible for logged-in owners
        if (navLinks.collaborators) navLinks.collaborators.classList.toggle('hidden', !(isLoggedIn && tournamentSelected && currentTournamentData?.ownerId === window.userId));

        // Logout/Select Tournament buttons (part of authInfoDiv, but explicit toggle for clarity if ever separated)
        selectTournamentBtn.classList.toggle('hidden', !isLoggedIn);
        logoutBtn.classList.toggle('hidden', !isLoggedIn);

        // Mise à jour de la classe "active" de la navigation pour tous les liens
        document.querySelectorAll('.nav-link').forEach(link => {
            const linkPath = link.getAttribute('href').substring(1);
            const currentHashPath = window.location.hash.substring(1);
            if (linkPath === currentHashPath) {
                link.classList.add('border-b-2', 'border-blue-200');
            } else {
                link.classList.remove('border-b-2', 'border-blue-200');
            }
        });
    }
	
	// Part 2 sur 5 (script.js) - Corrigée

    /**
     * Reconstruit la map `matchOccurrenceMap` à partir de `allBrassagePhases`.
     * Ceci est nécessaire après le chargement des données depuis Firestore ou LocalStorage.
     */
    function rebuildMatchOccurrenceMap() {
        matchOccurrenceMap.clear(); // Vider la map existante
        // Seules les phases de brassage (initiales et secondaires) sont pertinentes pour les occurrences de matchs
        allBrassagePhases.filter(p => p.type === PHASE_TYPE_INITIAL || p.type === PHASE_TYPE_SECONDARY_BRASSAGE).forEach(phase => {
            if (phase.generated && phase.pools) {
                phase.pools.forEach(pool => {
                    pool.matches.forEach(match => {
                        if (match.team1Id && match.team2Id) { // S'assurer que les équipes sont définies
                            const matchKey = JSON.stringify([match.team1Id, match.team2Id].sort());
                            if (!matchOccurrenceMap.has(matchKey)) {
                                matchOccurrenceMap.set(matchKey, new Set());
                            }
                            matchOccurrenceMap.get(matchKey).add(phase.id);
                        }
                    });
                });
            }
        });
        console.log("Map des occurrences de matchs reconstruite.");
    }

    /**
     * Calcule et affiche le nombre de matchs répétés.
     */
    function updateRepeatedMatchesCountDisplay() {
        const countElement = document.getElementById('repeatedMatchesCount');
        if (countElement) {
            let repeatedCount = 0;
            // Itérer sur la map pour compter les rencontres répétées uniques
            for (const [matchKey, phaseIdsSet] of matchOccurrenceMap.entries()) {
                if (phaseIdsSet.size > 1) { // Un match est répété s'il a eu lieu dans plus d'une phase
                    repeatedCount++;
                }
            }

            countElement.textContent = `(${repeatedCount} rencontre${repeatedCount > 1 ? 's' : ''} répétée${repeatedCount > 1 ? 's' : ''})`;
            if (repeatedCount === 0) {
                countElement.classList.add('hidden');
            } else {
                countElement.classList.remove('hidden');
            }
        }
    }

    /**
     * Vérifie si un match donné s'est déjà produit dans une autre phase.
     * @param {string} team1Id ID de la première équipe.
     * @param {string} team2Id ID de la deuxième équipe.
     * @param {string} currentPhaseId ID de la phase actuelle à exclure de la vérification.
     * @param {Map} evaluationMatchMap La map d'occurrences de matchs à utiliser pour cette vérification (peut être temporaire).
     * @returns {boolean} Vrai si le match est une répétition, faux sinon.
     */
    function isMatchRepeated(team1Id, team2Id, currentPhaseId, evaluationMatchMap = matchOccurrenceMap) {
        if (!team1Id || !team2Id) return false;
        const matchKey = JSON.stringify([team1Id, team2Id].sort());
        const occurrences = evaluationMatchMap.get(matchKey);
        if (!occurrences) return false;

        // Vérifier si cette paire d'équipes a joué dans au moins une *autre* phase (sans inclure currentPhaseId si c'est la phase évaluée).
        return Array.from(occurrences).some(phaseId => phaseId !== currentPhaseId);
    }

    /**
     * Affiche une modale avec les détails d'un match répété.
     * @param {string} team1Name Nom de la première équipe.
     * @param {string} team2Name Nom de la deuxième équipe.
     * @param {string} team1Id ID de la première équipe.
     * @param {string} team2Id ID de la deuxième équipe.
     * @param {string} currentPhaseId ID de la phase actuelle (à exclure de la liste).
     */
    function showRepeatedMatchDetailsModal(team1Name, team2Name, team1Id, team2Id, currentPhaseId) {
        const matchKey = JSON.stringify([team1Id, team2Id].sort());
        const occurrences = matchOccurrenceMap.get(matchKey);

        if (!occurrences) {
            console.warn("DEBUG: Aucune occurrence trouvée pour ce match répété, ce qui est inattendu.");
            return;
        }

        const previousPhases = Array.from(occurrences)
            .filter(phaseId => phaseId !== currentPhaseId) // Exclure la phase actuelle
            .map(phaseId => allBrassagePhases.find(p => p.id === phaseId))
            .filter(phase => phase !== undefined); // S'assurer que la phase existe

        const modalContent = document.createElement('div');
        modalContent.className = 'text-gray-700';

        if (previousPhases.length > 0) {
            modalContent.innerHTML = `
                <p class="mb-3">La rencontre <span class="font-bold">${escapeHtml(team1Name)} vs ${escapeHtml(team2Name)}</span> s'est déjà produite dans les phases suivantes :</p>
                <ul class="list-disc list-inside space-y-1">
                    ${previousPhases.map(phase => `<li>${escapeHtml(phase.name)}</li>`).join('')}
                </ul>
                <p class="mt-4 text-sm text-gray-500">Nous avons fait de notre mieux pour minimiser les répétitions, mais elles peuvent survenir si le nombre d'équipes est limité ou si les structures des poules l'exigent.</p>
            `;
        } else {
            modalContent.innerHTML = `
                <p>La rencontre <span class="font-bold">${escapeHtml(team1Name)} vs ${escapeHtml(team2Name)}</span> n'apparaît pas comme répétée dans les phases précédentes enregistrées. Il pourrait y avoir une erreur ou il s'agit d'une rencontre au sein de la même phase.</p>
            `;
        }

        showModal(`Rencontre Répétée : ${escapeHtml(team1Name)} vs ${escapeHtml(team2Name)}`, modalContent, () => hideModal());
    }

    /**
     * Vérifie si une équipe avec un nom donné existe déjà dans la liste des équipes.
     * La comparaison est insensible à la casse.
     * @param {string} teamName Le nom de l'équipe à vérifier.
     * @returns {boolean} Vrai si l'équipe existe déjà, faux sinon.
     */
    function teamExists(teamName) {
        const lowerCaseNewTeamName = teamName.toLowerCase();
        return allTeams.some(team => team.name.toLowerCase() === lowerCaseNewTeamName);
    }
    // --- Fonctions de Gestion des Équipes ---

    /**
     * Affiche une modale demandant à l'utilisateur de se connecter ou de s'inscrire.
     */
    function showLoginRequiredModal() {
        const messageContent = document.createElement('div');
        messageContent.innerHTML = `
            <p class="text-gray-700 mb-4">Pour dépasser ${GUEST_MODE_MAX_TEAMS} équipes et sauvegarder vos progrès, veuillez vous connecter ou créer un compte.</p>
            <p class="text-gray-700">Vous pouvez continuer en mode invité avec les équipes actuelles.</p>
        `;
        const confirmBtnText = "Se connecter / S'inscrire";

        showModal('Connexion Requis', messageContent, () => {
            window.location.hash = '#auth';
            clearGuestData(); // Clear guest data on login redirect
        }, false, false); // No delete style, no cancel button
        modalConfirmBtn.textContent = confirmBtnText;
    }

    /**
     * Ajoute une nouvelle équipe.
     * @param {string} name - Le nom de l'équipe.
     * @param {number} level - Le niveau de l'équipe (1-10).
     */
function addTeam(name, level) {
        // Vérifie la limite d'équipes pour les tournois connectés et pour le mode invité
        const limit = isGuestMode ? GUEST_MODE_MAX_TEAMS : (currentTournamentData ? currentTournamentData.numTeamsAllowed : 0);
        if (allTeams.length >= limit) {
            showToast(`Limite de ${limit} équipes atteinte pour ce tournoi.`, "error");
            if (isGuestMode) showLoginRequiredModal();
            return;
        }
        
        if (!name.trim()) {
            showToast("Le nom de l'équipe ne peut pas être vide.", "error");
            return;
        }
        if (teamExists(name)) {
            showToast(`L'équipe "${escapeHtml(name)}" existe déjà.`, "error");
            return;
        }
        if (isNaN(level) || level < 1 || level > 10) {
            showToast("Le niveau doit être un nombre entre 1 et 10.", "error");
            return;
        }
        
        const newTeam = {
            id: 'team_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9),
            name: name.trim(),
            level: parseInt(level)
        };
        allTeams.push(newTeam);
        saveAllData();
        showToast(`Équipe "${escapeHtml(name)}" ajoutée.`, "success");
    }

    /**
     * Met à jour le nom et le niveau d'une équipe.
     * @param {string} id - L'ID de l'équipe à mettre à jour.
     * @param {string} newName - Le nouveau nom de l'équipe.
     * @param {number} newLevel - Le nouveau niveau de l'équipe.
     */
    function updateTeam(id, newName, newLevel) {
        if (!newName.trim()) {
            showToast("Le nom de l'équipe ne peut pas être vide.", "error");
            return;
        }
        if (teamExists(newName) && allTeams.find(t => t.id === id)?.name.toLowerCase() !== newName.toLowerCase()) {
            showToast(`Une équipe nommée "${escapeHtml(newName)}" existe déjà.`, "error");
            return;
        }
        if (isNaN(newLevel) || newLevel < 1 || newLevel > 10) {
            showToast("Le niveau doit être un nombre entre 1 et 10.", "error");
            return;
        }

        const teamToUpdate = allTeams.find(team => team.id === id);
        if (teamToUpdate) {
            teamToUpdate.name = newName.trim();
            teamToUpdate.level = newLevel;
            saveAllData(); // Will save to localStorage if in guest mode, Firestore if logged in
            // Le rendu est géré par setupEquipesPageLogic après l'appel à saveAllData via onSnapshot
            showToast(`Équipe "${escapeHtml(newName)}" mise à jour.`, "success");
        } else {
            showToast("Équipe non trouvée.", "error");
        }
    }

    /**
     * Supprime une équipe.
     * @param {string} id - L'ID de l'équipe à supprimer.
     */
    function deleteTeam(id) {
        // Vérifier si l'équipe est impliquée dans une phase de brassage ou d'élimination
        const isTeamInBrassage = allBrassagePhases.some(phase =>
            phase.pools && phase.pools.some(pool =>
                pool.teams.some(team => team.id === id) || pool.matches.some(match => match.team1Id === id || match.team2Id === id)
            )
        );

        const isTeamInElimination = Object.values(eliminationPhases).some(bracket =>
            bracket.bracket && bracket.bracket.some(round =>
                round.matches.some(match => (match.team1 && match.team1.id === id) || (match.team2 && match.team2.id === id))
            )
        );

        if (isTeamInBrassage || isTeamInElimination) {
            const messageContent = document.createElement('p');
            messageContent.innerHTML = `L'équipe est impliquée dans des phases de tournoi existantes (brassage ou élimination). Vous ne pouvez pas la supprimer.<br><br>Veuillez supprimer les phases concernées d'abord.`;
            messageContent.className = 'text-gray-700';
            showModal("Impossible de supprimer l'équipe", messageContent, () => hideModal());
            return;
        }

        const teamToDelete = allTeams.find(team => team.id === id);
        if (!teamToDelete) {
            showToast("Équipe non trouvée.", "error");
            return;
        }

        const messageContent = document.createElement('p');
        messageContent.textContent = `Êtes-vous sûr de vouloir supprimer l'équipe "${escapeHtml(teamToDelete.name)}" ? Cette action est irréversible.`;
        messageContent.className = 'text-gray-700';

        showModal('Confirmer la suppression', messageContent, () => {
            allTeams = allTeams.filter(team => team.id !== id);
            eliminatedTeams.delete(id); // S'assurer qu'elle est retirée des équipes éliminées si elle y était
            saveAllData(); // Will save to localStorage if in guest mode, Firestore if logged in
            // Le rendu est géré par setupEquipesPageLogic après l'appel à saveAllData via onSnapshot
            showToast(`Équipe "${escapeHtml(teamToDelete.name)}" supprimée.`, "success");
        }, true);
    }

    // --- Fonctions de Gestion des Phases de Brassage ---

    /**
     * Vérifie si une phase de brassage donnée est complète (tous les matchs ont des scores et un vainqueur).
     * @param {Object} phase The phase object to check.
     * @returns {boolean} True if the phase is complete, false otherwise.
     */
    function isBrassagePhaseComplete(phase) {
        if (!phase || !phase.generated || !phase.pools) return false;
        for (const pool of phase.pools) {
            if (!pool.matches) return false;
            for (const match of pool.matches) {
                // Check if score1 and score2 are valid numbers and winnerId is set
                if (match.score1 === null || match.score2 === null || isNaN(match.score1) || isNaN(match.score2) || match.winnerId === null) {
                    return false;
                }
            }
        }
        return true;
    }

    /**
     * Helper function to generate a single set of pools and evaluate its repetitions.
     * @param {string} phaseType The type of phase (initial_brassage or secondary_brassage).
     * @param {Array<Object>} teamsToUse The teams to use for generation.
     * @param {number} requestedTeamsPerPool The number of teams desired per pool.
     * @param {HTMLElement} msgElement Element to display messages (for internal generation failures).
     * @param {string|null} currentPhaseIdToExclude The ID of the phase currently being generated (to exclude from repetition check).
     * @returns {{pools: Array<Object>|null, repetitions: number, remainingTeamsCount: number}} Object with generated pools, repetition count, and remaining teams.
     */
    function generateAndEvaluatePools(phaseType, teamsToUse, requestedTeamsPerPool, msgElement, currentPhaseIdToExclude = null) {
        let generationResult = null;
        if (phaseType === PHASE_TYPE_INITIAL) {
            generationResult = _generatePoolsLogicInitialLevels(teamsToUse, requestedTeamsPerPool, msgElement);
        } else if (phaseType === PHASE_TYPE_SECONDARY_BRASSAGE) {
            generationResult = _generatePoolsLogicRankingBased(teamsToUse, requestedTeamsPerPool, msgElement);
        }

        if (!generationResult || !generationResult.pools) {
            return { pools: null, repetitions: Infinity, remainingTeamsCount: Infinity };
        }

        const generatedPools = generationResult.pools;

        // Create a temporary, combined list of phases for evaluation, including the new generated one
        const phasesForEvaluation = [...allBrassagePhases.filter(p => p.id !== currentPhaseIdToExclude)];

        // Create a temporary phase representation for the newly generated pools
        const tempPhaseForEvaluation = {
            id: currentPhaseIdToExclude || 'temp_phase_for_eval_' + Date.now(),
            type: phaseType,
            name: 'Temp Phase for Evaluation',
            pools: generatedPools,
            generated: true,
            timestamp: Date.now() // Use a unique timestamp for uniqueness in the map
        };
        phasesForEvaluation.push(tempPhaseForEvaluation);


        // Rebuild a temporary match occurrence map including the new pools
        const tempMatchOccurrenceMap = new Map();
        phasesForEvaluation.forEach(p => {
            if (p.generated && p.pools) {
                p.pools.forEach(pool => {
                    pool.matches.forEach(match => {
                        if (match.team1Id && match.team2Id) {
                            const matchKey = JSON.stringify([match.team1Id, match.team2Id].sort());
                            if (!tempMatchOccurrenceMap.has(matchKey)) {
                                tempMatchOccurrenceMap.set(matchKey, new Set());
                            }
                            tempMatchOccurrenceMap.get(matchKey).add(p.id);
                        }
                    });
                });
            }
        });

        let currentRepetitions = 0;
        // Count repetitions specifically within the newly generated pools against ALL OTHER phases
        tempPhaseForEvaluation.pools.forEach(pool => {
            pool.matches.forEach(match => {
                if (match.team1Id && match.team2Id) {
                    const matchKey = JSON.stringify([match.team1Id, match.team2Id].sort());
                    const occurrences = tempMatchOccurrenceMap.get(matchKey);
                    // A match is a repetition if it occurs in tempPhaseForEvaluation AND in at least one OTHER phase
                    if (occurrences && occurrences.has(tempPhaseForEvaluation.id) && Array.from(occurrences).some(id => id !== tempPhaseForEvaluation.id)) {
                         currentRepetitions++;
                    }
                }
            });
        });

        return { pools: generatedPools, repetitions: currentRepetitions, remainingTeamsCount: generationResult.remainingTeamsCount };
    }


    /**
     * Unified function to generate pools for any brassage phase.
     * @param {string} phaseIdToUpdate ID of the phase whose pools are to be generated.
     */
    function generatePoolsForPhase(phaseIdToUpdate) {
        console.log("--- DEBUG: Entering generatePoolsForPhase ---");
        console.log(`DEBUG: Requested Phase ID to Update: ${phaseIdToUpdate}`);

        if (allTeams.length === 0) {
            showToast("Aucune équipe n'a été ajoutée. Veuillez gérer les équipes d'abord.", "error");
            console.log("DEBUG: No teams available, exiting.");
            return;
        }

        const numPoolsInput = document.getElementById('teamsPerPool'); // Get the input element
        const requestedTeamsPerPool = parseInt(numPoolsInput.value);

        if (isNaN(requestedTeamsPerPool) || requestedTeamsPerPool < 1) {
            showToast("Veuillez entrer un nombre valide d'équipes par poule (au moins 1).", "error");
            console.log("DEBUG: Invalid teams per pool (less than 1), exiting.");
            return;
        }

        if (requestedTeamsPerPool > 10) {
            showToast("Le nombre d'équipes par poule ne peut pas dépasser 10 (le niveau maximum des équipes).", "error");
            console.log("DEBUG: Teams per pool exceeds max level (10), exiting.");
            return;
        }

        const phaseToGenerate = allBrassagePhases.find(p => p.id === phaseIdToUpdate);
        if (!phaseToGenerate) {
            showToast("Erreur: Phase à générer introuvable.", "error");
            console.log(`DEBUG: Phase with ID ${phaseIdToUpdate} not found, exiting.`);
            return;
        }
        console.log(`DEBUG: Phase to generate found: ${phaseToGenerate.name} (Type: ${phaseToGenerate.type})`);

        // Get sorted list of actual brassage phases (initial and secondary)
        const sortedActualBrassagePhases = allBrassagePhases
            .filter(p => p.type === PHASE_TYPE_INITIAL || p.type === PHASE_TYPE_SECONDARY_BRASSAGE)
            .sort((a, b) => a.timestamp - b.timestamp);

        const currentPhaseIndexInSorted = sortedActualBrassagePhases.findIndex(p => p.id === phaseIdToUpdate);
        // Check if this is the absolute first brassage phase created by chronological order
        const isFirstActualBrassagePhaseOverall = currentPhaseIndexInSorted === 0;
        console.log(`DEBUG: Is this the first *overall* brassage phase? ${isFirstActualBrassagePhaseOverall}`);

        // Get the user's selected pool generation basis directly from radio buttons
        const basisInitialLevelsRadio = document.getElementById('basisInitialLevels');
        const basisPreviousResultsRadio = document.getElementById('basisPreviousResults');
        const selectedBasisFromUI = basisInitialLevelsRadio.checked ? 'initialLevels' : (basisPreviousResultsRadio.checked ? 'previousResults' : null);
        console.log(`DEBUG: User's selected basis from radio buttons: "${selectedBasisFromUI}"`);

        let effectiveUseInitialLevels;

        if (isFirstActualBrassagePhaseOverall) {
            // The very first brassage phase (initial or secondary, though usually initial) MUST use initial levels.
            effectiveUseInitialLevels = true;
            showToast("La toute première phase de brassage utilise toujours les niveaux initiaux des équipes.", "info");
            console.log("DEBUG: This is the first *overall* brassage phase. Forcing effectiveUseInitialLevels = true.");
        } else if (phaseToGenerate.type === PHASE_TYPE_SECONDARY_BRASSAGE) {
            // Secondary brassage phases always derive from previous results.
            effectiveUseInitialLevels = false;
            console.log("DEBUG: Phase type is SECONDARY_BRASSAGE. Forcing effectiveUseInitialLevels = false.");
        } else if (phaseToGenerate.type === PHASE_TYPE_INITIAL) {
            // For subsequent initial brassage phases, respect the user's chosen basis.
            effectiveUseInitialLevels = (selectedBasisFromUI === 'initialLevels');
            console.log(`DEBUG: Phase type is INITIAL_BRASSAGE (not first overall). EffectiveUseInitialLevels based on selectedBasis: ${effectiveUseInitialLevels}.`);
        } else {
            // Fallback for any other unexpected phase type, default to initial levels or throw error
            effectiveUseInitialLevels = true; // Safe default
            console.warn(`DEBUG: Unknown phase type encountered (${phaseToGenerate.type}). Defaulting to initial levels.`);
        }

        console.log(`DEBUG: Final effectiveUseInitialLevels for this generation attempt: ${effectiveUseInitialLevels}`);

        // Now, apply the check for previous results only if the effective method for THIS phase is 'previousResults'
        if (!effectiveUseInitialLevels) { // This means the effective method for this generation is 'previousResults'
            const previousBrassagePhase = sortedActualBrassagePhases[currentPhaseIndexInSorted - 1];
            console.log(`DEBUG: Effective method is 'previousResults'. Checking previous phase completion.`);
            if (!previousBrassagePhase) {
                showToast("Erreur logique: La phase précédente est introuvable pour une génération basée sur les résultats.", "error");
                console.log("DEBUG: Previous phase not found for results-based generation, exiting.");
                return;
            }
            console.log(`DEBUG: Previous phase to check: ${previousBrassagePhase.name} (ID: ${previousBrassagePhase.id})`);
            if (!isBrassagePhaseComplete(previousBrassagePhase)) {
                showToast(`Veuillez compléter tous les scores de la phase précédente ("${escapeHtml(previousBrassagePhase.name)}") avant de générer les poules basées sur les résultats.`, "error");
                console.log(`DEBUG: Previous phase (${previousBrassagePhase.name}) is NOT complete, exiting.`);
                return;
            }
            console.log(`DEBUG: Previous phase (${previousBrassagePhase.name}) IS complete.`);
        }

        // Determine the actual teams to use for generation
        const teamsForGeneration = effectiveUseInitialLevels ? allTeams : (function() {
            const globalRankings = getGlobalRankings(allTeams, allBrassagePhases);
            const teamsWithScores = globalRankings.filter(r => r.totalPoints !== 0 || r.totalDiffScore !== 0).map(r => ({
                id: r.teamObject.id,
                name: r.teamObject.name,
                level: r.teamObject.level,
                totalPoints: r.totalPoints,
                totalDiffScore: r.totalDiffScore
            }));
            // If there are no teams with scores, fall back to all teams but warn
            if (teamsWithScores.length === 0 && !isFirstActualBrassagePhaseOverall) {
                showToast("Aucune équipe avec des scores enregistrés pour générer des poules basées sur les résultats précédents. Les niveaux initiaux seront utilisés.", "error");
                console.log("DEBUG: No teams with scores for results-based generation, falling back to all teams.");
                return allTeams; // Fallback
            }
            console.log(`DEBUG: Teams for generation based on scores (${teamsWithScores.length} teams):`, teamsWithScores.map(t => `${t.name} (Pts: ${t.totalPoints}, Diff: ${t.totalDiffScore})`).join(', '));
            return teamsWithScores.length > 0 ? teamsWithScores : allTeams; // Use teamsWithScores if available, else allTeams
        })();

        if (teamsForGeneration.length === 0) {
             showToast("Aucune équipe disponible pour générer des poules.", "error");
             console.log("DEBUG: No teams for generation, exiting.");
             return;
        }
        if (teamsForGeneration.length < requestedTeamsPerPool) {
            showToast(`Pas assez d'équipes (${teamsForGeneration.length}) pour former des poules de ${requestedTeamsPerPool} équipes. Réduisez le nombre d'équipes par poule ou ajoutez des équipes.` + (effectiveUseInitialLevels ? "" : " Assurez-vous d'avoir suffisamment d'équipes avec des scores valides."), "error");
            console.log("DEBUG: Not enough teams for requested pools, exiting.");
            return;
        }


        const MAX_ATTEMPTS = 20; // Number of times to try generating pools
        let bestPools = null;
        let minRepetitions = Infinity;
        let bestRemainingTeamsCount = Infinity;
        console.log(`DEBUG: Starting pool generation attempts (max ${MAX_ATTEMPTS})...`);

        for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
            // Generate and evaluate potential pools
            const result = generateAndEvaluatePools(phaseToGenerate.type, teamsForGeneration, requestedTeamsPerPool, null, phaseIdToUpdate);

            if (result.pools) {
                // Prioritize fewer repetitions, then fewer remaining teams
                if (result.repetitions < minRepetitions) {
                    minRepetitions = result.repetitions;
                    bestPools = result.pools;
                    bestRemainingTeamsCount = result.remainingTeamsCount;
                } else if (result.repetitions === minRepetitions && result.remainingTeamsCount < bestRemainingTeamsCount) {
                    // If repetitions are the same, prefer fewer unassigned teams
                    minRepetitions = result.repetitions; // Redundant but for clarity
                    bestPools = result.pools;
                    bestRemainingTeamsCount = result.remainingTeamsCount;
                }

                // If we found a perfect solution (0 repetitions), no need to try further
                if (minRepetitions === 0 && bestRemainingTeamsCount === 0) { // Also ensure all teams assigned
                     console.log(`DEBUG: Optimal solution found in ${attempt + 1} attempts.`);
                     break;
                }
            }
        }

        if (!bestPools) {
            showToast("Impossible de générer des poules valides après plusieurs tentatives. Vérifiez le nombre d'équipes et les paramètres.", "error");
            console.log("DEBUG: Failed to generate valid pools after all attempts, exiting.");
            return;
        }

        const phaseIndex = allBrassagePhases.findIndex(p => p.id === phaseIdToUpdate);
        if (phaseIndex > -1) {
            allBrassagePhases[phaseIndex].pools = bestPools;
            allBrassagePhases[phaseIndex].generated = true;
            saveAllData(); // Sauve les données, cela déclenchera le re-rendu de l'UI
            // Le rendu est géré par onSnapshot (pour les utilisateurs connectés) ou par handleLocationHash (pour le mode invité)
            // renderPhaseHistory();
            // renderPoolsWithCurrentSettings(bestPools, allBrassagePhases[phaseIndex].name, phaseIdToUpdate);

            let successMessage = bestPools.length + " poule(s) générée(s) avec succès pour cette phase ! ";
            if (minRepetitions > 0) {
                successMessage += `Ceci a entraîné ${minRepetitions} rencontre(s) répétée(s) (minimum trouvé après ${MAX_ATTEMPTS} tentatives).`;
            } else {
                successMessage += `Aucune rencontre répétée détectée dans cette phase.`;
            }
            if (bestRemainingTeamsCount > 0) {
                successMessage += ` ${bestRemainingTeamsCount} équipe(s) n'ont pas pu être assignée(s) à une poule.`;
            }
            showToast(successMessage, "success");
            console.log("DEBUG: Pool generation successful.");
        } else {
            showToast("Erreur: Phase à générer introuvable après les vérifications.", "error");
            console.log("DEBUG: Phase not found after final checks, exiting.");
        }
        console.log("--- DEBUG: Exiting generatePoolsForPhase ---");
    }

    /**
     * Logic to generate pools based on initial team levels.
     * @param {Array<Object>} teamsToUse The teams to use for generation.
     * @param {number} requestedTeamsPerPool The number of teams desired per pool.
     * @param {HTMLElement} msgElement Element to display messages.
     * @returns {Object|null} Object containing generated pools and remaining teams count, or null on failure.
     */
    function _generatePoolsLogicInitialLevels(teamsToUse, requestedTeamsPerPool, msgElement) {
        const teamsByExactLevel = new Map();
        for (let i = 1; i <= 10; i++) {
            teamsByExactLevel.set(i, shuffleArray(teamsToUse.filter(team => team.level === i)));
        }

        let maxPoolsThatCanBeFormed = Infinity;
        let requiredLevelsPresent = true;

        for (let level = 1; level <= requestedTeamsPerPool; level++) {
            const teamsAtLevel = teamsByExactLevel.get(level);
            if (!teamsAtLevel || teamsAtLevel.length === 0) {
                requiredLevelsPresent = false;
                // showToast(`Impossible de former des poules de ${requestedTeamsPerPool} équipes: il manque des équipes de niveau ${level}.`, "error");
                return null;
            }
            maxPoolsThatCanBeForminées = Math.min(maxPoolsThatCanBeFormed, teamsAtLevel.length);
        }

        if (!requiredLevelsPresent) return null;

        const generatedPools = [];
        for (let i = 0; i < maxPoolsThatCanBeFormed; i++) {
            const poolName = String.fromCharCode(65 + i);
            const pool = {
                id: 'pool_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9),
                name: "Poule " + poolName,
                teams: [],
                matches: []
            };

            for (let level = 1; level <= requestedTeamsPerPool; level++) {
                pool.teams.push(teamsByExactLevel.get(level).pop());
            }

            for (let t1_idx = 0; t1_idx < pool.teams.length; t1_idx++) {
                for (let t2_idx = t1_idx + 1; t2_idx < pool.teams.length; t2_idx++) {
                    pool.matches.push({
                        team1Id: pool.teams[t1_idx].id,
                        team1Name: pool.teams[t1_idx].name,
                        team2Id: pool.teams[t2_idx].id,
                        team2Name: pool.teams[t2_idx].name,
                        score1: null,
                        score2: null,
                        winnerId: null
                    });
                }
            }
            generatedPools.push(pool);
        }

        let allRemainingTeams = [];
        teamsByExactLevel.forEach(teamsAtLevel => {
            allRemainingTeams.push(...teamsAtLevel);
        });
        allRemainingTeams = shuffleArray(allRemainingTeams);

        let currentPoolIdxForRemaining = 0;
        while (allRemainingTeams.length > 0 && generatedPools.length > 0) {
            if (generatedPools.length === 0) break;

            const pool = generatedPools[currentPoolIdxForRemaining];
            const teamToAdd = allRemainingTeams.pop();

            if (!pool.teams.some(t => t.id === teamToAdd.id)) { // Prevent adding same team multiple times
                pool.teams.push(teamToAdd);
                // Add new matches with the newly added team against existing teams in the pool
                pool.teams.filter(t => t.id !== teamToAdd.id).forEach(existingTeam => {
                    pool.matches.push({
                        team1Id: teamToAdd.id,
                        team1Name: teamToAdd.name,
                        team2Id: existingTeam.id,
                        team2Name: existingTeam.name,
                        score1: null, score2: null, winnerId: null
                    });
                });
            }
            currentPoolIdxForRemaining = (currentPoolIdxForRemaining + 1) % generatedPools.length;
        }
        return { pools: generatedPools, remainingTeamsCount: allRemainingTeams.length };
    }

    /**
     * Génère des poules basées sur le classement global, en essayant de minimiser les rencontres répétées.
     * @param {Array<Object>} teamsForThisGroup Les équipes du groupe actuel, avec leurs totaux de points/diff.
     * @param {number} requestedTeamsPerPool Le nombre d'équipes souhaité par poule.
     * @param {HTMLElement} msgElement L'élément pour afficher les messages.
     * @returns {Object|null} Les poules générées et le nombre d'équipes restantes, ou null en cas d'échec.
     */
    function _generatePoolsLogicRankingBased(teamsForThisGroup, requestedTeamsPerPool, msgElement) {
        if (teamsForThisGroup.length === 0) {
            // showToast("Aucune équipe disponible pour former les poules dans ce groupe.", "error");
            return null;
        }

        const numInternalTiers = requestedTeamsPerPool; // Représente combien de niveaux nous divisons les équipes en
        const totalTeamsInGroup = teamsForThisGroup.length;

        if (numInternalTiers < 1) {
            // showToast("Le nombre d'équipes par poule doit être au moins 1.", "error");
            return null;
        }

        // Trier les équipes au sein du groupe par leur classement (points, puis différence de score)
        const sortedTeamsWithinGroup = [...teamsForThisGroup].sort((a, b) => b.totalPoints - a.totalPoints || b.totalDiffScore - a.totalDiffScore);

        const teamsGroupedByInternalTier = new Map();
        for(let i = 0; i < numInternalTiers; i++) {
            teamsGroupedByInternalTier.set(i, []);
        }

        // Distribuer les équipes de manière égale dans `numInternalTiers` en fonction de leur ordre trié
        for (let i = 0; i < totalTeamsInGroup; i++) {
            const tierIndex = i % numInternalTiers; // Distribution en serpentin dans les niveaux
            teamsGroupedByInternalTier.get(tierIndex).push(sortedTeamsWithinGroup[i]);
        }

        // Déterminer le nombre de poules en fonction de la plus petite taille de niveau
        let minTierSize = Infinity;
        const tierKeys = Array.from(teamsGroupedByInternalTier.keys()).sort((a,b)=>a-b);

        for (const tier of tierKeys) {
            const teamsInThisTier = teamsGroupedByInternalTier.get(tier);
            minTierSize = Math.min(minTierSize, teamsInThisTier.length);
        }

        if (minTierSize === 0 || minTierSize === Infinity || minTierSize < 1) {
            // showToast(`Pas assez d'équipes pour former des poules équilibrées de ${requestedTeamsPerPool} équipes à partir de ce groupe. Réduisez le nombre d'équipes par poule ou ajoutez des équipes.`, "error");
            return null;
        }

        const numberOfPools = minTierSize;
        const generatedPools = [];

        // Générer des décalages aléatoires pour chaque niveau afin de diversifier les compositions de poules
        // C'est le changement principal pour minimiser les répétitions : chaque niveau commencera sa sélection d'équipe
        // à partir d'un point différent, en tournant à travers ses membres pour chaque poule.
        const tierOffsets = shuffleArray(Array.from({length: numInternalTiers}, (_, k) => k));

        for (let i = 0; i < numberOfPools; i++) {
            const poolName = String.fromCharCode(65 + i);
            const pool = {
                id: 'pool_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9),
                name: "Poule " + poolName,
                teams: [],
                matches: []
            };

            for (const tier of tierKeys) {
                const teamsInThisTier = teamsGroupedByInternalTier.get(tier);
                // Appliquer le décalage pour choisir l'équipe du niveau, en s'assurant de revenir au début si l'index dépasse la longueur
                const actualIndex = (i + tierOffsets[tier]) % teamsInThisTier.length;

                if (teamsInThisTier && teamsInThisTier[actualIndex]) {
                    // Nous devons passer l'objet équipe complet ici, pas seulement l'ID/le nom.
                    // Les `teamsForThisGroup` contiennent déjà les objets équipe originaux et leurs scores calculés.
                    const originalTeam = allTeams.find(t => t.id === teamsInThisTier[actualIndex].id);
                    if (originalTeam) {
                        pool.teams.push({
                            ...originalTeam, // Propriétés de l'équipe originale (id, nom, niveau)
                            totalPoints: teamsInThisTier[actualIndex].totalPoints, // Points calculés
                            totalDiffScore: teamsInThisTier[actualIndex].totalDiffScore // Différence de score calculée
                        });
                    } else {
                        console.warn(`Original team data not found for ID: ${teamsInThisTier[actualIndex].id}`);
                        pool.teams.push(teamsInThisTier[actualIndex]); // Fallback vers les données partielles
                    }

                } else {
                    console.warn(`ATTENTION: Tentative de prendre une équipe de tiers vide ou hors limite pour la poule ${pool.name}, tier ${tier}, index ${actualIndex}.`);
                }
            }

            shuffleArray(pool.teams); // Mélanger les équipes dans la poule après la sélection

            // Générer les matchs pour cette poule (tous contre tous)
            for (let t1_idx = 0; t1_idx < pool.teams.length; t1_idx++) {
                for (let t2_idx = t1_idx + 1; t2_idx < pool.teams.length; t2_idx++) {
                    pool.matches.push({
                        team1Id: pool.teams[t1_idx].id,
                        team1Name: pool.teams[t1_idx].name,
                        team2Id: pool.teams[t2_idx].id,
                        team2Name: pool.teams[t2_idx].name,
                        score1: null,
                        score2: null,
                        winnerId: null
                    });
                }
            }
            generatedPools.push(pool);
        }

        let remainingTeamsCount = 0;
        // Calculer les équipes restantes (celles qui ne sont utilisées dans aucune poule)
        teamsGroupedByInternalTier.forEach(group => {
            remainingTeamsCount += (group.length - numberOfPools);
        });

        return { pools: generatedPools, remainingTeamsCount: remainingTeamsCount };
    }

    /**
     * Renommage de la fonction `previewSecondaryGroups` en `_performSecondaryGroupsPreview`
     * et ajout d'un wrapper `previewSecondaryGroups` pour la modale d'avertissement.
     */
    function _performSecondaryGroupsPreview() {
        const numberOfSecondaryGroupsInput = document.getElementById('numberOfSecondaryGroups');
        const secondaryGroupsPreviewDisplay = document.getElementById('secondaryGroupsPreviewDisplay');
        const validateSecondaryGroupsBtn = document.getElementById('validateSecondaryGroupsBtn');
        const generateSecondaryBrassagesBtn = document.getElementById('generateSecondaryBrassagesBtn');
        const refreshSecondaryGroupScoresBtn = document.getElementById('refreshSecondaryGroupScoresBtn');

        const numGroups = parseInt(numberOfSecondaryGroupsInput.value);
        if (isNaN(numGroups) || (numGroups !== 2 && numGroups !== 3)) {
            showToast("Veuillez choisir 2 ou 3 groupes de niveau pour la création.", "error");
            secondaryGroupsPreviewDisplay.innerHTML = '';
            validateSecondaryGroupsBtn.classList.add('hidden');
            generateSecondaryBrassagesBtn.classList.add('hidden');
            refreshSecondaryGroupScoresBtn.classList.add('hidden'); // Hide refresh button
            currentSecondaryGroupsPreview = {}; // Clear preview if invalid selection
            saveAllData(); // Sauve l'état vide
            return;
        }

        const globalRankings = getGlobalRankings(allTeams, allBrassagePhases);
        if (globalRankings.length === 0) {
            showToast("Aucune équipe classée disponible pour créer les groupes. Générez et terminez des phases de brassage initiales d'abord.", "error");
            secondaryGroupsPreviewDisplay.innerHTML = '';
            validateSecondaryGroupsBtn.classList.add('hidden');
            generateSecondaryBrassagesBtn.classList.add('hidden');
            refreshSecondaryGroupScoresBtn.classList.add('hidden'); // Hide refresh button
            currentSecondaryGroupsPreview = {}; // Clear preview if no rankings
            saveAllData(); // Sauve l'état vide
            return;
        }

        currentSecondaryGroupsPreview = {}; // Reset for new preview
        const groupNamesMap = { 2: ["Principale", "Consolante"], 3: ["Principale", "Consolante", "Super Consolante"] };
        const selectedGroupNames = groupNamesMap[numGroups];

        const teamsToDistribute = [...globalRankings];
        const totalTeams = teamsToDistribute.length;
        const baseGroupSize = Math.floor(totalTeams / numGroups);
        let remainder = totalTeams % numGroups;
        let currentTeamIndex = 0;

        for (let i = 0; i < numGroups; i++) {
            const groupName = selectedGroupNames[i];
            currentSecondaryGroupsPreview[groupName] = [];
            const currentSize = baseGroupSize + (remainder > 0 ? 1 : 0);
            if (remainder > 0) remainder--;

            for (let j = 0; j < currentSize; j++) {
                if (teamsToDistribute[currentTeamIndex]) {
                    const teamForPreview = {
                        ...teamsToDistribute[currentTeamIndex].teamObject,
                        totalPoints: teamsToDistribute[currentTeamIndex].totalPoints,
                        totalDiffScore: teamsToDistribute[currentTeamIndex].totalDiffScore,
                        previewGroup: groupName
                    };
                    currentSecondaryGroupsPreview[groupName].push(teamForPreview);
                }
                currentTeamIndex++;
            }
        }

        renderSecondaryGroupsPreview(selectedGroupNames);
        saveAllData(); // Sauve la nouvelle prévisualisation générée
        showToast(`Création des ${numGroups} groupes de niveau terminée. Ajustez si nécessaire.`, "success");
    }

    /**
     * NOUVELLE FONCTION: Affiche une modale avec les options pour une équipe spécifique.
     * Permet de déplacer l'équipe ou de changer son statut d'élimination.
     * @param {string} teamId L'ID de l'équipe.
     * @param {string} teamName Le nom de l'équipe.
     * @param {number} totalPoints Les points totaux de l'équipe.
     * @param {number} totalDiffScore La différence de score totale de l'équipe.
     * @param {string} currentGroup Le groupe actuel de l'équipe.
     * @param {Array<string>} allGroupNames Tous les noms de groupes possibles.
     */
    function showTeamOptionsModal(teamId, teamName, totalPoints, totalDiffScore, currentGroup, allGroupNames) {
        const isCurrentlyEliminated = eliminatedTeams.has(teamId);
        const teamStatusText = isCurrentlyEliminated ? 'Actuellement **Éliminée**' : 'Actuellement **En Jeu**';
        const toggleEliminationAction = isCurrentlyEliminated ? 'Remettre en jeu' : 'Éliminer';
        const toggleEliminationColor = isCurrentlyEliminated ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700';

        const modalContentDiv = document.createElement('div');
        modalContentDiv.className = 'space-y-4 text-gray-700';
        modalContentDiv.innerHTML = `
            <p class="text-md">Options pour <span class="font-bold">${escapeHtml(teamName)}</span> (Pts: ${totalPoints}, Diff: ${totalDiffScore})</p>
            <p class="text-sm font-semibold">${teamStatusText}</p>
            <div class="flex flex-col space-y-2 mt-4">
                <button id="moveTeamOptionBtn" class="bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition ease-in-out duration-150">
                    Déplacer l'équipe dans un autre groupe
                </button>
                <button id="toggleEliminationOptionBtn" class="${toggleEliminationColor} text-white py-2 px-4 rounded-md transition ease-in-out duration-150">
                    ${toggleEliminationAction} cette équipe
                </button>
            </div>
        `;

        // On ne passe pas de confirmCallback directe à showModal ici,
        // car les boutons de la modale interne auront leurs propres callbacks.
        // On utilise une modale "neutre" pour le conteneur.
        showModal(`Gérer l'équipe : ${escapeHtml(teamName)}`, modalContentDiv, () => { /* Aucune action par défaut */ }, false, false); // No delete style, no cancel button

        document.getElementById('moveTeamOptionBtn').addEventListener('click', () => {
            if (isGuestMode) {
                showToast("Veuillez vous connecter pour déplacer les équipes entre les groupes.", "error");
                hideModal(); // Cacher la modale d'options
                showLoginRequiredModal(); // Proposer la connexion
                return;
            }
            hideModal(); // Cacher la modale d'options
            showMoveTeamModal(teamId, teamName, currentGroup, totalPoints, totalDiffScore, allGroupNames);
        });

        document.getElementById('toggleEliminationOptionBtn').addEventListener('click', () => {
            if (isGuestMode) {
                showToast("Veuillez vous connecter pour gérer le statut d'élimination des équipes.", "error");
                hideModal(); // Hide modal
                showLoginRequiredModal(); // Prompt for login
                return;
            }

            if (eliminatedTeams.has(teamId)) {
                eliminatedTeams.delete(teamId);
                showToast(`${escapeHtml(teamName)} remise en jeu.`, "info");
            } else {
                eliminatedTeams.add(teamId);
                showToast(`${escapeHtml(teamName)} éliminée.`, "info");
            }
            saveAllData();
            // Re-render la prévisualisation des groupes secondaires pour que les changements soient visibles
            const numberOfSecondaryGroupsInput = document.getElementById('numberOfSecondaryGroups');
            const groupNamesMap = { 2: ["Principale", "Consolante"], 3: ["Principale", "Consolante", "Super Consolante"] };
            renderSecondaryGroupsPreview(groupNamesMap[parseInt(numberOfSecondaryGroupsInput.value)]);
            hideModal(); // Cacher la modale après l'action
        });

        // Ajuster les boutons de la modale principale pour qu'ils ne fassent rien
        // lorsque cette modale d'options est ouverte.
        // La "confirmCallback" passée à showModal était déjà vide, donc pas de conflit ici.
        // Le bouton de confirmation de showModal restera visible mais inactif si aucune action n'y est assignée.
        // On s'assure qu'il n'exécute rien de la modale parente.
        modalConfirmBtn.onclick = () => hideModal(); // Just hide the modal if the main confirm is clicked
        modalCancelBtn.onclick = () => hideModal(); // Just hide the modal if the main cancel is clicked
    }

    /**
     * Affiche une modale pour déplacer une équipe entre les groupes secondaires.
     * @param {string} teamId L'ID de l'équipe à déplacer.
     * @param {string} teamName Le nom de l'équipe.
     * @param {string} currentGroup Le groupe actuel de l'équipe.
     * @param {number} totalPoints Les points totaux de l'équipe.
     * @param {number} totalDiffScore La différence de score totale de l'équipe.
     * @param {Array<string>} allGroupNames Tous les noms de groupes possibles.
     */
    function showMoveTeamModal(teamId, teamName, currentGroup, totalPoints, totalDiffScore, allGroupNames) {
        // La vérification isGuestMode est déplacée dans showTeamOptionsModal avant d'appeler ici
        // Cela permet à showTeamOptionsModal de proposer la connexion
        const formDiv = document.createElement('div');
        formDiv.className = 'space-y-4';
        formDiv.innerHTML = `
            <p class="text-gray-700">Déplacer l'équipe <span class="font-bold">${escapeHtml(teamName)}</span> (Pts: ${totalPoints}, Diff: ${totalDiffScore}) :</p>
            <div>
                <label for="moveTeamGroupSelect" class="block text-sm font-medium text-gray-700 mb-1">Nouveau groupe :</label>
                <select id="moveTeamGroupSelect"
                        class="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 shadow-sm">
                </select>
            </div>
            <p id="moveModalMessage" class="text-sm text-center"></p>
        `;
        const groupSelect = formDiv.querySelector('#moveTeamGroupSelect');

        allGroupNames.forEach(groupName => {
            const option = document.createElement('option');
            option.value = groupName;
            option.textContent = groupName;
            if (groupName === currentGroup) {
                option.selected = true;
            }
            groupSelect.appendChild(option);
        });

        showModal('Déplacer l\'équipe', formDiv, async () => {
            const newGroup = groupSelect.value;
            // moveModalMessage is not used, can remove or keep for potential future use

            if (newGroup === currentGroup) {
                return; // hideModal is handled by showModal's callback
            }

            moveTeamBetweenSecondaryGroups(teamId, currentGroup, newGroup);
        });
    }

    /**
     * Déplace une équipe entre deux groupes secondaires.
     * @param {string} teamId L'ID de l'équipe à déplacer.
     * @param {string} fromGroup Le nom du groupe d'origine.
     * @param {string} toGroup Le nom du groupe de destination.
     */
    function moveTeamBetweenSecondaryGroups(teamId, fromGroup, toGroup) {
        // La vérification isGuestMode est déplacée dans showTeamOptionsModal avant d'appeler ici
        if (fromGroup === toGroup) return;

        let teamToMove = null;
        currentSecondaryGroupsPreview[fromGroup] = currentSecondaryGroupsPreview[fromGroup].filter(team => {
            if (team.id === teamId) {
                teamToMove = team;
                return false;
            }
            return true;
        });

        if (teamToMove) {
            teamToMove.previewGroup = toGroup;
            if (!currentSecondaryGroupsPreview[toGroup]) {
                currentSecondaryGroupsPreview[toGroup] = [];
            }
            currentSecondaryGroupsPreview[toGroup].push(teamToMove);

            // Re-sort the destination group to maintain rank order for display/future logic
            currentSecondaryGroupsPreview[toGroup].sort((a, b) => b.totalPoints - a.totalPoints || b.totalDiffScore - a.totalDiffScore);

            const numberOfSecondaryGroupsInput = document.getElementById('numberOfSecondaryGroups');
            const groupNamesMap = { 2: ["Principale", "Consolante"], 3: ["Principale", "Consolante", "Super Consolante"] };
            renderSecondaryGroupsPreview(groupNamesMap[parseInt(numberOfSecondaryGroupsInput.value)]);
            saveAllData(); // Sauve l'état après un déplacement manuel
            showToast(`Équipe ${escapeHtml(teamToMove.name)} déplacée vers ${escapeHtml(toGroup)}.`, "success");

        } else {
            console.error("ERROR: Team not found for movement:", teamId);
        }
    }

    /**
     * Valide la composition actuelle des groupes secondaires pour les phases éliminatoires.
     * Crée une phase spéciale de type `elimination_seeding`.
     */
    function validateSecondaryGroupsForElimination() {
        if (isGuestMode) {
            showToast("Veuillez vous connecter pour valider la répartition des groupes.", "error");
            showLoginRequiredModal();
            return;
        }

        const messageContent = document.createElement('p');
        messageContent.textContent = "Confirmer la composition actuelle des groupes pour les phases éliminatoires ? Cette action enregistre ce regroupement.";
        messageContent.className = 'text-gray-700';

        showModal('Valider les Groupes', messageContent, () => {
            if (Object.keys(currentSecondaryGroupsPreview).length === 0) {
                showToast("Aucun groupe à valider. Créez les groupes d'abord.", "error");
                return; // hideModal is handled by showModal's callback
            }

            // Remove only existing elimination seeding phases to avoid duplicates if re-validating
            allBrassagePhases = allBrassagePhases.filter(p => p.type !== PHASE_TYPE_ELIMINATION_SEEDING);

            const eliminationSeedingPhase = {
                id: `${PHASE_TYPE_ELIMINATION_SEEDING}_${Date.now()}`,
                type: PHASE_TYPE_ELIMINATION_SEEDING, // Ensure type is correct
                name: `Répartition Éliminatoire Validée (${new Date().toLocaleDateString('fr-FR')})`,
                timestamp: Date.now(),
                groupedTeams: JSON.parse(JSON.stringify(currentSecondaryGroupsPreview)), // Deep copy
                generated: true // Mark as generated/validated
            };
            allBrassagePhases.push(eliminationSeedingPhase);
            saveAllData(); // Sauve les données, cela déclenchera le re-rendu de l'UI
            showToast("Répartition des groupes validée et enregistrée pour les éliminatoires !", "success");
        });
    }

    /**
     * NOUVELLE FONCTION : Validation directe pour l'élimination.
     * Crée une phase de type `elimination_seeding` avec toutes les équipes éligibles dans un seul groupe.
     */
    async function validateForDirectElimination() {
        if (isGuestMode) {
            showToast("Veuillez vous connecter pour valider la répartition des groupes.", "error");
            showLoginRequiredModal();
            return;
        }

        const messageContent = document.createElement('p');
        messageContent.innerHTML = `
            Êtes-vous sûr de vouloir valider toutes les équipes (non éliminées)
            pour la phase éliminatoire en vous basant sur le classement général ?
            <br>
            **Attention :** Cette action écrasera toute configuration de groupes secondaires préalablement validée
            et passera les équipes sélectionnées à l'étape éliminatoire principale.
        `;
        messageContent.className = 'text-gray-700';

        showModal('Confirmer la validation directe pour l\'élimination', messageContent, async () => {
            if (allTeams.length === 0) {
                showToast("Aucune équipe enregistrée. Veuillez ajouter des équipes d'abord.", "error");
                return;
            }

            const globalRankings = getGlobalRankings(allTeams, allBrassagePhases);
            if (globalRankings.length === 0) {
                showToast("Aucune équipe classée disponible. Veuillez générer et terminer des phases de brassage d'abord.", "error");
                return;
            }

            // Filter out eliminated teams from the rankings
            const eligibleTeams = globalRankings.filter(rankEntry => !eliminatedTeams.has(rankEntry.teamObject.id));

            if (eligibleTeams.length === 0) {
                showToast("Aucune équipe éligible (non éliminée) trouvée pour la phase éliminatoire.", "info");
                return;
            }

            // Create a single group for all eligible teams
            const directEliminationGroup = {
                "Principale": eligibleTeams.map(r => ({
                    ...r.teamObject, // Original team properties (id, nom, level)
                    totalPoints: r.totalPoints, // Calculated points
                    totalDiffScore: r.totalDiffScore, // Calculated diff score
                    previewGroup: "Principale" // Indicate they belong to the main group
                }))
            };

            // Clear any existing secondary groups preview data
            currentSecondaryGroupsPreview = {};
            await saveAllData(); // Save cleared preview

            // Remove only existing elimination seeding phases to avoid duplicates if re-validating
            allBrassagePhases = allBrassagePhases.filter(p => p.type !== PHASE_TYPE_ELIMINATION_SEEDING);

            const eliminationSeedingPhase = {
                id: `${PHASE_TYPE_ELIMINATION_SEEDING}_${Date.now()}_direct`,
                type: PHASE_TYPE_ELIMINATION_SEEDING,
                name: `Validation Élimination Directe (${new Date().toLocaleDateString('fr-FR')})`,
                timestamp: Date.now(),
                groupedTeams: directEliminationGroup, // Use the single main group
                generated: true
            };

            allBrassagePhases.push(eliminationSeedingPhase);
            await saveAllData(); // Sauve les données, cela déclenchera le re-rendu de l'UI
            showToast("Toutes les équipes éligibles validées pour l'élimination directe !", "success");
            window.location.hash = '#eliminatoires'; // Redirect to elimination page
        }, true); // Use red style for confirmation as it overwrites
    }


    /**
     * Génère les phases de brassage secondaires basées sur les groupes prévisualisés.
     */
    async function generateSecondaryBrassagePhases() {
        if (isGuestMode) {
            showToast("Veuillez vous connecter pour générer des phases de brassage secondaires.", "error");
            showLoginRequiredModal();
            return;
        }

        console.log("DEBUG: Lancement de generateSecondaryBrassagePhases...");

        const numPoolsInput = document.getElementById('teamsPerPool');
        const numberOfSecondaryGroupsInput = document.getElementById('numberOfSecondaryGroups');
        const secondaryPreviewMessage = document.getElementById('secondaryPreviewMessage');

        const teamsPerPoolForNewPhases = parseInt(numPoolsInput.value);

        if (isNaN(teamsPerPoolForNewPhases) || teamsPerPoolForNewPhases < 1) {
            showToast("Veuillez entrer un nombre valide d'équipes par poule (au moins 1) pour les phases secondaires.", "error");
            return;
        }

        if (Object.keys(currentSecondaryGroupsPreview).length === 0) {
            showToast("Veuillez d'abord créer les groupes de brassage secondaires.", "error");
            return;
        }

        const newPhases = [];
        const groupNamesMap = { 2: ["Principale", "Consolante"], 3: ["Principale", "Consolante", "Super Consolante"] };
        const numGroups = parseInt(numberOfSecondaryGroupsInput.value);
        const selectedGroupNames = groupNamesMap[numGroups];

        let generationFailed = false;

        for (const groupName of selectedGroupNames) {
            const teamsInThisGroup = currentSecondaryGroupsPreview[groupName];
            console.log(`DEBUG: Traitement du groupe: ${groupName} avec ${teamsInThisGroup ? teamsInThisGroup.length : 0} équipes.`);

            if (!teamsInThisGroup || teamsInThisGroup.length < teamsPerPoolForNewPhases) {
                showToast(`Le groupe "${escapeHtml(groupName)}" n'a pas assez d'équipes pour former des poules de ${teamsPerPoolForNewPhases} équipes. (${teamsInGroup.length} équipes disponibles)`, "error");
                generationFailed = true;
                break;
            }
            // Use the retry logic for secondary brassage generation too
            const MAX_ATTEMPTS = 20;
            let bestResult = null;
            let minReps = Infinity;
            let bestRemCount = Infinity;

            for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
                const result = generateAndEvaluatePools(PHASE_TYPE_SECONDARY_BRASSAGE, teamsInThisGroup, teamsPerPoolForNewPhases, secondaryPreviewMessage);
                if (result.pools) {
                    if (result.repetitions < minReps) {
                        minReps = result.repetitions;
                        bestResult = result;
                    } else if (result.repetitions === minReps && result.remainingTeamsCount < bestRemCount) {
                        minReps = result.repetitions; // Redundant but for clarity
                        bestResult = result;
                    }
                    if (minReps === 0 && bestRemCount === 0) break;
                }
            }

            if (bestResult && bestResult.pools.length > 0) {
                const newPhase = {
                    id: `${PHASE_TYPE_SECONDARY_BRASSAGE}_${Date.now()}_${groupName.replace(/\s/g, '_')}`,
                    type: PHASE_TYPE_SECONDARY_BRASSAGE,
                    name: `Brassage ${groupName}`, // Nom sans la date
                    pools: bestResult.pools,
                    generated: true,
                    timestamp: Date.now() + newPhases.length // Ensure unique timestamp for ordering
                };
                newPhases.push(newPhase);
            } else {
                showToast(`Impossible de générer des poules pour le groupe ${escapeHtml(groupName)}. Vérifiez si vous avez suffisamment d'équipes dans ce groupe pour les poules de ${teamsPerPoolForNewPhases} équipes.`, "error");
                generationFailed = true;
                break;
            }
        }

        if (!generationFailed && newPhases.length > 0 && newPhases.length === numGroups) {
            allBrassagePhases.push(...newPhases);
            await saveAllData(); // Sauve les données, cela déclenchera le re-rendu de l'UI
            // Le rendu est géré par onSnapshot (pour les utilisateurs connectés) ou par handleLocationHash (pour le mode invité)
            // renderPhaseHistory();
            // renderPoolsWithCurrentSettings(newPhases[0].pools, newPhases[0].name, newPhases[0].id);
            showToast(`${newPhases.length} phases de brassage secondaires générées avec succès !`, "success");
        } else if (generationFailed) {
            console.error("ERREUR: La génération des phases supplémentaires a échoué pour au moins un groupe.");
        } else {
            showToast("Aucune phase de brassage secondaire n'a pu être générée. Vérifiez vos paramètres et le classement actuel.", "error");
            console.error("ERREUR: Aucune phase secondaire n'a été générée malgré aucune erreur explicite.");
        }
    }

    /**
     * Supprime toutes les phases de brassage (initiales et secondaires).
     */
    async function clearAllPhases() {
        if (isGuestMode) {
            showToast("Veuillez vous connecter pour effacer toutes les phases.", "error");
            showLoginRequiredModal();
            return;
        }

        const messageContent = document.createElement('p');
        messageContent.textContent = "Êtes-vous sûr de vouloir supprimer TOUTES les phases de brassage (initiales et secondaires) ? Cette action est irréversible.";
        messageContent.className = 'text-gray-700';

        showModal('Confirmer la suppression de toutes les phases', messageContent, async () => {
            allBrassagePhases = allBrassagePhases.filter(p => p.type === PHASE_TYPE_ELIMINATION_SEEDING); // Keep only seeding phases
            currentSecondaryGroupsPreview = {}; // Clear secondary groups preview
            await saveAllData(); // Sauve les données, cela déclenchera le re-rendu de l'UI

            // Le rendu est géré par onSnapshot (pour les utilisateurs connectés) ou par handleLocationHash (pour le mode invité)
            // renderPhaseHistory();
            // poolsDisplay.innerHTML = '<p class="text-gray-500 text-center md:col-span-2">Les poules de la phase sélectionnée s\'afficheront ici.</p>';
            // currentPhaseTitle.textContent = 'Poules de la Phase Actuelle';
            // currentDisplayedPhaseId = null;
            // secondaryGroupsPreviewDisplay.innerHTML = '<p class="text-gray-500 text-center w-full md:col-span-2 lg:col-span-3">Créez les groupes ici après avoir cliqué sur "Créer les groupes".</p>';
            // validateSecondaryGroupsBtn.classList.add('hidden');
            // generateSecondaryBrassagesBtn.classList.add('hidden');
            // refreshSecondaryGroupScoresBtn.classList.add('hidden');
            showToast("Toutes les phases de brassage ont été supprimées.", "success");
        }, true); // Use red style for confirmation button
    }
    // --- Logique du Classement (partagée) ---

    /**
     * Calcule le classement global des équipes basé sur les phases de brassage,
     * y compris les scores détaillés par phase.
     */
    function getGlobalRankings(teams, brassagePhases) {
        const rankings = new Map(); // Map: teamId -> { teamObject, totalPoints, totalDiffScore, detailsByPhase }

        teams.forEach(team => {
            rankings.set(team.id, {
                teamObject: team,
                totalPoints: 0,
                totalDiffScore: 0,
                detailsByPhase: {} // Pour stocker les points/diff pour chaque phase individuellement
            });
        });

        brassagePhases.forEach(phase => {
            // Seulement compter les scores des phases de brassage initiales et secondaires
            if ((phase.type === PHASE_TYPE_INITIAL || phase.type === PHASE_TYPE_SECONDARY_BRASSAGE) && phase.generated && phase.pools) {
                // Initialiser les détails de phase pour toutes les équipes pour cette phase
                teams.forEach(team => {
                    const teamStats = rankings.get(team.id);
                    if (teamStats) { // S'assurer que teamStats existe
                        if (!teamStats.detailsByPhase[phase.id]) {
                            teamStats.detailsByPhase[phase.id] = { points: 0, diffScore: 0 };
                        }
                    }
                });

                phase.pools.forEach(pool => {
                    if (pool.matches) {
                        pool.matches.forEach(match => {
                            if (match.score1 !== null && match.score2 !== null && match.score1 >= 0 && match.score2 >= 0) {
                                const score1 = match.score1;
                                const score2 = match.score2;
                                const diff = Math.abs(score1 - score2);

                                const team1Stats = rankings.get(match.team1Id);
                                const team2Stats = rankings.get(match.team2Id);

                                // Mettre à jour les totaux globaux
                                if (team1Stats) {
                                    team1Stats.totalDiffScore += (score1 - score2);
                                    if (score1 > score2) team1Stats.totalPoints += 8;
                                    else if (score2 > score1) { // L'équipe 1 perd
                                        if (diff >= 1 && diff <= 3) team1Stats.totalPoints += 4;
                                        else if (diff >= 4 && diff <= 6) team1Stats.totalPoints += 3;
                                        else if (diff >= 7 && diff <= 9) team1Stats.totalPoints += 2;
                                        else if (diff >= 10) team1Stats.totalPoints += 1;
                                    }
                                }
                                if (team2Stats) {
                                    team2Stats.totalDiffScore += (score2 - score1);
                                    if (score2 > score1) team2Stats.totalPoints += 8;
                                    else if (score1 > score2) { // L'équipe 2 perd
                                        if (diff >= 1 && diff <= 3) team2Stats.totalPoints += 4;
                                        else if (diff >= 4 && diff <= 6) team2Stats.totalPoints += 3;
                                        else if (diff >= 7 && diff <= 9) team2Stats.totalPoints += 2;
                                        else if (diff >= 10) team2Stats.totalPoints += 1;
                                    }
                                }

                                // Mettre à jour les totaux par phase
                                if (team1Stats && team1Stats.detailsByPhase[phase.id]) {
                                    team1Stats.detailsByPhase[phase.id].diffScore += (score1 - score2);
                                    if (score1 > score2) team1Stats.detailsByPhase[phase.id].points += 8;
                                    else if (score2 > score1) {
                                        if (diff >= 1 && diff <= 3) team1Stats.detailsByPhase[phase.id].points += 4;
                                        else if (diff >= 4 && diff <= 6) team1Stats.detailsByPhase[phase.id].points += 3;
                                        else if (diff >= 7 && diff <= 9) team1Stats.detailsByPhase[phase.id].points += 2;
                                        else if (diff >= 10) team1Stats.detailsByPhase[phase.id].points += 1;
                                    }
                                }
                                if (team2Stats && team2Stats.detailsByPhase[phase.id]) {
                                    team2Stats.detailsByPhase[phase.id].diffScore += (score2 - score1);
                                    if (score2 > score1) team2Stats.detailsByPhase[phase.id].points += 8;
                                    else if (score1 > score2) {
                                        if (diff >= 1 && diff <= 3) team2Stats.detailsByPhase[phase.id].points += 4;
                                        else if (diff >= 4 && diff <= 6) team2Stats.detailsByPhase[phase.id].points += 3;
                                        else if (diff >= 7 && diff <= 9) team2Stats.detailsByPhase[phase.id].points += 2;
                                        else if (diff >= 10) team2Stats.detailsByPhase[phase.id].points += 1;
                                    }
                                }
                            }
                        });
                    }
                });
            }
        });

        let sortedRankings = Array.from(rankings.values()).sort((a, b) => {
            if (b.totalPoints !== a.totalPoints) {
                return b.totalPoints - a.totalPoints; // Tri par points décroissant
            }
            if (b.totalDiffScore !== a.totalDiffScore) {
                return b.totalDiffScore - a.totalDiffScore; // Puis par différence de score décroissante
            }
            // En cas d'égalité, tri par niveau initial (plus bas est meilleur) puis par nom
            if (a.teamObject.level !== b.teamObject.level) return a.teamObject.level - b.teamObject.level;
            return a.teamObject.name.localeCompare(b.teamObject.name);
        });
        return sortedRankings;
    }

    // --- Fonctions de Rendu des Pages (Vues) ---

    /**
     * Affiche la page d'authentification (connexion/inscription).
     * En mode invité, affiche un message indiquant les limitations.
     */
	function renderAuthPage() {
        APP_CONTAINER.innerHTML = `
            <div class="max-w-md mx-auto mt-10 p-8 bg-white rounded-lg shadow-xl">
                
                <div id="login-container">
                    <h2 class="text-2xl font-bold text-center mb-6">Connexion</h2>
                    <div class="space-y-4">
                        <div>
                            <label for="authEmail" class="block text-sm font-medium text-gray-700">Email</label>
                            <input type="email" id="authEmail" class="mt-1 w-full p-2 border rounded-md" placeholder="votre.email@example.com">
                        </div>
                        <div>
                            <label for="authPassword" class="block text-sm font-medium text-gray-700">Mot de passe</label>
                            <input type="password" id="authPassword" class="mt-1 w-full p-2 border rounded-md" placeholder="********">
                        </div>
                        <button id="loginBtn" class="w-full bg-blue-600 text-white p-3 rounded-md hover:bg-blue-700 transition">Se connecter</button>
                        
                        <div class="text-sm text-center pt-2">
                            <p class="mt-4">
                                <a href="#" id="forgotPasswordLink" class="font-medium text-gray-500 hover:text-blue-600 hover:underline">Mot de passe oublié ?</a>
                            </p>
                            <p class="mt-2">
                                Vous n'avez pas encore de compte ? 
                                <a href="#" id="showRegisterLink" class="font-medium text-blue-600 hover:underline">Créer un compte</a>
                            </p>
                        </div>
                        </div>
                </div>

                <div id="register-container" class="hidden">
                    <h2 class="text-2xl font-bold text-center mb-6">Créer un Compte</h2>
                    <div class="space-y-4">
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label for="registerFirstName" class="block text-sm font-medium">Prénom</label>
                                <input type="text" id="registerFirstName" class="mt-1 w-full p-2 border rounded-md">
                            </div>
                            <div>
                                <label for="registerLastName" class="block text-sm font-medium">Nom</label>
                                <input type="text" id="registerLastName" class="mt-1 w-full p-2 border rounded-md">
                            </div>
                        </div>
                        <div>
                            <label for="registerClubName" class="block text-sm font-medium">Nom du club</label>
                            <input type="text" id="registerClubName" class="mt-1 w-full p-2 border rounded-md">
                        </div>
                        <div>
                            <label for="registerPhone" class="block text-sm font-medium">Téléphone</label>
                            <input type="tel" id="registerPhone" class="mt-1 w-full p-2 border rounded-md">
                        </div>
                        <div>
                            <label for="registerEmail" class="block text-sm font-medium">Email</label>
                            <input type="email" id="registerEmail" class="mt-1 w-full p-2 border rounded-md">
                        </div>
                        <div>
                            <label for="registerPassword" class="block text-sm font-medium">Mot de passe</label>
                            <input type="password" id="registerPassword" class="mt-1 w-full p-2 border rounded-md">
                        </div>
                        <div>
                            <label for="registerConfirmPassword" class="block text-sm font-medium">Confirmez le mot de passe</label>
                            <input type="password" id="registerConfirmPassword" class="mt-1 w-full p-2 border rounded-md">
                        </div>
                        <button id="registerBtn" class="w-full bg-green-600 text-white p-3 rounded-md hover:bg-green-700 transition">Créer mon compte</button>
                        <p class="text-sm text-center">
                            Déjà un compte ? 
                            <a href="#" id="showLoginLink" class="font-medium text-blue-600 hover:underline">Se connecter</a>
                        </p>
                    </div>
                </div>
                
                <p id="authMessage" class="mt-4 text-sm text-center text-red-500"></p>
            </div>`;
        setupAuthPageLogic();
    }
	/**
     * Affiche la page de gestion du compte utilisateur.
     */
    async function renderAccountPage() {
        if (!window.userId) {
            window.location.hash = '#auth';
            return;
        }

        APP_CONTAINER.innerHTML = `<div class="text-center p-8"><p>Chargement des informations du compte...</p></div>`;

        try {
            const userDocRef = window.doc(window.db, "users", window.userId);
            const docSnap = await window.getDoc(userDocRef);

            if (docSnap.exists()) {
                const userData = docSnap.data();
                APP_CONTAINER.innerHTML = `
                    <div class="max-w-2xl mx-auto p-8 bg-white rounded-lg shadow-xl">
                        <h2 class="text-3xl font-bold text-center mb-6">Mon Compte</h2>
                        <div class="space-y-4">
                            <div>
                                <label class="block text-sm font-medium text-gray-700">Email (non modifiable)</label>
                                <input type="email" disabled class="mt-1 w-full p-2 border rounded-md bg-gray-100" value="${escapeHtml(userData.email || '')}">
                            </div>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label for="accountFirstName" class="block text-sm font-medium">Prénom</label>
                                    <input type="text" id="accountFirstName" class="mt-1 w-full p-2 border rounded-md" value="${escapeHtml(userData.firstName || '')}">
                                </div>
                                <div>
                                    <label for="accountLastName" class="block text-sm font-medium">Nom</label>
                                    <input type="text" id="accountLastName" class="mt-1 w-full p-2 border rounded-md" value="${escapeHtml(userData.lastName || '')}">
                                </div>
                            </div>
                            <div>
                                <label for="accountClubName" class="block text-sm font-medium">Nom du club</label>
                                <input type="text" id="accountClubName" class="mt-1 w-full p-2 border rounded-md" value="${escapeHtml(userData.clubName || '')}">
                            </div>
                            <div>
                                <label for="accountPhone" class="block text-sm font-medium">Téléphone</label>
                                <input type="tel" id="accountPhone" class="mt-1 w-full p-2 border rounded-md" value="${escapeHtml(userData.phone || '')}">
                            </div>
                            <p id="accountMessage" class="text-sm text-center text-red-500"></p>
                            <div class="flex flex-col sm:flex-row gap-4 pt-4">
                                <button id="updateProfileBtn" class="w-full bg-blue-600 text-white p-3 rounded-md hover:bg-blue-700 transition">Enregistrer les modifications</button>
                                <button id="changePasswordBtn" class="w-full bg-gray-600 text-white p-3 rounded-md hover:bg-gray-700 transition">Changer le mot de passe</button>
                            </div>
                        </div>
                    </div>`;
                setupAccountPageLogic();
            } else {
                APP_CONTAINER.innerHTML = `<p class="text-red-500">Erreur: Impossible de trouver les informations de votre profil.</p>`;
            }
        } catch (error) {
            console.error("Erreur de chargement du profil:", error);
            APP_CONTAINER.innerHTML = `<p class="text-red-500">Une erreur est survenue lors du chargement de votre profil.</p>`;
        }
    }

    /**
     * Attache la logique aux éléments de la page "Mon Compte".
     */
    function setupAccountPageLogic() {
        document.getElementById('updateProfileBtn').addEventListener('click', async () => {
            const newData = {
                firstName: document.getElementById('accountFirstName').value.trim(),
                lastName: document.getElementById('accountLastName').value.trim(),
                clubName: document.getElementById('accountClubName').value.trim(),
                phone: document.getElementById('accountPhone').value.trim()
            };

            if (!newData.firstName || !newData.lastName || !newData.clubName) {
                showToast("Le nom, prénom et nom du club ne peuvent pas être vides.", "error");
                return;
            }

            try {
                const userDocRef = window.doc(window.db, "users", window.userId);
                await window.updateDoc(userDocRef, newData);
                showToast("Profil mis à jour avec succès !", "success");
            } catch (error) {
                showToast("Erreur lors de la mise à jour du profil.", "error");
                console.error("Erreur de mise à jour du profil:", error);
            }
        });

        document.getElementById('changePasswordBtn').addEventListener('click', () => {
            const userEmail = window.auth.currentUser.email;

            // --- DÉBUT DE LA MODIFICATION ---
            // On crée un conteneur pour le nouveau message
            const modalContent = document.createElement('div');
            modalContent.innerHTML = `
                <p class="text-gray-700 mb-4">Un e-mail pour changer votre mot de passe va être envoyé à : <span class="font-bold">${escapeHtml(userEmail)}</span>.</p>
                <p class="text-sm text-gray-500">N'hésitez pas à regarder vos courriers indésirables (spam) si vous ne voyez pas le mail dans votre boite de réception.</p>
            `;
            
            showModal('Changer le mot de passe', modalContent, async () => {
                try {
                    await window.sendPasswordResetEmail(window.auth, userEmail);
                    showToast("Email envoyé ! Veuillez consulter votre boîte de réception.", "success");
                } catch (error) {
                    showToast("Erreur : " + error.message, "error");
                }
            });
            // --- FIN DE LA MODIFICATION ---
        });
    }
	
    /**
     * Logique de la page d'authentification.
     */
function setupAuthPageLogic() {
    // Récupération des éléments DOM
    const loginContainer = document.getElementById('login-container');
    const registerContainer = document.getElementById('register-container');
    const showRegisterLink = document.getElementById('showRegisterLink');
    const showLoginLink = document.getElementById('showLoginLink');
    const forgotPasswordLink = document.getElementById('forgotPasswordLink');
    const authMessage = document.getElementById('authMessage');

    // --- Logique pour basculer entre les formulaires ---
    if (showRegisterLink) {
        showRegisterLink.addEventListener('click', (e) => {
            e.preventDefault();
            if (loginContainer) loginContainer.classList.add('hidden');
            if (registerContainer) registerContainer.classList.remove('hidden');
            if (authMessage) authMessage.textContent = '';
        });
    }

    if (showLoginLink) {
        showLoginLink.addEventListener('click', (e) => {
            e.preventDefault();
            if (registerContainer) registerContainer.classList.add('hidden');
            if (loginContainer) loginContainer.classList.remove('hidden');
            if (authMessage) authMessage.textContent = '';
        });
    }

    // --- Logique du formulaire de Connexion ---
    const loginBtn = document.getElementById('loginBtn');
    if (loginBtn) {
        loginBtn.addEventListener('click', async () => {
            const email = document.getElementById('authEmail').value.trim();
            const password = document.getElementById('authPassword').value.trim();
            if (!email || !password) {
                authMessage.textContent = "Veuillez entrer un email et un mot de passe.";
                return;
            }
            try {
                await window.signInWithEmailAndPassword(window.auth, email, password);
                showToast("Connexion réussie !", "success");
                // La redirection est gérée par onAuthStateChanged qui recharge les données
            } catch (error) {
                authMessage.textContent = "Erreur de connexion : L'email ou le mot de passe est incorrect.";
            }
        });
    }

    // --- Logique du formulaire d'Inscription ---
    const registerBtn = document.getElementById('registerBtn');
    if (registerBtn) {
        registerBtn.addEventListener('click', async () => {
            // Récupération de toutes les valeurs des champs
            const firstName = document.getElementById('registerFirstName').value.trim();
            const lastName = document.getElementById('registerLastName').value.trim();
            const clubName = document.getElementById('registerClubName').value.trim();
            const phone = document.getElementById('registerPhone').value.trim();
            const email = document.getElementById('registerEmail').value.trim();
            const password = document.getElementById('registerPassword').value.trim();
            const confirmPassword = document.getElementById('registerConfirmPassword').value.trim();
            
            // Vérifications de validité
            if (!firstName || !lastName || !clubName || !email || !password || !confirmPassword) {
                authMessage.textContent = "Veuillez remplir tous les champs.";
                return;
            }
            if (password.length < 6) {
                authMessage.textContent = "Le mot de passe doit contenir au moins 6 caractères.";
                return;
            }
            if (password !== confirmPassword) {
                authMessage.textContent = "Les mots de passe ne correspondent pas.";
                return;
            }

            try {
                // Étape 1 : Créer l'utilisateur dans Firebase Authentication
                const userCredential = await window.createUserWithEmailAndPassword(window.auth, email, password);
                const user = userCredential.user;

                // Étape 2 : Créer un document dans Firestore pour stocker les informations du profil
                const userDocRef = window.doc(window.db, "users", user.uid);
                const userData = {
                    firstName,
                    lastName,
                    clubName,
                    phone,
                    email: user.email,
                    createdAt: new Date()
                };
                await window.setDoc(userDocRef, userData);
                
                showToast("Inscription réussie ! Vous êtes maintenant connecté.", "success");
                 // La redirection est gérée par onAuthStateChanged

            } catch (error) {
                if (error.code === 'auth/email-already-in-use') {
                    authMessage.textContent = "Cette adresse e-mail est déjà utilisée.";
                } else {
                    authMessage.textContent = "Erreur d'inscription: " + error.message;
                }
            }
        });
    }
    
	function cleanupFirestoreListeners() {
        if (currentUserPrivateDataUnsubscribe) {
            currentUserPrivateDataUnsubscribe();
            currentUserPrivateDataUnsubscribe = null;
            console.log("Listener de données privées détaché.");
        }
        if (currentTournamentUnsubscribe) {
            currentTournamentUnsubscribe();
            currentTournamentUnsubscribe = null;
            console.log("Listener de tournoi détaché.");
        }
    }
    // Cette ligne est cruciale pour que index.html puisse trouver la fonction
    window.cleanupFirestoreListeners = cleanupFirestoreListeners;
    // --- Logique du mot de passe oublié ---
    if (forgotPasswordLink) {
        forgotPasswordLink.addEventListener('click', (e) => {
            e.preventDefault();
            const emailForReset = document.getElementById('authEmail').value.trim();
            
            if (!emailForReset) {
                showToast("Veuillez d'abord entrer votre adresse e-mail dans le champ 'Email'.", "error");
                return;
            }
            
            const modalContent = document.createElement('div');
            modalContent.innerHTML = `
                <p class="text-gray-700 mb-4">Un e-mail pour réinitialiser votre mot de passe va être envoyé à : <span class="font-bold">${escapeHtml(emailForReset)}</span>.</p>
                <p class="text-sm text-gray-500">N'hésitez pas à regarder vos courriers indésirables (SPAM) si vous ne voyez pas l'e-mail.</p>
            `;

            showModal('Confirmer la réinitialisation', modalContent, async () => {
                try {
                    await window.sendPasswordResetEmail(window.auth, emailForReset);
                    showToast("Email de réinitialisation envoyé ! Veuillez consulter votre boîte de réception.", "success");
                } catch (error) {
                    showToast("Erreur : " + error.message, "error");
                }
            });
        });
    }
}

    /**
     * Affiche la page d'accueil du tournoi.
     */
    function renderHomePage() {
        APP_CONTAINER.innerHTML = `
            <div class="max-w-5xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
                <h1 class="text-4xl font-extrabold text-center text-blue-700 mb-8 leading-tight">
                    Marre des casse-têtes<img src="Images/explosion.png" alt="emoji casse-tête" class="inline-block w-12 h-12 align-middle mx-1">pour organiser vos tournois ?<br>
                    Cette App est là pour simplifier la vie des organisateurs de tournois !<img src="Images/content.png" alt="emoji casse-tête" class="inline-block w-15 h-12 align-middle mx-1">
                </h1>

                <p class="text-xl text-gray-700 text-center mb-12">
                    Gagnez du temps, réduisez les erreurs et offrez une expérience fluide à vos participants.
                    Concentrez-vous sur le jeu, on s'occupe du reste.
                </p>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
                    <div class="bg-blue-50 p-6 rounded-lg shadow-md border border-blue-200">
                        <h2 class="text-2xl font-semibold text-blue-800 mb-3 flex items-center">
                            <i class="fas fa-users mr-3 text-blue-600"></i> Gestion Simplifiée
                        </h2>
                        <p class="text-blue-700">
                            Ajoutez, modifiez ou supprimez vos équipes et définissez leurs niveaux initiaux.
                            Importez facilement vos listes depuis un fichier Excel.
                        </p>
                    </div>
                    <div class="bg-green-50 p-6 rounded-lg shadow-md border border-green-200">
                        <h2 class="text-2xl font-semibold text-green-800 mb-3 flex items-center">
                            <i class="fas fa-sitemap mr-3 text-green-600"></i> Organisation des Phases
                        </h2>
                        <p class="text-green-700">
                            Créez et suivez vos phases de brassage et éliminatoires.
                            L'application vous guide à chaque étape, des poules aux matchs finaux.
                        </p>
                    </div>
                    <div class="bg-purple-50 p-6 rounded-lg shadow-md border border-purple-200">
                        <h2 class="text-2xl font-semibold text-purple-800 mb-3 flex-center">
                            <i class="fas fa-list-ol mr-3 text-purple-600"></i> Classements Automatiques
                        </h2>
                        <p class="text-purple-700">
                            Saisissez les scores et laissez l'application calculer les classements en temps réel.
                            Visualisez les performances des équipes tout au long du tournoi.
                        </p>
                    </div>
                    <div class="bg-yellow-50 p-6 rounded-lg shadow-md border border-yellow-200">
                        <h2 class="text-2xl font-semibold text-yellow-800 mb-3 flex items-center">
                            <i class="fas fa-tools mr-3 text-yellow-600"></i> Flexibilité des Brassages
                        </h2>
                        <p class="text-yellow-700">
                            Choisissez entre un brassage basé sur les niveaux initiaux des équipes,
                            ou sur les résultats cumulés des phases précédentes pour une progression équitable.
                            Possibilité d'ajuster des groupes secondaires pour les éliminatoires.
                        </p>
                    </div>
                </div>

                <div class="bg-gray-100 p-6 rounded-lg shadow-inner border border-gray-300 text-gray-800 max-w-2xl mx-auto">
                    <h3 class="text-xl font-bold mb-4 text-center">Comment ça Marche ? (Les Règles du Jeu)</h3>
                    <ul class="list-disc list-inside space-y-2 mb-4">
                        <li>
                            <strong class="text-blue-700">Système de Points :</strong>
                            <ul class="list-disc list-inside ml-4 mt-1 text-sm">
                                <li>Équipe gagnante : 8 points.</li>
                                <li>Équipe perdante de 1 à 3 points d'écart : 4 points.</li>
                                <li>Équipe perdante de 4 à 6 points d'écart : 3 points.</li>
                                <li>Équipe perdante de 7 à 9 points d'écart : 2 points.</li>
                                <li>Équipe perdante de 10 points ou plus d'écart : 1 point.</li>
                            </ul>
                        </li>
                        <li>
                            <strong class="text-blue-700">Phases de Brassage :</strong> Tous les points et scores de tous les matchs joués dans les phases de brassage précédentes pourraient être <strong class="bg-gray-100">intégralement pris en compte</strong> pour la génération des poules des phases de brassage suivantes et pour le classement général.
                        </li>
                        <li>
                            <strong class="text-blue-700">Classement Éliminatoire :</strong> Le classement utilisé pour la phase éliminatoire est basé sur le <strong class="bg-gray-100">cumul de tous les points et scores</strong> des phases de brassage initiales et secondaires terminées, assurant une progression juste des meilleures équipes.
                        </li>
                    </ul>
                    <p class="text-sm text-center italic text-gray-600 mt-4">
                        Notre objectif est de rendre l'organisation transparente et efficace !
                    </p>
                </div>
                <p class="text-2xl text-center font-extrabold text-blue-700 mt-12">
                    Prêt(e) à révolutionner vos tournois ? Accroche-toi, l'aventure commence maintenant ! <img src="Images/voila.png" alt="emoji casse-tête" class="inline-block w-12 h-12 align-middle mx-1">
                </p>
            </div>
        `;
    }


    function renderEquipesPage() {
        // Calculate team count by level
        let levelCounts = {};
        allTeams.forEach(team => {
            levelCounts[team.level] = (levelCounts[team.level] || 0) + 1;
        });

        // Build HTML for level counts display
        let levelCountsHtml = '';
        if (Object.keys(levelCounts).length > 0) {
            levelCountsHtml += '<div class="mt-2 text-sm text-gray-600 space-y-1">';
            // Sort levels numerically for ordered display
            Object.keys(levelCounts).sort((a, b) => parseInt(a) - parseInt(b)).forEach(level => {
                const count = levelCounts[level];
                levelCountsHtml += `<p>Niveau ${escapeHtml(level)}: <span class="font-bold">${count}</span> équipe${count > 1 ? 's' : ''}</p>`;
            });
            levelCountsHtml += '</div>';
        } else {
            levelCountsHtml = '<p class="mt-2 text-sm text-gray-600">Aucun niveau d\'équipe défini.</p>';
        }

        // Add guest mode warning if applicable
        const guestModeWarning = isGuestMode ? `
            <div class="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-md text-yellow-800 text-sm">
                <p class="font-semibold mb-2">Mode Invité Actif :</p>
                <p>Vous êtes en mode invité. Vous pouvez gérer jusqu'à ${GUEST_MODE_MAX_TEAMS} équipes. Les données sont sauvegardées localement dans votre navigateur.</p>
                <p class="mt-2">Pour des tournois plus importants et une sauvegarde sécurisée, veuillez vous <a href="#auth" class="text-blue-700 hover:underline">connecter ou créer un compte</a>.</p>
            </div>
        ` : '';

        APP_CONTAINER.innerHTML = `
            <h1 class="text-3xl font-bold text-center text-gray-800 mb-8">Gestion des Équipes</h1>

            ${guestModeWarning}

            <section class="mb-8 p-6 bg-gray-50 rounded-lg border border-gray-200">
                <h2 class="text-2xl font-semibold text-gray-700 mb-4">Ajouter une Nouvelle Équipe</h2>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
                    <div>
                        <label for="teamName" class="block text-sm font-medium text-gray-700 mb-1">Nom de l'équipe</label>
                        <input type="text" id="teamName" placeholder="Nom de l'équipe"
                               class="w-96 p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 shadow-sm">
                    </div>
                    <div>
                        <label for="teamLevel" class="block text-sm font-medium text-gray-700 mb-1">Niveau (1-10)</label>
                        <input type="number" id="teamLevel" min="1" max="10" value="5"
                               class="w-96 p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 shadow-sm">
                    </div>
                    <div class="md:col-span-2">
                        <button id="addTeamBtn"
                                class="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 shadow-md transition ease-in-out duration-150">
                            Ajouter l'équipe
                        </button>
                    </div>
                </div>
                <p id="message" class="mt-3 text-sm text-center"></p>
            </section>

            <section class="mb-8 p-6 bg-gray-50 rounded-lg border border-gray-200">
                <h2 class="text-2xl font-semibold text-gray-700 mb-4">Importer des Équipes depuis Excel</h2>
                <div class="flex flex-col sm:flex-row items-center gap-4">
                    <input type="file" id="excelFileInput" accept=".xlsx, .xls" class="block w-full text-sm text-gray-700
                        file:mr-4 file:py-2 file:px-4
                        file:rounded-md file:border-0
                        file:text-sm file:font-semibold
                        file:bg-blue-50 file:text-blue-700
                        hover:file:bg-blue-100" />
                    <button id="importTeamsBtn"
                            class="w-full sm:w-auto bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 shadow-md transition ease-in-out duration-150">
                        Importer les équipes
                    </button>
                </div>
                <p class="text-xs text-gray-600 mt-2">
                    - Le fichier Excel doit contenir deux colonnes : "Nom" (pour le nom de l'équipe) et "Niveau" (pour le niveau de l'équipe, de 1 à 10).
                </p>
				<p class="text-xs text-gray-600 mt-2">
                    - Selon le nombre d'équipes que vous souhaitez mettre dans chaque poule des brassages, ajustez les niveaux des équipes dans le fichier Excel: Pour N équipes par poule, attribuez des niveaux de 1 à N, en veillant à avoir le même nombre d'équipes de chaque niveau.
                </p>
                <p id="importMessage" class="mt-3 text-sm text-center"></p>
            </section>

            <section class="p-6 bg-gray-50 rounded-lg border border-gray-200">
                <h2 class="text-2xl font-semibold text-gray-700 mb-4">
                    Équipes Actuelles (<span id="teamCountDisplay">0</span>)
                </h2>
                ${levelCountsHtml} <div id="teamsList" class="space-y-4">
                    </div>
                <div class="mt-6 text-center">
                    <button id="clearTeamsBtn"
                            class="bg-red-600 text-white py-2 px-4 rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 shadow-md transition ease-in-out duration-150">
                        Effacer toutes les équipes
                    </button>
                </div>
            </section>
        `;
        setupEquipesPageLogic();
    }
	// Part 3 sur 5 (script.js) - Corrigée

    function setupEquipesPageLogic() {
        const teamNameInput = document.getElementById('teamName');
        const teamLevelInput = document.getElementById('teamLevel');
        const addTeamBtn = document.getElementById('addTeamBtn');
        const teamsListDiv = document.getElementById('teamsList');
        const clearTeamsBtn = document.getElementById('clearTeamsBtn');
        const messageElement = document.getElementById('message'); // Not used directly, but kept for consistency
        const excelFileInput = document.getElementById('excelFileInput');
        const importTeamsBtn = document.getElementById('importTeamsBtn');
        const importMessageElement = document.getElementById('importMessage'); // Not used directly, but kept for consistency
        const teamCountDisplay = document.getElementById('teamCountDisplay');


        function renderTeams() {
            teamsListDiv.innerHTML = '';
            teamCountDisplay.textContent = allTeams.length.toString(); // Update team count

            // Recalculate and update the level counts display when teams are rendered
            let levelCounts = {};
            allTeams.forEach(team => {
                levelCounts[team.level] = (levelCounts[team.level] || 0) + 1;
            });

            let levelCountsHtml = '';
            if (Object.keys(levelCounts).length > 0) {
                levelCountsHtml += '<div class="mt-2 text-sm text-gray-600 space-y-1">';
                Object.keys(levelCounts).sort((a, b) => parseInt(a) - parseInt(b)).forEach(level => {
                    const count = levelCounts[level];
                    levelCountsHtml += `<p>Niveau ${escapeHtml(level)}: <span class="font-bold">${count}</span> équipe${count > 1 ? 's' : ''}</p>`;
                });
                levelCountsHtml += '</div>';
            } else {
                levelCountsHtml = '<p class="mt-2 text-sm text-gray-600">Aucun niveau d\'équipe défini.</p>';
            }
            // Find the element for level counts and update it
            const existingLevelCountsDiv = document.querySelector('section.p-6.bg-gray-50.rounded-lg.border.border-gray-200 div.mt-2.text-sm.text-gray-600.space-y-1');
            if (existingLevelCountsDiv) {
                 existingLevelCountsDiv.outerHTML = levelCountsHtml; // Replace the entire div to update content
            } else {
                // Fallback if the structure changes or if initially empty
                const section = document.querySelector('section.p-6.bg-gray-50.rounded-lg.border.border-gray-200');
                const h2 = section.querySelector('h2');
                h2.insertAdjacentHTML('afterend', levelCountsHtml);
            }


            if (allTeams.length === 0) {
                teamsListDiv.innerHTML = '<p class="text-gray-500 text-center">Aucune équipe n\'a été ajoutée pour le moment.</p>';
                return;
            }

            allTeams.forEach(team => {
                const teamDiv = document.createElement('div');
                teamDiv.className = 'flex items-center justify-between p-3 bg-white border border-gray-200 rounded-md shadow-sm';
                teamDiv.innerHTML = `
                    <span class="text-gray-800 font-medium flex-grow">${escapeHtml(team.name)} (Niveau: ${escapeHtml(team.level.toString())})</span>
                    <div class="flex space-x-2 ml-4">
                        <button data-id="${team.id}" class="edit-team-btn bg-yellow-500 text-white px-3 py-1 rounded-md hover:bg-yellow-600 text-sm transition duration-150">Éditer</button>
                        <button data-id="${team.id}" class="delete-team-btn bg-red-500 text-white px-3 py-1 rounded-md hover:bg-red-600 text-sm transition duration-150">Supprimer</button>
                    </div>
                `;
                teamsListDiv.appendChild(teamDiv);
            });

            document.querySelectorAll('.edit-team-btn').forEach(button => {
                button.addEventListener('click', (event) => {
                    if (isGuestMode) {
                        showToast("Veuillez vous connecter pour éditer les équipes.", "error");
                        showLoginRequiredModal();
                        return;
                    }
                    const teamId = event.target.dataset.id;
                    const teamToEdit = allTeams.find(t => t.id === teamId);
                    if (teamToEdit) {
                        const formDiv = document.createElement('div');
                        formDiv.innerHTML = `
                            <div class="mb-4">
                                <label for="editTeamName" class="block text-sm font-medium text-gray-700 mb-1">Nom</label>
                                <input type="text" id="editTeamName" class="w-full p-2 border border-gray-300 rounded-md" value="${escapeHtml(teamToEdit.name)}">
                            </div>
                            <div>
                                <label for="editTeamLevel" class="block text-sm font-medium text-gray-700 mb-1">Niveau (1-10)</label>
                                <input type="number" id="editTeamLevel" class="w-full p-2 border border-gray-300 rounded-md" min="1" max="10" value="${escapeHtml(teamToEdit.level.toString())}">
                            </div>
                        `;
                        showModal('Éditer l\'équipe', formDiv, () => {
                            const newName = document.getElementById('editTeamName').value.trim();
                            const newLevel = parseInt(document.getElementById('editTeamLevel').value);

                            if (!newName) {
                                showToast("Le nom de l'équipe ne peut pas être vide.", "error");
                                return;
                            }
                            // Check for duplicate name during edit, excluding the current team being edited
                            if (teamExists(newName) && newName.toLowerCase() !== teamToEdit.name.toLowerCase()) {
                                showToast(`Une équipe nommée "${escapeHtml(newName)}" existe déjà.`, "error");
                                return;
                            }
                            if (isNaN(newLevel) || newLevel < 1 || newLevel > 10) {
                                showToast("Le niveau doit être un nombre entre 1 et 10.", "error");
                                return;
                            }

                            teamToEdit.name = newName;
                            teamToEdit.level = newLevel;
                            saveAllData(); // Will save to localStorage if in guest mode, Firestore if logged in
                            // Le rendu est géré par setupEquipesPageLogic après l'appel à saveAllData via onSnapshot
                            showToast(`Équipe "${escapeHtml(newName)}" mise à jour.`, "success");
                        });
                    }
                });
            });

            document.querySelectorAll('.delete-team-btn').forEach(button => {
                button.addEventListener('click', (event) => {
                    if (isGuestMode) {
                        showToast("Veuillez vous connecter pour supprimer les équipes.", "error");
                        showLoginRequiredModal();
                        return;
                    }
                    const teamId = event.target.dataset.id;
                    deleteTeam(teamId); // Call the unified deleteTeam function
                });
            });
        }

        addTeamBtn.addEventListener('click', () => {
            const name = teamNameInput.value.trim();
            const level = parseInt(teamLevelInput.value);
            addTeam(name, level); // Call the unified addTeam function
            teamNameInput.value = '';
            teamLevelInput.value = '5';
        });

        clearTeamsBtn.addEventListener('click', () => {
            if (isGuestMode) {
                showToast("Veuillez vous connecter pour effacer toutes les équipes.", "error");
                showLoginRequiredModal();
                return;
            }
            const messageContent = document.createElement('p');
            messageContent.textContent = "Êtes-vous sûr de vouloir supprimer TOUTES les équipes ? Cette action est irréversible.";
            messageContent.className = 'text-gray-700';

            showModal('Confirmer la suppression de toutes les équipes', messageContent, () => {
                allTeams = [];
                eliminatedTeams.clear(); // Effacer toutes les équipes éliminées
                saveAllData(); // Will save to localStorage if in guest mode, Firestore if logged in
                // Le rendu est géré par setupEquipesPageLogic après l'appel à saveAllData via onSnapshot
                showToast("Toutes les équipes ont été supprimées.", "success");
            }, true);
        });

		importTeamsBtn.addEventListener('click', () => {
            const file = excelFileInput.files[0];
            if (!file) {
                showToast("Veuillez sélectionner un fichier Excel.", "error");
                return;
            }

            const reader = new FileReader();
            reader.onload = (e) => {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                const json = XLSX.utils.sheet_to_json(worksheet);

                // --- DÉBUT DE LA MODIFICATION ---
                const limit = isGuestMode ? GUEST_MODE_MAX_TEAMS : (currentTournamentData ? currentTournamentData.numTeamsAllowed : 0);
                const currentTeamCount = allTeams.length;
                if (currentTeamCount + json.length > limit) {
                    showToast(`L'import de ${json.length} équipes dépasserait la limite de ${limit} équipes pour ce tournoi.`, "error");
                    if (isGuestMode) showLoginRequiredModal();
                    return;
                }
                // --- FIN DE LA MODIFICATION ---

                let importedCount = 0;
                let failedCount = 0;
                let newTeams = [];
                let skippedNames = [];

                json.forEach(row => {
                    const name = row['Nom'];
                    const level = parseInt(row['Niveau']);

                    if (name && !isNaN(level) && level >= 1 && level <= 10) {
                        if (teamExists(name)) {
                            skippedNames.push(name);
                            failedCount++;
                        } else {
                            newTeams.push({
                                id: 'team_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9),
                                name: name,
                                level: level
                            });
                            importedCount++;
                        }
                    } else {
                        failedCount++;
                    }
                });

                if (importedCount > 0) {
                    allTeams.push(...newTeams);
                    saveAllData();
                    let successMsg = `${importedCount} équipe(s) importée(s) avec succès.`;
                    if (failedCount > 0) {
                        successMsg += ` ${failedCount} ligne(s) ignorée(s).`;
                    }
                    showToast(successMsg, "success");
                } else {
                    showToast("Aucune nouvelle équipe valide trouvée dans le fichier.", "error");
                }
                excelFileInput.value = '';
            };
            reader.readAsArrayBuffer(file);
        });
        renderTeams();
    }

    function renderBrassagesPage() {
        APP_CONTAINER.innerHTML = `
            <h1 class="text-3xl font-bold text-center text-gray-800 mb-8">Génération des Poules de Brassage</h1>

            <section class="mb-8 p-6 bg-gray-50 rounded-lg border border-gray-200">
                <h2 class="text-2xl font-semibold text-gray-700 mb-4">1. Choisir la Méthode de Génération des Poules</h2>
                <div class="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-4">
                    <div class="flex items-center">
                        <input type="radio" id="basisInitialLevels" name="poolGenerationBasis" value="initialLevels" class="form-radio h-4 w-4 text-blue-600">
                        <label for="basisInitialLevels" class="ml-2 text-gray-700">Base sur les niveaux initiaux des équipes</label>
                    </div>
                    <div class="flex items-center">
                        <input type="radio" id="basisPreviousResults" name="poolGenerationBasis" value="previousResults" class="form-radio h-4 w-4 text-blue-600">
                        <label for="basisPreviousResults" class="ml-2 text-gray-700">Base sur les résultats cumulés des brassages précédents</label>
                    </div>
                </div>
                <p class="text-sm text-gray-600 mt-3" id="basisHelpText">
                    Choisissez how les équipes seront réparties dans les poules.
                </p>
                <p id="basisMessage" class="mt-3 text-sm text-center"></p>
            </section>

            <section class="mb-8 p-6 bg-gray-50 rounded-lg border border-gray-200">
                <h2 class="text-2xl font-semibold text-gray-700 mb-4">2. Créer de Nouvelles Phases de Brassage</h2>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
                    <div>
                        <label for="teamsPerPool" class="block text-sm font-medium text-gray-700 mb-1">Nombre d'équipes par poule</label>
                        <input type="number" id="teamsPerPool" min="1" value="3" max="10"
                               class="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 shadow-sm">
                    </div>
                    <div>
                        <label for="numberOfGlobalPhases" class="block text-sm font-medium text-gray-700 mb-1">Nombre de phases de brassage initial à créer</label>
                        <input type="number" id="numberOfGlobalPhases" min="1" value="1"
                               class="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 shadow-sm">
                    </div>
                    <div class="md:col-span-2">
                        <button id="createGlobalPhasesStructureBtn"
                                class="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 shadow-md transition ease-in-out duration-150">
                            Créer les phases de brassage
                        </button>
                    </div>
                </div>
                <p id="message" class="mt-3 text-sm text-center"></p>
                <div id="nextBrassagePhaseContainer" class="mt-4 hidden text-center">
                    <button id="createNextBrassagePhaseBtn"
                            class="bg-purple-600 text-white py-2 px-4 rounded-md hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 shadow-md transition ease-in-out duration-150">
                        Créer la phase de brassage suivante
                    </button>
                    <p id="nextBrassagePhaseMessage" class="mt-3 text-sm text-center"></p>
                </div>
            </section>

            <section class="mb-8 p-6 bg-gray-50 rounded-lg border border-gray-200">
                <h2 class="text-2xl font-semibold text-gray-700 mb-4">3. Ajuster les Groupes de Brassage Supplémentaires (Optionnel)</h2>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
                    <div>
                        <label for="numberOfSecondaryGroups" class="block text-sm font-medium text-gray-700 mb-1">Nombre de groupes de niveau à former (2 ou 3)</label>
                        <select id="numberOfSecondaryGroups"
                                class="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 shadow-sm">
                            <option value="2">2 Groupes (Principale, Consolante)</option>
                            <option value="3">3 Groupes (Principale, Consolante, Super Consolante)</option>
                        </select>
                    </div>
                    <div>
                        <button id="previewSecondaryGroupsBtn"
                                class="w-full bg-indigo-600 text-white py-2 px-4 rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 shadow-md transition ease-in-out duration-150">
                            Créer les groupes
                        </button>
                    </div>
                </div>
                <p id="secondaryPreviewMessage" class="mt-3 text-sm text-center"></p>

                <div id="secondaryGroupsPreviewDisplay" class="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <p class="text-gray-500 text-center w-full md:col-span-2 lg:col-span-3">Créez les groupes ici après avoir cliqué sur "Créer les groupes".</p>
                </div>
                <div class="flex justify-center mt-6">
                    <button id="refreshSecondaryGroupScoresBtn"
                            class="bg-blue-500 text-white py-2 px-4 rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 shadow-md transition ease-in-out duration-150 hidden">
                        Actualiser les Scores des Groupes Secondaires
                    </button>
                </div>


                <div class="mt-6 text-center">
                    <button id="validateSecondaryGroupsBtn"
                            class="bg-purple-600 text-white py-2 px-4 rounded-md hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 shadow-md transition ease-in-out duration-150 hidden">
                        Valider et Enregistrer la Répartition des Groupes
                    </button>
                    <button id="generateSecondaryBrassagesBtn"
                            class="bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 shadow-md transition ease-in-out duration-150 ml-2 hidden">
                        Générer les Brassages des Groupes Secondaires
                    </button>
                </div>
            </section>

            <section class="mb-8 p-6 bg-gray-50 rounded-lg border border-gray-200">
                <h2 class="text-2xl font-semibold text-gray-700 mb-4">4. Passer Directement à la Phase Éliminatoire (Optionnel)</h2>
                <p class="text-gray-600 mb-4">
                    Si vous n'avez pas besoin de phases de brassage secondaires, vous pouvez valider les équipes
                    pour la phase éliminatoire en vous basant sur leur classement général actuel.
                    <br>
                    **Attention :** Cette action écrasera toute configuration de groupes secondaires préalablement validée.
                </p>
                <div class="text-center">
                    <button id="validateForDirectEliminationBtn"
                            class="bg-purple-600 text-white py-2 px-6 rounded-md hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 shadow-md transition ease-in-out duration-150">
                        Valider toutes les équipes pour l'élimination directe
                    </button>
                </div>
                <p id="directEliminationMessage" class="mt-3 text-sm text-center"></p>
            </section>

            <section class="mb-8 p-6 bg-gray-50 rounded-lg border border-gray-200">
                <h2 class="text-2xl font-semibold text-gray-700 mb-4">Historique des Phases de Brassage</h2>
                <div class="mt-4 flex items-center justify-end">
                    <input type="checkbox" id="toggleRepeatedMatchesDisplay" class="form-checkbox h-4 w-4 text-blue-600 mr-2">
                    <label for="toggleRepeatedMatchesDisplay" class="text-gray-700 text-sm">Afficher les rencontres répétées</label>
                    <span id="repeatedMatchesCount" class="text-sm text-gray-500 ml-2"></span>
                </div>
                <div id="phaseHistoryDisplay" class="flex flex-col space-y-2 items-center">
                    <p class="text-gray-500 text-center w-full">Aucune phase de brassage générée pour le moment.</p>
                </div>
                <div class="mt-4 text-center">
                    <button id="clearAllPhasesBtn"
                            class="bg-red-600 text-white py-2 px-4 rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 shadow-md transition ease-in-out duration-150">
                        Effacer toutes les Phases
                    </button>
                </div>
            </section>

            <section class="p-6 bg-gray-50 rounded-lg border border-gray-200">
                <h2 id="currentPhaseTitle" class="text-2xl font-semibold text-gray-700 mb-4">Poules de la Phase Actuelle</h2>
                <div id="poolsDisplay" class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <p class="text-gray-500 text-center md:col-span-2">Les poules de la phase sélectionnée s\'afficheront ici.</p>
                </div>
            </section>
        `;
        setupBrassagesPageLogic();
    }

    function setupBrassagesPageLogic() {
        const messageElement = document.getElementById('message'); // Not used directly
        const secondaryPreviewMessage = document.getElementById('secondaryPreviewMessage');
        const poolsDisplay = document.getElementById('poolsDisplay');
        const phaseHistoryDisplay = document.getElementById('phaseHistoryDisplay');
        const numPoolsInput = document.getElementById('teamsPerPool');
        const numberOfGlobalPhasesInput = document.getElementById('numberOfGlobalPhases');
        const createGlobalPhasesStructureBtn = document.getElementById('createGlobalPhasesStructureBtn');
        const numberOfSecondaryGroupsInput = document.getElementById('numberOfSecondaryGroups');
        const previewSecondaryGroupsBtn = document.getElementById('previewSecondaryGroupsBtn');
        const secondaryGroupsPreviewDisplay = document.getElementById('secondaryGroupsPreviewDisplay');
        const validateSecondaryGroupsBtn = document.getElementById('validateSecondaryGroupsBtn');
        const generateSecondaryBrassagesBtn = document.getElementById('generateSecondaryBrassagesBtn');
        const clearAllPhasesBtn = document.getElementById('clearAllPhasesBtn');
        const currentPhaseTitle = document.getElementById('currentPhaseTitle');
        const toggleRepeatedMatchesDisplay = document.getElementById('toggleRepeatedMatchesDisplay');
        const refreshSecondaryGroupScoresBtn = document.getElementById('refreshSecondaryGroupScoresBtn'); // NEW

        // Elements for pool generation basis
        const basisInitialLevelsRadio = document.getElementById('basisInitialLevels');
        const basisPreviousResultsRadio = document.getElementById('basisPreviousResults');
        const basisMessageElement = document.getElementById('basisMessage'); // Not used directly
        const basisHelpText = document.getElementById('basisHelpText');

        // New elements for step-by-step phase creation
        const nextBrassagePhaseContainer = document.getElementById('nextBrassagePhaseContainer');
        const createNextBrassagePhaseBtn = document.getElementById('createNextBrassagePhaseBtn');
        const nextBrassagePhaseMessage = document.getElementById('nextBrassagePhaseMessage');

        // NOUVEAU: Éléments pour la validation directe
        const validateForDirectEliminationBtn = document.getElementById('validateForDirectEliminationBtn');
        const directEliminationMessage = document.getElementById('directEliminationMessage'); // Not used directly


        /**
         * Generates options for a score select dropdown (0 to maxScore).
         * @param {number} maxScore The maximum score to include.
         * @param {number|null} selectedValue The current selected value, or null.
         * @returns {string} HTML string for select options.
         */
        function generateScoreOptions(maxScore, selectedValue) {
            let options = '<option value="">-</option>'; // Default empty option
            for (let i = 0; i <= maxScore; i++) {
                options += `<option value="${i}" ${selectedValue === i ? 'selected' : ''}>${i}</option>`;
            }
            return options;
        }

        // Modified renderPools to accept showRepeats parameter
        function renderPools(pools, phaseName = "Poules Actuelles", phaseId = null, showRepeats = false) {
            APP_CONTAINER.querySelector('#poolsDisplay').innerHTML = ''; // Cible le div #poolsDisplay à l'intérieur de APP_CONTAINER
            APP_CONTAINER.querySelector('#currentPhaseTitle').textContent = 'Poules de ' + phaseName;
            currentDisplayedPhaseId = phaseId;

            if (pools.length === 0) {
                APP_CONTAINER.querySelector('#poolsDisplay').innerHTML = '<p class="text-gray-500 text-center md:col-span-2">Aucune poule générée pour cette phase.</p>';
                return;
            }

            pools.forEach(pool => {
                const poolCard = document.createElement('div');
                poolCard.className = 'bg-white p-4 rounded-lg shadow-md border border-gray-200';

                let teamsListHtml = '';
                pool.teams.forEach(team => {
                    // Display level for initial brassage, or points/diff for secondary/ranking-based
                    const teamDetail = team.previewGroup ? `Groupe ${team.previewGroup}` :
                                       (team.totalPoints !== undefined && team.totalDiffScore !== undefined ? `Pts: ${team.totalPoints}, Diff: ${team.totalDiffScore}` : `Niveau ${team.level}`);
                    teamsListHtml += `<li>${escapeHtml(team.name)} (${teamDetail})</li>`;
                });

                let matchesHtml = '';
                if (pool.matches && pool.matches.length > 0) {
                    pool.matches.forEach((match, matchIndex) => {
                        let team1Class = 'text-gray-700';
                        let team2Class = 'text-gray-700';

                        // Apply classes based on winnerId
                        if (match.winnerId === match.team1Id) {
                            team1Class = 'font-bold text-green-700';
                            team2Class = 'text-red-700';
                        } else if (match.winnerId === match.team2Id) {
                            team2Class = 'font-bold text-green-700';
                            team1Class = 'text-red-700';
                        }

                        // NEW: Ajouter l'indicateur de match répété et le rendre cliquable
                        const isRepeat = isMatchRepeated(match.team1Id, match.team2Id, phaseId);
                        const repeatIndicatorHtml = isRepeat ?
                            `<button class="repeated-match-indicator-btn text-red-500 font-bold ml-2 text-sm focus:outline-none ${showRepeats ? '' : 'hidden'}"
                                data-team1-id="${match.team1Id}"
                                data-team2-id="${match.team2Id}"
                                data-team1-name="${escapeHtml(match.team1Name)}"
                                data-team2-name="${escapeHtml(match.team2Name)}">
                                (Répété)
                            </button>` : '';


                        matchesHtml += `
                            <div class="flex flex-col sm:flex-row items-center justify-between p-2 border-b border-gray-200 last:border-b-0 space-y-2 sm:space-y-0 sm:space-x-2">
                                <span data-team-role="team1-name" class="${team1Class} w-full sm:w-auto text-center sm:text-left">${escapeHtml(match.team1Name)}</span>
                                <div class="flex items-center space-x-1">
                                    <select data-pool-id="${pool.id}" data-match-index="${matchIndex}" data-team="1" class="score-select w-20 p-1 border border-gray-300 rounded-md text-center text-sm">
                                        ${generateScoreOptions(40, match.score1)}
                                    </select>
                                    <span class="text-gray-600">-</span>
                                    <select data-pool-id="${pool.id}" data-match-index="${matchIndex}" data-team="2" class="score-select w-20 p-1 border border-gray-300 rounded-md text-center text-sm">
                                        ${generateScoreOptions(40, match.score2)}
                                    </select>
                                </div>
                                <span data-team-role="team2-name" class="${team2Class} w-full sm:w-auto text-center sm:text-right">${escapeHtml(match.team2Name)}</span>
                                ${repeatIndicatorHtml}
                            </div>
                        `;
                    });
                } else {
                    matchesHtml = '<p class="text-gray-500 text-sm mt-2">Aucune rencontre générée pour cette poule.</p>';
                }

                poolCard.innerHTML = '<h3 class="text-xl font-semibold text-gray-800 mb-3">' + escapeHtml(pool.name) + '</h3>' +
                                     '<div class="mb-4">' +
                                         '<h4 class="font-semibold text-gray-700 mb-2">Équipes:</h4>' +
                                         '<ul class="list-disc list-inside space-y-1 text-gray-700">' +
                                             teamsListHtml +
                                         '</ul>' +
                                     '</div>' +
                                     '<div class="mt-4 border-t border-gray-200 pt-4">' +
                                         '<h4 class="font-semibold text-gray-700 mb-2">Rencontres:</h4>' +
                                         matchesHtml +
                                     '</div>';
                poolsDisplay.appendChild(poolCard);
            });

            poolsDisplay.querySelectorAll('.score-select').forEach(select => {
                select.addEventListener('change', (event) => { // Changed from 'input' to 'change'
                    const poolId = event.target.dataset.poolId;
                    const matchIndex = parseInt(event.target.dataset.matchIndex);

                    const matchDiv = event.target.closest('.flex.flex-col.sm\\:flex-row');
                    const scoreSelects = matchDiv.querySelectorAll('.score-select');

                    let score1 = parseInt(scoreSelects[0].value);
                    let score2 = parseInt(scoreSelects[1].value);

                    if (isNaN(score1)) score1 = null;
                    if (isNaN(score2)) score2 = null;

                    const phase = allBrassagePhases.find(p => p.id === currentDisplayedPhaseId);
                    if (phase) {
                        const pool = phase.pools.find(p => p.id === poolId);
                        if (pool) {
                            const match = pool.matches[matchIndex];

                            match.score1 = score1;
                            match.score2 = score2;
                            match.winnerId = null;

                            if (score1 !== null && score2 !== null && score1 >= 0 && score2 >= 0) {
                                if (score1 > score2) {
                                    match.winnerId = match.team1Id;
                                } else if (score2 > score1) {
                                    match.winnerId = match.team2Id;
                                } else {
                                     // Handle tie - for now, no winner, message for user
                                     showToast("Un match ne peut pas être un match nul. Veuillez entrer un vainqueur.", "error");
                                }
                            }
                            saveAllData(); // Use saveAllData
                            // Le rendu est géré par onSnapshot (pour les utilisateurs connectés) ou par handleLocationHash (pour le mode invité)

                            const team1Span = matchDiv.querySelector('span[data-team-role="team1-name"]');
                            const team2Span = matchDiv.querySelector('span[data-team-role="team2-name"]');

                            // Always reset classes first
                            team1Span.classList.remove('font-bold', 'text-green-700', 'text-red-700');
                            team2Span.classList.remove('font-bold', 'text-green-700', 'text-red-700');

                            // Apply new classes based on winnerId
                            if (match.winnerId === match.team1Id) {
                                team1Span.classList.add('font-bold', 'text-green-700');
                                team2Span.classList.add('text-red-700');
                            } else if (match.winnerId === match.team2Id) {
                                team2Span.classList.add('font-bold', 'text-green-700');
                                team1Span.classList.add('text-red-700');
                            }
                            if (score1 !== null && score2 !== null && score1 >= 0 && score2 >= 0 && match.winnerId) {
                                showToast("Score enregistré automatiquement pour " + escapeHtml(match.team1Name) + " vs " + escapeHtml(match.team2Name) + " !", "success");
                            } else {
                                showToast("Saisie en cours...", "info");
                            }

                        } else {
                            console.error("ERROR: Pool not found for ID:", poolId);
                        }
                    } else {
                        console.error("ERROR: Currently displayed phase not found:", currentDisplayedPhaseId);
                    }
                });
            });

            // Add event listeners for the new repeated match buttons
            poolsDisplay.querySelectorAll('.repeated-match-indicator-btn').forEach(button => {
                button.addEventListener('click', (event) => {
                    const team1Id = event.target.dataset.team1Id;
                    const team2Id = event.target.dataset.team2Id;
                    const team1Name = event.target.dataset.team1Name;
                    const team2Name = event.target.dataset.team2Name;
                    showRepeatedMatchDetailsModal(team1Name, team2Name, team1Id, team2Id, phaseId); // Use passed phaseId
                });
            });
        }

        // Helper function to render pools with current display settings
        function renderPoolsWithCurrentSettings(pools, phaseName, phaseId) {
            const toggleRepeatedMatchesDisplay = document.getElementById('toggleRepeatedMatchesDisplay');
            const showRepeats = toggleRepeatedMatchesDisplay ? toggleRepeatedMatchesDisplay.checked : false;
            renderPools(pools, phaseName, phaseId, showRepeats);
        }

        function renderPhaseHistory() {
            phaseHistoryDisplay.innerHTML = '';

            const brassagePhasesForHistory = allBrassagePhases.filter(p => p.type !== PHASE_TYPE_ELIMINATION_SEEDING);
            brassagePhasesForHistory.sort((a, b) => a.timestamp - b.timestamp);

            if (brassagePhasesForHistory.length === 0) {
                phaseHistoryDisplay.innerHTML = '<p class="text-gray-500 text-center w-full">Aucune phase de brassage générée pour le moment.</p>';
            } else {
                brassagePhasesForHistory.forEach(phase => {
                    const phaseEntryWrapper = document.createElement('div');
                    phaseEntryWrapper.className = 'phase-entry-wrapper flex flex-col w-full bg-gray-100 rounded-lg p-2 mb-2 shadow-sm';

                    const buttonContainer = document.createElement('div');
                    buttonContainer.className = 'flex items-center space-x-2 w-full';

                    const phaseButton = document.createElement('button');
                    phaseButton.textContent = phase.name;
                    phaseButton.className = 'phase-name-button flex-grow bg-gray-200 text-gray-800 py-2 px-4 rounded-md hover:bg-gray-300 transition duration-150 text-sm text-left';
                    phaseButton.addEventListener('click', () => {
                        renderPoolsWithCurrentSettings(phase.pools, phase.name, phase.id);
                    });

                    const generateOrDisplayButton = document.createElement('button');
                    if (phase.generated) {
                        generateOrDisplayButton.textContent = 'Afficher les poules';
                        generateOrDisplayButton.className = 'generate-or-display-button bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 transition duration-150 text-sm ml-2';
                        generateOrDisplayButton.addEventListener('click', () => {
                            renderPoolsWithCurrentSettings(phase.pools, phase.name, phase.id);
                        });
                    } else {
                        generateOrDisplayButton.textContent = 'Générer les poules';
                        generateOrDisplayButton.className = `generate-or-display-button bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition duration-150 text-sm ml-2 ${isGuestMode ? 'opacity-50 cursor-not-allowed' : ''}`;
                        generateOrDisplayButton.disabled = isGuestMode; // Désactiver si en mode invité
                        generateOrDisplayButton.addEventListener('click', () => {
                            if (isGuestMode) {
                                showToast("Veuillez vous connecter pour générer les poules.", "error");
                                showLoginRequiredModal();
                                return;
                            }
                            generatePoolsForPhase(phase.id); // Call the unified generation function
                        });
                    }

                    const deleteButton = document.createElement('button');
                    deleteButton.textContent = 'X';
                    deleteButton.className = `delete-phase-button bg-red-500 text-white w-6 h-6 flex items-center justify-center rounded-full text-xs hover:bg-red-600 transition duration-150 ${isGuestMode ? 'opacity-50 cursor-not-allowed' : ''}`;
                    deleteButton.title = 'Supprimer cette phase';
                    deleteButton.disabled = isGuestMode; // Désactiver si en mode invité
                    deleteButton.addEventListener('click', () => {
                        if (isGuestMode) {
                            showToast("Veuillez vous connecter pour supprimer les phases.", "error");
                            showLoginRequiredModal();
                            return;
                        }
                        const messageContent = document.createElement('p');
                        messageContent.textContent = `Êtes-vous sûr de vouloir supprimer la phase "${escapeHtml(phase.name)}" ? Cette action est irréversible.`;
                        messageContent.className = 'text-gray-700';

                        showModal('Confirmer la suppression', messageContent, () => {
                            deletePhaseById(phase.id);
                        }, true);
                    });

                    buttonContainer.appendChild(phaseButton);
                    buttonContainer.appendChild(generateOrDisplayButton);
                    buttonContainer.appendChild(deleteButton);

                    phaseEntryWrapper.appendChild(buttonContainer);

                    phaseHistoryDisplay.appendChild(phaseEntryWrapper);
                });
            }
            updateRepeatedMatchesCountDisplay(); // Update count display after history is rendered
            updateNextPhaseButtonVisibility(); // Update visibility of the "Create next phase" button
        }

        /**
         * Updates the visibility and message of the "Create next brassage phase" button.
         */
        function updateNextPhaseButtonVisibility() {
            const basisInitialLevelsRadio = document.getElementById('basisInitialLevels');
            const basisPreviousResultsRadio = document.getElementById('basisPreviousResults');
            const nextBrassagePhaseContainer = document.getElementById('nextBrassagePhaseContainer');
            const nextBrassagePhaseMessage = document.getElementById('nextBrassagePhaseMessage');

            // Retrieve the basis from the DOM elements, not localStorage, as localStorage is no longer used for this setting
            const selectedBasis = basisInitialLevelsRadio.checked ? 'initialLevels' : (basisPreviousResultsRadio.checked ? 'previousResults' : null);

            const initialOrSecondaryPhases = allBrassagePhases.filter(p => p.type === PHASE_TYPE_INITIAL || p.type === PHASE_TYPE_SECONDARY_BRASSAGE);
            initialOrSecondaryPhases.sort((a, b) => a.timestamp - b.timestamp);

            const lastBrassagePhase = initialOrSecondaryPhases[initialOrSecondaryPhases.length - 1];
            const hasUngeneratedPhase = initialOrSecondaryPhases.some(p => !p.generated);

            // Désactiver le bouton "Créer la phase suivante" en mode invité
            if (isGuestMode) {
                nextBrassagePhaseContainer.classList.remove('hidden'); // S'assurer que le conteneur est visible pour le message
                createNextBrassagePhaseBtn.classList.add('opacity-50', 'cursor-not-allowed');
                createNextBrassagePhaseBtn.disabled = true;
                nextBrassagePhaseMessage.textContent = "Veuillez vous connecter pour créer plus de phases de brassage.";
                nextBrassagePhaseMessage.classList.add('text-red-500');
                return; // Ne pas exécuter la logique de détection de complétion pour les invités
            } else {
                 createNextBrassagePhaseBtn.classList.remove('opacity-50', 'cursor-not-allowed');
                 createNextBrassagePhaseBtn.disabled = false;
            }


            if (selectedBasis === 'previousResults' && lastBrassagePhase && isBrassagePhaseComplete(lastBrassagePhase) && !hasUngeneratedPhase) {
                nextBrassagePhaseContainer.classList.remove('hidden');
                nextBrassagePhaseMessage.textContent = "La phase de brassage précédente est complète. Vous pouvez créer la prochaine phase.";
                nextBrassagePhaseMessage.classList.remove('text-red-500');
                nextBrassagePhaseMessage.classList.add('text-green-500');
            } else if (selectedBasis === 'previousResults' && lastBrassagePhase && !isBrassagePhaseComplete(lastBrassagePhase)) {
                nextBrassagePhaseContainer.classList.remove('hidden');
                nextBrassagePhaseMessage.textContent = `Veuillez compléter les scores de la phase "${escapeHtml(lastBrassagePhase ? lastBrassagePhase.name : 'Phase Inconnue')}" pour créer la phase suivante.`;
                nextBrassagePhaseMessage.classList.remove('text-green-500');
                nextBrassagePhaseMessage.classList.add('text-red-500');
            } else if (selectedBasis === 'previousResults' && hasUngeneratedPhase) {
                nextBrassagePhaseContainer.classList.remove('hidden');
                nextBrassagePhaseMessage.textContent = `Une phase de brassage est en attente de génération. Veuillez générer ses poules en cliquant sur "Générer les poules".`;
                nextBrassagePhaseMessage.classList.remove('text-green-500');
                nextBrassagePhaseMessage.classList.add('text-red-500');
            }
            else {
                nextBrassagePhaseContainer.classList.add('hidden');
            }
        }

        function renderSecondaryGroupsPreview(groupNames) {
            const secondaryGroupsPreviewDisplay = document.getElementById('secondaryGroupsPreviewDisplay');
            const refreshSecondaryGroupScoresBtn = document.getElementById('refreshSecondaryGroupScoresBtn');
            const validateSecondaryGroupsBtn = document.getElementById('validateSecondaryGroupsBtn');
            const generateSecondaryBrassagesBtn = document.getElementById('generateSecondaryBrassagesBtn');
            const numberOfSecondaryGroupsInput = document.getElementById('numberOfSecondaryGroups');

            secondaryGroupsPreviewDisplay.innerHTML = '';
            refreshSecondaryGroupScoresBtn.classList.add('hidden'); // Hide by default, show only if groups are rendered

            // Désactiver les boutons de validation/génération si en mode invité
            if (isGuestMode) {
                validateSecondaryGroupsBtn.classList.add('opacity-50', 'cursor-not-allowed');
                validateSecondaryGroupsBtn.disabled = true;
                generateSecondaryBrassagesBtn.classList.add('opacity-50', 'cursor-not-allowed');
                generateSecondaryBrassagesBtn.disabled = true;
                // Le refresh button peut rester actif pour actualiser les scores localement si on veut.
                // refreshSecondaryGroupScoresBtn.classList.add('opacity-50', 'cursor-not-allowed');
                // refreshSecondaryGroupScoresBtn.disabled = true;
            } else {
                 validateSecondaryGroupsBtn.classList.remove('opacity-50', 'cursor-not-allowed');
                 validateSecondaryGroupsBtn.disabled = false;
                 generateSecondaryBrassagesBtn.classList.remove('opacity-50', 'cursor-not-allowed');
                 generateSecondaryBrassagesBtn.disabled = false;
                 // refreshSecondaryGroupScoresBtn.classList.remove('opacity-50', 'cursor-not-allowed');
                 // refreshSecondaryGroupScoresBtn.disabled = false;
            }


            if (Object.keys(currentSecondaryGroupsPreview).length === 0) {
                secondaryGroupsPreviewDisplay.innerHTML = '<p class="text-gray-500 text-center w-full md:col-span-2 lg:col-span-3">Créez les groupes ici après avoir cliqué sur "Créer les groupes".</p>';
                // Ensure buttons are hidden if there's no data
                validateSecondaryGroupsBtn.classList.add('hidden');
                generateSecondaryBrassagesBtn.classList.add('hidden');
                refreshSecondaryGroupScoresBtn.classList.add('hidden'); // Hide refresh button
                // Pas besoin de saveAllData ici car c'est un état d'affichage initial
                return;
            }

            // Ensure buttons are visible if there IS data
            validateSecondaryGroupsBtn.classList.remove('hidden');
            generateSecondaryBrassagesBtn.classList.remove('hidden');
            refreshSecondaryGroupScoresBtn.classList.remove('hidden'); // Show refresh button


            groupNames.forEach(groupName => {
                const teamsInGroup = currentSecondaryGroupsPreview[groupName] || [];
                const groupDiv = document.createElement('div');
                groupDiv.className = 'bg-white p-4 rounded-lg shadow-md border border-gray-200 dropzone';
                groupDiv.dataset.groupName = groupName;
                groupDiv.innerHTML = `
                    <h3 class="text-xl font-semibold text-gray-800 mb-3">${escapeHtml(groupName)} (${teamsInGroup.length} équipes)</h3>
                    <ul class="space-y-2" id="group-${groupName.replace(/\s/g, '-')}-list"></ul>
                `;
                const teamList = groupDiv.querySelector('ul');

                teamsInGroup.forEach(team => {
                    const listItem = document.createElement('li');
                    const isEliminated = eliminatedTeams.has(team.id);

                    // Changed to a more "button-like" appearance and added elimination styling
                    listItem.className = `draggable-team block w-full text-left py-2 px-3 rounded-md font-medium hover:bg-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition duration-150 shadow-sm cursor-pointer
                        ${isEliminated ? 'bg-red-50 text-red-800' : 'bg-blue-100 text-blue-800'}`;
                    listItem.dataset.teamId = team.id;
                    listItem.dataset.currentGroup = groupName;
                    listItem.dataset.teamName = team.name;
                    listItem.dataset.totalPoints = team.totalPoints;
                    listItem.dataset.totalDiffScore = team.totalDiffScore;

                    // Display updated scores and elimination status
                    listItem.innerHTML = `
                        <span class="${isEliminated ? 'line-through' : ''}">${escapeHtml(team.name)} (Pts: ${team.totalPoints}, Diff: ${team.totalDiffScore})</span>
                        ${isEliminated ? '<span class="ml-2 text-red-500 text-sm">(Éliminée)</span>' : ''}
                    `;

                    // MODIFIÉ : Appel d'une nouvelle fonction pour gérer les options de l'équipe
                    listItem.addEventListener('click', (event) => {
                        showTeamOptionsModal(team.id, team.name, team.totalPoints, team.totalDiffScore, groupName, groupNames);
                    });

                    teamList.appendChild(listItem);
                });
                secondaryGroupsPreviewDisplay.appendChild(groupDiv);
            });
        }

        /**
         * Updates the scores displayed in the secondary groups preview without re-shuffling teams.
         * This is useful if brassage phase scores have been updated after the preview was generated.
         */
        function updateSecondaryGroupsPreviewDisplayOnly() {
            const numberOfSecondaryGroupsInput = document.getElementById('numberOfSecondaryGroups');
            if (Object.keys(currentSecondaryGroupsPreview).length === 0) {
                showToast("Aucune prévisualisation de groupe secondaire à actualiser.", "info");
                return;
            }

            const latestGlobalRankings = getGlobalRankings(allTeams, allBrassagePhases);
            const rankingsMap = new Map(latestGlobalRankings.map(r => [r.teamObject.id, r]));

            let displayUpdated = false;

            for (const groupName in currentSecondaryGroupsPreview) {
                currentSecondaryGroupsPreview[groupName].forEach(teamInPreview => {
                    const latestTeamRank = rankingsMap.get(teamInPreview.id);
                    if (latestTeamRank) {
                        // Update the stored totalPoints and totalDiffScore in the preview data
                        if (teamInPreview.totalPoints !== latestTeamRank.totalPoints ||
                            teamInPreview.totalDiffScore !== latestTeamRank.totalDiffScore) {
                            teamInPreview.totalPoints = latestTeamRank.totalPoints;
                            teamInPreview.totalDiffScore = latestTeamRank.totalDiffScore;
                            displayUpdated = true; // Indicate that content changed
                        }
                    }
                });
                // Re-sort the teams within each preview group to maintain rank order
                currentSecondaryGroupsPreview[groupName].sort((a, b) => b.totalPoints - a.totalPoints || b.totalDiffScore - a.totalDiffScore);
            }

            // Re-render the secondary groups preview to show updated scores
            const numGroupsValue = parseInt(numberOfSecondaryGroupsInput.value);
            const groupNamesMap = { 2: ["Principale", "Consolante"], 3: ["Principale", "Consolante", "Super Consolante"] };
            const selectedGroupNames = groupNamesMap[numGroupsValue];

            renderSecondaryGroupsPreview(selectedGroupNames); // This will redraw the display with updated scores
            saveAllData(); // Sauve les données, cela déclenchera le re-rendu de l'UI

            if (displayUpdated) {
                showToast("Scores des groupes secondaires actualisés avec les dernières données de classement.", "success");
            } else {
                showToast("Les scores des groupes secondaires sont déjà à jour.", "info");
            }
        }


        function deletePhaseById(phaseIdToDelete) {
            const initialLength = allBrassagePhases.length;
            allBrassagePhases = allBrassagePhases.filter(phase => phase.id !== phaseIdToDelete);

            if (allBrassagePhases.length < initialLength) {
                saveAllData(); // Sauve les données, cela déclenchera le re-rendu de l'UI
                // Le rendu est géré par onSnapshot (pour les utilisateurs connectés) ou par handleLocationHash (pour le mode invité)

                if (currentDisplayedPhaseId === phaseIdToDelete) {
                    poolsDisplay.innerHTML = '<p class="text-gray-500 text-center md:col-span-2">Les poules de la phase sélectionnée s\'afficheront ici.</p>';
                    currentPhaseTitle.textContent = 'Poules de la Phase Actuelle';
                    currentDisplayedPhaseId = null;
                }
                showToast("La phase a été supprimée avec succès !", "success");

            } else {
                showToast("Erreur: Phase non trouvée pour la suppression.", "error");
            }
        }

        // Wrapper pour `_performSecondaryGroupsPreview` avec avertissement
        function previewSecondaryGroupsWithWarning() {
            if (isGuestMode) {
                showToast("Veuillez vous connecter pour créer des groupes secondaires.", "error");
                showLoginRequiredModal();
                return;
            }
            if (Object.keys(currentSecondaryGroupsPreview).length > 0) {
                const messageContent = document.createElement('p');
                messageContent.innerHTML = `Des groupes secondaires ont déjà été créés. En continuant, vous perdrez la composition actuelle des groupes et ils seront recréés. Êtes-vous sûr de vouloir continuer ?`;
                messageContent.className = 'text-gray-700';

                showModal('Confirmer la re-création des groupes secondaires', messageContent, () => {
                    _performSecondaryGroupsPreview(); // Call the actual generation logic
                }, true); // Use red style for confirmation button
            } else {
                _performSecondaryGroupsPreview(); // No warning needed if no preview exists
            }
        }

        // --- Initialisation et Événements pour la page Brassages ---

        // Initialize pool generation basis radio buttons
        // Load from global variable `poolGenerationBasis` (which is loaded from Firestore or localStorage)
        if (basisInitialLevelsRadio) {
            basisInitialLevelsRadio.checked = (poolGenerationBasis === 'initialLevels');
        }
        if (basisPreviousResultsRadio) {
            basisPreviousResultsRadio.checked = (poolGenerationBasis === 'previousResults');
        }
        updatePoolGenerationBasisUI(); // Call to set initial state based on default or loaded value


        // Event listeners for basis selection
        basisInitialLevelsRadio.addEventListener('change', () => {
            poolGenerationBasis = 'initialLevels';
            saveAllData(); // Save the preference
            updatePoolGenerationBasisUI();
        });

        basisPreviousResultsRadio.addEventListener('change', () => {
            poolGenerationBasis = 'previousResults';
            saveAllData(); // Save the preference
            updatePoolGenerationBasisUI();
        });

        // La fonction updatePoolGenerationBasisUI est maintenant définie globalement et appelée ici.
        // Elle vérifiera si les éléments DOM existent avant d'essayer de les manipuler.


        createGlobalPhasesStructureBtn.addEventListener('click', () => {
            if (isGuestMode) {
                showToast("Veuillez vous connecter pour créer des phases de brassage.", "error");
                showLoginRequiredModal();
                return;
            }
            const numPhases = parseInt(numberOfGlobalPhasesInput.value);
            // Read directly from the DOM elements
            const selectedBasis = basisInitialLevelsRadio.checked ? 'initialLevels' : (basisPreviousResultsRadio.checked ? 'previousResults' : null);

            if (allTeams.length === 0) {
                showToast("Aucune équipe n'a été ajoutée. Veuillez gérer les équipes d'abord.", "error");
                return;
            }

            if (isNaN(numPhases) || numPhases < 1) {
                showToast("Veuillez entrer un nombre valide de phases globales à créer (au moins 1).", "error");
                return;
            }

            // Get existing actual brassage phases (initial and secondary)
            const existingBrassagePhases = allBrassagePhases.filter(p => p.type === PHASE_TYPE_INITIAL || p.type === PHASE_TYPE_SECONDARY_BRASSAGE);
            const hasUngeneratedPhase = existingBrassagePhases.some(p => !p.generated);
            const lastBrassagePhase = existingBrassagePhases[existingBrassagePhases.length - 1];

            if (selectedBasis === 'previousResults') {
                if (existingBrassagePhases.length > 0 && !isBrassagePhaseComplete(lastBrassagePhase)) {
                     showToast(`La phase "${escapeHtml(lastBrassagePhase.name)}" n'est pas terminée. Veuillez compléter ses scores ou la supprimer pour créer une nouvelle phase.`, "error");
                     return;
                }
                if (hasUngeneratedPhase) {
                    showToast("Une phase de brassage est en attente de génération. Veuillez générer ses poules en cliquant sur 'Générer les poules' ou la supprimer.", "error");
                    return;
                }
                if (numPhases > 1) { // This case should be prevented by readOnly, but as a safeguard
                    showToast("Lorsque la méthode de génération est 'Base sur les résultats cumulés des brassages précédents', vous ne pouvez créer qu'une seule phase à la fois.", "error");
                    numberOfGlobalPhasesInput.value = 1; // Force back to 1
                    return;
                }
            }


            let newGlobalPhases = [];
            const nextPhaseNumber = existingBrassagePhases.length + 1; // Calculate next phase number

            // Filter out existing initial and secondary brassage phases when creating NEW global phases
            // We want to keep only the ELIMINATION_SEEDING phase, as it's a validated state for future elimination.
            allBrassagePhases = allBrassagePhases.filter(p => p.type === PHASE_TYPE_ELIMINATION_SEEDING);

            for (let i = 0; i < numPhases; i++) {
                newGlobalPhases.push({
                    id: `${PHASE_TYPE_INITIAL}_${Date.now()}_${i}`,
                    type: PHASE_TYPE_INITIAL,
                    name: `Phase Globale ${nextPhaseNumber + i}`, // Use calculated phase number
                    pools: [],
                    generated: false, // Newly created phases are not yet generated
                    timestamp: Date.now() + i // Ensure unique timestamp for ordering
                });
            }

            allBrassagePhases.push(...newGlobalPhases);
            saveAllData(); // Sauve les données, cela déclenchera le re-rendu de l'UI
            // Le rendu est géré par onSnapshot (pour les utilisateurs connectés) ou par handleLocationHash (pour le mode invité)

            if (selectedBasis === 'previousResults') {
                 showToast(`Une seule phase ('Phase Globale ${nextPhaseNumber}') a été créée. Veuillez générer ses poules, puis compléter ses scores pour débloquer la création de la phase suivante.`, "info");
            } else {
                 showToast(`${numPhases} phases globales créées. Générez les poules pour chaque phase.`, "success");
            }
        });

        // New event listener for creating the next phase when basis is previousResults
        createNextBrassagePhaseBtn.addEventListener('click', async () => {
            if (isGuestMode) {
                showToast("Veuillez vous connecter pour créer la phase suivante.", "error");
                showLoginRequiredModal();
                return;
            }
            // Read directly from the DOM elements
            const basisInitialLevelsRadio = document.getElementById('basisInitialLevels');
            const basisPreviousResultsRadio = document.getElementById('basisPreviousResults');
            const selectedBasis = basisInitialLevelsRadio.checked ? 'initialLevels' : (basisPreviousResultsRadio.checked ? 'previousResults' : null);
            if (selectedBasis !== 'previousResults') {
                showToast("Cette option n'est disponible que lorsque la génération est basée sur les résultats précédents.", "error");
                return;
            }

            const initialOrSecondaryPhases = allBrassagePhases.filter(p => p.type === PHASE_TYPE_INITIAL || p.type === PHASE_TYPE_SECONDARY_BRASSAGE);
            initialOrSecondaryPhases.sort((a,b) => a.timestamp - b.timestamp);

            const lastBrassagePhase = initialOrSecondaryPhases[initialOrSecondaryPhases.length - 1];
            const hasUngeneratedPhase = initialOrSecondaryPhases.some(p => !p.generated);

            if (!lastBrassagePhase || !isBrassagePhaseComplete(lastBrassagePhase)) {
                showToast(`Veuillez compléter tous les scores de la phase "${escapeHtml(lastBrassagePhase ? lastBrassagePhase.name : 'précédente')}" avant de créer la phase suivante.`, "error");
                return;
            }
            if (hasUngeneratedPhase) {
                showToast("Une phase de brassage est en attente de génération. Veuillez générer ses poules en cliquant sur 'Générer les poules' ou la supprimer.", "error");
                return;
            }

            const nextPhaseNumber = initialOrSecondaryPhases.length + 1;
            const newPhase = {
                id: `${PHASE_TYPE_INITIAL}_${Date.now()}_${nextPhaseNumber}`,
                type: PHASE_TYPE_INITIAL,
                name: `Phase Globale ${nextPhaseNumber}`,
                pools: [],
                generated: false,
                timestamp: Date.now() // Ensure unique timestamp for ordering
            };

            allBrassagePhases.push(newPhase);
            await saveAllData(); // Sauve les données, cela déclenchera le re-rendu de l'UI
            // Le rendu est géré par onSnapshot (pour les utilisateurs connectés) ou par handleLocationHash (pour le mode invité)
            showToast(`Phase Globale ${nextPhaseNumber} créée avec succès !`, "success");
        });

        previewSecondaryGroupsBtn.addEventListener('click', previewSecondaryGroupsWithWarning);
        numberOfSecondaryGroupsInput.addEventListener('change', () => {
            // If the user changes the number of groups, clear the current preview
            // because the structure might be different.
            currentSecondaryGroupsPreview = {};
            secondaryGroupsPreviewDisplay.innerHTML = '<p class="text-gray-500 text-center w-full md:col-span-2 lg:col-span-3">Créez les groupes ici après avoir cliqué sur "Créer les groupes".</p>';
            validateSecondaryGroupsBtn.classList.add('hidden');
            generateSecondaryBrassagesBtn.classList.add('hidden');
            refreshSecondaryGroupScoresBtn.classList.add('hidden'); // Hide refresh button
            saveAllData(); // Sauve l'état vide
        });

        validateSecondaryGroupsBtn.addEventListener('click', validateSecondaryGroupsForElimination);

        generateSecondaryBrassagesBtn.addEventListener('click', () => {
            if (isGuestMode) {
                showToast("Veuillez vous connecter pour générer les brassages des groupes secondaires.", "error");
                showLoginRequiredModal();
                return;
            }
            const messageContent = document.createElement('p');
            messageContent.textContent = "Êtes-vous sûr de vouloir générer les phases de brassage pour les groupes Principale, Consolante et Super Consolante ? Cette action ajoutera de nouvelles phases à l'historique.";
            messageContent.className = 'text-gray-700';

            showModal('Confirmer la génération des brassages de groupes secondaires', messageContent, () => {
                generateSecondaryBrassagePhases();
            });
        });

        // NOUVEAU: Écouteur pour le bouton de validation directe
        validateForDirectEliminationBtn.addEventListener('click', validateForDirectElimination);

        clearAllPhasesBtn.addEventListener('click', clearAllPhases);

        // Event listener for toggling repeated matches display
        toggleRepeatedMatchesDisplay.addEventListener('change', () => {
            if (currentDisplayedPhaseId) {
                const currentPhase = allBrassagePhases.find(p => p.id === currentDisplayedPhaseId);
                if (currentPhase) {
                    renderPoolsWithCurrentSettings(currentPhase.pools, currentPhase.name, currentPhase.id);
                }
            }
        });

        // NEW: Event listener for refreshing secondary group scores
        refreshSecondaryGroupScoresBtn.addEventListener('click', updateSecondaryGroupsPreviewDisplayOnly);

        // Load and display the previously selected phase if it exists
        if (currentDisplayedPhaseId) {
            const initialPhase = allBrassagePhases.find(p => p.id === currentDisplayedPhaseId);
            if (initialPhase) {
                renderPoolsWithCurrentSettings(initialPhase.pools, initialPhase.name, initialPhase.id);
            }
        }

        // NEW: On page load, if a secondary group preview exists, render it
        if (Object.keys(currentSecondaryGroupsPreview).length > 0) {
            // The number of groups should be derived from the actual preview, not localStorage
            const numGroupsInPreview = Object.keys(currentSecondaryGroupsPreview).length;
            const groupNamesMap = { 2: ["Principale", "Consolante"], 3: ["Principale", "Consolante", "Super Consolante"] };
            const selectedGroupNames = groupNamesMap[numGroupsInPreview];

            // Ensure the dropdown reflects the loaded state
            if (numberOfSecondaryGroupsInput.value !== numGroupsInPreview.toString()) {
                numberOfSecondaryGroupsInput.value = numGroupsInPreview;
            }

            renderSecondaryGroupsPreview(selectedGroupNames);
        }
    }
	// Part 4 sur 5 (script.js) - Corrigée

    // NOUVEAU: Fonction pour la page de sélection des équipes éliminées
    function renderEliminationSelectionPage() {
        // Guest mode restriction
        const guestModeWarning = isGuestMode ? `
            <div class="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-md text-yellow-800 text-sm">
                <p class="font-semibold mb-2">Mode Invité Actif :</p>
                <p>Vous êtes en mode invité. La modification du statut d'élimination est visible localement, mais pour la sauvegarder de manière permanente et l'appliquer à vos tournois futurs, veuillez vous <a href="#auth" class="text-blue-700 hover:underline">connecter ou créer un compte</a>.</p>
            </div>
        ` : '';

        APP_CONTAINER.innerHTML = `
            <h1 class="text-3xl font-bold text-center text-gray-800 mb-8">Sélection des Équipes Éliminées</h1>

            ${guestModeWarning}

            <section class="p-6 bg-gray-50 rounded-lg border border-gray-200">
                <p class="text-gray-700 mb-4">Cochez les équipes qui seront exclues des phases éliminatoires. Elles n'apparaîtront pas dans les arbres de tournoi.</p>
                <div id="eliminationTeamsList" class="space-y-3">
                    </div>
                <div class="mt-6 text-center">
                    <button id="saveEliminationSelectionBtn"
                            class="bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 shadow-md transition ease-in-out duration-150">
                        Sauvegarder la Sélection
                    </button>
                    <p id="eliminationSelectionMessage" class="mt-3 text-sm text-center"></p>
                </div>
            </section>
        `;
        setupEliminationSelectionPageLogic();
    }

    // NOUVEAU: Logique de la page de sélection des équipes éliminées
    function setupEliminationSelectionPageLogic() {
        const eliminationTeamsList = document.getElementById('eliminationTeamsList');
        const saveEliminationSelectionBtn = document.getElementById('saveEliminationSelectionBtn');
        const eliminationSelectionMessage = document.getElementById('eliminationSelectionMessage');

        function renderTeamsForEliminationSelection() {
            eliminationTeamsList.innerHTML = '';

            if (allTeams.length === 0) {
                eliminationTeamsList.innerHTML = '<p class="text-gray-500 text-center">Aucune équipe enregistrée.</p>';
                return;
            }

            // 1. Calculer le classement global
            const globalRankings = getGlobalRankings(allTeams, allBrassagePhases);

            // 2. Créer une map pour un accès rapide aux scores par ID d'équipe
            const teamScoresMap = new Map();
            globalRankings.forEach(rankEntry => {
                teamScoresMap.set(rankEntry.teamObject.id, {
                    points: rankEntry.totalPoints,
                    diffScore: rankEntry.totalDiffScore
                });
            });

            // 3. Trier les équipes pour l'affichage
            const sortedTeamsForDisplay = [...allTeams].sort((a, b) => {
                const scoreA = teamScoresMap.get(a.id) || { points: 0, diffScore: 0 };
                const scoreB = teamScoresMap.get(b.id) || { points: 0, diffScore: 0 };

                // Tri par points décroissant
                if (scoreB.points !== scoreA.points) {
                    return scoreB.points - scoreA.points;
                }
                // Tri par différence de score décroissante
                if (scoreB.diffScore !== scoreA.diffScore) {
                    return scoreB.diffScore - scoreA.diffScore;
                }
                // Tri alphabétique par nom en dernier recours
                return a.name.localeCompare(b.name);
            });


            sortedTeamsForDisplay.forEach(team => {
                const teamDiv = document.createElement('div');
                const isChecked = eliminatedTeams.has(team.id);

                // Récupérer les scores de la map
                const scores = teamScoresMap.get(team.id) || { points: 0, diffScore: 0 };

                teamDiv.className = `flex items-center justify-between p-3 bg-white border border-gray-200 rounded-md shadow-sm cursor-pointer ${isChecked ? 'bg-red-50' : ''}`;
                teamDiv.innerHTML = `
                    <label class="flex items-center flex-grow cursor-pointer">
                        <input type="checkbox" data-team-id="${team.id}" class="form-checkbox h-5 w-5 text-red-600 mr-3" ${isChecked ? 'checked' : ''}>
                        <span class="text-lg font-medium text-gray-800 ${isChecked ? 'line-through text-red-600' : ''}">
                            ${escapeHtml(team.name)} (Pts: ${scores.points}, Diff: ${scores.diffScore})
                        </span>
                    </label>
                `;
                eliminationTeamsList.appendChild(teamDiv);

                // Add event listener to update visual state immediately
                const checkbox = teamDiv.querySelector('input[type="checkbox"]');
                const teamNameSpan = teamDiv.querySelector('span');
                checkbox.addEventListener('change', () => {
                    if (checkbox.checked) {
                        teamDiv.classList.add('bg-red-50');
                        teamNameSpan.classList.add('line-through', 'text-red-600');
                    } else {
                        teamDiv.classList.remove('bg-red-50');
                        teamNameSpan.classList.remove('line-through', 'text-red-600');
                    }
                });
            });
        }

        saveEliminationSelectionBtn.addEventListener('click', () => {
            // Pas de showLoginRequiredModal() ici, car l'action est autorisée en mode invité pour le test
            // Le warning sur la persistance est affiché par le bandeau en haut de la page.
            eliminatedTeams.clear(); // Clear existing selections
            document.querySelectorAll('#eliminationTeamsList input[type="checkbox"]:checked').forEach(checkbox => {
                eliminatedTeams.add(checkbox.dataset.teamId);
            });
            saveAllData(); // Sauve les données (localement en mode invité, Firestore si connecté)
            showToast("Sélection des équipes éliminées sauvegardée !", "success");
            window.location.hash = '#eliminatoires';
        });

        renderTeamsForEliminationSelection();
    }


    function renderEliminatoiresPage() {
        APP_CONTAINER.innerHTML = `
            <h1 class="text-3xl font-bold text-center text-gray-800 mb-8">Phase Éliminatoire</h1>

            <section class="p-6 bg-gray-50 rounded-lg border border-gray-200">
                <h2 class="text-2xl font-semibold text-gray-700 mb-4">Génération des phases éliminatoires</h2>
                <p class="text-gray-600 mb-4">
                    Les phases éliminatoires seront générées pour les groupes "Principale", "Consolante" et "Super Consolante"
                    (si ces groupes existent et contiennent au moins 2 équipes) validés sur la page Brassages. Les matchs seront appariés 1er contre dernier, 2ème contre avant-dernier, etc.
                </p>
                <div class="flex flex-col sm:flex-row justify-center gap-4 mt-6">
                    <button id="goToEliminationSelectionBtn"
                            class="bg-yellow-600 text-white py-2 px-4 rounded-md hover:bg-yellow-700 focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:ring-offset-2 shadow-md transition ease-in-out duration-150">
                        Sélectionner les équipes à éliminer
                    </button>
                    <button id="generateEliminationPhasesBtn"
                            class="bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 shadow-md transition ease-in-out duration-150">
                        Générer les Phases Éliminatoires
                    </button>
                    <button id="resetAllEliminationPhasesBtn"
                            class="bg-red-600 text-white py-2 px-4 rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 shadow-md transition ease-in-out duration-150">
                        Réinitialiser toutes les Phases
                    </button>
                </div>
                <p id="eliminationMessage" class="mt-3 text-sm text-center"></p>
            </section>

            <div id="eliminationBracketsDisplay" class="space-y-8 mt-8">
                <p class="text-gray-500 text-center">Cliquez sur "Générer les Phases Éliminatoires" pour afficher les tournois.</p>
            </div>
        `;
        setupEliminatoiresPageLogic();
    }

    function setupEliminatoiresPageLogic() {
        const eliminationBracketsDisplay = document.getElementById('eliminationBracketsDisplay');
        const eliminationMessage = document.getElementById('eliminationMessage'); // Not used directly
        const generateEliminationPhasesBtn = document.getElementById('generateEliminationPhasesBtn');
        const resetAllEliminationPhasesBtn = document.getElementById('resetAllEliminationPhasesBtn');
        // NOUVEAU: Bouton pour accéder à la sélection des équipes éliminées
        const goToEliminationSelectionBtn = document.getElementById('goToEliminationSelectionBtn');


        /**
         * Generates options for a score select dropdown (0 to maxScore).
         * @param {number} maxScore The maximum score to include.
         * @param {number|null} selectedValue The current selected value, or null.
         * @returns {string} HTML string for select options.
         */
        function generateScoreOptions(maxScore, selectedValue) {
            let options = '<option value="">-</option>'; // Default empty option
            for (let i = 0; i <= maxScore; i++) {
                options += `<option value="${i}" ${selectedValue === i ? 'selected' : ''}>${i}</option>`;
            }
            return options;
        }

        function getTeamsGroupedBySecondaryPhase() {
            // Find the latest 'elimination_seeding' phase
            const latestEliminationSeedingPhase = allBrassagePhases
                .filter(p => p.type === PHASE_TYPE_ELIMINATION_SEEDING)
                .sort((a, b) => b.timestamp - a.timestamp)[0];

            if (latestEliminationSeedingPhase && latestEliminationSeedingPhase.groupedTeams) {
                console.log("DEBUG: Secondary ranking phases found:", latestEliminationSeedingPhase.groupedTeams);
                return latestEliminationSeedingPhase.groupedTeams;
            } else {
                showToast("Aucune phase de classement secondaire (Principale, Consolante, Super Consolante) n'a été validée sur la page 'Brassages'. Veuillez les générer et les valider d'abord.", "error");
                return null;
            }
        }

        /**
         * Determines the round name based on the number of TEAMS in the round.
         * This is more logical for tournament naming (e.g., "8th Final" means 8 matches, 16 teams)
         * @param {number} numTeamsInRound The number of teams starting this round.
         * @returns {string} The round name.
         */
        function getRoundNameFromTeamsCount(numTeamsInRound) {
            if (numTeamsInRound === 2) return 'Finale';
            if (numTeamsInRound === 4) return 'Demi-Finales';
            if (numTeamsInRound === 8) return 'Quart de Finale';
            if (numTeamsInRound === 16) return '8ème de Finale';
            if (numTeamsInRound === 32) return '16ème de Finale';
            if (numTeamsInRound === 64) return '32ème de Finale';
            // Fallback for non-standard power of 2 initial rounds (e.g., if byes were handled by having some teams auto-advance)
            return `Tour Éliminatoire (${numTeamsInRound} équipes)`; // Generic fallback
        }


        function generateBracketData(teams, groupType) {
            // NOUVEAU: Filtrer les équipes éliminées avant de générer le bracket
            const eligibleTeamsInGroup = teams.filter(team => !eliminatedTeams.has(team.id));

            if (eligibleTeamsInGroup.length < 2) {
                return { rounds: [], message: `Pas assez d'équipes éligibles dans le groupe ${groupType} pour un tournoi à élimination (${eligibleTeamsInGroup.length} équipe(s) restante(s)).` };
            }

            let currentParticipants = [...eligibleTeamsInGroup]; // Teams currently in play for this bracket
            let rounds = []; // Array to store all generated rounds

            // Sort initial teams based on their global ranking for seeding
            currentParticipants.sort((a, b) => {
                const pointsA = a.totalPoints || 0;
                const pointsB = b.totalPoints || 0;
                const diffA = a.totalDiffScore || 0;
                const diffB = b.totalDiffScore || 0;

                if (pointsB !== pointsA) return pointsB - pointsA;
                if (diffB !== diffA) return diffB - diffA;
                return a.name.localeCompare(b.name); // Secondary sort by name for tie-breaking
            });

            // Calculate the nearest power of 2 for the bracket size
            let bracketSize = 2;
            while (bracketSize < currentParticipants.length) {
                bracketSize *= 2;
            }

            const numberOfByes = bracketSize - currentParticipants.length;

            let teamsAdvancingToNextRound = []; // Will hold winners and bye teams

            // Handle initial byes if any
            if (numberOfByes > 0) {
                // Top ranked teams get byes
                const byeTeams = currentParticipants.slice(0, numberOfByes);
                teamsAdvancingToNextRound.push(...byeTeams.map(team => ({
                    id: team.id,
                    name: team.name,
                    isBye: true // Mark as a bye team for later identification
                })));
                currentParticipants = currentParticipants.slice(numberOfByes); // Remaining teams will play
            }

            // Create initial matches for teams that actually play in Round 1
            let roundMatches = [];
            let currentRoundPlayers = [...currentParticipants]; // Teams actively playing in this round

            for (let i = 0; i < Math.ceil(currentRoundPlayers.length / 2); i++) {
                const team1 = currentRoundPlayers[i];
                const team2 = currentRoundPlayers[currentRoundPlayers.length - 1 - i]; // Serpentine seeding

                if (team1 && team2) {
                    roundMatches.push({
                        id: `elim_match_${groupType}_R0_M${roundMatches.length}`,
                        team1: team1,
                        team2: team2,
                        score1: null,
                        score2: null,
                        winnerId: null,
                        loserId: null,
                        nextMatchId: null // To be filled later
                    });
                }
            }

            if (roundMatches.length > 0) {
                rounds.push({ roundName: getRoundNameFromTeamsCount(currentRoundPlayers.length), matches: roundMatches });
            }


            let prevRoundMatches = roundMatches; // This refers to the actual matches played in the first round (if any)
            let roundIdx = 1; // Start counting from Round 1 for subsequent rounds

            // Loop to generate subsequent rounds
            while (true) {
                let teamsForNextRound = [];
                // Add teams that got a bye in the *previous* logical step (only applies if first round had byes)
                if (roundIdx === 1 && numberOfByes > 0) {
                    teamsForNextRound.push(...teamsAdvancingToNextRound); // These are the initial bye teams
                }

                // Collect winners from the *previous* actual playing round
                prevRoundMatches.forEach(match => {
                    if (match.winnerId) {
                        teamsForNextRound.push(allTeams.find(t => t.id === match.winnerId) || match.team1 || match.team2);
                    } else {
                        // If winner is not determined, add placeholder to ensure bracket structure
                        teamsForNextRound.push({ id: null, name: 'À déterminer' });
                    }
                });

                if (teamsForNextRound.length <= 1) { // Stop if only one winner or no more teams
                    break;
                }

                // Sort teams for this round's pairing (might not be needed if previous propagation was perfect, but for robustness)
                // However, for single elimination, after the initial seeding, subsequent pairings are determined by bracket position, not re-ranking.
                // So, no re-sort here based on total points. The order comes from previous matches.

                let nextRoundMatches = [];
                const numMatchesInThisRound = Math.floor(teamsForNextRound.length / 2);

                for (let i = 0; i < numMatchesInThisRound; i++) {
                    const team1 = teamsForNextRound[i];
                    const team2 = teamsForNextRound[teamsForNextRound.length - 1 - i];

                    const match = {
                        id: `elim_match_${groupType}_R${roundIdx}_M${i}`,
                        team1: team1,
                        team2: team2,
                        score1: null,
                        score2: null,
                        winnerId: null,
                        loserId: null,
                        prevMatch1Id: prevRoundMatches[i*2] ? prevRoundMatches[i*2].id : null, // Link to previous matches
                        prevMatch2Id: prevRoundMatches[i*2 + 1] ? prevRoundMatches[i*2 + 1].id : null,
                        nextMatchId: null
                    };
                    nextRoundMatches.push(match);

                    // Update `nextMatchId` for previous matches
                    if (prevRoundMatches[i*2]) prevRoundMatches[i*2].nextMatchId = match.id;
                    if (prevRoundMatches[i*2 + 1]) prevRoundMatches[i*2 + 1].nextMatchId = match.id;
                }

                rounds.push({ roundName: getRoundNameFromTeamsCount(teamsForNextRound.length), matches: nextRoundMatches });
                prevRoundMatches = nextRoundMatches;
                roundIdx++;

                if (nextRoundMatches.length === 1) { // If only one match left, it's the final. Stop.
                    break;
                }
            }

            // Add Petite Finale (3rd place match)
            const semiFinalRound = rounds.find(r => r.roundName === 'Demi-Finales');
            if (semiFinalRound && semiFinalRound.matches.length === 2) {
                const petiteFinaleMatch = {
                    id: `elim_match_petite_finale_${groupType}`,
                    roundName: 'Petite Finale', // Add roundName here for easier identification in propagateWinnerLoser
                    team1: { id: null, name: 'À déterminer' }, // Use generic placeholder
                    team2: { id: null, name: 'À déterminer' }, // Use generic placeholder
                    score1: null,
                    score2: null,
                    winnerId: null,
                    loserId: null,
                    // These correctly store the IDs of the semi-final matches that will produce the losers
                    prevMatch1LoserId: semiFinalRound.matches[0].id,
                    prevMatch2LoserId: semiFinalRound.matches[1].id
                };
                rounds.push({ roundName: 'Petite Finale', matches: [petiteFinaleMatch] });
            }

            return {
                id: `elim_bracket_${groupType}`,
                groupType: groupType,
                timestamp: Date.now(),
                bracket: rounds
            };
        }

		function renderBracket(bracketData, containerElement) {
            if (!bracketData || !bracketData.bracket || bracketData.bracket.length === 0) {
                containerElement.innerHTML = `<p class="text-gray-500 text-center">Aucun tournoi à afficher pour le groupe ${escapeHtml(bracketData.groupType || '')}.</p>`;
                return;
            }

            containerElement.innerHTML = `
                <h3 class="2xl font-semibold text-gray-700 mb-4 text-center">Tournoi ${escapeHtml(bracketData.groupType)}</h3>
                <div class="flex flex-col sm:flex-row justify-center gap-4 p-4 bg-white rounded-lg shadow-md overflow-x-auto">
                    </div>
                <div class="text-center mt-4">
                    <button class="reset-group-btn bg-yellow-500 text-white py-1 px-3 rounded-md hover:bg-yellow-600 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:ring-offset-2 shadow-sm text-sm">
                        Réinitialiser ce groupe
                    </button>
                </div>
            `;
            const bracketContainer = containerElement.querySelector('.flex.flex-col.sm\\:flex-row');

            bracketData.bracket.forEach((round, roundIndex) => {
                const roundDiv = document.createElement('div');
                roundDiv.className = 'bracket-round flex flex-col items-center p-2 border border-gray-100 rounded-lg';
                roundDiv.innerHTML = `<h4 class="font-bold text-lg text-gray-800 mb-4">${escapeHtml(round.roundName)}</h4>`;

                round.matches.forEach(match => {
                    const matchFrame = document.createElement('div');
                    matchFrame.className = 'match-frame bg-gray-50 border border-gray-300 rounded-lg p-3 mb-4 shadow-sm w-full'; // Cadran pour le match
                    matchFrame.dataset.matchId = match.id;

                    let team1Name = escapeHtml(match.team1 ? match.team1.name : 'N/A');
                    let team2Name = escapeHtml(match.team2 ? match.team2.name : 'N/A');
                    let team1Class = 'team-name';
                    let team2Class = 'team-name';
                    let inputDisabled = false;

                    // Disable input if teams are placeholders (BYE, To be determined)
                    if (!match.team1 || match.team1.id === null || match.team1.id === 'BYE' ||
                        !match.team2 || match.team2.id === null || match.team2.id === 'BYE') {
                        inputDisabled = true;
                    }


                    // For BYE teams, ensure scores are 0 for display consistency
                    if (match.team1 && match.team1.id === 'BYE') match.score1 = 0;
                    if (match.team2 && match.team2.id === 'BYE') match.score2 = 0;

                    if (match.winnerId) {
                        if (match.winnerId === (match.team1 ? match.team1.id : null)) {
                            team1Class += ' winner-team';
                            team2Class += ' loser-team';
                        } else if (match.winnerId === (match.team2 ? match.team2.id : null)) {
                            team2Class += ' winner-team';
                            team1Class += ' loser-team';
                        }
                    }

                    matchFrame.innerHTML = `
                        <div class="match-teams w-full text-center">
                            <div class="${team1Class}">${team1Name}</div>
                            <div class="flex items-center justify-center gap-2 mt-1">
                                <select data-match-id="${match.id}" data-team="1" class="team-score-select score-input w-20 p-1 border border-gray-300 rounded-md text-center text-sm" ${inputDisabled ? 'disabled' : ''}>
                                    ${generateScoreOptions(40, match.score1)}
                                </select>
                                <span class="font-bold text-gray-700">-</span>
                                <select data-match-id="${match.id}" data-team="2" class="team-score-select score-input w-20 p-1 border border-gray-300 rounded-md text-center text-sm" ${inputDisabled ? 'disabled' : ''}>
                                    ${generateScoreOptions(40, match.score2)}
                                </select>
                            </div>
                            <div class="${team2Class}">${team2Name}</div>
                        </div>
                    `;
                    roundDiv.appendChild(matchFrame);
                });
                bracketContainer.appendChild(roundDiv);
            });

            containerElement.querySelectorAll('.match-frame .score-input').forEach(select => {
                select.addEventListener('change', updateMatchScoreAndWinner);
            });
        }

        function updateMatchScoreAndWinner(event) {
            const matchId = event.target.dataset.matchId;
            const teamNum = event.target.dataset.team;
            let score = parseInt(event.target.value);

            if (isNaN(score)) {
                score = null;
            }

            let targetBracket = null;
            let targetMatch = null;

            for (const groupType in eliminationPhases) {
                const bracket = eliminationPhases[groupType];
                for (const round of bracket.bracket) {
                    for (const match of round.matches) {
                        if (match.id === matchId) {
                            targetBracket = bracket;
                            targetMatch = match;
                            break;
                        }
                    }
                    if (targetMatch) break;
                }
                if (targetMatch) break;
            }

            if (!targetMatch) {
                console.error(`Match with ID ${matchId} not found.`);
                return;
            }

            // Prevent score entry if teams are placeholders (BYE, To be determined)
            if ((!targetMatch.team1 || targetMatch.team1.id === null || targetMatch.team1.id === 'BYE') ||
                (!targetMatch.team2 || targetMatch.team2.id === null || targetMatch.team2.id === 'BYE')) {
                showToast("Ce match est un BYE ou ses équipes ne sont pas encore déterminées. Les scores ne peuvent pas être saisis.", "error");
                event.target.value = (teamNum === '1' ? targetMatch.score1 : targetMatch.score2) || ''; // Reset input to saved value or empty
                return;
            }


            if (teamNum === '1') {
                targetMatch.score1 = score;
            } else {
                targetMatch.score2 = score;
            }

            targetMatch.winnerId = null;
            targetMatch.loserId = null;

            if (targetMatch.score1 !== null && targetMatch.score2 !== null && targetMatch.score1 >= 0 && targetMatch.score2 >= 0) {
                if (targetMatch.score1 > targetMatch.score2) {
                    targetMatch.winnerId = targetMatch.team1.id;
                    targetMatch.loserId = targetMatch.team2.id;
                } else if (targetMatch.score2 > targetMatch.score1) {
                    targetMatch.winnerId = targetMatch.team2.id;
                    targetMatch.loserId = targetMatch.team1.id;
                } else {
                    showToast("Un match ne peut pas être un match nul. Veuillez entrer un vainqueur.", "error");
                }
            }

            saveAllData(); // Sauve les données, cela déclenchera le re-rendu de l'UI

            // Visually update winner/loser classes
            const matchElement = document.querySelector(`[data-match-id="${matchId}"]`);
            if (matchElement) {
                const team1NameSpan = matchElement.querySelector('.team-name:first-of-type');
                const team2NameSpan = matchElement.querySelector('.team-name:last-of-type');

                team1NameSpan.classList.remove('winner-team', 'loser-team');
                team2NameSpan.classList.remove('winner-team', 'loser-team');

                if (targetMatch.winnerId === (targetMatch.team1 ? targetMatch.team1.id : null)) {
                    team1NameSpan.classList.add('winner-team');
                    team2NameSpan.classList.add('loser-team');
                } else if (targetMatch.winnerId === (targetMatch.team2 ? targetMatch.team2.id : null)) {
                    team2Span.classList.add('winner-team');
                    team1NameSpan.classList.add('loser-team');
                }
            }

            propagateWinnerLoser(targetMatch.id, targetMatch.winnerId, targetMatch.loserId, targetBracket);

            // Re-render the specific bracket to update dynamic team names in next rounds
            renderBracket(targetBracket, document.getElementById(targetBracket.groupType.toLowerCase() + 'Bracket'));

            if (targetMatch.winnerId) {
                showToast(`Score pour ${escapeHtml(targetMatch.team1.name)} vs ${escapeHtml(targetMatch.team2.name)} mis à jour et vainqueur déterminé !`, "success");
            } else {
                showToast("Saisie du score en cours...", "info");
            }
        }

        function propagateWinnerLoser(sourceMatchId, winnerId, loserId, bracket) {
            const sourceMatch = bracket.bracket.flatMap(r => r.matches).find(m => m.id === sourceMatchId);
            if (!sourceMatch) return;

            // Get the actual team objects based on IDs
            const winningTeamObject = allTeams.find(t => t.id === winnerId) || { id: winnerId, name: 'À déterminer' };
            const losingTeamObject = allTeams.find(t => t.id === loserId) || { id: loserId, name: 'À déterminer' };

            bracket.bracket.forEach(round => {
                round.matches.forEach(match => {
                    // Standard propagation for winners to next round
                    if (match.prevMatch1Id === sourceMatchId) {
                        match.team1 = { ...winningTeamObject };
                        // Clear scores if a new team is propagated into this slot (from placeholder or previous winner)
                        // Only reset if both teams are now "real" and scores are already set or placeholder
                        if (match.team1.id && match.team2?.id && match.team1.id !== 'À déterminer' && match.team2.id !== 'À déterminer' && match.team1.id !== 'BYE' && match.team2.id !== 'BYE') {
                           if (match.score1 !== null || match.score2 !== null || match.winnerId !== null) { // if scores exist, reset them
                                match.score1 = null;
                                match.score2 = null;
                                match.winnerId = null;
                                match.loserId = null;
                           }
                        }
                    }
                    if (match.prevMatch2Id === sourceMatchId) {
                        match.team2 = { ...winningTeamObject };
                        // Clear scores if a new team is propagated into this slot
                        if (match.team1.id && match.team2?.id && match.team1.id !== 'À déterminer' && match.team2.id !== 'À déterminer' && match.team1.id !== 'BYE' && match.team2.id !== 'BYE') {
                           if (match.score1 !== null || match.score2 !== null || match.winnerId !== null) { // if scores exist, reset them
                                match.score1 = null;
                                match.score2 = null;
                                match.winnerId = null;
                                match.loserId = null;
                           }
                        }
                    }

                    // *** LOGIQUE CORRIGÉE POUR LA PETITE FINALE ***
                    // Si le match actuel est la "Petite Finale"
                    if (match.roundName === 'Petite Finale') {
                        // Chercher les matchs de demi-finale correspondant aux prevMatchLoserId
                        const semiFinalMatch1 = bracket.bracket.flatMap(r => r.matches).find(m => m.id === match.prevMatch1LoserId);
                        const semiFinalMatch2 = bracket.bracket.flatMap(r => r.matches).find(m => m.id === match.prevMatch2LoserId);

                        // Si le match source est la demi-finale 1 et qu'elle a un perdant
                        if (sourceMatch.id === semiFinalMatch1?.id && semiFinalMatch1.loserId) {
                            const actualLoserTeam = allTeams.find(t => t.id === semiFinalMatch1.loserId);
                            if (actualLoserTeam) {
                                match.team1 = { id: actualLoserTeam.id, name: actualLoserTeam.name };
                                // Reset score if one team is updated to a real team from a placeholder
                                if (match.team1.id && match.team2?.id && (match.score1 !== null || match.score2 !== null || match.winnerId !== null)) {
                                    match.score1 = null;
                                    match.score2 = null;
                                    match.winnerId = null;
                                    match.loserId = null;
                                }
                            }
                        }
                        // Si le match source est la demi-finale 2 et qu'elle a un perdant
                        if (sourceMatch.id === semiFinalMatch2?.id && semiFinalMatch2.loserId) {
                            const actualLoserTeam = allTeams.find(t => t.id === semiFinalMatch2.loserId);
                            if (actualLoserTeam) {
                                match.team2 = { id: actualLoserTeam.id, name: actualLoserTeam.name };
                                // Reset score if one team is updated to a real team from a placeholder
                                if (match.team1?.id && match.team2.id && (match.score1 !== null || match.score2 !== null || match.winnerId !== null)) {
                                    match.score1 = null;
                                    match.score2 = null;
                                    match.winnerId = null;
                                    match.loserId = null;
                                }
                            }
                        }
                    }
                });
            });
            saveAllData(); // Sauve les données, cela déclenchera le re-rendu de l'UI
        }

        function generateAllEliminationPhases() {
            // Suppression de la condition isGuestMode ici, car l'action est maintenant autorisée
            eliminationBracketsDisplay.innerHTML = '';
            showToast("Génération des tournois éliminatoires...", "info");

            const groupedTeams = getTeamsGroupedBySecondaryPhase();
            if (!groupedTeams) {
                return;
            }

            eliminationPhases = {}; // Clear existing elimination phases for a fresh generation

            const orderedGroupTypes = ["Principale", "Consolante", "Super Consolante"];

            orderedGroupTypes.forEach(groupType => {
                const teamsInGroup = groupedTeams[groupType];
                if (teamsInGroup) { // Ensure the group exists
                    const bracketData = generateBracketData(teamsInGroup, groupType);
                    if (bracketData.bracket.length > 0) {
                        eliminationPhases[groupType] = bracketData;

                        const groupContainer = document.createElement('div');
                        groupContainer.id = groupType.toLowerCase() + 'Bracket';
                        groupContainer.className = 'bg-white p-4 rounded-lg shadow-xl';
                        eliminationBracketsDisplay.appendChild(groupContainer);
                        renderBracket(bracketData, groupContainer);
                    } else {
                        const messageDiv = document.createElement('div');
                        messageDiv.className = 'bg-white p-4 rounded-lg shadow-md text-center text-gray-500';
                        // Use bracketData.message if available, otherwise a generic message
                        messageDiv.textContent = bracketData.message || `Pas assez d'équipes éligibles dans le groupe ${escapeHtml(groupType)} pour générer un tournoi à élimination.`;
                        eliminationBracketsDisplay.appendChild(messageDiv);
                    }
                } else { // Group doesn't exist in currentSecondaryGroupsPreview
                     const messageDiv = document.createElement('div');
                    messageDiv.className = 'bg-white p-4 rounded-lg shadow-md text-center text-gray-500';
                    messageDiv.textContent = `Le groupe "${escapeHtml(groupType)}" n'est pas configuré.`;
                    eliminationBracketsDisplay.appendChild(messageDiv);
                }
            });

            saveAllData(); // Sauve les données, cela déclenchera le re-rendu de l'UI
            showToast("Phases éliminatoires générées avec succès !", "success");
        }

        function resetAllEliminationPhases() {
            // Suppression de la condition isGuestMode ici, car l'action est maintenant autorisée
            const messageContent = document.createElement('p');
            messageContent.textContent = "Êtes-vous sûr de vouloir réinitialiser TOUTES les phases éliminatoires ? Cette action est irréversible.";
            messageContent.className = 'text-gray-700';

            showModal('Confirmer la réinitialisation complète', messageContent, () => {
                eliminationPhases = {};
                saveAllData(); // Sauve les données, cela déclenchera le re-rendu de l'UI
                eliminationBracketsDisplay.innerHTML = '<p class="text-gray-500 text-center">Cliquez sur "Générer les Phases Éliminatoires" pour afficher les tournois.</p>';
                showToast("Toutes les phases éliminatoires ont été réinitialisées.", "success");
            }, true);
        }

        function resetGroupEliminationPhase(groupType) {
            // Suppression de la condition isGuestMode ici, car l'action est maintenant autorisée
            const messageContent = document.createElement('p');
            messageContent.textContent = `Êtes-vous sûr de vouloir réinitialiser la phase éliminatoire pour le groupe "${escapeHtml(groupType)}" ? Cette action est irréversible.`;
            messageContent.className = 'text-gray-700';

            showModal(`Confirmer la réinitialisation du groupe ${escapeHtml(groupType)}`, messageContent, () => {
                const groupedTeams = getTeamsGroupedBySecondaryPhase();
                if (groupedTeams && groupedTeams[groupType]) { // Check if the group exists in groupedTeams
                    // NOUVEAU: Filtrer les équipes éliminées
                    const eligibleTeamsInGroup = groupedTeams[groupType].filter(team => !eliminatedTeams.has(team.id));

                    if (eligibleTeamsInGroup.length >= 2) {
                        const newBracketData = generateBracketData(eligibleTeamsInGroup, groupType);
                        eliminationPhases[groupType] = newBracketData;
                        saveAllData(); // Sauve les données, cela déclenchera le re-rendu de l'UI
                        renderBracket(newBracketData, document.getElementById(groupType.toLowerCase() + 'Bracket'));
                        showToast(`Phase éliminatoire pour le groupe "${escapeHtml(groupType)}" réinitialisée.`, "success");
                    } else {
                        showToast(`Impossible de réinitialiser le groupe "${escapeHtml(groupType)}" : pas assez d'équipes éligibles (${eligibleTeamsInGroup.length} restante(s)) ou données manquantes.`, "error");
                        const groupContainer = document.getElementById(groupType.toLowerCase() + 'Bracket');
                        if (groupContainer) {
                             groupContainer.innerHTML = `<p class="text-gray-500 text-center">Aucun tournoi à afficher pour le groupe ${escapeHtml(groupType)}.</p>`;
                        }
                    }
                } else {
                     showToast(`Impossible de réinitialiser le groupe "${escapeHtml(groupType)}" : groupe non configuré.`, "error");
                }
            }, true);
        }

        // Initial rendering logic for the elimination page
        if (Object.keys(eliminationPhases).length > 0) {
            eliminationBracketsDisplay.innerHTML = '';
            const orderedGroupTypes = ["Principale", "Consolante", "Super Consolante"];
            orderedGroupTypes.forEach(groupType => {
                const bracketData = eliminationPhases[groupType];
                if (bracketData) {
                    const groupContainer = document.createElement('div');
                    groupContainer.id = groupType.toLowerCase() + 'Bracket';
                    groupContainer.className = 'bg-white p-4 rounded-lg shadow-xl';
                    eliminationBracketsDisplay.appendChild(groupContainer);
                    renderBracket(bracketData, groupContainer);
                } else {
                     const messageDiv = document.createElement('div');
                    messageDiv.className = 'bg-white p-4 rounded-lg shadow-md text-center text-gray-500';
                    messageDiv.textContent = `Le groupe "${escapeHtml(groupType)}" n'a aucun tournoi enregistré.`;
                    eliminationBracketsDisplay.appendChild(messageDiv);
                }
            });
            showToast("Phases éliminatoires chargées depuis la sauvegarde.", "info");
        } else {
            eliminationBracketsDisplay.innerHTML = '<p class="text-gray-500 text-center">Cliquez sur "Générer les Phases Éliminatoires" pour afficher les tournois.</p>';
        }

        generateEliminationPhasesBtn.addEventListener('click', generateAllEliminationPhases);
        resetAllEliminationPhasesBtn.addEventListener('click', resetAllEliminationPhases);
        // NOUVEAU: Écouteur pour le bouton de sélection des équipes éliminées
        goToEliminationSelectionBtn.addEventListener('click', () => {
            window.location.hash = '#elimination-selection';
        });

        eliminationBracketsDisplay.addEventListener('click', (event) => {
            if (event.target.classList.contains('reset-group-btn')) {
                const groupType = event.target.dataset.groupType;
                resetGroupEliminationPhase(groupType);
            }
        });
    }

    function renderClassementsPage() {
        APP_CONTAINER.innerHTML = `
            <h1 class="text-3xl font-bold text-center text-gray-800 mb-8">Classements du Tournoi</h1>

            <section class="mb-8 p-6 bg-gray-50 rounded-lg border border-gray-200">
                <h2 class="text-2xl font-semibold text-gray-700 mb-4">Classement Général des Équipes</h2>
                <p class="text-gray-600 mb-4">Ce classement est basé sur les points accumulés et la différence de score de toutes les phases de brassage (initiales et secondaires).</p>

                <div id="rankingsDisplay" class="overflow-x-auto rounded-lg shadow-sm border border-gray-200">
                    <table class="min-w-full divide-y divide-gray-200">
                        <thead class="bg-gray-100">
                            <tr>
                                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider rounded-tl-lg">Rang</th>
                                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nom de l'équipe</th>
                                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Points Totaux</th>
                                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider rounded-tr-lg">Diff. Score Totale</th>
                            </tr>
                        </thead>
                        <tbody id="rankingsTableBody" class="bg-white divide-y divide-gray-200">
                            <tr>
                                <td colspan="4" class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-center">
                                    Aucune donnée de classement disponible. Générez et complétez les phases de brassage.
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <p id="rankingsMessage" class="mt-3 text-sm text-center text-gray-600"></p>
            </section>

            <section class="p-6 bg-gray-50 rounded-lg border border-gray-200">
                <h2 class="text-2xl font-semibold text-gray-700 mb-4">Détails des Scores par Phase de Brassage</h2>
                <div class="mb-4 flex items-center justify-start space-x-2">
                    <input type="checkbox" id="togglePhaseDetails" class="form-checkbox h-4 w-4 text-blue-600">
                    <label for="togglePhaseDetails" class="text-gray-700 text-sm">Afficher les détails par phase</label>
                </div>
                <div id="phaseDetailsDisplay" class="space-y-6">
                    <p class="text-gray-500 text-center">Activez "Afficher les détails par phase" pour voir les scores par phase.</p>
                </div>
            </section>
        `;
        setupClassementsPageLogic();
    }
	// Part 5 sur 5 (script.js) - Corrigée

    function setupClassementsPageLogic() {
        const rankingsTableBody = document.getElementById('rankingsTableBody');
        const rankingsMessage = document.getElementById('rankingsMessage');
        const togglePhaseDetailsCheckbox = document.getElementById('togglePhaseDetails');
        const phaseDetailsDisplay = document.getElementById('phaseDetailsDisplay');

        function renderRankings() {
            const globalRankings = getGlobalRankings(allTeams, allBrassagePhases);

            if (globalRankings.length === 0) {
                rankingsTableBody.innerHTML = `
                    <tr>
                        <td colspan="4" class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-center">
                            Aucune donnée de classement disponible. Générez et complétez les phases de brassage.
                        </td>
                    </tr>
                `;
                rankingsMessage.textContent = "Aucune équipe classée pour le moment.";
                return;
            }

            rankingsTableBody.innerHTML = globalRankings.map((rankEntry, index) => {
                const teamName = escapeHtml(rankEntry.teamObject.name);
                const isEliminated = eliminatedTeams.has(rankEntry.teamObject.id);
                const teamClass = isEliminated ? 'line-through text-red-600' : 'text-gray-900';
                const eliminatedText = isEliminated ? ' (Éliminée)' : '';

                return `
                    <tr>
                        <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${index + 1}</td>
                        <td class="px-6 py-4 whitespace-nowrap text-sm ${teamClass}">${teamName}${eliminatedText}</td>
                        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${rankEntry.totalPoints}</td>
                        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${rankEntry.totalDiffScore}</td>
                    </tr>
                `;
            }).join('');

            rankingsMessage.textContent = `Classement général des ${globalRankings.length} équipes.`;

            renderPhaseDetailsSection(globalRankings);
        }

        function renderPhaseDetailsSection(globalRankings) {
            phaseDetailsDisplay.innerHTML = '';
            if (!togglePhaseDetailsCheckbox.checked) {
                phaseDetailsDisplay.innerHTML = '<p class="text-gray-500 text-center">Activez "Afficher les détails par phase" pour voir les scores par phase.</p>';
                return;
            }

            const relevantPhases = allBrassagePhases.filter(p => p.type === PHASE_TYPE_INITIAL || p.type === PHASE_TYPE_SECONDARY_BRASSAGE);

            if (relevantPhases.length === 0) {
                phaseDetailsDisplay.innerHTML = '<p class="text-gray-500 text-center">Aucune phase de brassage avec des détails à afficher.</p>';
                return;
            }

            // Sort phases by timestamp to display chronologically
            relevantPhases.sort((a, b) => a.timestamp - b.timestamp);

            relevantPhases.forEach(phase => {
                const phaseDiv = document.createElement('div');
                phaseDiv.className = 'bg-white p-4 rounded-lg shadow-md border border-gray-200';
                phaseDiv.innerHTML = `
                    <h3 class="text-xl font-semibold text-gray-800 mb-3">${escapeHtml(phase.name)}</h3>
                    <div class="overflow-x-auto">
                        <table class="min-w-full divide-y divide-gray-200">
                            <thead class="bg-gray-50">
                                <tr>
                                    <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Équipe</th>
                                    <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Points</th>
                                    <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Diff. Score</th>
                                </tr>
                            </thead>
                            <tbody class="bg-white divide-y divide-gray-200">
                                </tbody>
                        </table>
                    </div>
                `;
                const tbody = phaseDiv.querySelector('tbody');

                // Filter teams that actually participated in this phase
                const teamsInPhase = globalRankings.filter(rankEntry => rankEntry.detailsByPhase[phase.id]);

                if (teamsInPhase.length === 0) {
                    tbody.innerHTML = `
                        <tr>
                            <td colspan="3" class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-center">
                                Aucune équipe n'a participé ou n'a de score dans cette phase.
                            </td>
                        </tr>
                    `;
                } else {
                    // Sort teams within this phase by their performance in THIS phase
                    teamsInPhase.sort((a, b) => {
                        const statsA = a.detailsByPhase[phase.id] || { points: 0, diffScore: 0 };
                        const statsB = b.detailsByPhase[phase.id] || { points: 0, diffScore: 0 };
                        if (statsB.points !== statsA.points) return statsB.points - statsA.points;
                        return statsB.diffScore - statsA.diffScore;
                    });

                    tbody.innerHTML = teamsInPhase.map(rankEntry => {
                        const stats = rankEntry.detailsByPhase[phase.id] || { points: 0, diffScore: 0 };
                        const teamName = escapeHtml(rankEntry.teamObject.name);
                        return `
                            <tr>
                                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${teamName}</td>
                                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${stats.points}</td>
                                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${stats.diffScore}</td>
                            </tr>
                        `;
                    }).join('');
                }
                phaseDetailsDisplay.appendChild(phaseDiv);
            });
        }

        togglePhaseDetailsCheckbox.addEventListener('change', renderPhaseDetailsSection.bind(null, getGlobalRankings(allTeams, allBrassagePhases)));

        renderRankings(); // Initial render
    }

    /**
     * Affiche le tableau de bord des tournois (créer/sélectionner).
     */
    function renderTournamentDashboard() {
        // Only show this page if logged in. In guest mode, we don't manage multiple tournaments.
        if (isGuestMode) {
            window.location.hash = '#home'; // Redirect to home page if guest mode
            return;
        }
        APP_CONTAINER.innerHTML = `
            <div class="max-w-4xl mx-auto bg-white p-8 rounded-lg shadow-md mt-10">
                <h1 class="text-3xl font-bold text-center text-gray-800 mb-6">Mes Tournois</h1>

                <section class="mb-8 p-6 bg-gray-50 rounded-lg border border-gray-200">
                    <h2 class="text-2xl font-semibold text-gray-700 mb-4">Créer un Nouveau Tournoi</h2>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
                        <div>
                            <label for="newTournamentName" class="block text-sm font-medium text-gray-700 mb-1">Nom du Tournoi</label>
                            <input type="text" id="newTournamentName" placeholder="Nom du tournoi"
                                   class="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 shadow-sm">
                        </div>
                        <div>
                            <label for="newTournamentDate" class="block text-sm font-medium text-gray-700 mb-1">Date du Tournoi</label>
                            <input type="date" id="newTournamentDate"
                                   class="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 shadow-sm">
                        </div>
                        <div class="md:col-span-2">
                            <label for="newTournamentNumTeams" class="block text-sm font-medium text-gray-700 mb-1">Nombre d'équipes prévues</label>
                            <input type="number" id="newTournamentNumTeams" min="2" value="10" placeholder="Nombre d'équipes"
                                   class="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 shadow-sm">
                        </div>
                        <div class="md:col-span-2">
                            <button id="createTournamentBtn"
                                    class="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 shadow-md transition ease-in-out duration-150">
                                Créer le Tournoi
                            </button>
                        </div>
                    </div>
                    <p id="createTournamentMessage" class="mt-3 text-sm text-center"></p>
                </section>

                <section class="p-6 bg-gray-50 rounded-lg border border-gray-200">
                    <h2 class="text-2xl font-semibold text-gray-700 mb-4">Sélectionner un Tournoi Existant</h2>
                    <div id="tournamentsList" class="space-y-4">
                        <p class="text-gray-500 text-center">Aucun tournoi disponible. Créez-en un nouveau !</p>
                    </div>
                </section>
            </div>
        `;
        setupTournamentDashboardLogic();
    }

/**
     * Affiche une modale pour éditer les détails d'un tournoi.
     * @param {object} tournament Le tournoi à modifier.
     */
    function showEditTournamentModal(tournament) {
        const formDiv = document.createElement('div');
        const currentTeamCount = tournament.allTeams ? tournament.allTeams.length : 0;

        formDiv.innerHTML = `
            <div class="space-y-4">
                <div>
                    <label for="editTournamentName" class="block text-sm font-medium text-gray-700">Nom du Tournoi</label>
                    <input type="text" id="editTournamentName" class="mt-1 w-full p-2 border rounded-md" value="${escapeHtml(tournament.name)}">
                </div>
                <div>
                    <label for="editTournamentDate" class="block text-sm font-medium text-gray-700">Date</label>
                    <input type="date" id="editTournamentDate" class="mt-1 w-full p-2 border rounded-md" value="${escapeHtml(tournament.date)}">
                </div>
                <div>
                    <label for="editNumTeamsAllowed" class="block text-sm font-medium text-gray-700">Nombre d'équipes maximum</label>
                    <input type="number" id="editNumTeamsAllowed" min="${currentTeamCount}" class="mt-1 w-full p-2 border rounded-md" value="${escapeHtml(tournament.numTeamsAllowed || currentTeamCount)}">
                    <p class="text-xs text-gray-500 mt-1">Ne peut pas être inférieur au nombre d'équipes déjà inscrites (${currentTeamCount}).</p>
                </div>
            </div>
        `;
        
        showModal(`Modifier le tournoi "${escapeHtml(tournament.name)}"`, formDiv, () => {
            const newName = document.getElementById('editTournamentName').value.trim();
            const newDate = document.getElementById('editTournamentDate').value;
            const newNumTeams = parseInt(document.getElementById('editNumTeamsAllowed').value);
            
            updateTournamentDetails(tournament.id, newName, newDate, newNumTeams);
        });
    }



	/**
     * fonction de mise à jour. Cette fonction va sauvegarder les modifications dans Firestore
     */
	async function updateTournamentDetails(tournamentId, newName, newDate, newNumTeams) {
        const tournamentRef = getTournamentDataRef(tournamentId);
        const tournamentToUpdate = allUserTournaments.find(t => t.id === tournamentId);
        const currentTeamCount = tournamentToUpdate?.allTeams?.length || 0;

        if (!newName || !newDate || isNaN(newNumTeams) || newNumTeams < currentTeamCount) {
            showToast("Données invalides. Assurez-vous que tous les champs sont remplis et que le nombre d'équipes n'est pas inférieur au nombre actuel.", "error");
            return;
        }

        try {
            await window.updateDoc(tournamentRef, {
                name: newName,
                date: newDate,
                numTeamsAllowed: newNumTeams
            });
            showToast("Tournoi mis à jour avec succès !", "success");

            // --- CORRECTION DÉFINITIVE ---
            // 1. Mettre à jour manuellement la liste locale (plus rapide qu'un nouveau fetch)
            if (tournamentToUpdate) {
                tournamentToUpdate.name = newName;
                tournamentToUpdate.date = newDate;
                tournamentToUpdate.numTeamsAllowed = newNumTeams;
            }
            // 2. Appeler la fonction de rendu qui va redessiner la liste
            renderTournamentsList();
            // --- FIN DE LA CORRECTION ---

        } catch (error) {
            console.error("Erreur de mise à jour du tournoi :", error);
            showToast("Une erreur est survenue lors de la mise à jour.", "error");
        }
    }
    /**
     * Logique du tableau de bord des tournois.
     */
	function setupTournamentDashboardLogic() {
        const newTournamentNameInput = document.getElementById('newTournamentName');
        const newTournamentDateInput = document.getElementById('newTournamentDate');
        const newTournamentNumTeamsInput = document.getElementById('newTournamentNumTeams');
        const createTournamentBtn = document.getElementById('createTournamentBtn');

        if (!createTournamentBtn) return;

        createTournamentBtn.addEventListener('click', () => {
            const name = newTournamentNameInput.value.trim();
            const date = newTournamentDateInput.value;
            const numTeams = parseInt(newTournamentNumTeamsInput.value);
            createNewTournament(name, date, numTeams);
        });

        // La seule responsabilité de cette fonction est maintenant d'appeler le rendu initial.
        renderTournamentsList();
    }

	/**
     * Affiche la liste des tournois et attache les écouteurs d'événements.
     * Cette fonction est maintenant indépendante pour pouvoir être appelée après une mise à jour.
     */
    function renderTournamentsList() {
        const tournamentsListDiv = document.getElementById('tournamentsList');
        if (!tournamentsListDiv) return; // Ne fait rien si on n'est pas sur la bonne page

        tournamentsListDiv.innerHTML = '';
        if (!allUserTournaments || allUserTournaments.length === 0) {
            tournamentsListDiv.innerHTML = '<p class="text-gray-500 text-center">Aucun tournoi disponible. Créez-en un nouveau !</p>';
            return;
        }

        allUserTournaments.forEach(tournament => {
            const isOwner = tournament.ownerId === window.userId;
            const isSelected = currentTournamentId === tournament.id;
            const tourneyDiv = document.createElement('div');
            tourneyDiv.className = `flex flex-col sm:flex-row items-start sm:items-center justify-between p-3 bg-white border rounded-md shadow-sm ${isSelected ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-200'}`;

            const numTeamsDisplay = tournament.numTeamsAllowed != null ? escapeHtml(tournament.numTeamsAllowed.toString()) : 'N/A';

            tourneyDiv.innerHTML = `
                <div class="flex-grow">
                    <p class="text-lg font-medium text-gray-800">${escapeHtml(tournament.name)} ${isSelected ? '<span class="text-blue-600 text-sm ml-2">(Actif)</span>' : ''}</p>
                    <p class="text-sm text-gray-600">Date: ${escapeHtml(tournament.date)} | Équipes max: ${numTeamsDisplay}</p>
                </div>
                <div class="flex space-x-2 mt-3 sm:mt-0">
                    <button data-id="${tournament.id}" class="select-tournament-btn bg-blue-500 text-white px-3 py-1 rounded-md hover:bg-blue-600 text-sm transition ${isSelected ? 'opacity-50 cursor-not-allowed' : ''}" ${isSelected ? 'disabled' : ''}>
                        Sélectionner
                    </button>
                    ${isOwner ? `<button data-id="${tournament.id}" class="edit-tournament-btn bg-yellow-500 text-white px-3 py-1 rounded-md hover:bg-yellow-600 text-sm transition">Éditer</button>` : ''}
                    ${isOwner ? `<button data-id="${tournament.id}" class="delete-tournament-btn bg-red-500 text-white px-3 py-1 rounded-md hover:bg-red-600 text-sm transition">Supprimer</button>` : ''}
                </div>
            `;
            tournamentsListDiv.appendChild(tourneyDiv);
        });

        // Attacher les écouteurs d'événements
        document.querySelectorAll('.select-tournament-btn').forEach(button => {
            button.addEventListener('click', (event) => selectTournament(event.target.dataset.id));
        });

        document.querySelectorAll('.edit-tournament-btn').forEach(button => {
            button.addEventListener('click', (event) => {
                const tournamentToEdit = allUserTournaments.find(t => t.id === event.target.dataset.id);
                if (tournamentToEdit) showEditTournamentModal(tournamentToEdit);
            });
        });

        document.querySelectorAll('.delete-tournament-btn').forEach(button => {
            button.addEventListener('click', (event) => deleteTournament(event.target.dataset.id));
        });
    }
   
    // --- Routage et Initialisation ---

    /**
     * Gère les changements de hash dans l'URL pour la navigation.
     */
    function handleLocationHash() {
        const path = window.location.hash.substring(1) || 'home';
        console.log("Navigating to:", path);

        // Mettre à jour la visibilité des liens de navigation en premier
        updateNavLinksVisibility();
        updateTournamentDisplay(); // S'assurer que le nom du tournoi est à jour

        // Mise à jour de la classe "active" de la navigation
        // Cette boucle a été déplacée dans updateNavLinksVisibility pour plus de clarté
        // et pour être sûr que les éléments DOM sont disponibles au moment du toggle
        // car navLinks est initialisé avec document.getElementById

        // Logique de redirection basée sur le mode (invité ou connecté)
        if (!window.userId) { // Si l'utilisateur n'est PAS connecté
            isGuestMode = true; // Activer le mode invité
            // Les données sont déjà chargées depuis localStorage via loadAllData() appelée par onFirebaseReady
            // ou manuellement par le bouton "Continuer en mode invité" sur la page d'auth.

            // Autoriser l'accès à toutes les pages si le nombre d'équipes est <= GUEST_MODE_MAX_TEAMS
            // Les fonctionnalités individuelles sur chaque page (ex: générer des poules de brassage)
            // sont restreintes par `isGuestMode` dans leur propre logique.
            if (allTeams.length <= GUEST_MODE_MAX_TEAMS) {
                switch (path) {
                    case 'home':
                    case 'equipes':
                    case 'brassages':
                    case 'eliminatoires': // Maintenant accessible en mode invité pour la génération
                    case 'classements':
                    case 'elimination-selection': // Maintenant accessible en mode invité pour la sélection
                        // Ces pages sont accessibles en mode invité (avec certaines fonctionnalités désactivées)
                        break;
                    case 'auth': // Si on est sur la page auth, on reste là
                        renderAuthPage();
                        return;
                    case 'tournaments': // Les tournois multiples ne sont pas gérés en mode invité
                   
                    case '': // Page par défaut (si vide)
                    default:
                        window.location.hash = '#home'; // Rediriger vers l'accueil pour les routes non autorisées ou par défaut
                        renderHomePage();
                        return;
                }
            } else { // Plus de 9 équipes en mode invité
                if (path !== 'auth') {
                    showToast(`Pour gérer plus de ${GUEST_MODE_MAX_TEAMS} équipes, veuillez vous connecter.`, "error");
                    window.location.hash = '#auth'; // Forcer la redirection vers la page d'authentification
                }
                renderAuthPage();
                return;
            }
        } else { // Si l'utilisateur est connecté
            isGuestMode = false; // Désactiver le mode invité
            // currentTournamentId est défini par loadAllData via le listener Firestore.

            if (!currentTournamentId) { // Si connecté mais aucun tournoi actif sélectionné
                if (path !== 'tournaments') {
                    window.location.hash = '#tournaments'; // Rediriger vers le tableau de bord des tournois
                }
                renderTournamentDashboard();
                return;
            }

            // Si un tournoi est sélectionné, et l'utilisateur est propriétaire, vérifier l'accès à la page des collaborateurs
            if (path === 'collaborators' && currentTournamentData?.ownerId !== window.userId) {
                showToast("Vous n'êtes pas le propriétaire de ce tournoi pour gérer les collaborateurs.", "error");
                window.location.hash = '#home'; // Rediriger vers l'accueil
                renderHomePage();
                return;
            }
        }

        // Rendre la page demandée (ou la page par défaut si non spécifiée ou déjà redirigée)
        switch (path) {
            case 'home':
                renderHomePage();
                break;
            case 'equipes':
                renderEquipesPage();
                break;
            case 'brassages':
                renderBrassagesPage();
                break;
            case 'eliminatoires':
                renderEliminatoiresPage();
                break;
            case 'classements':
                renderClassementsPage();
                break;
            case 'elimination-selection':
                renderEliminationSelectionPage();
                break;
            case 'tournaments':
                renderTournamentDashboard();
                break;
			case 'account': 
				renderAccountPage(); 
				break; 
            case 'auth': // Si déjà connecté et tournoi sélectionné, on renvoie à l'accueil
                window.location.hash = '#home';
                renderHomePage();
                break;
            case '': // Default path when loading or if hash is empty
                if (isGuestMode) {
                    window.location.hash = '#home';
                    renderHomePage();
                } else {
                    window.location.hash = '#tournaments'; // Logged in users go to dashboard
                    renderTournamentDashboard();
                }
                break;
            default: // Unknown path after all checks
                console.warn(`Route inconnue: ${path}. Redirection par défaut.`);
                if (isGuestMode) {
                    window.location.hash = '#home';
                    renderHomePage();
                } else {
                    window.location.hash = '#tournaments';
                    renderTournamentDashboard();
                }
        }
    }

    // --- Initialisation de l'Application ---
	document.addEventListener('DOMContentLoaded', () => {
        window.onFirebaseReady = loadAllData;

        // Le cleanup est géré par onAuthStateChanged, on se contente de déconnecter
        document.getElementById('logout-btn').addEventListener('click', async () => {
            if (window.signOut && window.auth) {
                await window.signOut(window.auth);
                showToast("Déconnexion réussie.", "info");
            }
        });
        
        document.getElementById('select-tournament-btn').addEventListener('click', () => {
            window.location.hash = '#tournaments';
        });

        document.getElementById('my-account-btn').addEventListener('click', () => {
            window.location.hash = '#account';
        });

        document.getElementById('modalCancelBtn').addEventListener('click', hideModal);

        window.addEventListener('hashchange', handleLocationHash);
		
		logoutBtn.addEventListener('click', async () => {
            // CORRECTION : On arrête les écouteurs AVANT la déconnexion pour éviter les erreurs de permission.
            cleanupFirestoreListeners();

            try {
                if (window.auth && window.signOut) {
                    // On se contente de demander la déconnexion.
                    // On ne montre PLUS de toast ici.
                    await window.signOut(window.auth);
                }
                // Le message "Déconnexion réussie !" sera affiché une seule fois par la logique
                // qui se déclenche APRÈS que l'état de connexion a VRAIMENT changé.
            } catch (error) {
                console.error("Erreur de déconnexion:", error);
                showToast("Erreur lors de la déconnexion.", "error");
            }
        });
    });
	 // --- POINT D'ENTRÉE PRINCIPAL DE L'APPLICATION ---
    onAuthStateChanged(auth, (user) => {
        console.log("État d'authentification changé. Utilisateur:", user ? user.uid : "aucun");
        // Cette fonction est le point de départ qui charge les données
        // soit pour l'invité, soit pour l'utilisateur connecté.
        loadAllData(); 
    });

})();
