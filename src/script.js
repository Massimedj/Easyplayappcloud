// Importe les modules Firebase nécessaires. Assurez-vous que votre balise <script> pour ce fichier
// dans index.html est de type <script type="module" src="script.js"></script>
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInWithCustomToken, signInAnonymously, onAuthStateChanged, signOut, createUserWithEmailAndPassword, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, onSnapshot, collection, addDoc, deleteDoc, updateDoc, query, where, getDocs, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

(function() {
    // --- Constantes Globales ---
    const APP_CONTAINER = document.getElementById('app-container');
    const TEAM_DATA_KEY = 'volleyTeamsData';
    const BRASSAGE_PHASES_KEY = 'volleyBrassagePhases';
    const ELIMINATION_PHASES_KEY = 'volleyEliminationPhases';
    const SECONDARY_GROUPS_SELECTION_KEY = 'volleySecondaryGroupsSelection';
    const POOL_GENERATION_BASIS_KEY = 'volleyPoolGenerationBasis';
    const SECONDARY_GROUPS_PREVIEW_KEY = 'volleySecondaryGroupsPreview';
    const ELIMINATED_TEAMS_KEY = 'volleyEliminatedTeams';
    const CURRENT_TOURNAMENT_ID_KEY = 'currentTournamentId';

    const PHASE_TYPE_INITIAL = 'initial_brassage';
    const PHASE_TYPE_SECONDARY_BRASSAGE = 'secondary_brassage';
    const PHASE_TYPE_ELIMINATION_SEEDING = 'elimination_seeding';

    // --- Variables Globales (état de l'application) ---
    let allTeams = [];
    let allBrassagePhases = [];
    let eliminationPhases = {};
    let currentSecondaryGroupsPreview = {};
    let eliminatedTeams = new Set();
    let currentDisplayedPhaseId = null;

    let currentTournamentId = null;
    let currentTournamentData = null;
    let allUserTournaments = [];

    // Déclaration des variables pour les éléments DOM. Elles seront initialisées DANS DOMContentLoaded.
    let navLinks = {};
    let modal, modalTitle, modalBody, modalConfirmBtn, modalCancelBtn, toastContainer;
    let authInfoDiv, userEmailSpan, logoutBtn, selectTournamentBtn, currentTournamentNameDisplay;


    // --- Fonctions Utilitaires Générales ---

    /**
     * Échappe les caractères HTML pour prévenir les attaques XSS.
     * @param {string} str La chaîne à échapper.
     * @returns {string} La chaîne échappée.
     */
    function escapeHtml(str) {
        const div = document.createElement('div');
        div.appendChild(document.createTextNode(str));
        return div.innerHTML;
    }

    /**
     * Mélange un tableau de manière aléatoire (algorithme de Fisher-Yates).
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

    /**
     * Affiche un message toast à l'utilisateur.
     * @param {string} message Le message à afficher.
     * @param {string} type Le type de message ('success', 'error', 'info').
     * @param {number} duration La durée d'affichage en ms (par défaut 3000).
     */
    function showToast(message, type = 'info', duration = 3000) {
        if (!toastContainer) {
            console.error("Toast container non trouvé! Impossible d'afficher le toast: ", message);
            return;
        }

        const toast = document.createElement('div');
        toast.className = `fixed bottom-4 right-4 p-4 rounded-lg shadow-lg text-white transform transition-all duration-300 ease-out z-50`;

        switch (type) {
            case 'success':
                toast.classList.add('bg-green-500');
                break;
            case 'error':
                toast.classList.add('bg-red-500');
                break;
            case 'info':
            default:
                toast.classList.add('bg-blue-500');
                break;
        }

        toast.textContent = message;
        toastContainer.appendChild(toast);

        setTimeout(() => {
            toast.style.transform = 'translateY(-10px)';
            toast.style.opacity = '1';
        }, 10);

        setTimeout(() => {
            toast.style.transform = 'translateY(20px)';
            toast.style.opacity = '0';
            toast.addEventListener('transitionend', () => toast.remove());
        }, duration);
    }

    /**
     * Affiche une modale personnalisée.
     * @param {string} title Le titre de la modale.
     * @param {HTMLElement} content L'élément HTML à afficher dans le corps de la modale.
     * @param {Function} confirmCallback La fonction à exécuter si l'utilisateur confirme.
     * @param {boolean} isDestructive Si true, le bouton de confirmation est rouge.
     */
    function showModal(title, content, confirmCallback, isDestructive = false) {
        if (!modal || !modalTitle || !modalBody || !modalConfirmBtn || !modalCancelBtn) {
            console.error("Éléments de la modale non trouvés! Impossible d'afficher la modale.");
            return;
        }

        modalTitle.textContent = title;
        modalBody.innerHTML = '';
        modalBody.appendChild(content);

        modalConfirmBtn.className = `inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 text-base font-medium text-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2 sm:ml-3 sm:w-auto sm:text-sm transition ease-in-out duration-150`;

        if (isDestructive) {
            modalConfirmBtn.classList.add('bg-red-600', 'hover:bg-red-700', 'focus:ring-red-500');
        } else {
            modalConfirmBtn.classList.add('bg-blue-600', 'hover:bg-blue-700', 'focus:ring-blue-500');
        }

        modalConfirmBtn.onclick = () => {
            confirmCallback();
            hideModal();
        };

        modal.classList.remove('hidden');
        setTimeout(() => modal.classList.add('opacity-100', 'scale-100'), 10);
    }

    /**
     * Cache la modale personnalisée.
     */
    function hideModal() {
        if (!modal) {
            console.error("Élément de la modale non trouvé pour la cacher!");
            return;
        }
        modal.classList.remove('opacity-100', 'scale-100');
        modal.classList.add('opacity-0', 'scale-95');
        setTimeout(() => modal.classList.add('hidden'), 300);
    }


    // --- Intégration Firebase (Authentification & Firestore) ---

    // Rendre les fonctions Firebase accessibles globalement si nécessaire, sinon les utiliser directement
    // depuis les imports dans les fonctions appelantes.
    window.initializeApp = initializeApp;
    window.getAuth = getAuth;
    window.signInWithCustomToken = signInWithCustomToken;
    window.signInAnonymously = signInAnonymously;
    window.onAuthStateChanged = onAuthStateChanged;
    window.signOut = signOut;
    window.createUserWithEmailAndPassword = createUserWithEmailAndPassword;
    window.signInWithEmailAndPassword = signInWithEmailAndPassword;

    window.getFirestore = getFirestore;
    window.doc = doc;
    window.getDoc = getDoc;
    window.setDoc = setDoc;
    window.onSnapshot = onSnapshot;
    window.collection = collection;
    window.addDoc = addDoc;
    window.deleteDoc = deleteDoc;
    window.updateDoc = updateDoc;
    window.query = query;
    window.where = where;
    window.getDocs = getDocs;
    window.serverTimestamp = serverTimestamp;

    // Firestore Unsubscribe functions
    window.currentTournamentUnsubscribe = null;
    window.allUserTournamentsUnsubscribe = null;

    /**
     * Initialise Firebase et configure l'écouteur d'état d'authentification.
     * Cette fonction est appelée UNIQUEMENT après que le DOM soit chargé.
     */
    function initializeFirebaseAndAuth() {
        try {
            const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
            const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

            if (Object.keys(firebaseConfig).length === 0) {
                console.error("Firebase config is missing. Cannot initialize Firebase.");
                showToast("Erreur: Configuration Firebase manquante. Veuillez contacter l'administrateur.", "error");
                return;
            }

            window.firebaseApp = window.initializeApp(firebaseConfig);
            window.auth = window.getAuth(window.firebaseApp);
            window.db = window.getFirestore(window.firebaseApp);

            window.onAuthStateChanged(window.auth, async (user) => {
                if (user) {
                    window.userId = user.uid;
                    console.log("User is signed in:", user.uid);
                    await loadAllUserTournaments();
                    await loadAllData();
                } else {
                    window.userId = null;
                    console.log("No user is signed in.");
                    // Clear all local data when logged out
                    currentTournamentId = null;
                    currentTournamentData = null;
                    allTeams = [];
                    allBrassagePhases = [];
                    eliminationPhases = {};
                    currentSecondaryGroupsPreview = {};
                    eliminatedTeams = new Set();
                    currentDisplayedPhaseId = null;
                    allUserTournaments = [];

                    if (window.currentTournamentUnsubscribe) {
                        window.currentTournamentUnsubscribe();
                        window.currentTournamentUnsubscribe = null;
                    }
                    if (window.allUserTournamentsUnsubscribe) {
                        window.allUserTournamentsUnsubscribe();
                        window.allUserTournamentsUnsubscribe = null;
                    }
                    handleLocationHash(); // Redirect to auth page or home
                }
                if (window.onFirebaseReady) {
                    window.onFirebaseReady();
                }
            });

            if (!window.auth.currentUser) {
                if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
                    window.signInWithCustomToken(window.auth, __initial_auth_token)
                        .then(() => console.log("Signed in with custom token."))
                        .catch(error => {
                            console.error("Error signing in with custom token:", error);
                            window.signInAnonymously(window.auth)
                                .then(() => console.log("Signed in anonymously."))
                                .catch(anonError => console.error("Error signing in anonymously:", anonError));
                        });
                } else {
                    window.signInAnonymously(window.auth)
                        .then(() => console.log("Signed in anonymously."))
                        .catch(error => console.error("Error signing in anonymously:", error));
                }
            }

        } catch (e) {
            console.error("Failed to initialize Firebase:", e);
            showToast("Erreur critique: Échec de l'initialisation de Firebase.", "error");
        }
    }


    // --- Fonctions de Gestion des Données (Firestore) ---

    /**
     * Charge tous les tournois créés par l'utilisateur actuel.
     * Met en place un listener en temps réel.
     */
    async function loadAllUserTournaments() {
        if (!window.db || !window.userId) {
            console.warn("Firestore ou userId non disponible pour charger les tournois.");
            return;
        }

        if (window.allUserTournamentsUnsubscribe) {
            window.allUserTournamentsUnsubscribe();
        }

        const tournamentsRef = window.collection(window.db, `artifacts/${__app_id}/users/${window.userId}/tournaments`);
        const q = window.query(tournamentsRef);

        window.allUserTournamentsUnsubscribe = window.onSnapshot(q, (snapshot) => {
            const fetchedTournaments = [];
            snapshot.forEach(doc => {
                fetchedTournaments.push({ id: doc.id, ...doc.data() });
            });
            allUserTournaments = fetchedTournaments;
            console.log("All user tournaments updated:", allUserTournaments);
            if (window.location.hash === '#tournaments') {
                renderTournamentDashboard();
            }
            updateNavLinksVisibility();
            updateTournamentDisplay();
        }, (error) => {
            console.error("Error fetching user tournaments:", error);
            showToast("Erreur lors du chargement de vos tournois.", "error");
        });
    }

    /**
     * Charge toutes les données du tournoi actuellement sélectionné depuis Firestore.
     * Met en place un listener en temps réel.
     */
    async function loadAllData() {
        if (!window.db || !window.userId) {
            console.warn("Firestore ou userId non disponible pour charger les données.");
            return;
        }

        const storedTournamentId = localStorage.getItem(CURRENT_TOURNAMENT_ID_KEY);
        if (storedTournamentId) {
            currentTournamentId = storedTournamentId;
        }

        if (!currentTournamentId) {
            console.log("Aucun tournoi sélectionné. Redirection vers le tableau de bord des tournois.");
            handleLocationHash();
            return;
        }

        if (window.currentTournamentUnsubscribe) {
            window.currentTournamentUnsubscribe();
        }

        const tournamentDocRef = window.doc(window.db, `artifacts/${__app_id}/users/${window.userId}/tournaments`, currentTournamentId);

        window.currentTournamentUnsubscribe = window.onSnapshot(tournamentDocRef, (docSnapshot) => {
            if (docSnapshot.exists()) {
                currentTournamentData = { id: docSnapshot.id, ...docSnapshot.data() };
                console.log("Current tournament data loaded/updated:", currentTournamentData);

                allTeams = currentTournamentData.teams || [];
                allBrassagePhases = currentTournamentData.brassagePhases || [];
                eliminationPhases = currentTournamentData.eliminationPhases || {};
                currentSecondaryGroupsPreview = currentTournamentData.secondaryGroupsPreview || {};
                eliminatedTeams = new Set(currentTournamentData.eliminatedTeams || []);
                currentDisplayedPhaseId = currentTournamentData.currentDisplayedPhaseId || null;

                handleLocationHash();
                showToast(`Données du tournoi "${escapeHtml(currentTournamentData.name)}" chargées.`, "info");
            } else {
                console.warn("Le tournoi sélectionné n'existe plus ou n'est pas accessible.");
                showToast("Le tournoi sélectionné n'existe plus ou n'est pas accessible. Veuillez en choisir un autre.", "error");
                currentTournamentId = null;
                currentTournamentData = null;
                localStorage.removeItem(CURRENT_TOURNAMENT_ID_KEY);
                handleLocationHash();
            }
        }, (error) => {
            console.error("Error fetching current tournament data:", error);
            showToast("Erreur lors du chargement des données du tournoi actuel.", "error");
            currentTournamentId = null;
            currentTournamentData = null;
            localStorage.removeItem(CURRENT_TOURNAMENT_ID_KEY);
            handleLocationHash();
        });
    }

    /**
     * Sauvegarde toutes les données du tournoi actuellement sélectionné dans Firestore.
     */
    async function saveAllData() {
        if (!window.db || !window.userId || !currentTournamentId) {
            console.warn("Firestore, userId ou currentTournamentId non disponible pour la sauvegarde.");
            return;
        }

        const tournamentDocRef = window.doc(window.db, `artifacts/${__app_id}/users/${window.userId}/tournaments`, currentTournamentId);

        const dataToSave = {
            teams: allTeams,
            brassagePhases: allBrassagePhases,
            eliminationPhases: eliminationPhases,
            secondaryGroupsPreview: currentSecondaryGroupsPreview,
            eliminatedTeams: Array.from(eliminatedTeams),
            currentDisplayedPhaseId: currentDisplayedPhaseId,
            name: currentTournamentData.name,
            date: currentTournamentData.date,
            numTeamsAllowed: currentTournamentData.numTeamsAllowed,
            ownerId: currentTournamentData.ownerId,
            createdAt: currentTournamentData.createdAt,
        };

        try {
            await window.setDoc(tournamentDocRef, dataToSave, { merge: true });
            console.log("Données du tournoi sauvegardées avec succès !");
        } catch (error) {
            console.error("Erreur lors de la sauvegarde des données du tournoi:", error);
            showToast("Erreur lors de la sauvegarde des données.", "error");
        }
    }


    // --- Fonctions de Gestion des Tournois ---

    /**
     * Met à jour l'affichage du nom du tournoi actif dans la barre de navigation.
     */
    function updateTournamentDisplay() {
        if (currentTournamentNameDisplay) {
            if (currentTournamentData) {
                currentTournamentNameDisplay.textContent = `Tournoi Actif: ${escapeHtml(currentTournamentData.name)}`;
                currentTournamentNameDisplay.classList.remove('hidden');
                selectTournamentBtn.classList.remove('hidden');
            } else {
                currentTournamentNameDisplay.textContent = '';
                currentTournamentNameDisplay.classList.add('hidden');
                selectTournamentBtn.classList.add('hidden');
            }
        }
    }

    /**
     * Crée un nouveau tournoi Firestore.
     * @param {string} name Nom du tournoi.
     * @param {string} date Date du tournoi (format YYYY-MM-DD).
     * @param {number} numTeams Nombre d'équipes prévues.
     */
    async function createNewTournament(name, date, numTeams) {
        if (!window.db || !window.userId) {
            showToast("Veuillez vous connecter pour créer un tournoi.", "error");
            return;
        }
        if (!name.trim() || !date || isNaN(numTeams) || numTeams < 2) {
            showToast("Veuillez remplir tous les champs (Nom, Date, Nombre d'équipes >= 2).", "error");
            return;
        }

        try {
            const tournamentsCollectionRef = window.collection(window.db, `artifacts/${__app_id}/users/${window.userId}/tournaments`);
            const newTournamentData = {
                name: name.trim(),
                date: date,
                numTeamsAllowed: numTeams,
                ownerId: window.userId,
                createdAt: window.serverTimestamp(),
                teams: [],
                brassagePhases: [],
                eliminationPhases: {},
                secondaryGroupsPreview: {},
                eliminatedTeams: [],
                currentDisplayedPhaseId: null
            };

            const docRef = await window.addDoc(tournamentsCollectionRef, newTournamentData);
            currentTournamentId = docRef.id;
            localStorage.setItem(CURRENT_TOURNAMENT_ID_KEY, currentTournamentId);
            showToast(`Tournoi "${escapeHtml(name)}" créé et sélectionné !`, "success");
            await loadAllData();
        } catch (error) {
            console.error("Erreur lors de la création du tournoi:", error);
            showToast("Erreur lors de la création du tournoi: " + error.message, "error");
        }
    }

    /**
     * Sélectionne un tournoi existant et charge ses données.
     * @param {string} tournamentId L'ID du tournoi à sélectionner.
     */
    async function selectTournament(tournamentId) {
        if (!window.db || !window.userId) {
            showToast("Veuillez vous connecter pour sélectionner un tournoi.", "error");
            return;
        }
        if (currentTournamentId === tournamentId) {
            showToast("Ce tournoi est déjà sélectionné.", "info");
            return;
        }

        currentTournamentId = tournamentId;
        localStorage.setItem(CURRENT_TOURNAMENT_ID_KEY, tournamentId);
        showToast("Chargement du tournoi...", "info");
        await loadAllData();
    }

    /**
     * Supprime un tournoi.
     * @param {string} tournamentId L'ID du tournoi à supprimer.
     */
    async function deleteTournament(tournamentId) {
        if (!window.db || !window.userId) {
            showToast("Veuillez vous connecter pour supprimer un tournoi.", "error");
            return;
        }

        const tournamentToDelete = allUserTournaments.find(t => t.id === tournamentId);
        if (!tournamentToDelete) {
            showToast("Tournoi non trouvé.", "error");
            return;
        }
        if (tournamentToDelete.ownerId !== window.userId) {
            showToast("Vous n'êtes pas le propriétaire de ce tournoi et ne pouvez pas le supprimer.", "error");
            return;
        }

        const messageContent = document.createElement('p');
        messageContent.textContent = `Êtes-vous sûr de vouloir supprimer le tournoi "${escapeHtml(tournamentToDelete.name)}" ? Cette action est irréversible.`;
        messageContent.className = 'text-gray-700';

        showModal('Confirmer la suppression du tournoi', messageContent, async () => {
            try {
                const tournamentDocRef = window.doc(window.db, `artifacts/${__app_id}/users/${window.userId}/tournaments`, tournamentId);
                await window.deleteDoc(tournamentDocRef);

                if (currentTournamentId === tournamentId) {
                    currentTournamentId = null;
                    currentTournamentData = null;
                    localStorage.removeItem(CURRENT_TOURNAMENT_ID_KEY);
                    if (window.currentTournamentUnsubscribe) {
                        window.currentTournamentUnsubscribe();
                        window.currentTournamentUnsubscribe = null;
                    }
                }
                showToast(`Tournoi "${escapeHtml(tournamentToDelete.name)}" supprimé.`, "success");
                await loadAllUserTournaments();
                handleLocationHash();
            } catch (error) {
                console.error("Erreur lors de la suppression du tournoi:", error);
                showToast("Erreur lors de la suppression du tournoi: " + error.message, "error");
            }
        }, true);
    }

    // --- Fonctions de Vérification et d'Information ---

    /**
     * Vérifie si une équipe avec le même nom existe déjà (insensible à la casse).
     * @param {string} name Le nom de l'équipe à vérifier.
     * @returns {boolean} True si l'équipe existe, false sinon.
     */
    function teamExists(name) {
        const lowerCaseName = name.toLowerCase();
        return allTeams.some(team => team.name.toLowerCase() === lowerCaseName);
    }

    /**
     * Vérifie si un match entre deux équipes données a déjà eu lieu dans une phase précédente.
     * @param {string} team1Id ID de la première équipe.
     * @param {string} team2Id ID de la deuxième équipe.
     * @param {string} currentPhaseId ID de la phase actuelle (pour l'exclure de la vérification des répétitions).
     * @returns {boolean} True si le match est une répétition, false sinon.
     */
    function isMatchRepeated(team1Id, team2Id, currentPhaseId) {
        const sortedIds = [team1Id, team2Id].sort();
        const matchKey = JSON.stringify(sortedIds);

        const relevantPhases = allBrassagePhases.filter(phase =>
            phase.generated && phase.id !== currentPhaseId &&
            (phase.type === PHASE_TYPE_INITIAL || phase.type === PHASE_TYPE_SECONDARY_BRASSAGE)
        );

        for (const phase of relevantPhases) {
            if (phase.pools) {
                for (const pool of phase.pools) {
                    if (pool.matches) {
                        for (const match of pool.matches) {
                            const currentMatchSortedIds = [match.team1Id, match.team2Id].sort();
                            const currentMatchKey = JSON.stringify(currentMatchSortedIds);
                            if (currentMatchKey === matchKey) {
                                return true;
                            }
                        }
                    }
                }
            }
        }
        return false;
    }

    /**
     * Met à jour le compteur des matchs répétés affiché sur la page des brassages.
     * (Cette fonction dépendra de l'existence d'un élément avec l'ID 'repeatedMatchesCount' et 'toggleRepeatedMatchesDisplay'
     * dans la partie HTML ou dans les fonctions de rendu des pages. Elle est ici pour la logique.)
     */
    function updateRepeatedMatchesCountDisplay() {
        const repeatedMatchesCountSpan = document.getElementById('repeatedMatchesCount');
        if (!repeatedMatchesCountSpan) return;

        const toggleRepeatedMatchesDisplay = document.getElementById('toggleRepeatedMatchesDisplay');
        const showRepeats = toggleRepeatedMatchesDisplay ? toggleRepeatedMatchesDisplay.checked : false;

        if (!currentDisplayedPhaseId) {
            repeatedMatchesCountSpan.textContent = '';
            return;
        }

        const currentPhase = allBrassagePhases.find(p => p.id === currentDisplayedPhaseId);
        if (!currentPhase || !currentPhase.generated || !currentPhase.pools) {
            repeatedMatchesCountSpan.textContent = '';
            return;
        }

        let count = 0;
        currentPhase.pools.forEach(pool => {
            pool.matches.forEach(match => {
                if (isMatchRepeated(match.team1Id, match.team2Id, currentDisplayedPhaseId)) {
                    count++;
                }
            });
        });

        if (count > 0) {
            repeatedMatchesCountSpan.textContent = `(${count} rencontre(s) répétée(s))`;
            repeatedMatchesCountSpan.classList.remove('text-gray-500');
            repeatedMatchesCountSpan.classList.add('text-red-500');
        } else {
            repeatedMatchesCountSpan.textContent = '(Aucune rencontre répétée)';
            repeatedMatchesCountSpan.classList.remove('text-red-500');
            repeatedMatchesCountSpan.classList.add('text-gray-500');
        }
    }

    /**
     * Affiche une modale détaillant les phases où un match spécifique a été répété.
     */
    function showRepeatedMatchDetailsModal(team1Name, team2Name, team1Id, team2Id, currentPhaseId) {
        const sortedIds = [team1Id, team2Id].sort();
        const matchKey = JSON.stringify(sortedIds);

        const repeatedInPhases = allBrassagePhases.filter(phase =>
            phase.generated && phase.id !== currentPhaseId &&
            (phase.type === PHASE_TYPE_INITIAL || phase.type === PHASE_TYPE_SECONDARY_BRASSAGE) &&
            phase.pools.some(pool =>
                pool.matches.some(match => {
                    const currentMatchSortedIds = [match.team1Id, match.team2Id].sort();
                    return JSON.stringify(currentMatchSortedIds) === matchKey;
                })
            )
        );

        let contentHtml = `<p class="mb-4">La rencontre entre <span class="font-bold">${escapeHtml(team1Name)}</span> et <span class="font-bold">${escapeHtml(team2Name)}</span> a déjà eu lieu dans les phases suivantes :</p>`;
        if (repeatedInPhases.length > 0) {
            contentHtml += `<ul class="list-disc list-inside space-y-1">`;
            repeatedInPhases.forEach(phase => {
                contentHtml += `<li>${escapeHtml(phase.name)}</li>`;
            });
            contentHtml += `</ul>`;
        } else {
            contentHtml += `<p>Aucune répétition trouvée dans les phases précédentes (ceci est inattendu si le bouton a été cliqué).</p>`;
        }

        const modalContentDiv = document.createElement('div');
        modalContentDiv.innerHTML = contentHtml;
        modalContentDiv.className = 'text-gray-700';

        showModal(`Détails de la rencontre répétée`, modalContentDiv, () => hideModal());
    }

    // --- Fonctions de Routage (seront définies dans Partie 5 mais dépendent de la visibilité) ---
    // Déclarées ici pour que les autres fonctions (comme updateNavLinksVisibility) puissent les appeler
    function renderHomePage() { /* sera défini dans Partie 5 */ }
    function renderTournamentDashboard() { /* sera défini dans Partie 5 */ }
    function renderEquipesPage() { /* sera défini dans Partie 5 */ }
    function renderBrassagesPage() { /* sera défini dans Partie 5 */ }
    function renderEliminatoiresPage() { /* sera défini dans Partie 5 */ }
    function renderClassementsPage() { /* sera défini dans Partie 5 */ }
    function renderAuthPage() { /* sera défini dans Partie 5 */ }

    const routes = {
        '#home': renderHomePage,
        '#tournaments': renderTournamentDashboard,
        '#equipes': renderEquipesPage,
        '#brassages': renderBrassagesPage,
        '#eliminatoires': renderEliminatoiresPage,
        '#classements': renderClassementsPage,
        '#auth': renderAuthPage
    };

    /**
     * Gère le changement de route en fonction du hash de l'URL.
     */
    function handleLocationHash() {
        let path = window.location.hash || '#auth'; // Par défaut, la page d'authentification ou d'accueil
        
        // Si l'utilisateur n'est pas connecté et qu'il n'est pas sur la page d'authentification,
        // le rediriger vers la page d'authentification.
        if (!window.userId && path !== '#auth') {
            path = '#auth';
            window.location.hash = '#auth'; // Mettre à jour l'URL pour refléter la redirection
        } else if (window.userId && path === '#auth') {
            // Si l'utilisateur est connecté et qu'il est sur la page d'authentification,
            // le rediriger vers la page des tournois ou l'accueil si aucun tournoi sélectionné
            if (!currentTournamentId) {
                 path = '#tournaments';
                 window.location.hash = '#tournaments';
            } else {
                 path = '#home';
                 window.location.hash = '#home';
            }
        }
        
        const renderFunction = routes[path];
        if (renderFunction) {
            renderFunction();
        } else {
            console.warn(`Route inconnue: ${path}. Redirection vers l'accueil.`);
            window.location.hash = '#home';
        }
        updateNavLinksVisibility(); // Mettre à jour la visibilité et les classes des liens de nav
    }

    /**
     * Met à jour la visibilité et la classe 'active' des liens de navigation.
     */
    function updateNavLinksVisibility() {
        // Mettre à jour la classe "active" de la navigation
        document.querySelectorAll('.nav-link').forEach(link => {
            if (link.getAttribute('href') === window.location.hash) {
                link.classList.add('border-b-2', 'border-blue-200');
            } else {
                link.classList.remove('border-b-2', 'border-blue-200');
            }
        });

        // Gérer la visibilité des liens de navigation
        if (window.userId && currentTournamentId) {
            // Utilisateur connecté et tournoi sélectionné : tout visible sauf auth
            navLinks.home.classList.remove('hidden');
            navLinks.equipes.classList.remove('hidden');
            navLinks.brassages.classList.remove('hidden');
            navLinks.eliminatoires.classList.remove('hidden');
            navLinks.classements.classList.remove('hidden');
            authInfoDiv.classList.remove('hidden'); // Contient email et bouton logout
            userEmailSpan.textContent = window.auth.currentUser ? window.auth.currentUser.email || "Anonyme" : "Déconnecté";
            logoutBtn.classList.remove('hidden');
            selectTournamentBtn.classList.remove('hidden');
            currentTournamentNameDisplay.classList.remove('hidden');
        } else if (window.userId && !currentTournamentId) {
            // Utilisateur connecté, mais aucun tournoi sélectionné : seulement tournois et auth visible
            navLinks.home.classList.add('hidden');
            navLinks.equipes.classList.add('hidden');
            navLinks.brassages.classList.add('hidden');
            navLinks.eliminatoires.classList.add('hidden');
            navLinks.classements.classList.add('hidden');
            authInfoDiv.classList.remove('hidden');
            userEmailSpan.textContent = window.auth.currentUser ? window.auth.currentUser.email || "Anonyme" : "Déconnecté";
            logoutBtn.classList.remove('hidden');
            selectTournamentBtn.classList.remove('hidden'); // Toujours visible pour sélectionner un tournoi
            currentTournamentNameDisplay.classList.add('hidden'); // Masquer le nom du tournoi si aucun sélectionné
        } else {
            // Non connecté : seulement tournois (pour s'inscrire/se connecter) et accueil, le reste masqué
            navLinks.home.classList.remove('hidden');
            navLinks.equipes.classList.add('hidden');
            navLinks.brassages.classList.add('hidden');
            navLinks.eliminatoires.classList.add('hidden');
            navLinks.classements.classList.add('hidden');
            authInfoDiv.classList.remove('hidden'); // Auth div visible pour login/register
            userEmailSpan.textContent = "Déconnecté";
            logoutBtn.classList.add('hidden');
            selectTournamentBtn.classList.add('hidden');
            currentTournamentNameDisplay.classList.add('hidden');
        }
        // Le lien "Tournois" (navTournaments) est toujours visible pour les utilisateurs connectés
        if (navLinks.tournaments) {
            navLinks.tournaments.classList.remove('hidden');
        }
    }


    // --- Initialisation de l'Application ---
    // Tout le code qui interagit avec le DOM doit être à l'intérieur de DOMContentLoaded
    document.addEventListener('DOMContentLoaded', () => {
        // 1. Initialisation des variables DOM ici, après que le document soit prêt
        modal = document.getElementById('globalModal');
        modalTitle = document.getElementById('modalTitle');
        modalBody = document.getElementById('modalBody');
        modalConfirmBtn = document.getElementById('modalConfirmBtn');
        modalCancelBtn = document.getElementById('modalCancelBtn');
        toastContainer = document.getElementById('toastContainer');

        authInfoDiv = document.getElementById('authInfo');
        userEmailSpan = document.getElementById('userEmail');
        logoutBtn = document.getElementById('logoutBtn');
        selectTournamentBtn = document.getElementById('selectTournamentBtn');
        currentTournamentNameDisplay = document.getElementById('currentTournamentNameDisplay');

        navLinks = {
            home: document.getElementById('navHome'),
            tournaments: document.getElementById('navTournaments'),
            equipes: document.getElementById('navEquipes'),
            brassages: document.getElementById('navBrassages'),
            eliminatoires: document.getElementById('navEliminatoires'),
            classements: document.getElementById('navClassements'),
        };

        // 2. Attacher les gestionnaires d'événements pour les boutons de la modale globale
        if (modalCancelBtn) {
            modalCancelBtn.addEventListener('click', hideModal);
        } else {
            console.error("modalCancelBtn non trouvé après DOMContentLoaded. Vérifiez l'HTML.");
        }

        // 3. Ajout de la transparence à la barre de navigation lors du défilement
        const navBar = document.querySelector('nav');
        if (navBar) {
            let isScrolled = false;
            window.addEventListener('scroll', () => {
                if (window.scrollY > 0) {
                    if (!isScrolled) {
                        navBar.classList.add('bg-blue-700/70', 'transition-colors', 'duration-300');
                        navBar.classList.remove('bg-blue-700/90');
                        isScrolled = true;
                    }
                } else {
                    if (isScrolled) {
                        navBar.classList.remove('bg-blue-700/70');
                        navBar.classList.add('bg-blue-700/90');
                        isScrolled = false;
                    }
                }
            });
        } else {
            console.warn("Barre de navigation (nav) non trouvée.");
        }

        // 4. Initialiser Firebase et l'authentification APRÈS que le DOM soit prêt
        initializeFirebaseAndAuth();

        // 5. Fonction de rappel appelée par initializeFirebaseAndAuth une fois Firebase initialisé et l'état d'authentification connu
        window.onFirebaseReady = () => {
            console.log("Firebase est prêt. Gestion du routage et chargement initial des données.");
            handleLocationHash(); // Gère la route initiale et la visibilité des liens
        };

        // 6. Écouter les changements de hash dans l'URL pour le routage
        window.addEventListener('hashchange', handleLocationHash);

        // 7. Gestionnaire pour le bouton de déconnexion
        if (logoutBtn) {
            logoutBtn.addEventListener('click', async () => {
                try {
                    await window.signOut(window.auth);
                    showToast("Déconnexion réussie !", "info");
                    // Les variables globales et les listeners sont nettoyés dans le onAuthStateChanged
                } catch (error) {
                    console.error("Erreur de déconnexion:", error);
                    showToast("Erreur lors de la déconnexion.", "error");
                }
            });
        }

        // 8. Gestionnaire pour le bouton "Changer de tournoi"
        if (selectTournamentBtn) {
            selectTournamentBtn.addEventListener('click', () => {
                window.location.hash = '#tournaments';
            });
        }
    });

    // Rendre les fonctions globales nécessaires pour être appelées depuis d'autres parties du code ou directement par le HTML
    window.showToast = showToast;
    window.showModal = showModal;
    window.hideModal = hideModal;
    window.currentTournamentId = currentTournamentId; // Exposer pour l'accès aux autres parties
    window.allTeams = allTeams; // Exposer pour l'accès aux autres parties
    window.allBrassagePhases = allBrassagePhases; // Exposer
    window.eliminationPhases = eliminationPhases; // Exposer
    window.currentSecondaryGroupsPreview = currentSecondaryGroupsPreview; // Exposer
    window.eliminatedTeams = eliminatedTeams; // Exposer
    window.currentDisplayedPhaseId = currentDisplayedPhaseId; // Exposer
    window.currentTournamentData = currentTournamentData; // Exposer
    window.allUserTournaments = allUserTournaments; // Exposer

    window.saveAllData = saveAllData;
    window.loadAllData = loadAllData; // Peut être appelé si on veut recharger manuellement
    window.createNewTournament = createNewTournament;
    window.selectTournament = selectTournament;
    window.deleteTournament = deleteTournament;
    window.teamExists = teamExists;
    window.isMatchRepeated = isMatchRepeated;
    window.updateRepeatedMatchesCountDisplay = updateRepeatedMatchesCountDisplay;
    window.showRepeatedMatchDetailsModal = showRepeatedMatchDetailsModal;
    window.updateNavLinksVisibility = updateNavLinksVisibility;
    window.updateTournamentDisplay = updateTournamentDisplay;
    window.handleLocationHash = handleLocationHash; // Exposer pour pouvoir déclencher un routage

})();
    // --- Fonctions de Gestion des Équipes ---

    /**
     * Ajoute une nouvelle équipe.
     * @param {string} name - Le nom de l'équipe.
     * @param {number} level - Le niveau de l'équipe (1-10).
     */
    function addTeam(name, level) {
        if (!name.trim()) {
            showToast("Le nom de l'équipe ne peut pas être vide.", "error");
            return;
        }
        if (teamExists(name)) { // Utilise la fonction teamExists (définie en Partie 1)
            showToast(`L'équipe "${escapeHtml(name)}" existe déjà. Veuillez choisir un nom différent.`, "error");
            return;
        }
        if (isNaN(level) || level < 1 || level > 10) {
            showToast("Le niveau doit être un nombre entre 1 et 10.", "error");
            return;
        }

        const newTeam = {
            id: 'team_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9),
            name: name.trim(),
            level: level
        };
        allTeams.push(newTeam);
        saveAllData(); // Sauvegarde les données via la fonction globale (définie en Partie 1)
        showToast(`Équipe "${escapeHtml(name)}" ajoutée avec succès !`, "success");
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
        // Vérifie si le nouveau nom existe déjà pour une AUTRE équipe
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
            saveAllData(); // Sauvegarde les données
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
            saveAllData(); // Sauvegarde les données
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

        if (isNaN(requestedTeamsPerPool) || requestedTeamsPerPool < 2) { // Changed min to 2
            showToast("Veuillez entrer un nombre valide d'équipes par poule (au moins 2).", "error");
            console.log("DEBUG: Invalid teams per pool (less than 2), exiting.");
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
        const selectedBasis = basisInitialLevelsRadio.checked ? 'initialLevels' : (basisPreviousResultsRadio.checked ? 'previousResults' : null);
        console.log(`DEBUG: User's selected basis from radio buttons: "${selectedBasis}"`);

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
            effectiveUseInitialLevels = (selectedBasis === 'initialLevels');
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
            // getGlobalRankings est une fonction de la Partie 5, elle est rendue globale pour être accessible ici.
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
        // Changed condition to allow 2 teams per pool if requested
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
            saveAllData(); // Sauvegarde les données
            // Le rendu est géré par onSnapshot après l'appel à saveAllData, donc pas besoin de le faire ici.

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

        // Check if there are enough teams for each level required to form a pool
        for (let level = 1; level <= requestedTeamsPerPool; level++) {
            const teamsAtLevel = teamsByExactLevel.get(level);
            if (!teamsAtLevel || teamsAtLevel.length === 0) {
                requiredLevelsPresent = false;
                return null; // Not enough teams at a specific level
            }
            maxPoolsThatCanBeFormed = Math.min(maxPoolsThatCanBeFormed, teamsAtLevel.length);
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

            // Generate matches for teams within the pool (all against all)
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

        // Distribute remaining teams to existing pools
        let currentPoolIdxForRemaining = 0;
        while (allRemainingTeams.length > 0 && generatedPools.length > 0) {
            if (generatedPools.length === 0) break; // Should not happen if generatedPools.length > 0 initially

            const pool = generatedPools[currentPoolIdxForRemaining];
            const teamToAdd = allRemainingTeams.pop();

            // Check if the team is already in the pool to prevent duplicates
            if (!pool.teams.some(t => t.id === teamToAdd.id)) {
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
            return null;
        }

        const numInternalTiers = requestedTeamsPerPool; // Représente combien de niveaux nous divisons les équipes en
        const totalTeamsInGroup = teamsForThisGroup.length;

        if (numInternalTiers < 1) {
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
            saveAllData();
            return;
        }

        // getGlobalRankings est une fonction de la Partie 5, elle est rendue globale pour être accessible ici.
        const globalRankings = getGlobalRankings(allTeams, allBrassagePhases);
        if (globalRankings.length === 0) {
            showToast("Aucune équipe classée disponible pour créer les groupes. Générez et terminez des phases de brassage initiales d'abord.", "error");
            secondaryGroupsPreviewDisplay.innerHTML = '';
            validateSecondaryGroupsBtn.classList.add('hidden');
            generateSecondaryBrassagesBtn.classList.add('hidden');
            refreshSecondaryGroupScoresBtn.classList.add('hidden'); // Hide refresh button
            currentSecondaryGroupsPreview = {}; // Clear preview if no rankings
            saveAllData();
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

        // renderSecondaryGroupsPreview est une fonction de la Partie 4, elle est rendue globale pour être accessible ici.
        renderSecondaryGroupsPreview(selectedGroupNames);
        saveAllData(); // Save the newly generated preview
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

        showModal(`Gérer l'équipe : ${escapeHtml(teamName)}`, modalContentDiv, () => { /* Aucune action par défaut */ });

        document.getElementById('moveTeamOptionBtn').addEventListener('click', () => {
            hideModal(); // Cacher la modale d'options
            showMoveTeamModal(teamId, teamName, totalPoints, totalDiffScore, currentGroup, allGroupNames);
        });

        document.getElementById('toggleEliminationOptionBtn').addEventListener('click', () => {
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
            // renderSecondaryGroupsPreview est une fonction de la Partie 4, elle est rendue globale pour être accessible ici.
            renderSecondaryGroupsPreview(groupNamesMap[parseInt(numberOfSecondaryGroupsInput.value)]);
            hideModal(); // Cacher la modale après l'action
        });

        // Ajuster les boutons de la modale principale pour qu'ils ne fassent rien
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
    function showMoveTeamModal(teamId, teamName, totalPoints, totalDiffScore, currentGroup, allGroupNames) {
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
            // const moveModalMessage = document.getElementById('moveModalMessage'); // Non utilisé pour l'instant

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
            // renderSecondaryGroupsPreview est une fonction de la Partie 4, elle est rendue globale pour être accessible ici.
            renderSecondaryGroupsPreview(groupNamesMap[parseInt(numberOfSecondaryGroupsInput.value)]);
            saveAllData(); // Save the state after manual move
            showToast(`Équipe ${escapeHtml(teamToMove.name)} déplacée vers ${escapeHtml(toGroup)}.`, "success");

        } else {
            console.error("ERREUR: Équipe non trouvée pour le déplacement:", teamId);
        }
    }

    /**
     * Valide la composition actuelle des groupes secondaires pour les phases éliminatoires.
     * Crée une phase spéciale de type `elimination_seeding`.
     */
    function validateSecondaryGroupsForElimination() {
        const messageContent = document.createElement('p');
        messageContent.textContent = "Confirmer la composition actuelle des groupes pour les phases éliminatoires ? Cette action enregistre ce regroupement.";
        messageContent.className = 'text-gray-700';

        showModal('Valider les Groupes', messageContent, () => {
            if (Object.keys(currentSecondaryGroupsPreview).length === 0) {
                showToast("Aucun groupe à valider. Créez les groupes d'abord.", "error");
                return;
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
            saveAllData();
            showToast("Répartition des groupes validée et enregistrée pour les éliminatoires !", "success");
        });
    }

    /**
     * NOUVELLE FONCTION : Validation directe pour l'élimination.
     * Crée une phase de type `elimination_seeding` avec toutes les équipes éligibles dans un seul groupe.
     */
    async function validateForDirectElimination() {
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

            // getGlobalRankings est une fonction de la Partie 5, elle est rendue globale pour être accessible ici.
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
            await saveAllData();
            showToast("Toutes les équipes éligibles validées pour l'élimination directe !", "success");
            window.location.hash = '#eliminatoires'; // Redirect to elimination page
        }, true); // Use red style for confirmation as it overwrites
    }


    /**
     * Génère les phases de brassage secondaires basées sur les groupes prévisualisés.
     */
    async function generateSecondaryBrassagePhases() {
        console.log("DEBUG: Lancement de generateSecondaryBrassagePhases...");

        const numPoolsInput = document.getElementById('teamsPerPool');
        const numberOfSecondaryGroupsInput = document.getElementById('numberOfSecondaryGroups');
        const secondaryPreviewMessage = document.getElementById('secondaryPreviewMessage');

        const teamsPerPoolForNewPhases = parseInt(numPoolsInput.value);

        if (isNaN(teamsPerPoolForNewPhases) || teamsPerPoolForNewPhases < 2) { // Changed min to 2
            showToast("Veuillez entrer un nombre valide d'équipes par poule (au moins 2) pour les phases secondaires.", "error");
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
                showToast(`Le groupe "${escapeHtml(groupName)}" n'a pas assez d'équipes pour former des poules de ${teamsPerPoolForNewPhases} équipes. (${teamsInThisGroup.length} équipes disponibles)`, "error");
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
            await saveAllData();
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
        const messageContent = document.createElement('p');
        messageContent.textContent = "Êtes-vous sûr de vouloir supprimer TOUTES les phases de brassage (initiales et secondaires) ? Cette action est irréversible.";
        messageContent.className = 'text-gray-700';

        showModal('Confirmer la suppression de toutes les phases', messageContent, async () => {
            allBrassagePhases = allBrassagePhases.filter(p => p.type === PHASE_TYPE_ELIMINATION_SEEDING); // Keep only seeding phases
            currentSecondaryGroupsPreview = {}; // Clear secondary groups preview
            await saveAllData();
            showToast("Toutes les phases de brassage ont été supprimées.", "success");
        }, true); // Use red style for confirmation button
    }

    // Rendre les fonctions globales nécessaires pour être appelées depuis d'autres parties du code.
    window.addTeam = addTeam;
    window.updateTeam = updateTeam;
    window.deleteTeam = deleteTeam;
    window.isBrassagePhaseComplete = isBrassagePhaseComplete;
    window.generateAndEvaluatePools = generateAndEvaluatePools;
    window.generatePoolsForPhase = generatePoolsForPhase;
    window._generatePoolsLogicInitialLevels = _generatePoolsLogicInitialLevels;
    window._generatePoolsLogicRankingBased = _generatePoolsLogicRankingBased;
    window._performSecondaryGroupsPreview = _performSecondaryGroupsPreview;
    window.showTeamOptionsModal = showTeamOptionsModal;
    window.showMoveTeamModal = showMoveTeamModal;
    window.moveTeamBetweenSecondaryGroups = moveTeamBetweenSecondaryGroups;
    window.validateSecondaryGroupsForElimination = validateSecondaryGroupsForElimination;
    window.validateForDirectElimination = validateForDirectElimination;
    window.generateSecondaryBrassagePhases = generateSecondaryBrassagePhases;
    window.clearAllPhases = clearAllPhases;
    /**
     * Affiche la page d'authentification (connexion/inscription).
     */
    function renderAuthPage() {
        APP_CONTAINER.innerHTML = `
            <div class="max-w-md mx-auto bg-white p-8 rounded-lg shadow-md mt-10">
                <h1 class="text-3xl font-bold text-center text-gray-800 mb-6">Connexion / Inscription</h1>
                <div class="mb-4">
                    <label for="authEmail" class="block text-sm font-medium text-gray-700 mb-1">Email</label>
                    <input type="email" id="authEmail" placeholder="votre.email@example.com"
                           class="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 shadow-sm">
                </div>
                <div class="mb-6">
                    <label for="authPassword" class="block text-sm font-medium text-gray-700 mb-1">Mot de passe</label>
                    <input type="password" id="authPassword" placeholder="********"
                           class="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 shadow-sm">
                </div>
                <div class="flex flex-col space-y-3">
                    <button id="loginBtn"
                            class="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 shadow-md transition ease-in-out duration-150">
                        Se connecter
                    </button>
                    <button id="registerBtn"
                            class="w-full bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 shadow-md transition ease-in-out duration-150">
                        S'inscrire
                    </button>
                </div>
                <p id="authMessage" class="mt-4 text-sm text-center text-red-500"></p>
            </div>
        `;
        setupAuthPageLogic();
    }

    /**
     * Logique de la page d'authentification.
     */
    function setupAuthPageLogic() {
        const authEmailInput = document.getElementById('authEmail');
        const authPasswordInput = document.getElementById('authPassword');
        const loginBtn = document.getElementById('loginBtn');
        const registerBtn = document.getElementById('registerBtn');
        const authMessage = document.getElementById('authMessage');

        loginBtn.addEventListener('click', async () => {
            const email = authEmailInput.value.trim();
            const password = authPasswordInput.value.trim();
            if (!email || !password) {
                authMessage.textContent = "Veuillez entrer un email et un mot de passe.";
                return;
            }
            try {
                // Utilise les fonctions Firebase globalement exposées par Partie 1
                await window.signInWithEmailAndPassword(window.auth, email, password);
                showToast("Connexion réussie !", "success");
                authMessage.textContent = "";
                // Redirection gérée par onAuthStateChanged -> loadAllData -> handleLocationHash
            } catch (error) {
                console.error("Erreur de connexion:", error);
                authMessage.textContent = "Erreur de connexion: " + error.message;
                showToast("Erreur de connexion: " + error.message, "error");
            }
        });

        registerBtn.addEventListener('click', async () => {
            const email = authEmailInput.value.trim();
            const password = authPasswordInput.value.trim();
            if (!email || !password) {
                authMessage.textContent = "Veuillez entrer un email et un mot de passe.";
                return;
            }
            if (password.length < 6) {
                authMessage.textContent = "Le mot de passe doit contenir au moins 6 caractères.";
                return;
            }
            try {
                // Utilise les fonctions Firebase globalement exposées par Partie 1
                await window.createUserWithEmailAndPassword(window.auth, email, password);
                showToast("Inscription réussie ! Vous êtes maintenant connecté.", "success");
                authMessage.textContent = "";
                // Redirection gérée par onAuthStateChanged -> loadAllData -> handleLocationHash
            } catch (error) {
                console.error("Erreur d'inscription:", error);
                authMessage.textContent = "Erreur d'inscription: " + error.message;
                showToast("Erreur d'inscription: " + error.message, "error");
            }
        });
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
                        Notre objectif est de rendre l'organisation transparente et amusante !
                    </p>
                </div>
                <p class="text-2xl text-center font-extrabold text-blue-700 mt-12">
                    Prêt(e) à révolutionner vos tournois ? Accroche-toi, l'aventure commence maintenant ! <img src="Images/voila.png" alt="emoji casse-tête" class="inline-block w-12 h-12 align-middle mx-1">
                </p>
            </div>
        `;
    }

    /**
     * Affiche la page de gestion des équipes.
     */
    function renderEquipesPage() {
        // Calculate team count by level
        let levelCounts = {};
        // allTeams est une variable globale exposée par Partie 1
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

        APP_CONTAINER.innerHTML = `
            <h1 class="text-3xl font-bold text-center text-gray-800 mb-8">Gestion des Équipes</h1>

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
                ${levelCountsHtml} <!-- Added level counts display here -->
                <div id="teamsList" class="space-y-4">
                    <!-- Les équipes seront listées ici -->
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

    /**
     * Logique de la page de gestion des équipes.
     */
    function setupEquipesPageLogic() {
        const teamNameInput = document.getElementById('teamName');
        const teamLevelInput = document.getElementById('teamLevel');
        const addTeamBtn = document.getElementById('addTeamBtn');
        const teamsListDiv = document.getElementById('teamsList');
        const clearTeamsBtn = document.getElementById('clearTeamsBtn');
        const messageElement = document.getElementById('message'); // Not directly used, but kept for consistency
        const excelFileInput = document.getElementById('excelFileInput');
        const importTeamsBtn = document.getElementById('importTeamsBtn');
        const importMessageElement = document.getElementById('importMessage'); // Not directly used, but kept for consistency
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
                        // showModal est une fonction globale exposée par Partie 1
                        showModal('Éditer l\'équipe', formDiv, () => {
                            const newName = document.getElementById('editTeamName').value.trim();
                            const newLevel = parseInt(document.getElementById('editTeamLevel').value);

                            if (!newName) {
                                showToast("Le nom de l'équipe ne peut pas être vide.", "error");
                                return;
                            }
                            // teamExists est une fonction globale exposée par Partie 1
                            if (teamExists(newName) && newName.toLowerCase() !== teamToEdit.name.toLowerCase()) {
                                showToast(`Une équipe nommée "${escapeHtml(newName)}" existe déjà.`, "error");
                                return;
                            }
                            if (isNaN(newLevel) || newLevel < 1 || newLevel > 10) {
                                showToast("Le niveau doit être un nombre entre 1 et 10.", "error");
                                return;
                            }

                            // updateTeam est une fonction globale exposée par Partie 2
                            updateTeam(teamId, newName, newLevel);
                        });
                    }
                });
            });

            document.querySelectorAll('.delete-team-btn').forEach(button => {
                button.addEventListener('click', (event) => {
                    const teamId = event.target.dataset.id;
                    // deleteTeam est une fonction globale exposée par Partie 2
                    deleteTeam(teamId);
                });
            });
        }

        addTeamBtn.addEventListener('click', () => {
            const name = teamNameInput.value.trim();
            const level = parseInt(teamLevelInput.value);
            // addTeam est une fonction globale exposée par Partie 2
            addTeam(name, level);
            teamNameInput.value = '';
            teamLevelInput.value = '5';
        });

        clearTeamsBtn.addEventListener('click', () => {
            const messageContent = document.createElement('p');
            messageContent.textContent = "Êtes-vous sûr de vouloir supprimer TOUTES les équipes ? Cette action est irréversible.";
            messageContent.className = 'text-gray-700';

            // showModal est une fonction globale exposée par Partie 1
            showModal('Confirmer la suppression de toutes les équipes', messageContent, () => {
                allTeams = []; // allTeams est une variable globale exposée par Partie 1
                eliminatedTeams.clear(); // eliminatedTeams est une variable globale exposée par Partie 1
                saveAllData(); // saveAllData est une fonction globale exposée par Partie 1
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
                // XLSX est chargé via un CDN dans index.html
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                const json = XLSX.utils.sheet_to_json(worksheet);

                let importedCount = 0;
                let failedCount = 0;
                let newTeams = [];
                let skippedNames = [];

                json.forEach(row => {
                    const name = row['Nom']; // Assurez-vous que le nom de la colonne est 'Nom'
                    const level = parseInt(row['Niveau']); // Assurez-vous que le nom de la colonne est 'Niveau'

                    if (name && !isNaN(level) && level >= 1 && level <= 10) {
                        // teamExists est une fonction globale exposée par Partie 1
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
                        console.warn('Ligne ignorée en raison de données invalides:', row);
                    }
                });

                if (importedCount > 0) {
                    allTeams.push(...newTeams); // allTeams est une variable globale exposée par Partie 1
                    saveAllData(); // saveAllData est une fonction globale exposée par Partie 1
                    let successMsg = `${importedCount} équipe(s) importée(s) avec succès.`;
                    if (skippedNames.length > 0) {
                        successMsg += ` ${failedCount} équipe(s) ignorée(s) (noms déjà existants ou données invalides) : ${skippedNames.map(escapeHtml).join(', ')}.`;
                    }
                    showToast(successMsg, "success"); // showToast est une fonction globale exposée par Partie 1
                } else if (json.length > 0) { // If there were rows, but none imported successfully
                     let errorMsg = "Aucune équipe n'a pu être importée.";
                     if (skippedNames.length > 0) {
                         errorMsg += ` Les équipes suivantes existent déjà : ${skippedNames.map(escapeHtml).join(', ')}.`;
                     }
                     errorMsg += " Vérifiez le format des colonnes ('Nom', 'Niveau') et la validité des données (niveau entre 1 et 10).";
                     showToast(errorMsg, "error"); // showToast est une fonction globale exposée par Partie 1
                } else { // File was empty or only headers
                    showToast("Aucune nouvelle équipe n'a été trouvée dans le fichier ou le fichier est vide.", "info"); // showToast est une fonction globale exposée par Partie 1
                }
                excelFileInput.value = ''; // Clear the input after processing
            };
            reader.onerror = (ex) => {
                showToast("Erreur lors de la lecture du fichier : " + ex.message, "error"); // showToast est une fonction globale exposée par Partie 1
                console.error("Erreur de lecture de fichier:", ex);
            };
            reader.readAsArrayBuffer(file);
        });

        renderTeams(); // Initial render of teams when the page is loaded
    }

    // Rendre les fonctions globales nécessaires pour être appelées depuis d'autres parties du code ou directement par le HTML
    window.renderAuthPage = renderAuthPage;
    window.setupAuthPageLogic = setupAuthPageLogic;
    window.renderHomePage = renderHomePage;
    window.renderEquipesPage = renderEquipesPage;
    window.setupEquipesPageLogic = setupEquipesPageLogic;
    /**
     * Affiche la page de gestion des phases de brassage.
     */
    function renderBrassagesPage() {
        // Find the last validated elimination seeding phase, if any
        // allBrassagePhases est une variable globale exposée par Partie 1
        const lastSeedingPhase = allBrassagePhases
            .filter(p => p.type === PHASE_TYPE_ELIMINATION_SEEDING && p.generated)
            .sort((a, b) => b.timestamp - a.timestamp)[0]; // Get the most recent one

        const directEliminationButton = lastSeedingPhase
            ? `<p class="text-sm text-gray-600 mt-2">Vous avez déjà validé une répartition pour les éliminatoires le ${new Date(lastSeedingPhase.timestamp).toLocaleDateString('fr-FR')} : "${escapeHtml(lastSeedingPhase.name)}".</p>
               <p class="text-sm text-gray-600">Vous pouvez re-générer des brassages secondaires si vous le souhaitez, mais la phase validée sera utilisée pour les éliminatoires.</p>`
            : `<button id="validateForDirectEliminationBtn"
                        class="bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 shadow-md transition ease-in-out duration-150 w-full sm:w-auto">
                    Valider toutes les équipes éligibles pour l'élimination directe
                </button>
                <p class="text-xs text-gray-600 mt-2">Passez directement aux éliminatoires en utilisant le classement général actuel de toutes les équipes non éliminées.</p>`;


        APP_CONTAINER.innerHTML = `
            <h1 class="text-3xl font-bold text-center text-gray-800 mb-8">Gestion des Phases de Brassage</h1>

            <section class="mb-8 p-6 bg-gray-50 rounded-lg border border-gray-200">
                <h2 class="text-2xl font-semibold text-gray-700 mb-4">Générer une Nouvelle Phase de Brassage</h2>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
                    <div>
                        <label for="teamsPerPool" class="block text-sm font-medium text-gray-700 mb-1">Équipes par poule (2-10)</label>
                        <input type="number" id="teamsPerPool" min="2" max="10" value="3"
                               class="w-96 p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 shadow-sm">
                    </div>
                    <div class="flex flex-col space-y-2">
                        <label class="block text-sm font-medium text-gray-700">Baser la génération sur :</label>
                        <div class="flex space-x-4">
                            <label class="inline-flex items-center">
                                <input type="radio" name="poolBasis" value="initialLevels" id="basisInitialLevels" class="form-radio text-blue-600">
                                <span class="ml-2 text-gray-700">Niveaux initiaux des équipes</span>
                            </label>
                            <label class="inline-flex items-center">
                                <input type="radio" name="poolBasis" value="previousResults" id="basisPreviousResults" class="form-radio text-blue-600">
                                <span class="ml-2 text-gray-700">Résultats des phases précédentes</span>
                            </label>
                        </div>
                    </div>
                    <div class="md:col-span-2">
                         <button id="addInitialBrassagePhaseBtn"
                                class="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 shadow-md transition ease-in-out duration-150">
                            Créer une Nouvelle Phase de Brassage Initiale
                        </button>
                    </div>
                </div>
            </section>

            <section class="mb-8 p-6 bg-gray-50 rounded-lg border border-gray-200">
                <h2 class="text-2xl font-semibold text-gray-700 mb-4">Phases de Brassage Secondaires (basées sur les résultats)</h2>
                <p class="text-sm text-gray-600 mb-4">Après avoir complété des phases de brassage initiales, vous pouvez générer des phases secondaires pour regrouper les équipes par niveau de performance actuel.</p>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
                    <div>
                        <label for="numberOfSecondaryGroups" class="block text-sm font-medium text-gray-700 mb-1">Nombre de groupes de niveau</label>
                        <select id="numberOfSecondaryGroups" class="w-96 p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 shadow-sm">
                            <option value="2">2 Groupes (Principale, Consolante)</option>
                            <option value="3">3 Groupes (Principale, Consolante, Super Consolante)</option>
                        </select>
                    </div>
                    <div class="flex flex-col space-y-2">
                        <button id="previewSecondaryGroupsBtn"
                                class="bg-purple-600 text-white py-2 px-4 rounded-md hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 shadow-md transition ease-in-out duration-150">
                            Prévisualiser les groupes secondaires
                        </button>
                        <button id="refreshSecondaryGroupScoresBtn" class="bg-gray-400 text-white py-2 px-4 rounded-md hover:bg-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-offset-2 shadow-md transition ease-in-out duration-150 hidden">
                            Actualiser les scores des groupes
                        </button>
                    </div>
                </div>

                <div id="secondaryPreviewMessage" class="mt-4 text-sm text-center text-red-500"></div>

                <div id="secondaryGroupsPreviewDisplay" class="mt-6 p-4 bg-white rounded-md border border-gray-200 shadow-inner">
                    <p class="text-gray-500 text-center w-full md:col-span-2 lg:col-span-3">Créez les groupes ici après avoir cliqué sur "Prévisualiser les groupes secondaires".</p>
                </div>
                
                <div class="flex flex-col sm:flex-row gap-3 mt-6">
                    <button id="validateSecondaryGroupsBtn"
                            class="bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 shadow-md transition ease-in-out duration-150 w-full sm:w-auto hidden">
                        Valider cette répartition de groupes pour les éliminatoires
                    </button>
                    <button id="generateSecondaryBrassagesBtn"
                            class="bg-orange-600 text-white py-2 px-4 rounded-md hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 shadow-md transition ease-in-out duration-150 w-full sm:w-auto hidden">
                        Générer des phases de brassage avec ces groupes
                    </button>
                </div>

                <div class="mt-6 text-center">
                    ${directEliminationButton}
                </div>
            </section>

            <section class="p-6 bg-gray-50 rounded-lg border border-gray-200">
                <h2 class="text-2xl font-semibold text-gray-700 mb-4">Historique et Gestion des Phases</h2>
                <div class="flex flex-col md:flex-row md:space-x-4">
                    <div class="md:w-1/3 mb-6 md:mb-0">
                        <h3 class="text-xl font-medium text-gray-700 mb-3">Phases Créées (<span id="phaseCountDisplay">0</span>)</h3>
                        <div id="phaseHistory" class="space-y-3 max-h-96 overflow-y-auto pr-2">
                            <p class="text-gray-500 text-center">Aucune phase n'a été créée pour le moment.</p>
                        </div>
                        <div class="mt-4 text-center">
                            <button id="clearAllPhasesBtn"
                                    class="bg-red-600 text-white py-2 px-4 rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 shadow-md transition ease-in-out duration-150">
                                Effacer toutes les phases de brassage
                            </button>
                        </div>
                    </div>
                    <div class="md:w-2/3">
                        <h3 id="currentPhaseTitle" class="text-xl font-medium text-gray-700 mb-3">Poules de la Phase Actuelle</h3>
                        <div class="flex items-center justify-between mb-4">
                            <p id="poolGenerationMessage" class="text-sm text-red-500"></p>
                            <button id="generatePoolsBtn"
                                    class="bg-blue-500 text-white px-4 py-2 rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 shadow-md transition ease-in-out duration-150 hidden">
                                Générer les poules pour cette phase
                            </button>
                            <button id="deleteCurrentPhaseBtn"
                                    class="bg-red-500 text-white px-4 py-2 rounded-md hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 shadow-md transition ease-in-out duration-150 hidden">
                                Supprimer cette phase
                            </button>
                            <button id="editCurrentPhaseBtn"
                                    class="bg-yellow-500 text-white px-4 py-2 rounded-md hover:bg-yellow-600 focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:ring-offset-2 shadow-md transition ease-in-out duration-150 hidden">
                                Renommer cette phase
                            </button>
                        </div>
                        <div id="poolsDisplay" class="bg-white p-4 rounded-md border border-gray-200 shadow-inner max-h-[calc(100vh-300px)] overflow-y-auto">
                            <p class="text-gray-500 text-center">Les poules de la phase sélectionnée s'afficheront ici.</p>
                        </div>
                    </div>
                </div>
            </section>
        `;
        setupBrassagesPageLogic();
    }

    /**
     * Logique de la page de gestion des phases de brassage.
     */
    function setupBrassagesPageLogic() {
        const addInitialBrassagePhaseBtn = document.getElementById('addInitialBrassagePhaseBtn');
        const phaseHistoryDiv = document.getElementById('phaseHistory');
        const poolsDisplay = document.getElementById('poolsDisplay');
        const currentPhaseTitle = document.getElementById('currentPhaseTitle');
        const generatePoolsBtn = document.getElementById('generatePoolsBtn');
        const deleteCurrentPhaseBtn = document.getElementById('deleteCurrentPhaseBtn');
        const editCurrentPhaseBtn = document.getElementById('editCurrentPhaseBtn');
        const clearAllPhasesBtn = document.getElementById('clearAllPhasesBtn');
        const teamsPerPoolInput = document.getElementById('teamsPerPool');
        const basisInitialLevelsRadio = document.getElementById('basisInitialLevels');
        const basisPreviousResultsRadio = document.getElementById('basisPreviousResults');
        const poolGenerationMessage = document.getElementById('poolGenerationMessage');
        const phaseCountDisplay = document.getElementById('phaseCountDisplay');

        const numberOfSecondaryGroupsSelect = document.getElementById('numberOfSecondaryGroups');
        const previewSecondaryGroupsBtn = document.getElementById('previewSecondaryGroupsBtn');
        const secondaryGroupsPreviewDisplay = document.getElementById('secondaryGroupsPreviewDisplay');
        const validateSecondaryGroupsBtn = document.getElementById('validateSecondaryGroupsBtn');
        const generateSecondaryBrassagesBtn = document.getElementById('generateSecondaryBrassagesBtn');
        const secondaryPreviewMessage = document.getElementById('secondaryPreviewMessage');
        const refreshSecondaryGroupScoresBtn = document.getElementById('refreshSecondaryGroupScoresBtn');
        const validateForDirectEliminationBtn = document.getElementById('validateForDirectEliminationBtn');

        // Restore saved pool generation basis
        const savedBasis = localStorage.getItem(POOL_GENERATION_BASIS_KEY);
        if (savedBasis === 'initialLevels') {
            basisInitialLevelsRadio.checked = true;
        } else if (savedBasis === 'previousResults') {
            basisPreviousResultsRadio.checked = true;
        } else {
            basisInitialLevelsRadio.checked = true; // Default
        }

        // Add event listeners to save preference
        basisInitialLevelsRadio.addEventListener('change', () => {
            localStorage.setItem(POOL_GENERATION_BASIS_KEY, 'initialLevels');
        });
        basisPreviousResultsRadio.addEventListener('change', () => {
            localStorage.setItem(POOL_GENERATION_BASIS_KEY, 'previousResults');
        });

        function renderPhaseHistory() {
            phaseHistoryDiv.innerHTML = '';
            phaseCountDisplay.textContent = allBrassagePhases.length.toString(); // allBrassagePhases est globale

            const sortedPhases = [...allBrassagePhases].sort((a, b) => a.timestamp - b.timestamp);

            if (sortedPhases.length === 0) {
                phaseHistoryDiv.innerHTML = '<p class="text-gray-500 text-center">Aucune phase n\'a été créée pour le moment.</p>';
                poolsDisplay.innerHTML = '<p class="text-gray-500 text-center">Les poules de la phase sélectionnée s\'afficheront ici.</p>';
                currentPhaseTitle.textContent = 'Poules de la Phase Actuelle';
                currentDisplayedPhaseId = null; // currentDisplayedPhaseId est globale
                generatePoolsBtn.classList.add('hidden');
                deleteCurrentPhaseBtn.classList.add('hidden');
                editCurrentPhaseBtn.classList.add('hidden');
                return;
            }

            sortedPhases.forEach(phase => {
                // Skip rendering elimination_seeding phases in the brassage history list
                if (phase.type === PHASE_TYPE_ELIMINATION_SEEDING) {
                    return;
                }

                const phaseEntry = document.createElement('div');
                let phaseClass = 'p-3 rounded-md shadow-sm border ';
                let statusText = '';

                if (currentDisplayedPhaseId === phase.id) { // currentDisplayedPhaseId est globale
                    phaseClass += 'bg-blue-100 border-blue-300';
                } else {
                    phaseClass += 'bg-white border-gray-200 hover:bg-gray-100 cursor-pointer';
                }

                if (phase.generated) {
                    statusText = '<span class="text-green-600 font-semibold">(Générée)</span>';
                    if (isBrassagePhaseComplete(phase)) { // isBrassagePhaseComplete est globale
                        statusText = '<span class="text-green-700 font-semibold">(Terminée)</span>';
                    } else if (phase.pools && phase.pools.length > 0) {
                        statusText = '<span class="text-orange-600 font-semibold">(En Cours)</span>';
                    }
                } else {
                    statusText = '<span class="text-red-600 font-semibold">(Non générée)</span>';
                }
                const phaseDate = new Date(phase.timestamp).toLocaleDateString('fr-FR');


                phaseEntry.className = phaseClass + ' flex justify-between items-center';
                phaseEntry.innerHTML = `
                    <span class="font-medium text-gray-800 flex-grow">${escapeHtml(phase.name)} <br> <span class="text-xs text-gray-500">${phaseDate}</span></span>
                    ${statusText}
                `;
                phaseEntry.dataset.phaseId = phase.id;
                phaseHistoryDiv.appendChild(phaseEntry);

                phaseEntry.addEventListener('click', (event) => {
                    const targetPhaseId = event.currentTarget.dataset.phaseId;
                    currentDisplayedPhaseId = targetPhaseId; // currentDisplayedPhaseId est globale
                    renderPhaseHistory(); // Re-render history to highlight active
                    displayCurrentPhasePools(targetPhaseId);
                });
            });

            // After rendering history, if no phase is explicitly selected, try to display the latest non-seeding brassage phase
            if (!currentDisplayedPhaseId && sortedPhases.filter(p => p.type !== PHASE_TYPE_ELIMINATION_SEEDING).length > 0) {
                const latestBrassagePhase = sortedPhases.filter(p => p.type !== PHASE_TYPE_ELIMINATION_SEEDING).pop();
                if (latestBrassagePhase) {
                    currentDisplayedPhaseId = latestBrassagePhase.id; // currentDisplayedPhaseId est globale
                    displayCurrentPhasePools(currentDisplayedPhaseId);
                    renderPhaseHistory(); // Re-render to highlight it
                }
            } else if (currentDisplayedPhaseId) {
                // If a phase was already selected, make sure its content is displayed
                displayCurrentPhasePools(currentDisplayedPhaseId);
            }
        }

        function displayCurrentPhasePools(phaseId) {
            const phase = allBrassagePhases.find(p => p.id === phaseId); // allBrassagePhases est globale
            if (!phase) {
                poolsDisplay.innerHTML = '<p class="text-gray-500 text-center">Phase introuvable.</p>';
                currentPhaseTitle.textContent = 'Poules de la Phase Actuelle';
                generatePoolsBtn.classList.add('hidden');
                deleteCurrentPhaseBtn.classList.add('hidden');
                editCurrentPhaseBtn.classList.add('hidden');
                poolGenerationMessage.textContent = '';
                return;
            }

            currentPhaseTitle.textContent = `Poules pour : ${escapeHtml(phase.name)}`;
            deleteCurrentPhaseBtn.classList.remove('hidden');
            editCurrentPhaseBtn.classList.remove('hidden');

            if (!phase.generated || !phase.pools || phase.pools.length === 0) {
                poolsDisplay.innerHTML = `
                    <div class="text-center p-4">
                        <p class="text-gray-600 mb-4">Cette phase n'a pas encore de poules générées.</p>
                        <button id="generatePoolsForSelectedPhaseBtn"
                                class="bg-blue-500 text-white px-4 py-2 rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 shadow-md transition ease-in-out duration-150">
                            Générer les poules
                        </button>
                    </div>
                `;
                generatePoolsBtn.classList.add('hidden'); // Hide the main one as we have an internal button
                poolGenerationMessage.textContent = ''; // Clear previous message
                document.getElementById('generatePoolsForSelectedPhaseBtn')?.addEventListener('click', () => {
                    generatePoolsForPhase(phaseId); // generatePoolsForPhase est globale (Partie 2)
                });
                return;
            }

            // Show generate pools button if phase is not complete (allowing re-generation)
            // Or if it's the very first phase, allow re-generation.
            const sortedBrassagePhases = allBrassagePhases.filter(p => p.type !== PHASE_TYPE_ELIMINATION_SEEDING).sort((a,b) => a.timestamp - b.timestamp);
            const isFirstBrassagePhase = sortedBrassagePhases.length > 0 && sortedBrassagePhases[0].id === phase.id;

            if (!isBrassagePhaseComplete(phase) || isFirstBrassagePhase) { // isBrassagePhaseComplete est globale (Partie 2)
                generatePoolsBtn.classList.remove('hidden');
                if (!isBrassagePhaseComplete(phase)) {
                    poolGenerationMessage.textContent = 'Vous pouvez re-générer les poules de cette phase si les scores ne sont pas encore tous saisis.';
                    poolGenerationMessage.className = 'text-sm text-orange-600';
                } else {
                    poolGenerationMessage.textContent = 'Vous pouvez re-générer les poules de cette phase même si elle est terminée.';
                    poolGenerationMessage.className = 'text-sm text-gray-600';
                }
            } else {
                generatePoolsBtn.classList.add('hidden');
                poolGenerationMessage.textContent = 'Cette phase est terminée. Pour la re-générer, supprimez les phases suivantes qui en dépendent.';
                poolGenerationMessage.className = 'text-sm text-red-500';

                // Check if current phase has a dependent next phase
                const nextPhase = sortedBrassagePhases[sortedBrassagePhases.findIndex(p => p.id === phase.id) + 1];
                if (nextPhase && nextPhase.type === PHASE_TYPE_SECONDARY_BRASSAGE) {
                    poolGenerationMessage.textContent = `Cette phase est terminée et a généré la phase suivante : "${escapeHtml(nextPhase.name)}". Vous devez supprimer les phases suivantes avant de pouvoir re-générer celle-ci.`;
                    poolGenerationMessage.className = 'text-sm text-red-500';
                }
            }


            let poolsHtml = '';
            phase.pools.forEach(pool => {
                poolsHtml += `
                    <div class="pool-card bg-white border border-blue-200 rounded-lg shadow-md mb-6 p-4">
                        <h4 class="text-lg font-bold text-blue-700 mb-3">${escapeHtml(pool.name)}</h4>
                        <div class="mb-4">
                            <h5 class="text-md font-semibold text-gray-700 mb-2">Équipes dans la poule:</h5>
                            <ul class="list-disc list-inside text-gray-800">
                                ${pool.teams.map(team => `<li>${escapeHtml(team.name)} (Niveau: ${escapeHtml(team.level.toString())})</li>`).join('')}
                            </ul>
                        </div>
                        <div>
                            <h5 class="text-md font-semibold text-gray-700 mb-2">Matchs:</h5>
                            <div class="space-y-3">
                                ${pool.matches.map(match => {
                                    const team1 = allTeams.find(t => t.id === match.team1Id); // allTeams est globale
                                    const team2 = allTeams.find(t => t.id === match.team2Id); // allTeams est globale
                                    const team1Name = team1 ? escapeHtml(team1.name) : 'Équipe inconnue';
                                    const team2Name = team2 ? escapeHtml(team2.name) : 'Équipe inconnue';

                                    const score1 = match.score1 !== null ? match.score1 : '';
                                    const score2 = match.score2 !== null ? match.score2 : '';
                                    const winnerClass = match.winnerId ? (match.winnerId === match.team1Id ? 'font-bold text-green-700' : 'text-gray-800') : '';
                                    const loserClass = match.winnerId ? (match.winnerId === match.team2Id ? 'font-bold text-green-700' : 'text-gray-800') : '';

                                    return `
                                        <div class="match-entry p-3 border border-gray-200 rounded-md bg-gray-50 flex items-center justify-between flex-wrap gap-2">
                                            <span class="text-sm ${winnerClass}">${team1Name}</span>
                                            <input type="number" data-phase-id="${phase.id}" data-pool-id="${pool.id}" data-match-id="${match.team1Id}_${match.team2Id}" data-score-type="score1"
                                                   value="${score1}" placeholder="0" class="score-input w-16 p-1 border border-gray-300 rounded-md text-center text-sm">
                                            <span class="font-bold text-gray-700"> - </span>
                                            <input type="number" data-phase-id="${phase.id}" data-pool-id="${pool.id}" data-match-id="${match.team1Id}_${match.team2Id}" data-score-type="score2"
                                                   value="${score2}" placeholder="0" class="score-input w-16 p-1 border border-gray-300 rounded-md text-center text-sm">
                                            <span class="text-sm ${loserClass}">${team2Name}</span>
                                        </div>
                                    `;
                                }).join('')}
                            </div>
                        </div>
                    </div>
                `;
            });
            poolsDisplay.innerHTML = poolsHtml;

            document.querySelectorAll('.score-input').forEach(input => {
                input.addEventListener('change', (event) => {
                    const phaseId = event.target.dataset.phaseId;
                    const poolId = event.target.dataset.poolId;
                    const matchIds = event.target.dataset.matchId.split('_'); // [team1Id, team2Id]
                    const scoreType = event.target.dataset.scoreType;
                    const value = parseInt(event.target.value);

                    updateMatchScore(phaseId, poolId, matchIds[0], matchIds[1], scoreType, value);
                });
            });
        }

        // Function to update match score in allBrassagePhases and determine winner
        function updateMatchScore(phaseId, poolId, team1Id, team2Id, scoreType, value) {
            const phase = allBrassagePhases.find(p => p.id === phaseId); // allBrassagePhases est globale
            if (!phase) return;

            const pool = phase.pools.find(p => p.id === poolId);
            if (!pool) return;

            const match = pool.matches.find(m =>
                (m.team1Id === team1Id && m.team2Id === team2Id) ||
                (m.team1Id === team2Id && m.team2Id === team1Id)
            );
            if (!match) return;

            if (scoreType === 'score1') {
                match.score1 = value;
            } else {
                match.score2 = value;
            }

            match.winnerId = null; // Reset winner
            match.loserId = null; // Reset loser

            if (match.score1 !== null && match.score2 !== null && !isNaN(match.score1) && !isNaN(match.score2)) {
                if (match.score1 > match.score2) {
                    match.winnerId = match.team1Id;
                    match.loserId = match.team2Id;
                } else if (match.score2 > match.score1) {
                    match.winnerId = match.team2Id;
                    match.loserId = match.team1Id;
                } else {
                    // Handle draw (e.g., set winner to null, show message)
                    showToast("Un match ne peut pas être un match nul. Veuillez entrer un vainqueur.", "error"); // showToast est globale
                }
            }
            saveAllData(); // saveAllData est globale
            renderPhaseHistory(); // Re-render history to update status (e.g., "En Cours" to "Terminée")
            displayCurrentPhasePools(currentDisplayedPhaseId); // Re-render current pools to update winner styling
        }


        addInitialBrassagePhaseBtn.addEventListener('click', () => {
            if (allTeams.length === 0) { // allTeams est globale
                showToast("Veuillez ajouter des équipes avant de créer une phase.", "error"); // showToast est globale
                return;
            }
            const initialLevelBasisChecked = basisInitialLevelsRadio.checked;
            const previousResultsBasisChecked = basisPreviousResultsRadio.checked;

            if (!initialLevelBasisChecked && !previousResultsBasisChecked) {
                showToast("Veuillez sélectionner une base de génération (niveaux initiaux ou résultats précédents).", "error"); // showToast est globale
                return;
            }

            const messageContent = document.createElement('div');
            messageContent.className = 'space-y-4';
            messageContent.innerHTML = `
                <p class="text-gray-700">Donnez un nom à cette nouvelle phase de brassage initiale :</p>
                <input type="text" id="newPhaseNameInput" placeholder="Ex: Phase de Brassage 1"
                       class="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 shadow-sm">
                <p id="newPhaseNameError" class="text-red-500 text-sm mt-1"></p>
            `;

            showModal('Nommer la Nouvelle Phase', messageContent, async () => { // showModal est globale
                const newPhaseNameInput = document.getElementById('newPhaseNameInput');
                const newPhaseNameError = document.getElementById('newPhaseNameError');
                const phaseName = newPhaseNameInput.value.trim();

                if (!phaseName) {
                    newPhaseNameError.textContent = "Le nom de la phase ne peut pas être vide.";
                    return; // Don't close modal
                }

                // Check for existing phase name
                if (allBrassagePhases.some(p => p.name.toLowerCase() === phaseName.toLowerCase())) { // allBrassagePhases est globale
                    newPhaseNameError.textContent = `Une phase nommée "${escapeHtml(phaseName)}" existe déjà.`; // escapeHtml est globale
                    return; // Don't close modal
                }

                // Check if the previous phase (if results-based) is complete
                const sortedBrassagePhases = allBrassagePhases.filter(p => p.type !== PHASE_TYPE_ELIMINATION_SEEDING).sort((a,b) => a.timestamp - b.timestamp);
                const lastBrassagePhase = sortedBrassagePhases.length > 0 ? sortedBrassagePhases[sortedBrassagePhases.length - 1] : null;

                if (previousResultsBasisChecked && lastBrassagePhase && !isBrassagePhaseComplete(lastBrassagePhase)) { // isBrassagePhaseComplete est globale
                    showToast(`Veuillez compléter tous les scores de la phase précédente ("${escapeHtml(lastBrassagePhase.name)}") avant de créer une nouvelle phase basée sur les résultats.`, "error"); // showToast est globale
                    return; // Keep modal open and return
                }

                // If all checks pass, proceed to create phase
                const newPhase = {
                    id: 'phase_' + Date.now(),
                    name: phaseName,
                    type: PHASE_TYPE_INITIAL, // Always initial_brassage type for this button
                    pools: [],
                    generated: false,
                    timestamp: Date.now()
                };
                allBrassagePhases.push(newPhase); // allBrassagePhases est globale
                currentDisplayedPhaseId = newPhase.id; // currentDisplayedPhaseId est globale
                saveAllData(); // saveAllData est globale
                showToast(`Phase "${escapeHtml(phaseName)}" créée. Générez maintenant les poules.`, "success"); // showToast est globale
            });
        });

        generatePoolsBtn.addEventListener('click', () => {
            if (currentDisplayedPhaseId) { // currentDisplayedPhaseId est globale
                generatePoolsForPhase(currentDisplayedPhaseId); // generatePoolsForPhase est globale (Partie 2)
            } else {
                showToast("Veuillez sélectionner une phase dans l'historique à gauche.", "error"); // showToast est globale
            }
        });

        deleteCurrentPhaseBtn.addEventListener('click', () => {
            if (!currentDisplayedPhaseId) { // currentDisplayedPhaseId est globale
                showToast("Aucune phase sélectionnée à supprimer.", "error"); // showToast est globale
                return;
            }
            const phaseToDelete = allBrassagePhases.find(p => p.id === currentDisplayedPhaseId); // allBrassagePhases est globale
            if (!phaseToDelete) {
                showToast("Phase introuvable pour la suppression.", "error"); // showToast est globale
                return;
            }

            const messageContent = document.createElement('p');
            messageContent.textContent = `Êtes-vous sûr de vouloir supprimer la phase "${escapeHtml(phaseToDelete.name)}" ? Cette action est irréversible.`; // escapeHtml est globale
            messageContent.className = 'text-gray-700';

            showModal('Confirmer la suppression', messageContent, () => { // showModal est globale
                const sortedPhases = allBrassagePhases.filter(p => p.type !== PHASE_TYPE_ELIMINATION_SEEDING).sort((a,b) => a.timestamp - b.timestamp);
                const phaseIndex = sortedPhases.findIndex(p => p.id === currentDisplayedPhaseId);

                // Prevent deletion if there's a subsequent phase that depends on this one's results
                if (phaseIndex !== -1 && phaseIndex < sortedPhases.length - 1) {
                    const nextPhase = sortedPhases[phaseIndex + 1];
                    if (nextPhase && nextPhase.type === PHASE_TYPE_SECONDARY_BRASSAGE) {
                        showToast(`Impossible de supprimer cette phase car la phase suivante ("${escapeHtml(nextPhase.name)}") en dépend. Supprimez d'abord les phases dépendantes.`, "error"); // escapeHtml est globale, showToast est globale
                        return;
                    }
                }

                allBrassagePhases = allBrassagePhases.filter(p => p.id !== currentDisplayedPhaseId); // allBrassagePhases est globale
                saveAllData(); // saveAllData est globale
                currentDisplayedPhaseId = null; // currentDisplayedPhaseId est globale
                showToast(`Phase "${escapeHtml(phaseToDelete.name)}" supprimée.`, "success"); // escapeHtml est globale, showToast est globale
            }, true);
        });

        editCurrentPhaseBtn.addEventListener('click', () => {
            if (!currentDisplayedPhaseId) { // currentDisplayedPhaseId est globale
                showToast("Aucune phase sélectionnée à éditer.", "error"); // showToast est globale
                return;
            }
            const phaseToEdit = allBrassagePhases.find(p => p.id === currentDisplayedPhaseId); // allBrassagePhases est globale
            if (!phaseToEdit) {
                showToast("Phase introuvable pour l'édition.", "error"); // showToast est globale
                return;
            }

            const formDiv = document.createElement('div');
            formDiv.innerHTML = `
                <div class="mb-4">
                    <label for="editPhaseName" class="block text-sm font-medium text-gray-700 mb-1">Nouveau nom de la phase</label>
                    <input type="text" id="editPhaseName" class="w-full p-2 border border-gray-300 rounded-md" value="${escapeHtml(phaseToEdit.name)}">
                </div>
                <p id="editPhaseNameError" class="text-red-500 text-sm mt-1"></p>
            `;
            showModal('Renommer la Phase', formDiv, () => { // showModal est globale
                const newName = document.getElementById('editPhaseName').value.trim();
                const editPhaseNameError = document.getElementById('editPhaseNameError');

                if (!newName) {
                    editPhaseNameError.textContent = "Le nom de la phase ne peut pas être vide.";
                    return;
                }
                // Check for duplicate name, excluding the current phase being edited
                if (allBrassagePhases.some(p => p.name.toLowerCase() === newName.toLowerCase() && p.id !== phaseToEdit.id)) { // allBrassagePhases est globale
                    editPhaseNameError.textContent = `Une phase nommée "${escapeHtml(newName)}" existe déjà.`; // escapeHtml est globale
                    return;
                }

                phaseToEdit.name = newName;
                saveAllData(); // saveAllData est globale
                showToast(`Phase renommée en "${escapeHtml(newName)}".`, "success"); // escapeHtml est globale, showToast est globale
            });
        });

        clearAllPhasesBtn.addEventListener('click', clearAllPhases); // clearAllPhases est globale (Partie 2)

        // --- Secondary Brassage Logic ---
        previewSecondaryGroupsBtn.addEventListener('click', _performSecondaryGroupsPreview); // _performSecondaryGroupsPreview est globale (Partie 2)

        validateSecondaryGroupsBtn.addEventListener('click', validateSecondaryGroupsForElimination); // validateSecondaryGroupsForElimination est globale (Partie 2)
        generateSecondaryBrassagesBtn.addEventListener('click', generateSecondaryBrassagePhases); // generateSecondaryBrassagePhases est globale (Partie 2)
        
        // This event listener should trigger a re-render of the secondary groups preview
        // based on the *current* global rankings, without re-assigning teams to groups.
        refreshSecondaryGroupScoresBtn.addEventListener('click', () => {
            if (Object.keys(currentSecondaryGroupsPreview).length > 0) { // currentSecondaryGroupsPreview est globale
                // Get current global rankings
                // getGlobalRankings est une fonction de la Partie 5, elle est rendue globale pour être accessible ici.
                const globalRankings = getGlobalRankings(allTeams, allBrassagePhases);
                
                // Create a temporary map for quick lookup of updated points/diff
                const updatedTeamStats = new Map(globalRankings.map(r => [r.teamObject.id, { totalPoints: r.totalPoints, totalDiffScore: r.totalDiffScore }]));

                // Update scores in the currentSecondaryGroupsPreview
                for (const groupName in currentSecondaryGroupsPreview) { // currentSecondaryGroupsPreview est globale
                    currentSecondaryGroupsPreview[groupName] = currentSecondaryGroupsPreview[groupName].map(team => {
                        const stats = updatedTeamStats.get(team.id);
                        if (stats) {
                            return { ...team, totalPoints: stats.totalPoints, totalDiffScore: stats.totalDiffScore };
                        }
                        return team; // Return original if stats not found (e.g., team deleted)
                    });
                    // Re-sort the group after updating scores
                    currentSecondaryGroupsPreview[groupName].sort((a, b) => b.totalPoints - a.totalPoints || b.totalDiffScore - a.totalDiffScore);
                }

                const groupNamesMap = { 2: ["Principale", "Consolante"], 3: ["Principale", "Consolante", "Super Consolante"] };
                renderSecondaryGroupsPreview(groupNamesMap[parseInt(numberOfSecondaryGroupsSelect.value)]); // renderSecondaryGroupsPreview est globale (définie ci-dessous)
                saveAllData(); // saveAllData est globale
                showToast("Scores des groupes secondaires actualisés.", "info"); // showToast est globale
            } else {
                showToast("Aucun groupe à actualiser. Veuillez d'abord prévisualiser les groupes.", "info"); // showToast est globale
            }
        });

        if (validateForDirectEliminationBtn) { // Check if the button exists (it might not if a seeding phase is already validated)
            validateForDirectEliminationBtn.addEventListener('click', validateForDirectElimination); // validateForDirectElimination est globale (Partie 2)
        }

        // Initial render for brassage page
        renderPhaseHistory();
        renderSecondaryGroupsPreviewFromSaved(); // Render preview if data exists on load
    }

    /**
     * Renders the secondary groups preview from saved data.
     */
    function renderSecondaryGroupsPreviewFromSaved() {
        const numberOfSecondaryGroupsInput = document.getElementById('numberOfSecondaryGroups');
        const validateSecondaryGroupsBtn = document.getElementById('validateSecondaryGroupsBtn');
        const generateSecondaryBrassagesBtn = document.getElementById('generateSecondaryBrassagesBtn');
        const secondaryGroupsPreviewDisplay = document.getElementById('secondaryGroupsPreviewDisplay');
        const refreshSecondaryGroupScoresBtn = document.getElementById('refreshSecondaryGroupScoresBtn');

        if (Object.keys(currentSecondaryGroupsPreview).length > 0) { // currentSecondaryGroupsPreview est globale
            const numGroups = Object.keys(currentSecondaryGroupsPreview).length;
            numberOfSecondaryGroupsInput.value = numGroups.toString();

            const groupNamesMap = { 2: ["Principale", "Consolante"], 3: ["Principale", "Consolante", "Super Consolante"] };
            renderSecondaryGroupsPreview(groupNamesMap[numGroups]); // renderSecondaryGroupsPreview est globale (définie ci-dessous)
            
            validateSecondaryGroupsBtn.classList.remove('hidden');
            generateSecondaryBrassagesBtn.classList.remove('hidden');
            refreshSecondaryGroupScoresBtn.classList.remove('hidden');
        } else {
            // If no preview is saved, ensure buttons are hidden and display is empty
            secondaryGroupsPreviewDisplay.innerHTML = '<p class="text-gray-500 text-center w-full md:col-span-2 lg:col-span-3">Créez les groupes ici après avoir cliqué sur "Prévisualiser les groupes secondaires".</p>';
            validateSecondaryGroupsBtn.classList.add('hidden');
            generateSecondaryBrassagesBtn.classList.add('hidden');
            refreshSecondaryGroupScoresBtn.classList.add('hidden');
        }
    }

    /**
     * Renders the preview of secondary groups for brassage or elimination.
     * @param {Array<string>} selectedGroupNames The names of the groups to display.
     */
    function renderSecondaryGroupsPreview(selectedGroupNames) {
        const secondaryGroupsPreviewDisplay = document.getElementById('secondaryGroupsPreviewDisplay');
        const validateSecondaryGroupsBtn = document.getElementById('validateSecondaryGroupsBtn');
        const generateSecondaryBrassagesBtn = document.getElementById('generateSecondaryBrassagesBtn');
        const refreshSecondaryGroupScoresBtn = document.getElementById('refreshSecondaryGroupScoresBtn');
        const secondaryPreviewMessage = document.getElementById('secondaryPreviewMessage');

        secondaryGroupsPreviewDisplay.innerHTML = '';
        secondaryPreviewMessage.textContent = ''; // Clear any previous messages

        if (Object.keys(currentSecondaryGroupsPreview).length === 0) { // currentSecondaryGroupsPreview est globale
            secondaryGroupsPreviewDisplay.innerHTML = '<p class="text-gray-500 text-center w-full md:col-span-2 lg:col-span-3">Créez les groupes ici après avoir cliqué sur "Prévisualiser les groupes secondaires".</p>';
            validateSecondaryGroupsBtn.classList.add('hidden');
            generateSecondaryBrassagesBtn.classList.add('hidden');
            refreshSecondaryGroupScoresBtn.classList.add('hidden');
            return;
        }

        validateSecondaryGroupsBtn.classList.remove('hidden');
        generateSecondaryBrassagesBtn.classList.remove('hidden');
        refreshSecondaryGroupScoresBtn.classList.remove('hidden');

        // Check if any team in preview is eliminated
        const eliminatedTeamsInPreview = [];
        selectedGroupNames.forEach(groupName => {
            if (currentSecondaryGroupsPreview[groupName]) { // currentSecondaryGroupsPreview est globale
                currentSecondaryGroupsPreview[groupName].forEach(team => {
                    if (eliminatedTeams.has(team.id)) { // eliminatedTeams est globale
                        eliminatedTeamsInPreview.push(team);
                    }
                });
            }
        });

        if (eliminatedTeamsInPreview.length > 0) {
            secondaryPreviewMessage.innerHTML = `
                <i class="fas fa-exclamation-triangle text-orange-500 mr-2"></i>
                Attention: Les équipes suivantes sont actuellement marquées comme éliminées et n'apparaîtront pas dans les phases éliminatoires si cette répartition est validée:
                ${eliminatedTeamsInPreview.map(team => `<span>${escapeHtml(team.name)}</span>`).join(', ')}.
                Vous pouvez gérer leur statut en cliquant sur leur nom dans la prévisualisation.
            `;
            secondaryPreviewMessage.className = 'mt-4 p-3 bg-orange-100 border border-orange-300 rounded-md text-orange-800 text-sm';
        }


        const groupDisplayContainer = document.createElement('div');
        groupDisplayContainer.className = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6';

        selectedGroupNames.forEach(groupName => {
            const teamsInGroup = currentSecondaryGroupsPreview[groupName] || []; // currentSecondaryGroupsPreview est globale
            const isGroupEmpty = teamsInGroup.length === 0;

            const groupDiv = document.createElement('div');
            groupDiv.className = `bg-blue-50 p-4 rounded-lg border border-blue-200 shadow-sm ${isGroupEmpty ? 'opacity-70' : ''}`;
            groupDiv.innerHTML = `
                <h4 class="text-lg font-semibold text-blue-800 mb-3">${escapeHtml(groupName)} (${teamsInGroup.length} équipes)</h4>
                <ul class="space-y-2">
                    ${isGroupEmpty ? '<li class="text-gray-500 italic">Aucune équipe dans ce groupe.</li>' : ''}
                    ${teamsInGroup.map(team => {
                        const isEliminated = eliminatedTeams.has(team.id); // eliminatedTeams est globale
                        const eliminatedClass = isEliminated ? 'line-through text-red-500 italic' : '';
                        const teamLevel = allTeams.find(t => t.id === team.id)?.level || 'N/A'; // allTeams est globale

                        return `
                            <li class="flex items-center justify-between group-team-entry p-2 bg-white rounded-md border border-gray-100 shadow-xs cursor-pointer hover:bg-gray-50"
                                data-team-id="${team.id}"
                                data-team-name="${escapeHtml(team.name)}"
                                data-total-points="${team.totalPoints}"
                                data-total-diff-score="${team.totalDiffScore}"
                                data-current-group="${groupName}"
                                >
                                <span class="${eliminatedClass} text-gray-800 text-sm">
                                    ${escapeHtml(team.name)}
                                    <span class="text-xs text-gray-500 ml-1">(Niveau: ${teamLevel}, Pts: ${team.totalPoints}, Diff: ${team.totalDiffScore})</span>
                                </span>
                                ${isEliminated ? '<i class="fas fa-ban text-red-500 ml-2" title="Équipe éliminée"></i>' : ''}
                            </li>
                        `;
                    }).join('')}
                </ul>
            `;
            groupDisplayContainer.appendChild(groupDiv);
        });
        secondaryGroupsPreviewDisplay.appendChild(groupDisplayContainer);

        // Add event listeners for each team entry to show options modal
        document.querySelectorAll('.group-team-entry').forEach(teamEntry => {
            teamEntry.addEventListener('click', (event) => {
                const teamId = event.currentTarget.dataset.teamId;
                const teamName = event.currentTarget.dataset.teamName;
                const totalPoints = parseInt(event.currentTarget.dataset.totalPoints);
                const totalDiffScore = parseInt(event.currentTarget.dataset.totalDiffScore);
                const currentGroup = event.currentTarget.dataset.currentGroup;

                showTeamOptionsModal(teamId, teamName, totalPoints, totalDiffScore, currentGroup, selectedGroupNames); // showTeamOptionsModal est globale (Partie 2)
            });
        });
    }

    /**
     * Rendu de la page de sélection des éliminatoires.
     */
    function renderEliminationSelectionPage() {
        APP_CONTAINER.innerHTML = `
            <h1 class="text-3xl font-bold text-center text-gray-800 mb-8">Phase d'Élimination Directe</h1>

            <section class="mb-8 p-6 bg-gray-50 rounded-lg border border-gray-200">
                <h2 class="text-2xl font-semibold text-gray-700 mb-4">Sélection des Équipes pour l'Arbre Final</h2>
                <p class="text-gray-700 mb-4">
                    Les équipes seront automatiquement classées en fonction de leurs performances cumulées
                    lors des phases de brassage initiales et secondaires (si utilisées).
                    Vous pouvez choisir de générer l'arbre éliminatoire pour le groupe principal,
                    ou pour d'autres groupes si vous avez créé des groupes secondaires.
                </p>
                <div id="eliminationSelectionArea">
                    <p class="text-gray-500 text-center">Chargement des options de sélection...</p>
                </div>
            </section>
        `;
        setupEliminationSelectionPageLogic();
    }

    /**
     * Logique de la page de sélection des éliminatoires.
     */
    function setupEliminationSelectionPageLogic() {
        const selectionArea = document.getElementById('eliminationSelectionArea');

        // Find the last validated elimination seeding phase
        // allBrassagePhases est une variable globale exposée par Partie 1
        const lastSeedingPhase = allBrassagePhases
            .filter(p => p.type === PHASE_TYPE_ELIMINATION_SEEDING && p.generated)
            .sort((a, b) => b.timestamp - a.timestamp)[0];

        if (!lastSeedingPhase || !lastSeedingPhase.groupedTeams || Object.keys(lastSeedingPhase.groupedTeams).length === 0) {
            selectionArea.innerHTML = `
                <div class="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-4" role="alert">
                    <p class="font-bold">Aucune répartition validée pour les éliminatoires.</p>
                    <p>Veuillez d'abord <a href="#brassages" class="font-semibold underline text-yellow-800 hover:text-yellow-900">valider une répartition des groupes</a> dans la section Brassages, ou utiliser l'option de validation directe.</p>
                </div>
                <div class="mt-4 text-center">
                    <button id="goToBrassagesBtn" class="bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700">Aller à la page Brassages</button>
                </div>
            `;
            document.getElementById('goToBrassagesBtn').addEventListener('click', () => {
                window.location.hash = '#brassages';
            });
            return;
        }

        const groups = lastSeedingPhase.groupedTeams;
        const availableGroupNames = Object.keys(groups);

        let optionsHtml = `
            <div class="mb-4">
                <label for="eliminationGroupSelect" class="block text-sm font-medium text-gray-700 mb-1">Sélectionner un groupe pour l'arbre:</label>
                <select id="eliminationGroupSelect"
                        class="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 shadow-sm">
                    ${availableGroupNames.map(groupName => `<option value="${escapeHtml(groupName)}">${escapeHtml(groupName)} (${groups[groupName].length} équipes)</option>`).join('')}
                </select>
            </div>

            <div class="mb-4">
                <label for="bracketSizeSelect" class="block text-sm font-medium text-gray-700 mb-1">Taille de l'arbre (puissance de 2) :</label>
                <select id="bracketSizeSelect"
                        class="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 shadow-sm">
                </select>
                <p id="bracketSizeMessage" class="text-sm text-red-500 mt-1"></p>
            </div>

            <div class="mt-6 flex flex-col sm:flex-row space-y-3 sm:space-y-0 sm:space-x-3 justify-center">
                <button id="generateEliminationBracketBtn"
                        class="bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 shadow-md transition ease-in-out duration-150 flex-grow">
                    Générer l'arbre éliminatoire
                </button>
                <button id="viewExistingBracketBtn"
                        class="bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 shadow-md transition ease-in-out duration-150 flex-grow hidden">
                    Voir l'arbre existant
                </button>
            </div>
        `;
        selectionArea.innerHTML = optionsHtml;

        const eliminationGroupSelect = document.getElementById('eliminationGroupSelect');
        const bracketSizeSelect = document.getElementById('bracketSizeSelect');
        const bracketSizeMessage = document.getElementById('bracketSizeMessage');
        const generateEliminationBracketBtn = document.getElementById('generateEliminationBracketBtn');
        const viewExistingBracketBtn = document.getElementById('viewExistingBracketBtn');

        let selectedTeamsForBracket = []; // Stores the sorted teams for the selected group, after filtering eliminated

        function updateBracketSizeOptions() {
            const selectedGroupName = eliminationGroupSelect.value;
            const teamsInSelectedGroup = groups[selectedGroupName] || [];
            
            // Filter out eliminated teams before determining eligible count
            selectedTeamsForBracket = teamsInSelectedGroup.filter(team => !eliminatedTeams.has(team.id)); // eliminatedTeams est globale

            const eligibleTeamCount = selectedTeamsForBracket.length;
            bracketSizeSelect.innerHTML = '';
            bracketSizeMessage.textContent = '';

            let hasValidOption = false;
            for (let i = 2; i <= eligibleTeamCount; i *= 2) {
                const option = document.createElement('option');
                option.value = i;
                option.textContent = `${i} équipes (ex: 8, 16, 32)`;
                bracketSizeSelect.appendChild(option);
                hasValidOption = true;
            }

            if (!hasValidOption) {
                bracketSizeSelect.innerHTML = '<option value="">Aucune taille d\'arbre possible</option>';
                bracketSizeMessage.textContent = `Pas assez d'équipes éligibles (${eligibleTeamCount}) dans ce groupe pour former un arbre de taille paire (min 2).`;
                generateEliminationBracketBtn.disabled = true;
            } else {
                generateEliminationBracketBtn.disabled = false;
            }

            // Check if a bracket already exists for this group and size
            // eliminationPhases est globale
            const existingBracket = eliminationPhases[selectedGroupName];
            if (existingBracket && existingBracket.size === parseInt(bracketSizeSelect.value)) {
                viewExistingBracketBtn.classList.remove('hidden');
                generateEliminationBracketBtn.textContent = 'Re-générer l\'arbre (écrase l\'existant)';
                generateEliminationBracketBtn.classList.remove('bg-green-600');
                generateEliminationBracketBtn.classList.add('bg-orange-600');
            } else {
                viewExistingBracketBtn.classList.add('hidden');
                generateEliminationBracketBtn.textContent = 'Générer l\'arbre éliminatoire';
                generateEliminationBracketBtn.classList.remove('bg-orange-600');
                generateEliminationBracketBtn.classList.add('bg-green-600');
            }
        }

        eliminationGroupSelect.addEventListener('change', updateBracketSizeOptions);
        bracketSizeSelect.addEventListener('change', updateBracketSizeOptions); // Also update if bracket size changes
        
        generateEliminationBracketBtn.addEventListener('click', () => {
            const selectedGroupName = eliminationGroupSelect.value;
            const bracketSize = parseInt(bracketSizeSelect.value);

            if (!selectedGroupName || isNaN(bracketSize) || bracketSize < 2) {
                showToast("Veuillez sélectionner un groupe et une taille d'arbre valide.", "error"); // showToast est globale
                return;
            }

            if (selectedTeamsForBracket.length < bracketSize) {
                showToast(`Seulement ${selectedTeamsForBracket.length} équipes éligibles dans ce groupe. Impossible de générer un arbre de ${bracketSize} équipes.`, "error"); // showToast est globale
                return;
            }

            const messageContent = document.createElement('p');
            messageContent.textContent = `Êtes-vous sûr de vouloir générer un arbre éliminatoire de ${bracketSize} équipes pour le groupe "${escapeHtml(selectedGroupName)}"? Cette action écrasera un arbre existant pour ce groupe et cette taille.`; // escapeHtml est globale
            messageContent.className = 'text-gray-700';

            showModal('Confirmer la génération de l\'arbre', messageContent, () => { // showModal est globale
                generateEliminationBracket(selectedGroupName, bracketSize, selectedTeamsForBracket); // generateEliminationBracket est définie ci-dessous
            }, true);
        });

        viewExistingBracketBtn.addEventListener('click', () => {
            const selectedGroupName = eliminationGroupSelect.value;
            if (eliminationPhases[selectedGroupName]) { // eliminationPhases est globale
                window.location.hash = `#eliminatoires?group=${encodeURIComponent(selectedGroupName)}`;
            } else {
                showToast("Aucun arbre existant pour ce groupe.", "error"); // showToast est globale
            }
        });

        // Initial update
        if (availableGroupNames.length > 0) {
            updateBracketSizeOptions();
        } else {
            selectionArea.innerHTML = `
                <div class="bg-red-100 border-l-4 border-red-500 text-red-700 p-4" role="alert">
                    <p class="font-bold">Problème de données de répartition.</p>
                    <p>La phase de répartition validée ne contient pas de groupes ou d'équipes. Veuillez re-valider une répartition des groupes.</p>
                </div>
            `;
        }
    }

    // Rendre les fonctions globales nécessaires pour être appelées depuis d'autres parties du code ou directement par le HTML
    window.renderBrassagesPage = renderBrassagesPage;
    window.setupBrassagesPageLogic = setupBrassagesPageLogic;
    window.renderSecondaryGroupsPreview = renderSecondaryGroupsPreview; // Exposer pour être appelée par Partie 2
    window.renderEliminationSelectionPage = renderEliminationSelectionPage;
    window.setupEliminationSelectionPageLogic = setupEliminationSelectionPageLogic;
    // --- Logique du Classement (partagée) ---

    /**
     * Calcule le classement global des équipes basé sur les phases de brassage,
     * y compris les scores détaillés par phase.
     * @param {Array<Object>} teams - Toutes les équipes.
     * @param {Array<Object>} brassagePhases - Toutes les phases de brassage.
     * @returns {Array<Object>} Classement trié des équipes.
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

    /**
     * Rendu de la page des éliminatoires.
     */
    function renderEliminatoiresPage() {
        APP_CONTAINER.innerHTML = `
            <h1 class="text-3xl font-bold text-center text-gray-800 mb-8">Phase Éliminatoire</h1>

            <section class="p-6 bg-gray-50 rounded-lg border border-gray-200">
                <h2 class="text-2xl font-semibold text-gray-700 mb-4">Génération des arbres éliminatoires</h2>
                <p class="text-gray-600 mb-4">
                    Les arbres éliminatoires seront générés pour les groupes "Principale", "Consolante" et "Super Consolante"
                    (si ces groupes ont été validés sur la page Brassages et contiennent au moins 2 équipes éligibles).
                    Les matchs seront appariés 1er contre dernier, 2ème contre avant-dernier, etc.
                </p>
                <div class="flex flex-col sm:flex-row justify-center gap-4 mt-6">
                    <button id="goToEliminationSelectionBtn"
                            class="bg-yellow-600 text-white py-2 px-4 rounded-md hover:bg-yellow-700 focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:ring-offset-2 shadow-md transition ease-in-out duration-150">
                        Configurer l'arbre éliminatoire
                    </button>
                    <button id="resetAllEliminationPhasesBtn"
                            class="bg-red-600 text-white py-2 px-4 rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 shadow-md transition ease-in-out duration-150">
                        Réinitialiser toutes les Phases
                    </button>
                </div>
                <p id="eliminationMessage" class="mt-3 text-sm text-center"></p>
            </section>

            <div id="eliminationBracketsDisplay" class="space-y-8 mt-8">
                <p class="text-gray-500 text-center">Configurez et générez les arbres éliminatoires ci-dessus.</p>
            </div>
        `;
        setupEliminatoiresPageLogic();
    }

    /**
     * Logique de la page des éliminatoires.
     */
    function setupEliminatoiresPageLogic() {
        const eliminationBracketsDisplay = document.getElementById('eliminationBracketsDisplay');
        const eliminationMessage = document.getElementById('eliminationMessage');
        const resetAllEliminationPhasesBtn = document.getElementById('resetAllEliminationPhasesBtn');
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

        /**
         * Récupère les équipes groupées par la dernière phase de "seeding" éliminatoire.
         * @returns {Object|null} Les équipes groupées, ou null si aucune phase de seeding n'est trouvée.
         */
        function getTeamsGroupedBySecondaryPhase() {
            // Find the latest 'elimination_seeding' phase
            const latestEliminationSeedingPhase = allBrassagePhases // allBrassagePhases est globale
                .filter(p => p.type === PHASE_TYPE_ELIMINATION_SEEDING)
                .sort((a, b) => b.timestamp - a.timestamp)[0];

            if (latestEliminationSeedingPhase && latestEliminationSeedingPhase.groupedTeams) {
                console.log("DEBUG: Secondary ranking phases found:", latestEliminationSeedingPhase.groupedTeams);
                return latestEliminationSeedingPhase.groupedTeams;
            } else {
                showToast("Aucune phase de classement secondaire (Principale, Consolante, Super Consolante) n'a été validée sur la page 'Brassages'. Veuillez les générer et les valider d'abord.", "error"); // showToast est globale
                return null;
            }
        }

        /**
         * Détermine le nom du tour en fonction du nombre d'ÉQUIPES dans le tour.
         * C'est plus logique pour la nomination des tournois (par exemple, "8ème de Finale" signifie 8 matchs, 16 équipes)
         * @param {number} numTeamsInRound Le nombre d'équipes commençant ce tour.
         * @returns {string} Le nom du tour.
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

        /**
         * Génère les données de l'arbre éliminatoire pour un groupe donné.
         * @param {Array<Object>} teams - Les équipes éligibles pour le bracket.
         * @param {string} groupType - Le type de groupe (e.g., "Principale").
         * @param {number} bracketSize - La taille souhaitée de l'arbre (puissance de 2).
         * @returns {Object} Les données de l'arbre généré.
         */
        function generateBracketData(teams, groupType, bracketSize) {
            // NOUVEAU: Filtrer les équipes éliminées avant de générer le bracket
            let eligibleTeamsInGroup = teams.filter(team => !eliminatedTeams.has(team.id)); // eliminatedTeams est globale

            if (eligibleTeamsInGroup.length < 2) {
                return { rounds: [], message: `Pas assez d'équipes éligibles dans le groupe ${groupType} pour un tournoi à élimination (${eligibleTeamsInGroup.length} équipe(s) restante(s)).` };
            }

            // Sort initial teams based on their global ranking for seeding
            eligibleTeamsInGroup.sort((a, b) => {
                const pointsA = a.totalPoints || 0;
                const pointsB = b.totalPoints || 0;
                const diffA = a.totalDiffScore || 0;
                const diffB = b.totalDiffScore || 0;

                if (pointsB !== pointsA) return pointsB - pointsA;
                if (diffB !== diffA) return diffB - diffA;
                return a.name.localeCompare(b.name); // Secondary sort by name for tie-breaking
            });

            // Take only the number of teams required for the bracket size
            let currentParticipants = eligibleTeamsInGroup.slice(0, bracketSize);
            let rounds = []; // Array to store all generated rounds

            // Handle initial byes if any (teams that automatically advance)
            const numberOfByes = bracketSize - currentParticipants.length;
            let teamsAdvancingFromByes = [];

            if (numberOfByes > 0) {
                // Top ranked teams get byes
                const byeTeams = currentParticipants.slice(0, numberOfByes);
                teamsAdvancingFromByes.push(...byeTeams.map(team => ({
                    id: team.id,
                    name: team.name,
                    isBye: true // Mark as a bye team for later identification
                })));
                currentParticipants = currentParticipants.slice(numberOfByes); // Remaining teams will play in Round 1
            }

            let roundMatches = []; // Matches for the current round being processed

            // Create initial matches for teams that actually play in Round 1
            // This is a serpentine seeding: 1st vs last, 2nd vs second-to-last, etc.
            for (let i = 0; i < Math.ceil(currentParticipants.length / 2); i++) {
                const team1 = currentParticipants[i];
                const team2 = currentParticipants[currentParticipants.length - 1 - i];

                if (team1 && team2) {
                    roundMatches.push({
                        id: `elim_match_${groupType}_R0_M${roundMatches.length}`, // R0 for initial playing round
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

            // If there were bye teams, these will effectively be the "winners" of a "virtual" first round.
            // We need to merge them with the actual winners of the first playing round.
            let teamsForNextRound = [...teamsAdvancingFromByes];

            // Add the actual matches played in this round, if any
            if (roundMatches.length > 0) {
                rounds.push({ roundName: getRoundNameFromTeamsCount(currentParticipants.length), matches: roundMatches });
                teamsForNextRound.push(...roundMatches.map(m => ({ id: null, name: 'À déterminer', placeholder: true }))); // Add placeholders for winners
            }
            
            // If all teams got byes (e.g., bracketSize was exactly equal to eligibleTeamCount, and all were byes),
            // then teamsForNextRound might just contain the bye teams.
            // If teamsForNextRound is already at the final stage (1 team), break.
            if (teamsForNextRound.length <= 1 && rounds.length > 0) { // If only one team left after initial byes/matches
                 return {
                    id: `elim_bracket_${groupType}`,
                    groupType: groupType,
                    timestamp: Date.now(),
                    size: bracketSize, // Store the bracket size
                    bracket: rounds
                };
            }


            let prevRoundMatches = roundMatches; // This refers to the actual matches played in the first round (if any)
            let roundIdx = 1; // Start counting from Round 1 for subsequent rounds

            // Loop to generate subsequent rounds
            while (true) {
                // If teamsForNextRound is not a power of 2, we need to add byes for this round too
                // This logic is simplified: we assume `teamsForNextRound` will always be a power of 2
                // or less, and we handle byes by advancing the top teams.
                
                let nextRoundParticipants = [];
                // Collect winners from the *previous* actual playing round (if any)
                prevRoundMatches.forEach(match => {
                    if (match.winnerId) {
                        nextRoundParticipants.push(allTeams.find(t => t.id === match.winnerId) || { id: match.winnerId, name: 'À déterminer' }); // allTeams est globale
                    } else {
                        nextRoundParticipants.push({ id: null, name: 'À déterminer', placeholder: true });
                    }
                });

                // Merge with teams that advanced from byes (only relevant for the first "real" round after initial byes)
                if (roundIdx === 1 && teamsAdvancingFromByes.length > 0) {
                    // This is where bye teams enter the bracket. They should be matched with winners of Round 1.
                    // We need to ensure correct pairing. For simplicity, we'll assume they are added to the beginning
                    // of the list of participants for this round, maintaining their "seed".
                    nextRoundParticipants = [...teamsAdvancingFromByes, ...nextRoundParticipants];
                    // Re-sort to ensure correct pairing (top bye vs bottom winner, etc.)
                    nextRoundParticipants.sort((a,b) => {
                        // Prioritize real teams over placeholders, then by original seeding (if available)
                        if (a.placeholder && !b.placeholder) return 1;
                        if (!a.placeholder && b.placeholder) return -1;
                        if (a.isBye && !b.isBye) return -1; // Bye teams are "higher seeded"
                        if (!a.isBye && b.isBye) return 1;
                        // For actual teams, use their original ranking from `teams` array
                        const originalTeamA = teams.find(t => t.id === a.id);
                        const originalTeamB = teams.find(t => t.id === b.id);
                        if (originalTeamA && originalTeamB) {
                            const pointsA = originalTeamA.totalPoints || 0;
                            const pointsB = originalTeamB.totalPoints || 0;
                            const diffA = originalTeamA.totalDiffScore || 0;
                            const diffB = originalTeamB.totalDiffScore || 0;
                            if (pointsB !== pointsA) return pointsB - pointsA;
                            if (diffB !== diffA) return diffB - diffA;
                        }
                        return a.name.localeCompare(b.name);
                    });
                }
                
                if (nextRoundParticipants.length <= 1) { // Stop if only one winner or no more teams
                    break;
                }

                let nextRoundMatches = [];
                const numMatchesInThisRound = Math.floor(nextRoundParticipants.length / 2);

                for (let i = 0; i < numMatchesInThisRound; i++) {
                    const team1 = nextRoundParticipants[i];
                    const team2 = nextRoundParticipants[nextRoundParticipants.length - 1 - i];

                    const match = {
                        id: `elim_match_${groupType}_R${roundIdx}_M${i}`,
                        team1: team1,
                        team2: team2,
                        score1: null,
                        score2: null,
                        winnerId: null,
                        loserId: null,
                        prevMatch1Id: prevRoundMatches[i] ? prevRoundMatches[i].id : null, // Link to previous matches
                        prevMatch2Id: prevRoundMatches[numMatchesInThisRound * 2 - 1 - i] ? prevRoundMatches[numMatchesInThisRound * 2 - 1 - i].id : null,
                        nextMatchId: null
                    };
                    nextRoundMatches.push(match);

                    // Update `nextMatchId` for previous matches
                    if (prevRoundMatches[i]) prevRoundMatches[i].nextMatchId = match.id;
                    if (prevRoundMatches[numMatchesInThisRound * 2 - 1 - i]) prevRoundMatches[numMatchesInThisRound * 2 - 1 - i].nextMatchId = match.id;
                }
                
                rounds.push({ roundName: getRoundNameFromTeamsCount(nextRoundParticipants.length), matches: nextRoundMatches });
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
                size: bracketSize, // Store the bracket size
                bracket: rounds
            };
        }

        /**
         * Rend un arbre éliminatoire dans le DOM.
         * @param {Object} bracketData - Les données de l'arbre à rendre.
         * @param {HTMLElement} containerElement - L'élément DOM où rendre l'arbre.
         */
		function renderBracket(bracketData, containerElement) {
            if (!bracketData || !bracketData.bracket || bracketData.bracket.length === 0) {
                containerElement.innerHTML = `<p class="text-gray-500 text-center">Aucun tournoi à afficher pour le groupe ${escapeHtml(bracketData.groupType || '')}.</p>`;
                return;
            }

            containerElement.innerHTML = `
                <h3 class="2xl font-semibold text-gray-700 mb-4 text-center">Tournoi ${escapeHtml(bracketData.groupType)}</h3>
                <div class="flex flex-col sm:flex-row justify-center gap-4 p-4 bg-white rounded-lg shadow-md overflow-x-auto">
                    <!-- Rounds will be injected here -->
                </div>
                <div class="text-center mt-4">
                    <button class="reset-group-btn bg-yellow-500 text-white py-1 px-3 rounded-md hover:bg-yellow-600 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:ring-offset-2 shadow-sm text-sm" data-group-type="${escapeHtml(bracketData.groupType)}">
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
                    matchFrame.className = 'match-frame bg-gray-50 border border-gray-300 rounded-lg p-3 mb-4 shadow-sm w-full';
                    matchFrame.dataset.matchId = match.id;

                    let team1Name = escapeHtml(match.team1 ? match.team1.name : 'N/A');
                    let team2Name = escapeHtml(match.team2 ? match.team2.name : 'N/A');
                    let team1Class = 'team-name';
                    let team2Class = 'team-name';
                    let inputDisabled = false;

                    // Disable input if teams are placeholders (BYE, To be determined)
                    if (!match.team1 || match.team1.id === null || match.team1.isBye ||
                        !match.team2 || match.team2.id === null || match.team2.isBye) {
                        inputDisabled = true;
                    }

                    // For BYE teams, ensure scores are 0 for display consistency
                    if (match.team1 && match.team1.isBye) match.score1 = 0;
                    if (match.team2 && match.team2.isBye) match.score2 = 0;

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

        /**
         * Met à jour le score d'un match éliminatoire et détermine le vainqueur.
         * @param {Event} event - L'événement de changement d'entrée.
         */
        function updateMatchScoreAndWinner(event) {
            const matchId = event.target.dataset.matchId;
            const teamNum = event.target.dataset.team;
            let score = parseInt(event.target.value);
            
            if (isNaN(score)) {
                score = null;
            }

            let targetBracket = null;
            let targetMatch = null;

            // Chercher le match dans toutes les phases éliminatoires
            for (const groupType in eliminationPhases) { // eliminationPhases est globale
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
            
            if ((!targetMatch.team1 || targetMatch.team1.id === null || targetMatch.team1.isBye) ||
                (!targetMatch.team2 || targetMatch.team2.id === null || targetMatch.team2.isBye)) {
                showToast("Ce match est un BYE ou ses équipes ne sont pas encore déterminées. Les scores ne peuvent pas être saisis.", "error"); // showToast est globale
                event.target.value = (teamNum === '1' ? targetMatch.score1 : targetMatch.score2) || '';
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
                    showToast("Un match ne peut pas être un match nul. Veuillez entrer un vainqueur.", "error"); // showToast est globale
                }
            }

            saveAllData(); // saveAllData est globale

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
                    team2NameSpan.classList.add('winner-team');
                    team1NameSpan.classList.add('loser-team');
                }
            }

            propagateWinnerLoser(targetMatch.id, targetMatch.winnerId, targetMatch.loserId, targetBracket);

            // Re-render the specific bracket to update dynamic content
            if (targetBracket && document.getElementById(targetBracket.groupType.toLowerCase() + 'Bracket')) {
                renderBracket(targetBracket, document.getElementById(targetBracket.groupType.toLowerCase() + 'Bracket'));
            }


            if (targetMatch.winnerId) {
                showToast(`Score pour ${escapeHtml(targetMatch.team1.name)} vs ${escapeHtml(targetMatch.team2.name)} mis à jour et vainqueur déterminé !`, "success"); // showToast est globale
            } else {
                showToast("Saisie du score en cours...", "info"); // showToast est globale
            }
        }

        /**
         * Propage le vainqueur et le perdant d'un match aux matchs suivants dans l'arbre.
         * @param {string} sourceMatchId - L'ID du match dont le résultat est propagé.
         * @param {string|null} winnerId - L'ID du vainqueur du match source.
         * @param {string|null} loserId - L'ID du perdant du match source.
         * @param {Object} bracket - L'objet de l'arbre éliminatoire.
         */
        function propagateWinnerLoser(sourceMatchId, winnerId, loserId, bracket) {
            const sourceMatch = bracket.bracket.flatMap(r => r.matches).find(m => m.id === sourceMatchId);
            if (!sourceMatch) return;

            // Get the actual team objects based on IDs
            const winningTeamObject = allTeams.find(t => t.id === winnerId) || { id: winnerId, name: 'À déterminer' }; // allTeams est globale
            const losingTeamObject = allTeams.find(t => t.id === loserId) || { id: loserId, name: 'À déterminer' }; // allTeams est globale

            bracket.bracket.forEach(round => {
                round.matches.forEach(match => {
                    // Standard propagation for winners to next round
                    if (match.prevMatch1Id === sourceMatchId) {
                        match.team1 = { ...winningTeamObject };
                        // Reset scores if teams change
                        if (match.team1.id && match.team2?.id && !match.team1.isBye && !match.team2.isBye) {
                           if (match.score1 !== null || match.score2 !== null || match.winnerId !== null) {
                                match.score1 = null;
                                match.score2 = null;
                                match.winnerId = null;
                                match.loserId = null;
                           }
                        }
                    }
                    if (match.prevMatch2Id === sourceMatchId) {
                        match.team2 = { ...winningTeamObject };
                        // Reset scores if teams change
                        if (match.team1.id && match.team2?.id && !match.team1.isBye && !match.team2.isBye) {
                           if (match.score1 !== null || match.score2 !== null || match.winnerId !== null) {
                                match.score1 = null;
                                match.score2 = null;
                                match.winnerId = null;
                                match.loserId = null;
                           }
                        }
                    }

                    // Logic for 3rd place match (Petite Finale)
                    if (match.roundName === 'Petite Finale') {
                        const semiFinalMatch1 = bracket.bracket.flatMap(r => r.matches).find(m => m.id === match.prevMatch1LoserId);
                        const semiFinalMatch2 = bracket.bracket.flatMap(r => r.matches).find(m => m.id === match.prevMatch2LoserId);

                        if (sourceMatch.id === semiFinalMatch1?.id && semiFinalMatch1.loserId) {
                            const actualLoserTeam = allTeams.find(t => t.id === semiFinalMatch1.loserId); // allTeams est globale
                            if (actualLoserTeam) {
                                match.team1 = { id: actualLoserTeam.id, name: actualLoserTeam.name };
                                if (match.team1.id && match.team2?.id && (match.score1 !== null || match.score2 !== null || match.winnerId !== null)) {
                                    match.score1 = null;
                                    match.score2 = null;
                                    match.winnerId = null;
                                    match.loserId = null;
                                }
                            }
                        }
                        if (sourceMatch.id === semiFinalMatch2?.id && semiFinalMatch2.loserId) {
                            const actualLoserTeam = allTeams.find(t => t.id === semiFinalMatch2.loserId); // allTeams est globale
                            if (actualLoserTeam) {
                                match.team2 = { id: actualLoserTeam.id, name: actualLoserTeam.name };
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
            saveAllData(); // saveAllData est globale
        }

        /**
         * Génère un nouvel arbre éliminatoire pour un groupe donné.
         * @param {string} groupName - Le nom du groupe.
         * @param {number} bracketSize - La taille de l'arbre.
         * @param {Array<Object>} teamsForBracket - Les équipes à inclure dans l'arbre.
         */
        function generateEliminationBracket(groupName, bracketSize, teamsForBracket) {
            const bracketData = generateBracketData(teamsForBracket, groupName, bracketSize);
            if (bracketData.bracket.length > 0) {
                eliminationPhases[groupName] = bracketData; // eliminationPhases est globale
                saveAllData(); // saveAllData est globale

                const groupContainer = document.createElement('div');
                groupContainer.id = groupName.toLowerCase() + 'Bracket';
                groupContainer.className = 'bg-white p-4 rounded-lg shadow-xl';
                eliminationBracketsDisplay.appendChild(groupContainer);
                renderBracket(bracketData, groupContainer);
                showToast(`Arbre éliminatoire pour le groupe "${escapeHtml(groupName)}" généré avec succès !`, "success"); // showToast est globale
            } else {
                showToast(bracketData.message || `Impossible de générer l'arbre pour le groupe ${escapeHtml(groupName)}.`, "error"); // showToast est globale
            }
        }

        /**
         * Rend tous les arbres éliminatoires existants.
         */
        function renderAllEliminationBrackets() {
            eliminationBracketsDisplay.innerHTML = '';
            const orderedGroupTypes = ["Principale", "Consolante", "Super Consolante"];
            
            let hasBracketsToDisplay = false;

            orderedGroupTypes.forEach(groupType => {
                const bracketData = eliminationPhases[groupType]; // eliminationPhases est globale
                if (bracketData && bracketData.bracket && bracketData.bracket.length > 0) {
                    hasBracketsToDisplay = true;
                    const groupContainer = document.createElement('div');
                    groupContainer.id = groupType.toLowerCase() + 'Bracket';
                    groupContainer.className = 'bg-white p-4 rounded-lg shadow-xl';
                    eliminationBracketsDisplay.appendChild(groupContainer);
                    renderBracket(bracketData, groupContainer);
                } else {
                    const messageDiv = document.createElement('div');
                    messageDiv.className = 'bg-white p-4 rounded-lg shadow-md text-center text-gray-500';
                    messageDiv.textContent = `Le groupe "${escapeHtml(groupType)}" n'a pas d'arbre éliminatoire généré ou n'est pas configuré.`;
                    eliminationBracketsDisplay.appendChild(messageDiv);
                }
            });

            if (!hasBracketsToDisplay) {
                eliminationBracketsDisplay.innerHTML = '<p class="text-gray-500 text-center">Configurez et générez les arbres éliminatoires ci-dessus.</p>';
            }
        }

        /**
         * Réinitialise toutes les phases éliminatoires.
         */
        function resetAllEliminationPhases() {
            const messageContent = document.createElement('p');
            messageContent.textContent = "Êtes-vous sûr de vouloir réinitialiser TOUTES les phases éliminatoires ? Cette action est irréversible.";
            messageContent.className = 'text-gray-700';

            showModal('Confirmer la réinitialisation complète', messageContent, () => { // showModal est globale
                eliminationPhases = {}; // eliminationPhases est globale
                saveAllData(); // saveAllData est globale
                renderAllEliminationBrackets(); // Re-render to show empty state
                showToast("Toutes les phases éliminatoires ont été réinitialisées.", "success"); // showToast est globale
            }, true);
        }

        /**
         * Réinitialise une phase éliminatoire pour un groupe spécifique.
         * @param {string} groupType - Le type de groupe à réinitialiser.
         */
        function resetGroupEliminationPhase(groupType) {
            const messageContent = document.createElement('p');
            messageContent.textContent = `Êtes-vous sûr de vouloir réinitialiser la phase éliminatoire pour le groupe "${escapeHtml(groupType)}" ? Cette action est irréversible.`;
            messageContent.className = 'text-gray-700';

            showModal(`Confirmer la réinitialisation du groupe ${escapeHtml(groupType)}`, messageContent, () => { // showModal est globale
                const groupedTeams = getTeamsGroupedBySecondaryPhase();
                if (groupedTeams && groupedTeams[groupType]) {
                    const latestSeedingPhase = allBrassagePhases // allBrassagePhases est globale
                        .filter(p => p.type === PHASE_TYPE_ELIMINATION_SEEDING && p.generated)
                        .sort((a, b) => b.timestamp - a.timestamp)[0];

                    if (latestSeedingPhase && latestSeedingPhase.groupedTeams[groupType]) {
                        const teamsFromSeeding = latestSeedingPhase.groupedTeams[groupType];
                        const bracketSize = eliminationPhases[groupType] ? eliminationPhases[groupType].size : null; // eliminationPhases est globale

                        if (bracketSize) {
                            const newBracketData = generateBracketData(teamsFromSeeding, groupType, bracketSize);
                            eliminationPhases[groupType] = newBracketData; // eliminationPhases est globale
                            saveAllData(); // saveAllData est globale
                            renderBracket(newBracketData, document.getElementById(groupType.toLowerCase() + 'Bracket'));
                            showToast(`Phase éliminatoire pour le groupe "${escapeHtml(groupType)}" réinitialisée.`, "success"); // showToast est globale
                        } else {
                            showToast(`Impossible de réinitialiser le groupe "${escapeHtml(groupType)}" : taille d'arbre non définie. Veuillez re-générer l'arbre via "Configurer l'arbre éliminatoire".`, "error"); // showToast est globale
                        }
                    } else {
                        showToast(`Impossible de réinitialiser le groupe "${escapeHtml(groupType)}" : données de répartition manquantes.`, "error"); // showToast est globale
                    }
                } else {
                     showToast(`Impossible de réinitialiser le groupe "${escapeHtml(groupType)}" : groupe non configuré.`, "error"); // showToast est globale
                }
            }, true);
        }

        // Initial rendering logic for the elimination page
        renderAllEliminationBrackets();

        goToEliminationSelectionBtn.addEventListener('click', () => {
            window.location.hash = '#elimination-selection';
        });

        resetAllEliminationPhasesBtn.addEventListener('click', resetAllEliminationPhases);
        
        eliminationBracketsDisplay.addEventListener('click', (event) => {
            if (event.target.classList.contains('reset-group-btn')) {
                const groupType = event.target.dataset.groupType;
                resetGroupEliminationPhase(groupType);
            }
        });
    }

    /**
     * Rend la page des classements.
     */
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

    /**
     * Logique de la page des classements.
     */
    function setupClassementsPageLogic() {
        const rankingsTableBody = document.getElementById('rankingsTableBody');
        const rankingsMessage = document.getElementById('rankingsMessage');
        const togglePhaseDetailsCheckbox = document.getElementById('togglePhaseDetails');
        const phaseDetailsDisplay = document.getElementById('phaseDetailsDisplay');

        function renderRankings() {
            const globalRankings = getGlobalRankings(allTeams, allBrassagePhases); // allTeams et allBrassagePhases sont globales

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
                const isEliminated = eliminatedTeams.has(rankEntry.teamObject.id); // eliminatedTeams est globale
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

            const relevantPhases = allBrassagePhases.filter(p => p.type === PHASE_TYPE_INITIAL || p.type === PHASE_TYPE_SECONDARY_BRASSAGE); // allBrassagePhases est globale

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
                                <!-- Team details for this phase -->
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
     * Logique du tableau de bord des tournois.
     */
    function setupTournamentDashboardLogic() {
        const newTournamentNameInput = document.getElementById('newTournamentName');
        const newTournamentDateInput = document.getElementById('newTournamentDate');
        const newTournamentNumTeamsInput = document.getElementById('newTournamentNumTeams');
        const createTournamentBtn = document.getElementById('createTournamentBtn');
        const createTournamentMessage = document.getElementById('createTournamentMessage'); // Non utilisé directement ici
        const tournamentsListDiv = document.getElementById('tournamentsList');

        createTournamentBtn.addEventListener('click', () => {
            const name = newTournamentNameInput.value.trim();
            const date = newTournamentDateInput.value;
            const numTeams = parseInt(newTournamentNumTeamsInput.value);
            createNewTournament(name, date, numTeams); // createNewTournament est globale
        });

        function renderTournamentsList() {
            tournamentsListDiv.innerHTML = '';
            if (allUserTournaments.length === 0) { // allUserTournaments est globale
                tournamentsListDiv.innerHTML = '<p class="text-gray-500 text-center">Aucun tournoi disponible. Créez-en un nouveau !</p>';
                return;
            }

            allUserTournaments.forEach(tournament => { // allUserTournaments est globale
                const isOwner = tournament.ownerId === window.userId; // window.userId est globale
                const isSelected = currentTournamentId === tournament.id; // currentTournamentId est globale
                const tourneyDiv = document.createElement('div');
                tourneyDiv.className = `flex flex-col sm:flex-row items-start sm:items-center justify-between p-3 bg-white border rounded-md shadow-sm ${isSelected ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-200'}`;
                
                tourneyDiv.innerHTML = `
                    <div class="flex-grow">
                        <p class="text-lg font-medium text-gray-800">${escapeHtml(tournament.name)} ${isSelected ? '<span class="text-blue-600 text-sm ml-2">(Actif)</span>' : ''}</p>
                        <p class="text-sm text-gray-600">Date: ${escapeHtml(tournament.date)} | Équipes prévues: ${escapeHtml(tournament.numTeamsAllowed.toString())}</p>
                        <p class="text-sm text-gray-600">Propriétaire: ${isOwner ? 'Moi' : 'Autre (ID: ' + escapeHtml(tournament.ownerId) + ')'}</p>
                    </div>
                    <div class="flex space-x-2 mt-3 sm:mt-0">
                        <button data-id="${tournament.id}" class="select-tournament-btn bg-blue-500 text-white px-3 py-1 rounded-md hover:bg-blue-600 text-sm transition duration-150 ${isSelected ? 'opacity-50 cursor-not-allowed' : ''}" ${isSelected ? 'disabled' : ''}>
                            Sélectionner
                        </button>
                        ${isOwner ? `<button data-id="${tournament.id}" class="delete-tournament-btn bg-red-500 text-white px-3 py-1 rounded-md hover:bg-red-600 text-sm transition duration-150">
                            Supprimer
                        </button>` : ''}
                    </div>
                `;
                tournamentsListDiv.appendChild(tourneyDiv);
            });

            document.querySelectorAll('.select-tournament-btn').forEach(button => {
                button.addEventListener('click', (event) => {
                    selectTournament(event.target.dataset.id); // selectTournament est globale
                });
            });

            document.querySelectorAll('.delete-tournament-btn').forEach(button => {
                button.addEventListener('click', (event) => {
                    deleteTournament(event.target.dataset.id); // deleteTournament est globale
                });
            });
        }

        renderTournamentsList();
    }

    // Rendre les fonctions globales nécessaires pour être appelées depuis d'autres parties du code ou directement par le HTML
    window.getGlobalRankings = getGlobalRankings;
    window.renderEliminatoiresPage = renderEliminatoiresPage;
    window.setupEliminatoiresPageLogic = setupEliminatoiresPageLogic;
    window.renderClassementsPage = renderClassementsPage;
    window.setupClassementsPageLogic = setupClassementsPageLogic;
    window.renderTournamentDashboard = renderTournamentDashboard;
    window.setupTournamentDashboardLogic = setupTournamentDashboardLogic;
