// Les imports Firebase sont supprimés ici car ils sont maintenant gérés dans index.html
// import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
// import { getAuth, signInWithCustomToken, signInAnonymously, onAuthStateChanged, signOut, createUserWithEmailAndPassword, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
// import { getFirestore, doc, getDoc, setDoc, onSnapshot, collection, addDoc, deleteDoc, updateDoc, query, where, getDocs, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

(function() {
    // --- Constantes Globales ---
    const APP_CONTAINER = document.getElementById('app-container');
    // Clés pour localStorage (utilisées en mode simulation)
    const TEAM_DATA_KEY = 'volleyTeamsData';
    const BRASSAGE_PHASES_KEY = 'volleyBrassagePhases';
    const ELIMINATION_PHASES_KEY = 'volleyEliminationPhases';
    const SECONDARY_GROUPS_SELECTION_KEY = 'volleySecondaryGroupsSelection';
    const POOL_GENERATION_BASIS_KEY = 'volleyPoolGenerationBasis';
    const SECONDARY_GROUPS_PREVIEW_KEY = 'volleySecondaryGroupsPreview';
    const ELIMINATED_TEAMS_KEY = 'volleyEliminatedTeams';
    const CURRENT_TOURNAMENT_ID_KEY = 'currentTournamentId'; // Pour persister l'ID du tournoi sélectionné

    const MAX_SIMULATION_TEAMS = 9; // Limite pour le mode simulation

    const PHASE_TYPE_INITIAL = 'initial_brassage';
    const PHASE_TYPE_SECONDARY_BRASSAGE = 'secondary_brassage';
    const PHASE_TYPE_ELIMINATION_SEEDING = 'elimination_seeding';

    // --- Variables Globales (état de l'application) ---
    // Ces variables contiendront les données du tournoi ACTIF, qu'elles viennent de localStorage ou Firestore
    let allTeams = [];
    let allBrassagePhases = [];
    let eliminationPhases = {};
    let currentSecondaryGroupsPreview = {};
    let eliminatedTeams = new Set();

    let currentDisplayedPhaseId = null; // ID de la phase de brassage actuellement affichée

    // Variables pour la gestion des tournois (Firestore)
    let currentTournamentId = null;
    let currentTournamentData = null; // Contient toutes les données du tournoi Firestore (y compris teams, phases, etc.)
    let allUserTournaments = []; // Liste des métadonnées de tous les tournois de l'utilisateur

    // Map pour suivre les occurrences de matchs dans les différentes phases
    let matchOccurrenceMap = new Map();

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
        toast.className = `p-4 rounded-lg shadow-lg text-white transform transition-all duration-300 ease-out z-50`;

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

        // Apparition
        setTimeout(() => {
            toast.style.opacity = '1';
        }, 10);

        // Disparition
        setTimeout(() => {
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
        // Assurez-vous que la modale est visible et avec la bonne transition
        modal.classList.remove('hidden');
        setTimeout(() => modal.querySelector('.modal-content').classList.add('opacity-100', 'scale-100'), 10);
    }

    /**
     * Cache la modale personnalisée.
     */
    function hideModal() {
        if (!modal) {
            console.error("Élément de la modale non trouvé pour la cacher!");
            return;
        }
        modal.querySelector('.modal-content').classList.remove('opacity-100', 'scale-100');
        modal.querySelector('.modal-content').classList.add('opacity-0', 'scale-95');
        setTimeout(() => modal.classList.add('hidden'), 300);
    }


    // --- Intégration Firebase (Authentification & Firestore) ou LocalStorage ---
    // Les fonctions et objets Firebase sont maintenant exposés globalement par le script inline dans index.html.
    // window.auth, window.db, window.userId, window.appId, etc. sont disponibles directement.

    // Firestore Unsubscribe functions
    window.currentTournamentUnsubscribe = null;
    window.allUserTournamentsUnsubscribe = null;

    /**
     * Charge toutes les données du tournoi actuellement sélectionné (Firestore) ou les données locales (localStorage).
     * Met en place un listener en temps réel si Firestore est utilisé.
     */
    async function loadAllData() {
        // Si un utilisateur est connecté et qu'un tournoi est sélectionné, charger depuis Firestore
        if (window.db && window.userId && window.appId) {
            const storedTournamentId = localStorage.getItem(CURRENT_TOURNAMENT_ID_KEY);
            if (storedTournamentId) {
                currentTournamentId = storedTournamentId;
            }

            if (!currentTournamentId) {
                console.log("Aucun tournoi sélectionné. Redirection vers le tableau de bord des tournois.");
                handleLocationHash(); // Rediriger pour choisir/créer un tournoi
                return;
            }

            // Annuler l'abonnement précédent si existant
            if (window.currentTournamentUnsubscribe) {
                window.currentTournamentUnsubscribe();
            }

            const tournamentDocRef = window.doc(window.db, `artifacts/${window.appId}/users/${window.userId}/tournaments`, currentTournamentId);

            window.currentTournamentUnsubscribe = window.onSnapshot(tournamentDocRef, (docSnapshot) => {
                if (docSnapshot.exists()) {
                    currentTournamentData = { id: docSnapshot.id, ...docSnapshot.data() };
                    console.log("Current tournament data loaded/updated from Firestore:", currentTournamentData);

                    // Mettre à jour les variables globales avec les données du tournoi Firestore
                    allTeams = currentTournamentData.teams || [];
                    allBrassagePhases = currentTournamentData.brassagePhases || [];
                    eliminationPhases = currentTournamentData.eliminationPhases || {};
                    currentSecondaryGroupsPreview = currentTournamentData.secondaryGroupsPreview || {};
                    eliminatedTeams = new Set(currentTournamentData.eliminatedTeams || []);
                    currentDisplayedPhaseId = currentTournamentData.currentDisplayedPhaseId || null;

                    rebuildMatchOccurrenceMap(); // Reconstruire la map après chargement
                    handleLocationHash(); // Re-render la page actuelle avec les nouvelles données
                    showToast(`Données du tournoi "${escapeHtml(currentTournamentData.name)}" chargées.`, "info");
                } else {
                    console.warn("Le tournoi sélectionné n'existe plus ou n'est pas accessible.");
                    showToast("Le tournoi sélectionné n'existe plus ou n'est pas accessible. Veuillez en choisir un autre.", "error");
                    currentTournamentId = null;
                    currentTournamentData = null;
                    localStorage.removeItem(CURRENT_TOURNAMENT_ID_KEY);
                    handleLocationHash(); // Rediriger pour choisir un nouveau tournoi
                }
            }, (error) => {
                console.error("Error fetching current tournament data from Firestore:", error);
                showToast("Erreur lors du chargement des données du tournoi actuel.", "error");
                currentTournamentId = null;
                currentTournamentData = null;
                localStorage.removeItem(CURRENT_TOURNAMENT_ID_KEY);
                handleLocationHash();
            });
        } else {
            // Mode simulation (non connecté ou pas de Firestore)
            console.log("Chargement des données depuis localStorage (mode simulation).");
            try {
                allTeams = JSON.parse(localStorage.getItem(TEAM_DATA_KEY) || '[]');
                allBrassagePhases = JSON.parse(localStorage.getItem(BRASSAGE_PHASES_KEY) || '[]');
                eliminationPhases = JSON.parse(localStorage.getItem(ELIMINATION_PHASES_KEY) || '{}');
                currentSecondaryGroupsPreview = JSON.parse(localStorage.getItem(SECONDARY_GROUPS_PREVIEW_KEY) || '{}');
                const storedEliminatedTeams = JSON.parse(localStorage.getItem(ELIMINATED_TEAMS_KEY) || '[]');
                eliminatedTeams = new Set(storedEliminatedTeams);
                
                // En mode simulation, currentTournamentData est une représentation locale
                currentTournamentData = {
                    id: 'simulation',
                    name: 'Tournoi de Simulation',
                    numTeamsAllowed: MAX_SIMULATION_TEAMS, // Limite pour la simulation
                    teams: allTeams,
                    brassagePhases: allBrassagePhases,
                    eliminationPhases: eliminationPhases,
                    secondaryGroupsPreview: currentSecondaryGroupsPreview,
                    eliminatedTeams: Array.from(eliminatedTeams),
                    currentDisplayedPhaseId: null
                };

                rebuildMatchOccurrenceMap();
                console.log("DEBUG: Données chargées depuis localStorage - Équipes:", allTeams, "Brassages:", allBrassagePhases);
                handleLocationHash(); // Re-render la page actuelle
            } catch (e) {
                console.error("ERREUR: Impossible de charger les données depuis localStorage:", e);
                // Réinitialiser en cas d'erreur de chargement local
                allTeams = [];
                allBrassagePhases = [];
                eliminationPhases = {};
                currentSecondaryGroupsPreview = {};
                eliminatedTeams = new Set();
                matchOccurrenceMap = new Map();
                currentTournamentData = { id: 'simulation', name: 'Tournoi de Simulation', numTeamsAllowed: MAX_SIMULATION_TEAMS, teams: [], brassagePhases: [], eliminationPhases: {}, secondaryGroupsPreview: {}, eliminatedTeams: [], currentDisplayedPhaseId: null };
                handleLocationHash();
            }
        }
    }

    /**
     * Sauvegarde toutes les données du tournoi actuellement sélectionné dans Firestore ou localStorage.
     */
    async function saveAllData() {
        // Si un utilisateur est connecté et qu'un tournoi est sélectionné, sauvegarder dans Firestore
        if (window.db && window.userId && currentTournamentId && window.appId) {
            const tournamentDocRef = window.doc(window.db, `artifacts/${window.appId}/users/${window.userId}/tournaments`, currentTournamentId);

            const dataToSave = {
                teams: allTeams,
                brassagePhases: allBrassagePhases,
                eliminationPhases: eliminationPhases,
                secondaryGroupsPreview: currentSecondaryGroupsPreview,
                eliminatedTeams: Array.from(eliminatedTeams),
                currentDisplayedPhaseId: currentDisplayedPhaseId,
                // Conserver les métadonnées du tournoi
                name: currentTournamentData ? currentTournamentData.name : 'N/A',
                date: currentTournamentData ? currentTournamentData.date : 'N/A',
                numTeamsAllowed: currentTournamentData ? currentTournamentData.numTeamsAllowed : 0,
                ownerId: window.userId,
                createdAt: currentTournamentData && currentTournamentData.createdAt ? currentTournamentData.createdAt : (window.serverTimestamp ? window.serverTimestamp() : Date.now()),
            };

            try {
                await window.setDoc(tournamentDocRef, dataToSave, { merge: true });
                console.log("Données du tournoi sauvegardées avec succès dans Firestore !");
            } catch (error) {
                console.error("Erreur lors de la sauvegarde des données du tournoi dans Firestore:", error);
                showToast("Erreur lors de la sauvegarde des données.", "error");
            }
        } else {
            // Mode simulation (non connecté) - Sauvegarde dans localStorage
            console.log("Sauvegarde des données dans localStorage (mode simulation).");
            localStorage.setItem(TEAM_DATA_KEY, JSON.stringify(allTeams));
            localStorage.setItem(BRASSAGE_PHASES_KEY, JSON.stringify(allBrassagePhases));
            localStorage.setItem(ELIMINATION_PHASES_KEY, JSON.stringify(eliminationPhases));
            localStorage.setItem(SECONDARY_GROUPS_PREVIEW_KEY, JSON.stringify(currentSecondaryGroupsPreview));
            localStorage.setItem(ELIMINATED_TEAMS_KEY, JSON.stringify(Array.from(eliminatedTeams)));
            // Pas de currentTournamentId en mode simulation, donc pas de sauvegarde pour cela.
            console.log("DEBUG: Données sauvegardées dans localStorage.");
        }
        rebuildMatchOccurrenceMap(); // Rebuild map after saving changes
        updateRepeatedMatchesCountDisplay(); // Update display after saving phases
    }


    /**
     * Rebuilds the match occurrence map.
     * This helps track which team pairs have played in which phases.
     */
    function rebuildMatchOccurrenceMap() {
        matchOccurrenceMap = new Map(); // Reset the map
        allBrassagePhases.forEach(phase => {
            // Only include actual brassage phases (initial and secondary)
            if ((phase.type === PHASE_TYPE_INITIAL || phase.type === PHASE_TYPE_SECONDARY_BRASSAGE) && phase.generated && phase.pools) {
                phase.pools.forEach(pool => {
                    pool.matches.forEach(match => {
                        // Ensure both team IDs are valid before creating the key
                        if (match.team1Id && match.team2Id) {
                            // Create a canonical key by sorting IDs so order doesn't matter
                            const matchKey = JSON.stringify([match.team1Id, match.team2Id].sort());
                            if (!matchOccurrenceMap.has(matchKey)) {
                                matchOccurrenceMap.set(matchKey, new Set()); // Use a Set to avoid duplicate phase IDs
                            }
                            matchOccurrenceMap.get(matchKey).add(phase.id);
                        }
                    });
                });
            }
        });
        console.log("DEBUG: Match Occurrence Map rebuilt:", matchOccurrenceMap);
    }

    /**
     * Calculates and displays the count of repeated matches.
     */
    function updateRepeatedMatchesCountDisplay() {
        const countElement = document.getElementById('repeatedMatchesCount');
        if (countElement) {
            let repeatedCount = 0;
            // Iterate over the map to count unique repeated encounters
            for (const [matchKey, phaseIdsSet] of matchOccurrenceMap.entries()) {
                if (phaseIdsSet.size > 1) { // A match is repeated if it occurred in more than one phase
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
     * Checks if a given match has already occurred in another phase.
     * @param {string} team1Id ID of the first team.
     * @param {string} team2Id ID of the second team.
     * @param {string} currentPhaseId ID of the current phase to exclude from the check.
     * @param {Map} evaluationMatchMap The match occurrence map to use for this check (can be temporary).
     * @returns {boolean} True if the match is a repeat, false otherwise.
     */
    function isMatchRepeated(team1Id, team2Id, currentPhaseId, evaluationMatchMap = matchOccurrenceMap) {
        if (!team1Id || !team2Id) return false;
        const matchKey = JSON.stringify([team1Id, team2Id].sort());
        const occurrences = evaluationMatchMap.get(matchKey);
        if (!occurrences) return false;

        // Check if this team pair has played in at least one *other* phase (not including currentPhaseId if it's the phase being evaluated).
        return Array.from(occurrences).some(phaseId => phaseId !== currentPhaseId);
    }

    /**
     * Displays a modal with details about a repeated match.
     * @param {string} team1Name Name of the first team.
     * @param {string} team2Name Name of the second team.
     * @param {string} team1Id ID of the first team.
     * @param {string} team2Id ID of the second team.
     * @param {string} currentPhaseId ID of the current phase (to exclude from the list).
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
            .filter(phase => phase !== undefined); // Ensure the phase exists

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
                detailsByPhase: {} // To store points/diff for each phase individually
            });
        });

        brassagePhases.forEach(phase => {
            // Seulement compter les scores des phases de brassage initiales et secondaires
            if ((phase.type === PHASE_TYPE_INITIAL || phase.type === PHASE_TYPE_SECONDARY_BRASSAGE) && phase.generated && phase.pools) {
                // Initialize phase details for all teams for this phase
                teams.forEach(team => {
                    const teamStats = rankings.get(team.id);
                    if (teamStats) { // Ensure teamStats exists
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

                                // Update global totals
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

                                // Update per-phase totals
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

    // --- Fonctions de Gestion des Tournois (Firestore) ---

    /**
     * Charge tous les tournois créés par l'utilisateur actuel.
     * Met en place un listener en temps réel.
     */
    async function loadAllUserTournaments() {
        // Vérifie si window.db et window.userId sont bien disponibles (mis à jour par l'initialisation Firebase dans index.html)
        if (!window.db || !window.userId || !window.appId) {
            console.warn("Firestore, userId ou appId non disponible pour charger les tournois.");
            // Si l'utilisateur est déconnecté, s'assurer que les données des tournois sont effacées.
            allUserTournaments = [];
            if (window.location.hash === '#tournaments') {
                renderTournamentDashboard(); // Re-render le tableau de bord des tournois qui sera vide
            }
            updateNavLinksVisibility();
            updateTournamentDisplay();
            return;
        }

        if (window.allUserTournamentsUnsubscribe) {
            window.allUserTournamentsUnsubscribe();
        }

        const tournamentsRef = window.collection(window.db, `artifacts/${window.appId}/users/${window.userId}/tournaments`);
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
     * Sauvegarde toutes les données du tournoi actuellement sélectionné dans Firestore.
     * Cette fonction est appelée par `saveAllData()` qui gère la logique localStorage/Firestore.
     * Elle est ici pour la clarté si on voulait l'appeler directement pour Firestore.
     */
    // function saveTournamentDataToFirestore() { /* ... */ }

    /**
     * Met à jour l'affichage du nom du tournoi actif dans la barre de navigation.
     */
    function updateTournamentDisplay() {
        if (currentTournamentNameDisplay) {
            if (currentTournamentData && currentTournamentData.id !== 'simulation') {
                currentTournamentNameDisplay.textContent = `Tournoi Actif: ${escapeHtml(currentTournamentData.name)}`;
                currentTournamentNameDisplay.classList.remove('hidden');
            } else if (currentTournamentData && currentTournamentData.id === 'simulation') {
                currentTournamentNameDisplay.textContent = `Mode Simulation (max ${MAX_SIMULATION_TEAMS} équipes)`;
                currentTournamentNameDisplay.classList.remove('hidden');
            }
            else {
                currentTournamentNameDisplay.textContent = '';
                currentTournamentNameDisplay.classList.add('hidden');
            }
        }
    }

    /**
     * Crée un nouveau tournoi Firestore.
     * @param {string} name Nom du tournoi.
     * @param {string} date Date du tournoi (formatYYYY-MM-DD).
     * @param {number} numTeams Nombre d'équipes prévues.
     */
    async function createNewTournament(name, date, numTeams) {
        if (!window.db || !window.userId || !window.appId) {
            showToast("Veuillez vous connecter pour créer un tournoi.", "error");
            return;
        }
        if (!name.trim() || !date || isNaN(numTeams) || numTeams < 2) {
            showToast("Veuillez remplir tous les champs (Nom, Date, Nombre d'équipes >= 2).", "error");
            return;
        }

        try {
            const tournamentsCollectionRef = window.collection(window.db, `artifacts/${window.appId}/users/${window.userId}/tournaments`);
            const newTournamentData = {
                name: name.trim(),
                date: date,
                numTeamsAllowed: numTeams,
                ownerId: window.userId,
                createdAt: window.serverTimestamp ? window.serverTimestamp() : Date.now(),
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
            // loadAllData sera déclenché par onSnapshot via le selectTournament qui se fera automatiquement
            // après la création du document.
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
        if (!window.db || !window.userId || !window.appId) {
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
        await loadAllData(); // Charger les données du nouveau tournoi
    }

    /**
     * Supprime un tournoi.
     * @param {string} tournamentId L'ID du tournoi à supprimer.
     */
    async function deleteTournament(tournamentId) {
        if (!window.db || !window.userId || !window.appId) {
            showToast("Veuillez vous connecter pour supprimer un tournoi.", "error");
            return;
        }

        const tournamentToDelete = allUserTournaments.find(t => t.id === tournamentId);
        if (!tournamentToDelete) {
            showToast("Tournoi non trouvé.", "error");
            return;
        }
        // Vérification de la propriété ownerId pour s'assurer que l'utilisateur est le propriétaire
        if (tournamentToDelete.ownerId !== window.userId) {
            showToast("Vous n'êtes pas le propriétaire de ce tournoi et ne pouvez pas le supprimer.", "error");
            return;
        }

        const messageContent = document.createElement('p');
        messageContent.textContent = `Êtes-vous sûr de vouloir supprimer le tournoi "${escapeHtml(tournamentToDelete.name)}" ? Cette action est irréversible.`;
        messageContent.className = 'text-gray-700';

        showModal('Confirmer la suppression du tournoi', messageContent, async () => {
            try {
                const tournamentDocRef = window.doc(window.db, `artifacts/${window.appId}/users/${window.userId}/tournaments`, tournamentId);
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
                // loadAllUserTournaments sera déclenché par onSnapshot
                handleLocationHash(); // Rediriger l'utilisateur après la suppression
            } catch (error) {
                console.error("Erreur lors de la suppression du tournoi:", error);
                showToast("Erreur lors de la suppression du tournoi: " + error.message, "error");
            }
        }, true);
    }


    // --- Fonctions de Routage (seront définies dans Partie 4 mais dépendent de la visibilité) ---
    // Déclarées ici pour que les autres fonctions (comme updateNavLinksVisibility) puissent les appeler
    function renderHomePage() { /* sera défini dans Partie 4 */ }
    function renderTournamentDashboard() { /* sera défini dans Partie 4 */ }
    function renderEquipesPage() { /* sera défini dans Partie 4 */ }
    function renderBrassagesPage() { /* sera défini dans Partie 4 */ }
    function renderEliminatoiresPage() { /* sera défini dans Partie 4 */ }
    function renderClassementsPage() { /* sera défini dans Partie 4 */ }
    function renderAuthPage() { /* sera défini dans Partie 4 */ }
    function renderEliminationSelectionPage() { /* sera défini dans Partie 4 */ }


    const routes = {
        '#home': renderHomePage,
        '#tournaments': renderTournamentDashboard,
        '#equipes': renderEquipesPage,
        '#brassages': renderBrassagesPage,
        '#eliminatoires': renderEliminatoiresPage,
        '#classements': renderClassementsPage,
        '#auth': renderAuthPage,
        '#elimination-selection': renderEliminationSelectionPage
    };

    /**
     * Gère le changement de route en fonction du hash de l'URL.
     */
    function handleLocationHash() {
        let path = window.location.hash || '#home'; // Par défaut, la page d'accueil

        // Si l'utilisateur n'est pas connecté et qu'il n'est pas sur la page d'authentification,
        // le rediriger vers la page d'authentification.
        if (!window.userId && path !== '#auth') {
            path = '#auth';
            window.location.hash = '#auth'; // Mettre à jour l'URL pour refléter la redirection
        } else if (window.userId && path === '#auth') {
            // Si l'utilisateur est connecté et qu'il est sur la page d'authentification,
            // le rediriger vers la page des tournois si aucun tournoi n'est sélectionné, sinon l'accueil
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
        const currentPath = window.location.hash;
        // Mettre à jour la classe "active" de la navigation sur les liens <a>
        document.querySelectorAll('#main-nav-links .nav-link').forEach(link => {
            if (link && link.getAttribute('href') === currentPath) {
                link.classList.add('bg-blue-700'); // Classe pour l'état actif
            } else if (link) {
                link.classList.remove('bg-blue-700');
            }
        });
        // Gérer spécifiquement le lien 'Accueil' qui est directement sous 'nav' (pas dans #main-nav-links)
        const homeNavLink = document.getElementById('nav-home');
        if (homeNavLink) {
            if (homeNavLink.getAttribute('href') === currentPath) {
                homeNavLink.classList.add('bg-blue-700');
            } else {
                homeNavLink.classList.remove('bg-blue-700');
            }
        }


        // Gérer la visibilité des blocs d'informations et des liens de navigation
        const isLoggedIn = !!window.userId;
        const tournamentSelected = !!currentTournamentId; // True si un tournoi Firestore est sélectionné

        if (authInfoDiv) {
            authInfoDiv.classList.toggle('hidden', !isLoggedIn);
        }
        if (userEmailSpan && window.auth && window.auth.currentUser) {
            userEmailSpan.textContent = window.auth.currentUser.email || "Anonyme";
        } else if (userEmailSpan) {
            userEmailSpan.textContent = "Déconnecté";
        }

        if (logoutBtn) {
            logoutBtn.classList.toggle('hidden', !isLoggedIn);
        }
        if (selectTournamentBtn) {
            selectTournamentBtn.classList.toggle('hidden', !isLoggedIn); // Toujours visible si connecté
        }
        if (currentTournamentNameDisplay) {
            // Toujours afficher le nom du tournoi si un tournoi est "actif" (même en simulation)
            currentTournamentNameDisplay.classList.toggle('hidden', !currentTournamentData);
        }

        // Afficher/masquer les éléments <li> des liens de navigation principaux
        // navLinks.home est maintenant le <li> du lien Accueil
        // Le lien "Tournois" est toujours visible si connecté
        if (navLinks.home) navLinks.home.classList.toggle('hidden', !isLoggedIn && currentPath !== '#auth');
        if (navLinks.tournaments) navLinks.tournaments.classList.toggle('hidden', !isLoggedIn);
        // Les autres liens ne sont visibles que si un tournoi est sélectionné (Firestore ou simulation)
        if (navLinks.equipes) navLinks.equipes.classList.toggle('hidden', !currentTournamentData);
        if (navLinks.brassages) navLinks.brassages.classList.toggle('hidden', !currentTournamentData);
        if (navLinks.eliminatoires) navLinks.eliminatoires.classList.toggle('hidden', !currentTournamentData);
        if (navLinks.classements) navLinks.classements.classList.toggle('hidden', !currentTournamentData);
    }


    // --- Initialisation de l'Application ---
    // Tout le code qui interagit avec le DOM doit être à l'intérieur de DOMContentLoaded.
    // Les fonctions globales sont définies dans le IIFE pour être accessibles via `window.`.
    // Les écouteurs d'événements pour les boutons de la modale globale sont attachés ici.
    // La logique d'initialisation de Firebase est dans index.html.
    // `window.onFirebaseReady` est le callback qui est appelé une fois Firebase initialisé et l'état d'auth connu.
    document.addEventListener('DOMContentLoaded', () => {
        // 1. Initialisation des variables DOM ici, après que le document soit prêt
        modal = document.getElementById('actionModal');
        modalTitle = document.getElementById('modalTitle');
        modalBody = document.getElementById('modalBody');
        modalConfirmBtn = document.getElementById('modalConfirmBtn');
        modalCancelBtn = document.getElementById('modalCancelBtn');
        toastContainer = document.getElementById('toast-container');

        authInfoDiv = document.getElementById('auth-info');
        userEmailSpan = document.getElementById('user-email');
        logoutBtn = document.getElementById('logout-btn');
        selectTournamentBtn = document.getElementById('select-tournament-btn');
        currentTournamentNameDisplay = document.getElementById('current-tournament-name');

        // navLinks maintenant cible les LI (pour les cacher/afficher)
        navLinks = {
            home: document.getElementById('nav-home-li'),
            tournaments: document.getElementById('nav-tournaments'),
            equipes: document.getElementById('nav-equipes'),
            brassages: document.getElementById('nav-brassages'),
            eliminatoires: document.getElementById('nav-eliminatoires'),
            classements: document.getElementById('nav-classements'),
        };

        // 2. Attacher les gestionnaires d'événements pour les boutons de la modale globale
        if (modalCancelBtn) {
            modalCancelBtn.addEventListener('click', hideModal);
        } else {
            console.error("modalCancelBtn non trouvé après DOMContentLoaded. Vérifiez l'HTML.");
        }

        // 3. Firebase est initialisé dans le script inline de index.html.
        // On attend que window.onFirebaseReady soit appelé par ce script.
        window.onFirebaseReady = async (user) => {
            console.log("Firebase est prêt. Gestion du routage et chargement initial des données.");
            // Si l'utilisateur est connecté, tenter de charger les tournois et les données du tournoi.
            if (user) {
                await loadAllUserTournaments(); // Charger la liste des tournois de l'utilisateur
                await loadAllData(); // Charger les données du tournoi sélectionné (ou rediriger)
            } else {
                // Si déconnecté, s'assurer que l'état de l'application est propre
                currentTournamentId = null;
                currentTournamentData = null; // Important: reset currentTournamentData
                allTeams = [];
                allBrassagePhases = [];
                eliminationPhases = {};
                currentSecondaryGroupsPreview = {};
                eliminatedTeams = new Set();
                currentDisplayedPhaseId = null;
                allUserTournaments = []; // Vider la liste des tournois
                loadAllData(); // Recharger les données en mode simulation
            }
            handleLocationHash(); // Gère la route initiale et la visibilité des liens
        };

        // 4. Écouter les changements de hash dans l'URL pour le routage
        window.addEventListener('hashchange', handleLocationHash);

        // 5. Gestionnaire pour le bouton de déconnexion
        if (logoutBtn) {
            logoutBtn.addEventListener('click', async () => {
                try {
                    if (window.auth) {
                        await window.signOut(window.auth);
                        showToast("Déconnexion réussie !", "info");
                        // onAuthStateChanged gérera le nettoyage et la redirection
                    } else {
                        showToast("Auth non initialisée.", "error");
                    }
                } catch (error) {
                    console.error("Erreur de déconnexion:", error);
                    showToast("Erreur lors de la déconnexion.", "error");
                }
            });
        }

        // 6. Gestionnaire pour le bouton "Changer de tournoi"
        if (selectTournamentBtn) {
            selectTournamentBtn.addEventListener('click', () => {
                window.location.hash = '#tournaments';
            });
        }
    });

    // Rendre les fonctions globales nécessaires pour être appelées depuis d'autres parties du code
    // ou directement par le HTML (via les gestionnaires d'événements JavaScript générés).
    window.showToast = showToast;
    window.showModal = showModal;
    window.hideModal = hideModal;

    // Exposer les variables d'état (lecture seule pour les autres modules)
    Object.defineProperty(window, 'allTeams', { get: () => allTeams });
    Object.defineProperty(window, 'allBrassagePhases', { get: () => allBrassagePhases });
    Object.defineProperty(window, 'eliminationPhases', { get: () => eliminationPhases });
    Object.defineProperty(window, 'currentSecondaryGroupsPreview', { get: () => currentSecondaryGroupsPreview });
    Object.defineProperty(window, 'eliminatedTeams', { get: () => eliminatedTeams });
    Object.defineProperty(window, 'currentDisplayedPhaseId', { get: () => currentDisplayedPhaseId });
    Object.defineProperty(window, 'currentTournamentId', { get: () => currentTournamentId });
    Object.defineProperty(window, 'currentTournamentData', { get: () => currentTournamentData });
    Object.defineProperty(window, 'allUserTournaments', { get: () => allUserTournaments });
    Object.defineProperty(window, 'MAX_SIMULATION_TEAMS', { get: () => MAX_SIMULATION_TEAMS });


    window.saveAllData = saveAllData;
    window.loadAllData = loadAllData;
    window.createNewTournament = createNewTournament;
    window.selectTournament = selectTournament;
    window.deleteTournament = deleteTournament;
    window.teamExists = teamExists;
    window.isMatchRepeated = isMatchRepeated;
    window.updateRepeatedMatchesCountDisplay = updateRepeatedMatchesCountDisplay;
    window.showRepeatedMatchDetailsModal = showRepeatedMatchDetailsModal;
    window.updateNavLinksVisibility = updateNavLinksVisibility;
    window.updateTournamentDisplay = updateTournamentDisplay;
    window.handleLocationHash = handleLocationHash;
    window.getGlobalRankings = getGlobalRankings; // Exposer pour les classements

    // Exposer les fonctions de rendu et de logique des pages (Partie 4 et 5)
    window.renderHomePage = renderHomePage;
    window.setupAuthPageLogic = setupAuthPageLogic; // Sera définie plus tard
    window.renderEquipesPage = renderEquipesPage;
    window.setupEquipesPageLogic = setupEquipesPageLogic;
    window.renderBrassagesPage = renderBrassagesPage;
    window.setupBrassagesPageLogic = setupBrassagesPageLogic;
    window.renderSecondaryGroupsPreview = renderSecondaryGroupsPreview;
    window.renderEliminationSelectionPage = renderEliminationSelectionPage;
    window.setupEliminationSelectionPageLogic = setupEliminationSelectionPageLogic;
    window.renderEliminatoiresPage = renderEliminatoiresPage;
    window.setupEliminatoiresPageLogic = setupEliminatoiresPageLogic;
    window.renderClassementsPage = renderClassementsPage;
    window.setupClassementsPageLogic = setupClassementsPageLogic;
    window.renderTournamentDashboard = renderTournamentDashboard;
    window.setupTournamentDashboardLogic = setupTournamentDashboardLogic; // Sera définie plus tard

    // Exposer les fonctions de gestion des équipes et phases de brassage
    window.addTeam = addTeam; // Sera définie plus tard
    window.updateTeam = updateTeam; // Sera définie plus tard
    window.deleteTeam = deleteTeam; // Sera définie plus tard
    window.isBrassagePhaseComplete = isBrassagePhaseComplete; // Sera définie plus tard
    window.generateAndEvaluatePools = generateAndEvaluatePools; // Sera définie plus tard
    window.generatePoolsForPhase = generatePoolsForPhase; // Sera définie plus tard
    window._generatePoolsLogicInitialLevels = _generatePoolsLogicInitialLevels; // Sera définie plus tard
    window._generatePoolsLogicRankingBased = _generatePoolsLogicRankingBased; // Sera définie plus tard
    window._performSecondaryGroupsPreview = _performSecondaryGroupsPreview; // Sera définie plus tard
    window.showTeamOptionsModal = showTeamOptionsModal; // Sera définie plus tard
    window.showMoveTeamModal = showMoveTeamModal; // Sera définie plus tard
    window.moveTeamBetweenSecondaryGroups = moveTeamBetweenSecondaryGroups; // Sera définie plus tard
    window.validateSecondaryGroupsForElimination = validateSecondaryGroupsForElimination; // Sera définie plus tard
    window.validateForDirectElimination = validateForDirectElimination; // Sera définie plus tard
    window.generateSecondaryBrassagePhases = generateSecondaryBrassagePhases; // Sera définie plus tard
    window.clearAllPhases = clearAllPhases; // Sera définie plus tard
    window.renderCurrentBrassagePhaseDetails = renderCurrentBrassagePhaseDetails; // Sera définie plus tard

    // Exposer les constantes de type de phase
    window.PHASE_TYPE_INITIAL = PHASE_TYPE_INITIAL;
    window.PHASE_TYPE_SECONDARY_BRASSAGE = PHASE_TYPE_SECONDARY_BRASSAGE;
    window.PHASE_TYPE_ELIMINATION_SEEDING = PHASE_TYPE_ELIMINATION_SEEDING;

    // Fonctions d'import/export Excel (à définir ou à laisser si déjà existantes)
    window.importScoresFromExcel = importScoresFromExcel; // Sera définie plus tard
    window.exportScoresToExcel = exportScoresToExcel; // Sera définie plus tard

})();
    // --- Fonctions de Gestion des Équipes ---

    /**
     * Ajoute une nouvelle équipe à la liste.
     * @param {string} name Le nom de l'équipe.
     * @param {number} level Le niveau de l'équipe (1-10).
     */
    async function addTeam(name, level) {
        if (!currentTournamentData) {
            showToast("Aucun tournoi n'est sélectionné ou les données ne sont pas chargées.", "error");
            return;
        }

        if (currentTournamentData.id === 'simulation' && allTeams.length >= MAX_SIMULATION_TEAMS) {
            showToast(`En mode simulation, vous ne pouvez pas ajouter plus de ${MAX_SIMULATION_TEAMS} équipes. Créez un compte pour des tournois plus grands.`, "error");
            return;
        }

        if (teamExists(name)) {
            showToast(`L'équipe "${escapeHtml(name)}" existe déjà. Veuillez choisir un nom différent.`, "error");
            return;
        }

        const newTeam = {
            id: 'team_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9),
            name: name,
            level: level
        };
        allTeams.push(newTeam);
        await saveAllData(); // Sauvegarde les données après l'ajout
        showToast(`Équipe "${escapeHtml(name)}" ajoutée avec succès !`, "success");
        renderEquipesPage(); // Re-render la page pour mettre à jour la liste
    }

    /**
     * Met à jour une équipe existante.
     * @param {string} teamId L'ID de l'équipe à modifier.
     * @param {string} newName Le nouveau nom de l'équipe.
     * @param {number} newLevel Le nouveau niveau de l'équipe.
     */
    async function updateTeam(teamId, newName, newLevel) {
        if (!currentTournamentData) {
            showToast("Aucun tournoi n'est sélectionné ou les données ne sont pas chargées.", "error");
            return;
        }

        const teamToUpdate = allTeams.find(t => t.id === teamId);
        if (!teamToUpdate) {
            showToast("Équipe non trouvée.", "error");
            return;
        }

        if (teamExists(newName) && newName.toLowerCase() !== teamToUpdate.name.toLowerCase()) {
            showToast(`Une équipe nommée "${escapeHtml(newName)}" existe déjà.`, "error");
            return;
        }

        teamToUpdate.name = newName;
        teamToUpdate.level = newLevel;
        await saveAllData(); // Sauvegarde les données après la modification
        showToast(`Équipe "${escapeHtml(newName)}" mise à jour.`, "success");
        renderEquipesPage(); // Re-render la page pour mettre à jour la liste
    }

    /**
     * Supprime une équipe.
     * @param {string} teamId L'ID de l'équipe à supprimer.
     */
    async function deleteTeam(teamId) {
        if (!currentTournamentData) {
            showToast("Aucun tournoi n'est sélectionné ou les données ne sont pas chargées.", "error");
            return;
        }

        const teamToDelete = allTeams.find(t => t.id === teamId);
        if (!teamToDelete) {
            showToast("Équipe non trouvée.", "error");
            return;
        }

        const messageContent = document.createElement('p');
        messageContent.textContent = `Êtes-vous sûr de vouloir supprimer l'équipe "${escapeHtml(teamToDelete.name)}" ? Cette action est irréversible.`;
        messageContent.className = 'text-gray-700';

        showModal('Confirmer la suppression', messageContent, async () => {
            allTeams = allTeams.filter(team => team.id !== teamId);
            eliminatedTeams.delete(teamId); // Supprimer l'équipe des éliminées si elle y était
            await saveAllData(); // Sauvegarde les données après la suppression
            showToast(`Équipe "${escapeHtml(teamToDelete.name)}" supprimée.`, "success");
            renderEquipesPage(); // Re-render la page pour mettre à jour la liste
        }, true);
    }
    // --- Fonctions de Gestion des Phases de Brassage et Élimination ---

    /**
     * Vérifie si tous les matchs d'une phase de brassage donnée ont des scores.
     * @param {string} phaseId L'ID de la phase à vérifier.
     * @returns {boolean} True si tous les matchs ont des scores, false sinon.
     */
    function isBrassagePhaseComplete(phaseId) {
        const phase = allBrassagePhases.find(p => p.id === phaseId);
        if (!phase || !phase.pools) return false;

        for (const pool of phase.pools) {
            if (pool.matches) {
                for (const match of pool.matches) {
                    if (match.score1 === undefined || match.score2 === undefined || match.score1 < 0 || match.score2 < 0) {
                        return false; // Au moins un score est manquant ou invalide
                    }
                }
            }
        }
        return true;
    }

    /**
     * Génère et évalue les poules pour une nouvelle phase de brassage ou de seeding.
     * @param {string} phaseType Le type de phase à générer (PHASE_TYPE_INITIAL, PHASE_TYPE_SECONDARY_BRASSAGE, PHASE_TYPE_ELIMINATION_SEEDING).
     */
    async function generateAndEvaluatePools(phaseType) {
        if (!currentTournamentData) {
            showToast("Aucun tournoi n'est sélectionné ou les données ne sont pas chargées.", "error");
            return;
        }

        if (allTeams.length < 4) {
            showToast("Un minimum de 4 équipes est requis pour générer des brassages.", "error");
            return;
        }

        let teamsToUse = [...allTeams]; // Copie des équipes
        let phaseName = '';
        let basis = ''; // Critère de génération (levels ou ranking)

        if (phaseType === PHASE_TYPE_INITIAL) {
            phaseName = `Brassage Initial - ${allBrassagePhases.length + 1}`;
            basis = 'levels'; // Basé sur les niveaux initiaux
        } else if (phaseType === PHASE_TYPE_SECONDARY_BRASSAGE) {
            const lastPhase = allBrassagePhases[allBrassagePhases.length - 1];
            if (!lastPhase || !lastPhase.generated || !lastPhase.rankings) {
                showToast("Veuillez d'abord compléter la phase précédente pour générer un brassage secondaire.", "error");
                return;
            }
            phaseName = `Brassage Secondaire - ${allBrassagePhases.length + 1}`;
            basis = 'ranking'; // Basé sur le classement de la phase précédente
            teamsToUse = lastPhase.rankings.map(r => allTeams.find(t => t.id === r.teamId)).filter(Boolean); // Utiliser les équipes classées
        } else if (phaseType === PHASE_TYPE_ELIMINATION_SEEDING) {
            // La logique de génération pour l'élimination_seeding est différente et est gérée par _performSecondaryGroupsPreview
            // Cette fonction ne devrait pas être appelée directement avec PHASE_TYPE_ELIMINATION_SEEDING.
            showToast("Veuillez utiliser le bouton 'Générer Groupes Éliminatoires' pour cette phase.", "error");
            return;
        }

        // Déterminer le nombre de poules et d'équipes par poule
        // Pour simplifier, nous allons viser des poules de 3 ou 4 équipes.
        let numPools = Math.floor(teamsToUse.length / 4);
        let teamsPerPool = 4;

        if (numPools === 0) { // Si moins de 4 équipes, on ne peut pas faire de poules de 4
            numPools = 1;
            teamsPerPool = teamsToUse.length;
            if (teamsPerPool < 2) {
                showToast("Pas assez d'équipes pour former des poules.", "error");
                return;
            }
        } else if (teamsToUse.length % 4 !== 0 && teamsToUse.length % 3 === 0) {
            teamsPerPool = 3;
            numPools = teamsToUse.length / 3;
        } else if (teamsToUse.length % 4 !== 0 && teamsToUse.length % 3 !== 0) {
            // Cas où la division n'est pas parfaite, essayer de répartir au mieux
            // Prioriser des poules de 4, puis de 3.
            // Exemple: 10 équipes -> 2 poules de 4, 1 poule de 2 (pas idéal)
            // Ou 10 équipes -> 3 poules (2 de 3, 1 de 4)
            // Pour l'instant, on reste simple, mais c'est ici qu'une logique plus complexe serait nécessaire.
            // Pour l'exemple, on va juste s'assurer que teamsPerPool est au moins 2.
            if (teamsToUse.length < 6) { // Moins de 6 équipes, faire une seule poule
                numPools = 1;
                teamsPerPool = teamsToUse.length;
            } else { // Plus de 6 équipes, tenter de faire des poules de 3 ou 4
                numPools = Math.max(1, Math.floor(teamsToUse.length / 4));
                teamsPerPool = Math.floor(teamsToUse.length / numPools);
                // Ajustement pour éviter des poules trop petites ou trop grandes
                while (teamsPerPool < 3 && numPools > 1) {
                    numPools--;
                    teamsPerPool = Math.floor(teamsToUse.length / numPools);
                }
                while (teamsPerPool > 4 && numPools < teamsToUse.length / 2) { // Éviter des poules trop grandes
                    numPools++;
                    teamsPerPool = Math.floor(teamsToUse.length / numPools);
                }
                if (teamsPerPool < 2) teamsPerPool = 2; // Minimum 2 équipes par poule
            }
        }

        const newPhase = await generatePoolsForPhase(phaseName, phaseType, teamsToUse, basis, numPools, teamsPerPool);
        if (newPhase) {
            allBrassagePhases.push(newPhase);
            currentDisplayedPhaseId = newPhase.id; // Afficher la nouvelle phase
            await saveAllData();
            showToast(`Phase "${escapeHtml(newPhase.name)}" générée avec succès !`, "success");
            renderBrassagesPage(); // Re-render pour afficher la nouvelle phase
        }
    }

    /**
     * Génère les poules pour une phase de brassage donnée.
     * @param {string} phaseName Le nom de la phase.
     * @param {string} phaseType Le type de phase (initial, secondaire).
     * @param {Array<Object>} teams Les équipes à répartir.
     * @param {string} basis Le critère de génération ('levels' ou 'ranking').
     * @param {number} numPools Le nombre de poules à créer.
     * @param {number} teamsPerPool Le nombre d'équipes par poule.
     * @returns {Object|null} La nouvelle phase générée ou null en cas d'échec.
     */
    async function generatePoolsForPhase(phaseName, phaseType, teams, basis, numPools, teamsPerPool) {
        const newPhase = {
            id: 'phase_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9),
            name: phaseName,
            type: phaseType,
            generated: false, // Sera true après la sauvegarde des scores
            pools: [],
            rankings: [], // Le classement de cette phase sera stocké ici
            createdAt: new Date().toISOString()
        };

        let pools = [];
        if (basis === 'levels') {
            pools = _generatePoolsLogicInitialLevels(teams, numPools, teamsPerPool);
        } else if (basis === 'ranking') {
            pools = _generatePoolsLogicRankingBased(teams, numPools, teamsPerPool);
        } else {
            showToast("Critère de génération de poules inconnu.", "error");
            return null;
        }

        // Générer les matchs pour chaque poule
        pools.forEach(pool => {
            pool.matches = [];
            for (let i = 0; i < pool.teams.length; i++) {
                for (let j = i + 1; j < pool.teams.length; j++) {
                    const team1Id = pool.teams[i];
                    const team2Id = pool.teams[j];
                    pool.matches.push({
                        id: `match_${newPhase.id}_${team1Id}_${team2Id}_${Math.random().toString(36).substring(2, 5)}`,
                        team1Id: team1Id,
                        team2Id: team2Id,
                        score1: undefined, // Score initialement non défini
                        score2: undefined,
                        winnerId: null,
                        loserId: null
                    });
                }
            }
        });

        newPhase.pools = pools;
        return newPhase;
    }

    /**
     * Logique de génération des poules basée sur les niveaux initiaux des équipes.
     * Tente d'équilibrer les niveaux entre les poules.
     * @param {Array<Object>} teams Les équipes avec leurs IDs et niveaux.
     * @param {number} numPools Le nombre de poules à créer.
     * @param {number} teamsPerPool Le nombre d'équipes par poule.
     * @returns {Array<Object>} Un tableau d'objets poule, chacun avec un tableau d'IDs d'équipes.
     */
    function _generatePoolsLogicInitialLevels(teams, numPools, teamsPerPool) {
        // Trier les équipes par niveau (les plus faibles en premier)
        const sortedTeams = [...teams].sort((a, b) => a.level - b.level);
        const pools = Array.from({ length: numPools }, (_, i) => ({
            id: `pool_${Date.now()}_${i}`,
            name: `Poule ${String.fromCharCode(65 + i)}`,
            teams: []
        }));

        let currentPoolIndex = 0;
        let direction = 1; // 1 pour aller de l'avant, -1 pour aller en arrière (méthode du serpentin)

        sortedTeams.forEach(team => {
            if (pools[currentPoolIndex].teams.length < teamsPerPool) {
                pools[currentPoolIndex].teams.push(team.id);
            } else {
                // Si la poule est pleine, trouver la prochaine poule non pleine
                let nextPoolFound = false;
                for (let i = 0; i < numPools; i++) {
                    const nextIndex = (currentPoolIndex + direction * (i + 1) + numPools) % numPools;
                    if (pools[nextIndex].teams.length < teamsPerPool) {
                        currentPoolIndex = nextIndex;
                        pools[currentPoolIndex].teams.push(team.id);
                        nextPoolFound = true;
                        break;
                    }
                }
                if (!nextPoolFound) {
                    // Fallback: si toutes les poules sont "pleines" selon teamsPerPool, mais il reste des équipes
                    // Cela peut arriver si teams.length n'est pas un multiple parfait de teamsPerPool
                    // On ajoute l'équipe à la poule actuelle (qui dépassera teamsPerPool)
                    pools[currentPoolIndex].teams.push(team.id);
                }
            }

            // Mettre à jour l'index de la poule pour la prochaine équipe
            currentPoolIndex += direction;
            if (currentPoolIndex >= numPools || currentPoolIndex < 0) {
                direction *= -1; // Changer de direction
                currentPoolIndex += direction; // Ajuster l'index pour rester dans les limites
            }
        });

        // Distribuer les équipes restantes si teams.length n'est pas un multiple parfait
        let remainingTeams = sortedTeams.filter(team => !pools.some(pool => pool.teams.includes(team.id)));
        let poolCounter = 0;
        while (remainingTeams.length > 0) {
            pools[poolCounter % numPools].teams.push(remainingTeams.shift().id);
            poolCounter++;
        }

        // S'assurer que toutes les équipes sont dans une poule
        const allTeamIdsInPools = new Set();
        pools.forEach(pool => pool.teams.forEach(teamId => allTeamIdsInPools.add(teamId)));
        if (allTeamIdsInPools.size !== teams.length) {
            console.warn("Certaines équipes n'ont pas été réparties dans les poules.");
            // Logique de récupération ou d'erreur ici
        }

        console.log("DEBUG: Poules générées par niveaux:", pools);
        return pools;
    }

    /**
     * Logique de génération des poules basée sur le classement des phases précédentes.
     * Tente de répartir les équipes classées de manière équitable.
     * @param {Array<Object>} teams Les équipes triées par classement (meilleures en premier).
     * @param {number} numPools Le nombre de poules à créer.
     * @param {number} teamsPerPool Le nombre d'équipes par poule.
     * @returns {Array<Object>} Un tableau d'objets poule, chacun avec un tableau d'IDs d'équipes.
     */
    function _generatePoolsLogicRankingBased(teams, numPools, teamsPerPool) {
        // Les équipes sont déjà censées être triées par classement (meilleures en premier)
        const sortedTeams = [...teams];
        const pools = Array.from({ length: numPools }, (_, i) => ({
            id: `pool_${Date.now()}_${i}`,
            name: `Poule ${String.fromCharCode(65 + i)}`,
            teams: []
        }));

        let currentPoolIndex = 0;
        let direction = 1; // 1 pour aller de l'avant, -1 pour aller en arrière (méthode du serpentin)

        sortedTeams.forEach(team => {
            if (pools[currentPoolIndex].teams.length < teamsPerPool) {
                pools[currentPoolIndex].teams.push(team.id);
            } else {
                // Si la poule est pleine, trouver la prochaine poule non pleine
                let nextPoolFound = false;
                for (let i = 0; i < numPools; i++) {
                    const nextIndex = (currentPoolIndex + direction * (i + 1) + numPools) % numPools;
                    if (pools[nextIndex].teams.length < teamsPerPool) {
                        currentPoolIndex = nextIndex;
                        pools[currentPoolIndex].teams.push(team.id);
                        nextPoolFound = true;
                        break;
                    }
                }
                if (!nextPoolFound) {
                    pools[currentPoolIndex].teams.push(team.id);
                }
            }

            currentPoolIndex += direction;
            if (currentPoolIndex >= numPools || currentPoolIndex < 0) {
                direction *= -1;
                currentPoolIndex += direction;
            }
        });

        // Distribuer les équipes restantes si teams.length n'est pas un multiple parfait
        let remainingTeams = sortedTeams.filter(team => !pools.some(pool => pool.teams.includes(team.id)));
        let poolCounter = 0;
        while (remainingTeams.length > 0) {
            pools[poolCounter % numPools].teams.push(remainingTeams.shift().id);
            poolCounter++;
        }

        console.log("DEBUG: Poules générées par classement:", pools);
        return pools;
    }

    /**
     * Génère une nouvelle phase de brassage secondaire basée sur le classement global actuel.
     */
    async function generateSecondaryBrassagePhases() {
        if (!currentTournamentData) {
            showToast("Aucun tournoi n'est sélectionné ou les données ne sont pas chargées.", "error");
            return;
        }

        const lastCompletedBrassagePhase = allBrassagePhases.filter(p => p.generated && (p.type === PHASE_TYPE_INITIAL || p.type === PHASE_TYPE_SECONDARY_BRASSAGE)).pop();

        if (!lastCompletedBrassagePhase) {
            showToast("Aucune phase de brassage précédente n'est complétée pour générer un brassage secondaire.", "error");
            return;
        }

        // Calculer le classement global basé sur toutes les phases de brassage complétées
        const globalRankings = getGlobalRankings(allTeams, allBrassagePhases);

        if (globalRankings.length < 4) {
            showToast("Pas assez d'équipes classées pour générer un brassage secondaire.", "error");
            return;
        }

        // Utiliser les équipes du classement global pour la nouvelle phase
        const teamsToUse = globalRankings.map(r => r.teamObject);

        // Déterminer le nombre de poules et d'équipes par poule
        let numPools = Math.floor(teamsToUse.length / 4);
        let teamsPerPool = 4;

        if (numPools === 0) {
            numPools = 1;
            teamsPerPool = teamsToUse.length;
            if (teamsPerPool < 2) {
                showToast("Pas assez d'équipes pour former des poules de brassage secondaire.", "error");
                return;
            }
        } else if (teamsToUse.length % 4 !== 0 && teamsToUse.length % 3 === 0) {
            teamsPerPool = 3;
            numPools = teamsToUse.length / 3;
        } else if (teamsToUse.length % 4 !== 0 && teamsToUse.length % 3 !== 0) {
            if (teamsToUse.length < 6) {
                numPools = 1;
                teamsPerPool = teamsToUse.length;
            } else {
                numPools = Math.max(1, Math.floor(teamsToUse.length / 4));
                teamsPerPool = Math.floor(teamsToUse.length / numPools);
                while (teamsPerPool < 3 && numPools > 1) {
                    numPools--;
                    teamsPerPool = Math.floor(teamsToUse.length / numPools);
                }
                while (teamsPerPool > 4 && numPools < teamsToUse.length / 2) {
                    numPools++;
                    teamsPerPool = Math.floor(teamsToUse.length / numPools);
                }
                if (teamsPerPool < 2) teamsPerPool = 2;
            }
        }

        const newPhaseName = `Brassage Secondaire - ${allBrassagePhases.length + 1}`;
        const newPhase = await generatePoolsForPhase(newPhaseName, PHASE_TYPE_SECONDARY_BRASSAGE, teamsToUse, 'ranking', numPools, teamsPerPool);

        if (newPhase) {
            allBrassagePhases.push(newPhase);
            currentDisplayedPhaseId = newPhase.id;
            await saveAllData();
            showToast(`Phase "${escapeHtml(newPhase.name)}" générée avec succès !`, "success");
            renderBrassagesPage();
        }
    }

    /**
     * Efface toutes les phases de brassage et d'élimination.
     */
    async function clearAllPhases() {
        if (!currentTournamentData) {
            showToast("Aucun tournoi n'est sélectionné ou les données ne sont pas chargées.", "error");
            return;
        }

        allBrassagePhases = [];
        eliminationPhases = {};
        currentSecondaryGroupsPreview = {};
        eliminatedTeams.clear(); // Vider le Set des équipes éliminées
        currentDisplayedPhaseId = null;
        await saveAllData();
        showToast("Toutes les phases de brassage et d'élimination ont été effacées.", "info");
        renderBrassagesPage(); // Re-render la page des brassages
    }

    /**
     * Effectue la prévisualisation des groupes secondaires pour la phase d'élimination.
     * Les équipes sont distribuées en "serpentin" (snaking) pour équilibrer les forces.
     * @param {Array<Object>} teamsRanked Les équipes triées par classement.
     * @param {number} numGroups Le nombre de groupes à créer.
     * @param {number} teamsPerGroup Le nombre d'équipes par groupe.
     */
    function _performSecondaryGroupsPreview(teamsRanked, numGroups, teamsPerGroup) {
        currentSecondaryGroupsPreview = {
            id: `elim_seeding_${Date.now()}`,
            groups: {},
            generatedAt: new Date().toISOString()
        };

        // Créer les groupes vides
        for (let i = 0; i < numGroups; i++) {
            const groupId = `group_${currentSecondaryGroupsPreview.id}_${i}`;
            currentSecondaryGroupsPreview.groups[groupId] = {
                id: groupId,
                name: String.fromCharCode(65 + i), // A, B, C...
                teams: [],
                seeding: 'manual'
            };
        }

        // Distribuer les équipes en "serpentin"
        let groupIndex = 0;
        let direction = 1; // 1 for forward, -1 for backward

        teamsRanked.forEach((team) => {
            const groupIds = Object.keys(currentSecondaryGroupsPreview.groups);
            const currentGroupId = groupIds[groupIndex];

            if (currentSecondaryGroupsPreview.groups[currentGroupId].teams.length < teamsPerGroup) {
                currentSecondaryGroupsPreview.groups[currentGroupId].teams.push(team);
            } else {
                // This scenario should ideally not happen if teamsPerGroup and numGroups are correctly calculated.
                // If it does, it means more teams are being added than the group capacity.
                // For now, let's just log a warning.
                console.warn(`Groupe ${currentGroupId} est plein, mais il reste des équipes à distribuer.`);
            }

            groupIndex += direction;

            if (groupIndex >= numGroups || groupIndex < 0) {
                direction *= -1; // Reverse direction
                groupIndex += direction; // Adjust index back within bounds
            }
        });

        saveAllData(); // Sauvegarder la prévisualisation
    }

    /**
     * Affiche une modale avec les options pour une équipe (déplacer, etc.).
     * @param {string} teamId L'ID de l'équipe.
     * @param {string} currentGroupId L'ID du groupe actuel de l'équipe.
     */
    function showTeamOptionsModal(teamId, currentGroupId) {
        const team = allTeams.find(t => t.id === teamId);
        if (!team) return;

        const content = document.createElement('div');
        content.innerHTML = `
            <p class="mb-4">Options pour l'équipe <span class="font-bold">${escapeHtml(team.name)}</span> :</p>
            <button id="move-team-option-btn" class="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded transition duration-150 w-full mb-2">
                Déplacer l'équipe
            </button>
            <!-- Autres options si nécessaire -->
        `;
        showModal(`Options de l'équipe ${escapeHtml(team.name)}`, content, () => { /* No direct confirm action here */ });

        document.getElementById('move-team-option-btn')?.addEventListener('click', () => {
            hideModal(); // Cacher la modale d'options
            showMoveTeamModal(teamId, currentGroupId); // Afficher la modale de déplacement
        });
    }

    /**
     * Affiche une modale pour déplacer une équipe vers un autre groupe.
     * @param {string} teamId L'ID de l'équipe à déplacer.
     * @param {string} fromGroupId L'ID du groupe d'origine.
     */
    function showMoveTeamModal(teamId, fromGroupId) {
        const team = allTeams.find(t => t.id === teamId);
        if (!team || !currentSecondaryGroupsPreview.groups) return;

        const otherGroups = Object.values(currentSecondaryGroupsPreview.groups).filter(g => g.id !== fromGroupId);

        if (otherGroups.length === 0) {
            showToast("Aucun autre groupe disponible pour déplacer l'équipe.", "info");
            return;
        }

        const content = document.createElement('div');
        content.innerHTML = `
            <p class="mb-4">Déplacer l'équipe <span class="font-bold">${escapeHtml(team.name)}</span> du groupe <span class="font-bold">${escapeHtml(currentSecondaryGroupsPreview.groups[fromGroupId]?.name || 'Inconnu')}</span> vers :</p>
            <select id="target-group-select" class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline mb-4">
                ${otherGroups.map(group => `<option value="${escapeHtml(group.id)}">Groupe ${escapeHtml(group.name)}</option>`).join('')}
            </select>
        `;

        showModal(`Déplacer l'équipe ${escapeHtml(team.name)}`, content, async () => {
            const targetGroupId = document.getElementById('target-group-select').value;
            if (targetGroupId) {
                await moveTeamBetweenSecondaryGroups(teamId, fromGroupId, targetGroupId);
            }
        });
    }

    /**
     * Déplace une équipe d'un groupe à un autre dans la prévisualisation des groupes secondaires.
     * @param {string} teamId L'ID de l'équipe à déplacer.
     * @param {string} fromGroupId L'ID du groupe d'origine.
     * @param {string} toGroupId L'ID du groupe cible.
     */
    async function moveTeamBetweenSecondaryGroups(teamId, fromGroupId, toGroupId) {
        if (!currentSecondaryGroupsPreview.groups || !currentSecondaryGroupsPreview.groups[fromGroupId] || !currentSecondaryGroupsPreview.groups[toGroupId]) {
            showToast("Groupes source ou cible invalides.", "error");
            return;
        }

        const teamToMove = currentSecondaryGroupsPreview.groups[fromGroupId].teams.find(t => t.id === teamId);
        if (!teamToMove) {
            showToast("Équipe non trouvée dans le groupe d'origine.", "error");
            return;
        }

        // Retirer l'équipe du groupe d'origine
        currentSecondaryGroupsPreview.groups[fromGroupId].teams = currentSecondaryGroupsPreview.groups[fromGroupId].teams.filter(t => t.id !== teamId);
        // Ajouter l'équipe au groupe cible
        currentSecondaryGroupsPreview.groups[toGroupId].teams.push(teamToMove);

        await saveAllData(); // Sauvegarder la prévisualisation modifiée
        showToast(`Équipe déplacée vers le groupe ${escapeHtml(currentSecondaryGroupsPreview.groups[toGroupId].name)}.`, "success");
        renderEliminationSelectionPage(); // Re-render la page pour refléter le changement
    }

    /**
     * Valide les groupes secondaires pour la génération de la phase d'élimination.
     * Crée une nouvelle phase de type `elimination_seeding` avec ces groupes.
     */
    async function validateSecondaryGroupsForElimination() {
        if (!currentTournamentData) {
            showToast("Aucun tournoi n'est sélectionné ou les données ne sont pas chargées.", "error");
            return;
        }

        const groups = currentSecondaryGroupsPreview.groups;
        const numGroups = Object.keys(groups).length;
        if (numGroups === 0) {
            showToast("Aucun groupe n'a été défini pour la phase éliminatoire.", "error");
            return;
        }

        // Vérifier que tous les groupes ont le même nombre d'équipes et qu'il y a au moins 2 équipes par groupe
        let teamsPerGroup = -1;
        for (const groupId in groups) {
            if (teamsPerGroup === -1) {
                teamsPerGroup = groups[groupId].teams.length;
            } else if (groups[groupId].teams.length !== teamsPerGroup) {
                showToast("Tous les groupes doivent contenir le même nombre d'équipes.", "error");
                return;
            }
            if (groups[groupId].teams.length < 2) {
                showToast("Chaque groupe doit contenir au moins 2 équipes.", "error");
                return;
            }
        }

        // Vérifier que toutes les équipes sont uniques et proviennent de allTeams
        const allTeamIdsInGroups = new Set();
        for (const groupId in groups) {
            groups[groupId].teams.forEach(team => {
                if (allTeamIdsInGroups.has(team.id)) {
                    showToast(`L'équipe ${escapeHtml(team.name)} est dupliquée dans les groupes.`, "error");
                    return; // Sortir de la boucle interne
                }
                allTeamIdsInGroups.add(team.id);
                // Vérifier si l'équipe existe dans allTeams
                if (!allTeams.some(t => t.id === team.id)) {
                    showToast(`L'équipe ${escapeHtml(team.name)} dans les groupes n'est pas une équipe enregistrée.`, "error");
                    return; // Sortir de la boucle interne
                }
            });
            if (allTeamIdsInGroups.size !== Object.values(groups).flatMap(g => g.teams).length) {
                return; // Sortir de la fonction si des doublons ont été trouvés
            }
        }

        // Créer une nouvelle phase de type elimination_seeding
        const newSeedingPhase = {
            id: `elim_seeding_phase_${Date.now()}`,
            name: `Groupes Éliminatoires - ${allBrassagePhases.length + 1}`,
            type: PHASE_TYPE_ELIMINATION_SEEDING,
            generated: true, // Marqué comme généré car la structure est prête
            pools: Object.values(groups).map(group => ({
                id: group.id,
                name: group.name,
                teams: group.teams.map(team => team.id), // Stocker seulement les IDs
                matches: [] // Pas de matchs pour cette phase, juste des groupes
            })),
            rankings: [], // Pas de classement direct pour cette phase de seeding
            createdAt: new Date().toISOString()
        };

        allBrassagePhases.push(newSeedingPhase);
        currentDisplayedPhaseId = newSeedingPhase.id; // Afficher cette phase
        await saveAllData();
        showToast("Groupes éliminatoires validés et phase de seeding créée ! Vous pouvez maintenant générer les tours éliminatoires.", "success");
        renderBrassagesPage(); // Re-render la page pour montrer la nouvelle phase
    }

    /**
     * Génère les matchs pour une phase d'élimination directe (arbre de tournoi).
     * @param {string} seedingPhaseId L'ID de la phase de seeding qui contient les groupes.
     * @param {number} numberOfRounds Le nombre de tours à générer (ex: 1 pour quarts, 2 pour demis, 3 pour finale).
     */
    async function validateForDirectElimination(seedingPhaseId, numberOfRounds) {
        if (!currentTournamentData) {
            showToast("Aucun tournoi n'est sélectionné ou les données ne sont pas chargées.", "error");
            return;
        }
        const seedingPhase = allBrassagePhases.find(p => p.id === seedingPhaseId && p.type === PHASE_TYPE_ELIMINATION_SEEDING);
        if (!seedingPhase || !seedingPhase.pools || seedingPhase.pools.length === 0) {
            showToast("Phase de groupes éliminatoires non trouvée ou vide.", "error");
            return;
        }

        // Récupérer toutes les équipes des groupes de seeding
        let qualifiedTeams = seedingPhase.pools.flatMap(pool => pool.teams);
        qualifiedTeams = qualifiedTeams.map(teamId => allTeams.find(t => t.id === teamId)).filter(Boolean);

        if (qualifiedTeams.length < 2) {
            showToast("Pas assez d'équipes qualifiées pour générer les éliminatoires.", "error");
            return;
        }

        // Calculer le nombre de matchs par tour
        // Un tour complet réduit le nombre d'équipes de moitié.
        // Pour un tournoi à élimination directe, le nombre d'équipes doit être une puissance de 2 (2, 4, 8, 16, etc.)
        // Si ce n'est pas le cas, il y aura des "byes" (équipes qui avancent sans jouer) ou des déséquilibres.
        const numTeams = qualifiedTeams.length;
        let nextPowerOf2 = 1;
        while (nextPowerOf2 < numTeams) {
            nextPowerOf2 *= 2;
        }
        const numByes = nextPowerOf2 - numTeams;

        // Si numByes > 0, il faut gérer les byes. Pour l'instant, on va juste avertir.
        if (numByes > 0) {
            showToast(`Attention: ${numTeams} équipes. Il y aura ${numByes} "byes" (équipes qui passent le premier tour sans jouer) pour former un arbre complet de ${nextPowerOf2} équipes.`, "info", 5000);
        }

        // Pour la génération, on va simuler un arbre complet avec les équipes qualifiées
        // et les "byes" si nécessaire.
        let teamsForBracket = [...qualifiedTeams];
        // Ajouter des équipes fictives pour les byes si nécessaire
        for (let i = 0; i < numByes; i++) {
            teamsForBracket.push({ id: `bye_${i}`, name: `BYE ${i + 1}`, isBye: true });
        }
        shuffleArray(teamsForBracket); // Mélanger pour un tirage aléatoire des byes/équipes

        // Initialiser les tours d'élimination
        eliminationPhases = {}; // Réinitialiser les phases d'élimination existantes

        let currentTeamsInRound = teamsForBracket;
        let roundCount = 1;

        while (currentTeamsInRound.length >= 2 && roundCount <= numberOfRounds) {
            const roundId = `round_${roundCount}`;
            const roundName = `Tour ${roundCount}`;
            const matchesInRound = [];
            let nextRoundTeams = [];

            // Créer les matchs pour ce tour
            for (let i = 0; i < currentTeamsInRound.length; i += 2) {
                const team1 = currentTeamsInRound[i];
                const team2 = currentTeamsInRound[i + 1]; // team2 pourrait être undefined si nombre impair, mais on a géré les byes.

                if (team1.isBye) {
                    // Si la première équipe est un bye, la deuxième équipe avance
                    nextRoundTeams.push(team2);
                    continue;
                } else if (team2.isBye) {
                    // Si la deuxième équipe est un bye, la première équipe avance
                    nextRoundTeams.push(team1);
                    continue;
                }

                matchesInRound.push({
                    id: `match_${roundId}_${team1.id}_${team2.id}_${Math.random().toString(36).substring(2, 5)}`,
                    team1Id: team1.id,
                    team2Id: team2.id,
                    score1: undefined,
                    score2: undefined,
                    winnerId: null,
                    loserId: null
                });
            }

            eliminationPhases[roundId] = {
                name: roundName,
                matches: matchesInRound
            };
            currentTeamsInRound = nextRoundTeams; // Les gagnants (ou byes) passent au tour suivant
            roundCount++;
        }

        await saveAllData();
        showToast("Arbre d'élimination directe généré avec succès !", "success");
        window.location.hash = '#eliminatoires'; // Rediriger vers la page des éliminatoires
    }


    // --- Fonctions d'Import/Export Excel ---

    /**
     * Importe les scores d'une phase de brassage à partir d'un fichier Excel.
     * Le format attendu est une feuille avec des colonnes pour Team1, Team2, Score1, Score2.
     * @param {Array<Array<any>>} jsonData Les données du fichier Excel converties en JSON (array of arrays).
     */
    async function importScoresFromExcel(jsonData) {
        if (!currentDisplayedPhaseId) {
            showToast("Veuillez sélectionner une phase de brassage à importer.", "error");
            return;
        }

        const currentPhase = allBrassagePhases.find(p => p.id === currentDisplayedPhaseId);
        if (!currentPhase || currentPhase.type === PHASE_TYPE_ELIMINATION_SEEDING) {
            showToast("La phase sélectionnée n'est pas une phase de brassage valide pour l'importation de scores.", "error");
            return;
        }

        if (!jsonData || jsonData.length < 2) { // Au moins l'en-tête et une ligne de données
            showToast("Fichier Excel vide ou format incorrect.", "error");
            return;
        }

        const headers = jsonData[0].map(h => String(h).trim().toLowerCase());
        const team1ColIndex = headers.indexOf('team1');
        const team2ColIndex = headers.indexOf('team2');
        const score1ColIndex = headers.indexOf('score1');
        const score2ColIndex = headers.indexOf('score2');

        if (team1ColIndex === -1 || team2ColIndex === -1 || score1ColIndex === -1 || score2ColIndex === -1) {
            showToast("Les colonnes 'Team1', 'Team2', 'Score1', 'Score2' sont requises dans le fichier Excel.", "error");
            return;
        }

        let scoresImportedCount = 0;
        let errorsCount = 0;

        for (let i = 1; i < jsonData.length; i++) { // Commencer à partir de la deuxième ligne (après l'en-tête)
            const row = jsonData[i];
            const excelTeam1Name = String(row[team1ColIndex]).trim();
            const excelTeam2Name = String(row[team2ColIndex]).trim();
            const excelScore1 = parseInt(row[score1ColIndex], 10);
            const excelScore2 = parseInt(row[score2ColIndex], 10);

            if (!excelTeam1Name || !excelTeam2Name || isNaN(excelScore1) || isNaN(excelScore2)) {
                console.warn(`Ligne ${i + 1} ignorée: Données manquantes ou invalides.`, row);
                errorsCount++;
                continue;
            }

            // Trouver les IDs des équipes par leur nom
            const team1 = allTeams.find(t => t.name.toLowerCase() === excelTeam1Name.toLowerCase());
            const team2 = allTeams.find(t => t.name.toLowerCase() === excelTeam2Name.toLowerCase());

            if (!team1 || !team2) {
                console.warn(`Ligne ${i + 1} ignorée: Équipe(s) non trouvée(s) dans la liste des équipes enregistrées. (${excelTeam1Name}, ${excelTeam2Name})`);
                errorsCount++;
                continue;
            }

            let matchFound = false;
            for (const pool of currentPhase.pools) {
                for (const match of pool.matches) {
                    // Vérifier si c'est le bon match (peu importe l'ordre des équipes dans le match)
                    if ((match.team1Id === team1.id && match.team2Id === team2.id) ||
                        (match.team1Id === team2.id && match.team2Id === team1.id)) {

                        // Assigner les scores en respectant l'ordre du match
                        if (match.team1Id === team1.id) {
                            match.score1 = excelScore1;
                            match.score2 = excelScore2;
                        } else { // match.team1Id === team2.id
                            match.score1 = excelScore2;
                            match.score2 = excelScore1;
                        }
                        matchFound = true;
                        scoresImportedCount++;
                        break; // Match trouvé, passer au suivant
                    }
                }
                if (matchFound) break;
            }

            if (!matchFound) {
                console.warn(`Ligne ${i + 1} ignorée: Match entre ${excelTeam1Name} et ${excelTeam2Name} non trouvé dans la phase actuelle.`, row);
                errorsCount++;
            }
        }

        if (scoresImportedCount > 0) {
            // Marquer la phase comme générée si tous les scores sont entrés (et donc la phase est complète)
            // Recalculer les classements après l'importation
            currentPhase.pools.forEach(pool => {
                const teamStats = {};
                pool.teams.forEach(teamId => {
                    teamStats[teamId] = { points: 0, setsWon: 0, setsLost: 0, matchesPlayed: 0, matchesWon: 0 };
                });

                pool.matches.forEach(match => {
                    if (match.score1 !== undefined && match.score2 !== undefined) {
                        const score1 = match.score1;
                        const score2 = match.score2;
                        const diff = Math.abs(score1 - score2);

                        const team1Stats = teamStats[match.team1Id];
                        const team2Stats = teamStats[match.team2Id];

                        if (team1Stats) {
                            team1Stats.matchesPlayed++;
                            team1Stats.setsWon += score1;
                            team1Stats.setsLost += score2;
                            if (score1 > score2) team1Stats.points += 8;
                            else if (score2 > score1) {
                                if (diff >= 1 && diff <= 3) team1Stats.points += 4;
                                else if (diff >= 4 && diff <= 6) team1Stats.points += 3;
                                else if (diff >= 7 && diff <= 9) team1Stats.points += 2;
                                else if (diff >= 10) team1Stats.points += 1;
                            }
                        }
                        if (team2Stats) {
                            team2Stats.matchesPlayed++;
                            team2Stats.setsWon += score2;
                            team2Stats.setsLost += score1;
                            if (score2 > score1) team2Stats.points += 8;
                            else if (score1 > score2) {
                                if (diff >= 1 && diff <= 3) team2Stats.points += 4;
                                else if (diff >= 4 && diff <= 6) team2Stats.points += 3;
                                else if (diff >= 7 && diff <= 9) team2Stats.points += 2;
                                else if (diff >= 10) team2Stats.points += 1;
                            }
                        }
                    }
                });

                pool.rankings = Object.entries(teamStats).map(([teamId, stats]) => {
                    const team = allTeams.find(t => t.id === teamId);
                    return {
                        teamId: teamId,
                        teamName: team ? team.name : 'Inconnu',
                        ...stats,
                        setRatio: stats.setsLost > 0 ? stats.setsWon / stats.setsLost : stats.setsWon // ratio sets
                    };
                });

                pool.rankings.sort((a, b) => {
                    if (b.points !== a.points) return b.points - a.points;
                    if (b.matchesWon !== a.matchesWon) return b.matchesWon - a.matchesWon;
                    return b.setRatio - a.setRatio;
                });
            });

            currentPhase.generated = isBrassagePhaseComplete(currentDisplayedPhaseId); // Marquer comme généré si tous les scores sont là
            await saveAllData();
            showToast(`${scoresImportedCount} scores importés avec succès. ${errorsCount > 0 ? `(${errorsCount} erreurs)` : ''}`, "success");
            renderBrassagesPage(); // Re-render pour afficher les scores et le statut mis à jour
        } else {
            showToast(`Aucun score n'a pu être importé. ${errorsCount > 0 ? `(${errorsCount} erreurs)` : ''}`, "error");
        }
    }

    /**
     * Exporte les scores de la phase de brassage actuellement affichée vers un fichier Excel.
     */
    function exportScoresToExcel() {
        if (!currentDisplayedPhaseId) {
            showToast("Veuillez sélectionner une phase de brassage à exporter.", "error");
            return;
        }

        const currentPhase = allBrassagePhases.find(p => p.id === currentDisplayedPhaseId);
        if (!currentPhase || currentPhase.type === PHASE_TYPE_ELIMINATION_SEEDING || !currentPhase.pools) {
            showToast("La phase sélectionnée n'est pas une phase de brassage valide pour l'exportation de scores.", "error");
            return;
        }

        const exportData = [];
        exportData.push(['Team1', 'Team2', 'Score1', 'Score2']); // En-têtes

        currentPhase.pools.forEach(pool => {
            pool.matches.forEach(match => {
                const team1Name = allTeams.find(t => t.id === match.team1Id)?.name || 'Inconnu';
                const team2Name = allTeams.find(t => t.id === match.team2Id)?.name || 'Inconnu';
                exportData.push([
                    team1Name,
                    team2Name,
                    match.score1 !== undefined ? match.score1 : '',
                    match.score2 !== undefined ? match.score2 : ''
                ]);
            });
        });

        if (exportData.length <= 1) { // Seulement les en-têtes
            showToast("Aucun match avec des scores à exporter dans cette phase.", "info");
            return;
        }

        const ws = XLSX.utils.aoa_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Scores");

        const fileName = `Scores_Brassage_${currentPhase.name.replace(/\s/g, '_')}_${new Date().toISOString().slice(0, 10)}.xlsx`;
        XLSX.writeFile(wb, fileName);
        showToast("Scores exportés avec succès au format Excel !", "success");
    }
    // --- Fonctions de Rendu des Pages (Vues) ---

    /**
     * Rend la page d'accueil de l'application.
     */
    function renderHomePage() {
        if (!APP_CONTAINER) {
            console.error("APP_CONTAINER non trouvé.");
            return;
        }
        APP_CONTAINER.innerHTML = ''; // Vider le contenu précédent

        const contentDiv = document.createElement('div');
        contentDiv.className = "max-w-5xl mx-auto py-8 px-4 sm:px-6 lg:px-8";

        if (window.userId) { // Si l'utilisateur est connecté
            if (window.currentTournamentData && window.currentTournamentData.id !== 'simulation') { // Si un tournoi réel est sélectionné
                contentDiv.innerHTML = `
                    <h1 class="text-4xl font-extrabold text-center text-blue-700 mb-8 leading-tight">
                        Bienvenue sur EasyPlay !
                    </h1>
                    <p class="text-xl text-gray-700 text-center mb-6">
                        Vous gérez actuellement le tournoi : <span class="font-semibold text-blue-600">${escapeHtml(window.currentTournamentData.name)}</span>.
                        Utilisez les onglets à gauche pour naviguer et gérer votre tournoi.
                    </p>
                    <div class="text-center mt-8 space-x-4">
                        <button onclick="window.location.hash='#equipes'" class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded transition duration-150">
                            Gérer les équipes
                        </button>
                        <button onclick="window.location.hash='#brassages'" class="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded transition duration-150">
                            Gérer les brassages
                        </button>
                    </div>
                `;
            } else { // Si connecté mais aucun tournoi réel sélectionné (ou en mode simulation par défaut)
                contentDiv.innerHTML = `
                    <h1 class="text-4xl font-extrabold text-center text-blue-700 mb-8 leading-tight">
                        Bienvenue sur EasyPlay !
                    </h1>
                    <p class="text-xl text-gray-700 text-center mb-6">
                        Vous êtes actuellement en <span class="font-semibold text-purple-600">mode simulation</span> (max ${MAX_SIMULATION_TEAMS} équipes).
                        Pour gérer des tournois réels avec plus d'équipes, veuillez créer ou sélectionner un tournoi.
                    </p>
                    <div class="text-center mt-8 space-x-4">
                        <button onclick="window.location.hash='#tournaments'" class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded transition duration-150">
                            Gérer mes tournois
                        </button>
                        <button onclick="window.location.hash='#equipes'" class="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded transition duration-150">
                            Commencer la simulation
                        </button>
                    </div>
                `;
            }
        } else { // Si l'utilisateur n'est pas connecté
            contentDiv.innerHTML = `
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
                <div class="text-center mt-8">
                    <button onclick="window.location.hash='#auth'" class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded transition duration-150">
                        Se connecter / S'inscrire
                    </button>
                </div>
            `;
        }
        APP_CONTAINER.appendChild(contentDiv);
    }

    /**
     * Rend la page d'authentification (connexion/inscription).
     */
    function renderAuthPage() {
        if (!APP_CONTAINER) {
            console.error("APP_CONTAINER non trouvé dans renderAuthPage.");
            return;
        }
        APP_CONTAINER.innerHTML = `
            <div class="max-w-md w-full bg-white p-8 rounded-lg shadow-md mt-10 mx-auto">
                <h2 class="text-2xl font-bold text-center text-blue-600 mb-6" id="auth-header">Connexion</h2>
                <form id="auth-form">
                    <div class="mb-4">
                        <label for="email" class="block text-gray-700 text-sm font-bold mb-2">Email:</label>
                        <input type="email" id="email" class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline" required>
                    </div>
                    <div class="mb-6">
                        <label for="password" class="block text-gray-700 text-sm font-bold mb-2">Mot de passe:</label>
                        <input type="password" id="password" class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 mb-3 leading-aight focus:outline-none focus:shadow-outline" required>
                    </div>
                    <div class="flex items-center justify-between">
                        <button type="submit" id="auth-submit-btn" class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline transition duration-150">
                            Se connecter
                        </button>
                        <button type="button" id="toggle-auth-mode" class="inline-block align-baseline font-bold text-sm text-blue-500 hover:text-blue-800 transition duration-150">
                            Créer un compte
                        </button>
                    </div>
                </form>
            </div>
        `;
        setupAuthPageLogic(); // This must be called AFTER content is in DOM
    }

    /**
     * Rend le tableau de bord des tournois.
     */
    function renderTournamentDashboard() {
        if (!APP_CONTAINER) {
            console.error("APP_CONTAINER non trouvé.");
            return;
        }

        const noTournamentsMessage = `
            <div class="text-center py-8">
                <p class="text-lg text-gray-600 mb-4">Vous n'avez pas encore de tournoi.</p>
                <button id="show-create-tournament-form" class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded transition duration-150">
                    Créer un nouveau tournoi
                </button>
            </div>
        `;

        if (!window.allUserTournaments || window.allUserTournaments.length === 0) {
            APP_CONTAINER.innerHTML = noTournamentsMessage;
            document.getElementById('show-create-tournament-form')?.addEventListener('click', () => {
                const createFormDiv = document.createElement('div');
                createFormDiv.innerHTML = `
                    <div class="max-w-md w-full bg-white p-8 rounded-lg shadow-md mt-10 mx-auto">
                        <h3 class="text-xl font-bold text-blue-600 mb-4">Créer un nouveau tournoi</h3>
                        <form id="create-tournament-form">
                            <div class="mb-4">
                                <label for="new-tournament-name" class="block text-gray-700 text-sm font-bold mb-2">Nom du tournoi:</label>
                                <input type="text" id="new-tournament-name" class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline" required>
                            </div>
                            <div class="mb-4">
                                <label for="new-tournament-date" class="block text-gray-700 text-sm font-bold mb-2">Date (AAAA-MM-JJ):</label>
                                <input type="date" id="new-tournament-date" class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline" required>
                            </div>
                            <div class="mb-6">
                                <label for="new-tournament-num-teams" class="block text-gray-700 text-sm font-bold mb-2">Nombre d'équipes prévues:</label>
                                <input type="number" id="new-tournament-num-teams" class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline" min="2" required>
                            </div>
                            <div class="flex justify-end space-x-3">
                                <button type="button" id="cancel-create-tournament" class="bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-4 rounded transition duration-150">
                                    Annuler
                                </button>
                                <button type="submit" class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded transition duration-150">
                                    Créer
                                </button>
                            </div>
                        </form>
                    </div>
                `;
                APP_CONTAINER.innerHTML = ''; // Clear previous message before adding form
                APP_CONTAINER.appendChild(createFormDiv);
                setupTournamentDashboardLogic(); // Re-attach logic for new form
            });
            return;
        }

        let tournamentsListHtml = `
            <h2 class="text-2xl font-bold text-blue-600 mb-6 text-center">Vos Tournois</h2>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        `;

        window.allUserTournaments.sort((a, b) => {
            const dateA = a.createdAt ? (a.createdAt.toDate ? a.createdAt.toDate() : new Date(a.createdAt)) : new Date(0);
            const dateB = b.createdAt ? (b.createdAt.toDate ? b.createdAt.toDate() : new Date(b.createdAt)) : new Date(0);
            return dateB - dateA; // Tri par date de création décroissante
        });


        window.allUserTournaments.forEach(tournament => {
            const isActive = window.currentTournamentId === tournament.id;
            const createdDate = tournament.createdAt ? (tournament.createdAt.toDate ? tournament.createdAt.toDate().toLocaleDateString() : new Date(tournament.createdAt).toLocaleDateString()) : 'N/A';
            tournamentsListHtml += `
                <div class="bg-white p-6 rounded-lg shadow-md flex flex-col ${isActive ? 'border-4 border-blue-500' : ''}">
                    <h3 class="text-xl font-semibold mb-2">${escapeHtml(tournament.name)}</h3>
                    <p class="text-gray-600 mb-1">Date: ${escapeHtml(tournament.date)}</p>
                    <p class="text-gray-600 mb-4">Créé le: ${createdDate}</p>
                    <p class="text-gray-600 mb-4">Équipes prévues: ${escapeHtml(String(tournament.numTeamsAllowed))}</p>
                    <div class="flex flex-col mt-auto space-y-2">
                        <button data-tournament-id="${tournament.id}" class="select-tournament-btn bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded transition duration-150 ${isActive ? 'opacity-50 cursor-not-allowed' : ''}" ${isActive ? 'disabled' : ''}>
                            ${isActive ? 'Actif' : 'Sélectionner'}
                        </button>
                        <button data-tournament-id="${tournament.id}" class="delete-tournament-btn bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-4 rounded transition duration-150">
                            Supprimer
                        </button>
                    </div>
                </div>
            `;
        });
        tournamentsListHtml += `</div>
            <div class="text-center mt-6">
                <button id="show-create-tournament-form" class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded transition duration-150">
                    Créer un nouveau tournoi
                </button>
            </div>
        `;
        APP_CONTAINER.innerHTML = tournamentsListHtml;
        setupTournamentDashboardLogic(); // Pour attacher les écouteurs d'événements
    }

    function renderEquipesPage() {
        if (!APP_CONTAINER || !window.currentTournamentData) {
            console.error("APP_CONTAINER ou currentTournamentData non trouvé.");
            return;
        }

        const maxTeams = window.currentTournamentData.numTeamsAllowed;
        const currentTeamCount = window.allTeams.length;
        const canAddMoreTeams = currentTeamCount < maxTeams;

        // Calculate team count by level
        let levelCounts = {};
        window.allTeams.forEach(team => {
            levelCounts[team.level] = (levelCounts[team.level] || 0) + 1;
        });

        // Generate level distribution HTML
        let levelDistributionHtml = '';
        if (Object.keys(levelCounts).length > 0) {
            levelDistributionHtml = `
                <div class="bg-white p-4 rounded-lg shadow-md mb-6">
                    <h3 class="text-lg font-semibold text-gray-800 mb-3">Répartition des équipes par niveau:</h3>
                    <ul class="list-disc list-inside space-y-1">
                        ${Object.keys(levelCounts).sort((a, b) => a - b).map(level => `
                            <li>Niveau ${escapeHtml(level)}: <span class="font-bold">${levelCounts[level]}</span> équipe(s)</li>
                        `).join('')}
                    </ul>
                </div>
            `;
        }

        let teamsHtml = `
            <h2 class="text-2xl font-bold text-blue-600 mb-6 text-center">Gérer les Équipes</h2>
            <div class="mb-6 bg-white p-4 rounded-lg shadow-md">
                <p class="text-gray-700">Nombre d'équipes enregistrées : <span class="font-bold">${currentTeamCount}</span> / ${maxTeams}</p>
                ${!canAddMoreTeams ? `<p class="text-red-500 text-sm mt-2">Vous avez atteint le nombre maximum d'équipes pour ce tournoi (${maxTeams}).</p>` : ''}
            </div>
            ${levelDistributionHtml}
            <form id="add-team-form" class="mb-8 bg-white p-6 rounded-lg shadow-md ${!canAddMoreTeams ? 'opacity-50 pointer-events-none' : ''}">
                <h3 class="text-xl font-bold text-blue-600 mb-4">Ajouter une nouvelle équipe</h3>
                <div class="mb-4">
                    <label for="team-name" class="block text-gray-700 text-sm font-bold mb-2">Nom de l'équipe:</label>
                    <input type="text" id="team-name" class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline" required>
                </div>
                <div class="mb-6">
                    <label for="team-level" class="block text-gray-700 text-sm font-bold mb-2">Niveau (1-10, 1 étant le plus fort):</label>
                    <input type="number" id="team-level" class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline" min="1" max="10" value="5" required>
                </div>
                <div class="flex justify-end">
                    <button type="submit" class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline transition duration-150">
                        Ajouter l'équipe
                    </button>
                </div>
            </form>

            <div class="w-full">
                <h3 class="text-xl font-bold text-blue-600 mb-4">Liste des équipes</h3>
                ${window.allTeams.length === 0 ? `<p class="text-gray-600">Aucune équipe enregistrée pour l'instant.</p>` : `
                    <div class="bg-white rounded-lg shadow-md overflow-hidden">
                        <table class="min-w-full divide-y divide-gray-200">
                            <thead class="bg-gray-50">
                                <tr>
                                    <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nom de l'équipe</th>
                                    <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Niveau</th>
                                    <th scope="col" class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                                </tr>
                            </thead>
                            <tbody class="bg-white divide-y divide-gray-200">
                                ${window.allTeams.map(team => `
                                    <tr data-team-id="${escapeHtml(team.id || '')}">
                                        <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${escapeHtml(team.name)}</td>
                                        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${escapeHtml(String(team.level))}</td>
                                        <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                            <button data-team-id="${escapeHtml(team.id || '')}" class="edit-team-btn text-indigo-600 hover:text-indigo-900 mr-4">
                                                Modifier
                                            </button>
                                            <button data-team-id="${escapeHtml(team.id || '')}" class="delete-team-btn text-red-600 hover:text-red-900">
                                                Supprimer
                                            </button>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                `}
            </div>
        `;
        APP_CONTAINER.innerHTML = teamsHtml;
        setupEquipesPageLogic(); // Attacher les écouteurs d'événements
    }

    /**
     * Rend la page de gestion des brassages.
     */
    function renderBrassagesPage() {
        if (!APP_CONTAINER || !window.currentTournamentData) {
            console.error("APP_CONTAINER ou currentTournamentData non trouvé.");
            return;
        }

        const teamsCount = window.allTeams.length;
        const minimumTeamsForBrassage = 4; // Minimum 4 équipes pour commencer les brassages

        // Vérifiez s'il existe une phase "secondary_brassage" ou "elimination_seeding"
        const hasAdvancedPhases = window.allBrassagePhases.some(p =>
            p.type === window.PHASE_TYPE_SECONDARY_BRASSAGE ||
            p.type === window.PHASE_TYPE_ELIMINATION_SEEDING
        );
        const lastPhase = window.allBrassagePhases[window.allBrassagePhases.length - 1];
        const canClearPhases = window.allBrassagePhases.length > 0;
        const canGenerateInitialBrassage = teamsCount >= minimumTeamsForBrassage && !hasAdvancedPhases;
        const canGenerateSecondaryBrassage = teamsCount >= minimumTeamsForBrassage && lastPhase && lastPhase.generated && !hasAdvancedPhases;
        const canGenerateEliminationSeeding = teamsCount >= minimumTeamsForBrassage && lastPhase && lastPhase.generated && !hasAdvancedPhases;

        let brassageHtml = `
            <h2 class="text-2xl font-bold text-blue-600 mb-6 text-center">Gérer les Brassages</h2>
            <div class="bg-white p-6 rounded-lg shadow-md mb-6">
                <p class="text-gray-700 mb-4">
                    Nombre d'équipes enregistrées : <span class="font-bold">${teamsCount}</span>.
                    ${teamsCount < minimumTeamsForBrassage ? `<span class="text-red-500">Un minimum de ${minimumTeamsForBrassage} équipes est requis pour générer les brassages.</span>` : ''}
                </p>
                <div class="flex flex-wrap gap-4 justify-center">
                    <button id="generate-initial-brassage" class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded transition duration-150 ${!canGenerateInitialBrassage ? 'opacity-50 cursor-not-allowed' : ''}" ${!canGenerateInitialBrassage ? 'disabled' : ''}>
                        Générer Brassage Initial
                    </button>
                    <button id="generate-secondary-brassage" class="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded transition duration-150 ${!canGenerateSecondaryBrassage ? 'opacity-50 cursor-not-allowed' : ''}" ${!canGenerateSecondaryBrassage ? 'disabled' : ''}>
                        Générer Brassage Secondaire
                    </button>
                    <button id="generate-elimination-seeding" class="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded transition duration-150 ${!canGenerateEliminationSeeding ? 'opacity-50 cursor-not-allowed' : ''}" ${!canGenerateEliminationSeeding ? 'disabled' : ''}>
                        Générer Groupes Éliminatoires
                    </button>
                    <button id="clear-all-brassage-phases" class="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded transition duration-150 ${!canClearPhases ? 'opacity-50 cursor-not-allowed' : ''}" ${!canClearPhases ? 'disabled' : ''}>
                        Effacer toutes les phases
                    </button>
                </div>
            </div>

            <div class="w-full">
                <h3 class="text-xl font-bold text-blue-600 mb-4">Phases de Brassage</h3>
                ${window.allBrassagePhases.length === 0 ? `<p class="text-gray-600">Aucune phase de brassage générée pour l'instant.</p>` : `
                    <div class="space-y-4">
                        ${window.allBrassagePhases.map(phase => `
                            <div class="bg-white p-4 rounded-lg shadow-md">
                                <div class="flex justify-between items-center mb-2">
                                    <h4 class="text-lg font-semibold text-gray-800">${escapeHtml(phase.name)}</h4>
                                    <div class="flex items-center space-x-2">
                                        <span class="text-sm text-gray-600">Type: ${phase.type === window.PHASE_TYPE_INITIAL ? 'Initial' : phase.type === window.PHASE_TYPE_SECONDARY_BRASSAGE ? 'Secondaire' : 'Éliminatoires'}</span>
                                        <button data-phase-id="${escapeHtml(phase.id)}" class="view-phase-btn bg-gray-200 hover:bg-gray-300 text-gray-800 text-sm py-1 px-3 rounded transition duration-150">
                                            ${window.currentDisplayedPhaseId === phase.id ? 'Masquer' : 'Voir'}
                                        </button>
                                    </div>
                                </div>
                                ${phase.generated ? `
                                    <p class="text-sm text-green-600">Statut: Généré</p>
                                ` : `
                                    <p class="text-sm text-red-600">Statut: En attente</p>
                                `}
                            </div>
                        `).join('')}
                    </div>
                `}
            </div>

            <div id="brassage-details-container" class="w-full mt-8">
                ${window.currentDisplayedPhaseId ? `
                    <h3 class="text-xl font-bold text-blue-600 mb-4">Détails de la phase : ${escapeHtml(window.allBrassagePhases.find(p => p.id === window.currentDisplayedPhaseId)?.name || '')}
                        <span id="repeatedMatchesCount" class="text-sm text-gray-500 ml-2">(Chargement...)</span>
                        <label class="inline-flex items-center ml-4 text-sm text-gray-700">
                            <input type="checkbox" id="toggleRepeatedMatchesDisplay" class="form-checkbox h-4 w-4 text-blue-600">
                            <span class="ml-2">Afficher répétitions</span>
                        </label>
                    </h3>
                    <div id="current-phase-content"></div>
                    <div class="mt-4 flex flex-wrap gap-3">
                        <button id="save-matches-btn" class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded transition duration-150">
                            Enregistrer les matchs et scores
                        </button>
                        ${window.allBrassagePhases.find(p => p.id === window.currentDisplayedPhaseId)?.type === window.PHASE_TYPE_ELIMINATION_SEEDING ? `
                            <button id="validate-groups-btn" class="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded transition duration-150">
                                Valider les groupes pour Éliminatoires
                            </button>
                            <button id="reset-elimination-groups-btn" class="bg-orange-500 hover:bg-orange-600 text-white font-bold py-2 px-4 rounded transition duration-150">
                                Réinitialiser Groupes Éliminatoires
                            </button>
                        ` : ''}
                        ${window.allBrassagePhases.find(p => p.id === window.currentDisplayedPhaseId)?.type !== window.PHASE_TYPE_ELIMINATION_SEEDING && window.allBrassagePhases.find(p => p.id === window.currentDisplayedPhaseId)?.generated ? `
                            <button id="import-scores-btn" class="bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-2 px-4 rounded transition duration-150">
                                Importer Scores (.xlsx)
                            </button>
                            <input type="file" id="import-scores-file-input" class="hidden" accept=".xlsx,.xls">
                            <button id="export-scores-btn" class="bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-2 px-4 rounded transition duration-150">
                                Exporter Scores (.xlsx)
                            </button>
                        ` : ''}
                    </div>
                ` : ``}
            </div>
        `;
        APP_CONTAINER.innerHTML = brassageHtml;
        setupBrassagesPageLogic(); // Attacher les écouteurs d'événements
        // Rendre les détails de la phase si currentDisplayedPhaseId est défini
        if (window.currentDisplayedPhaseId) {
            window.renderCurrentBrassagePhaseDetails();
        }
    }

    /**
     * Rend les détails de la phase de brassage actuellement sélectionnée.
     * Cette fonction est appelée par `renderBrassagesPage` et par les gestionnaires d'événements.
     */
    function renderCurrentBrassagePhaseDetails() {
        const detailsContainer = document.getElementById('current-phase-content');
        if (!detailsContainer || !window.currentDisplayedPhaseId) {
            if (detailsContainer) detailsContainer.innerHTML = ''; // Clear if no phase selected
            return;
        }

        const currentPhase = window.allBrassagePhases.find(p => p.id === window.currentDisplayedPhaseId);
        if (!currentPhase) {
            detailsContainer.innerHTML = `<p class="text-red-500">Phase introuvable.</p>`;
            return;
        }

        if (currentPhase.type === window.PHASE_TYPE_ELIMINATION_SEEDING) {
            window.renderSecondaryGroupsPreview(); // Utilise la fonction de rendu spécifique
            window.updateRepeatedMatchesCountDisplay(); // S'assure que le compteur est mis à jour (même si moins pertinent ici)
            return;
        }

        if (!currentPhase.generated || !currentPhase.pools || currentPhase.pools.length === 0) {
            detailsContainer.innerHTML = `<p class="text-gray-600">La phase "${escapeHtml(currentPhase.name)}" n'a pas encore été générée ou ne contient pas de poules.</p>`;
            window.updateRepeatedMatchesCountDisplay();
            return;
        }

        let poolsHtml = '';
        currentPhase.pools.forEach((pool, poolIndex) => {
            poolsHtml += `
                <div class="bg-white p-6 rounded-lg shadow-md mb-6">
                    <h4 class="text-lg font-bold text-gray-800 mb-4">Poule ${String.fromCharCode(65 + poolIndex)}</h4>
                    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
                        ${pool.teams.map(teamId => {
                            const team = window.allTeams.find(t => t.id === teamId);
                            return team ? `<span class="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium">${escapeHtml(team.name)}</span>` : '';
                        }).join('')}
                    </div>
                    ${pool.matches && pool.matches.length > 0 ? `
                        <div class="space-y-4">
                            ${pool.matches.map(match => {
                                const team1 = window.allTeams.find(t => t.id === match.team1Id);
                                const team2 = window.allTeams.find(t => t.id === match.team2Id);
                                const isRepeated = window.isMatchRepeated(match.team1Id, match.team2Id, window.currentDisplayedPhaseId);
                                const repeatedClass = isRepeated ? 'border-2 border-red-500' : '';
                                const repeatedWarning = isRepeated ? `<span class="text-red-500 text-xs ml-2 cursor-pointer" onclick="window.showRepeatedMatchDetailsModal('${escapeHtml(team1?.name || '')}', '${escapeHtml(team2?.name || '')}', '${escapeHtml(match.team1Id)}', '${escapeHtml(match.team2Id)}', '${escapeHtml(window.currentDisplayedPhaseId)}')">(Répété)</span>` : '';
                                const showRepeats = document.getElementById('toggleRepeatedMatchesDisplay')?.checked;

                                if (isRepeated && !showRepeats) return ''; // Hide repeated matches if toggle is off

                                return `
                                    <div class="flex items-center space-x-2 bg-gray-50 p-3 rounded-md ${repeatedClass}">
                                        <span class="font-medium flex-1 text-right">${escapeHtml(team1?.name || 'Inconnu')}</span>
                                        <input type="number" data-team-id="${escapeHtml(match.team1Id)}" data-match-id="${escapeHtml(match.id)}" class="match-score-input w-16 px-2 py-1 border rounded text-center" value="${match.score1 !== undefined ? match.score1 : ''}" min="0">
                                        <span class="font-bold">-</span>
                                        <input type="number" data-team-id="${escapeHtml(match.team2Id)}" data-match-id="${escapeHtml(match.id)}" class="match-score-input w-16 px-2 py-1 border rounded text-center" value="${match.score2 !== undefined ? match.score2 : ''}" min="0">
                                        <span class="font-medium flex-1 text-left">${escapeHtml(team2?.name || 'Inconnu')}</span>
                                        ${repeatedWarning}
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    ` : `<p class="text-gray-600">Aucun match généré pour cette poule.</p>`}
                </div>
            `;
        });
        detailsContainer.innerHTML = poolsHtml;
        window.updateRepeatedMatchesCountDisplay();
        setupBrassagePhaseDetailsLogic(); // Attacher les écouteurs d'événements
    }

    /**
     * Rend la prévisualisation des groupes secondaires pour les éliminatoires.
     */
    function renderSecondaryGroupsPreview() {
        const detailsContainer = document.getElementById('current-phase-content');
        if (!detailsContainer || !window.currentSecondaryGroupsPreview.groups) {
            if (detailsContainer) detailsContainer.innerHTML = `<p class="text-gray-600">Aucune prévisualisation de groupe éliminatoire disponible.</p>`;
            return;
        }

        let groupsHtml = `
            <div id="elimination-groups-container" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full">
                ${Object.values(window.currentSecondaryGroupsPreview.groups).map(group => `
                    <div class="bg-white p-6 rounded-lg shadow-md">
                        <h3 class="text-xl font-bold text-gray-800 mb-4">Groupe ${escapeHtml(group.name)}</h3>
                        <div class="space-y-2" data-group-id="${escapeHtml(group.id)}">
                            ${group.teams.map(team => `
                                <div class="flex items-center justify-between bg-gray-100 p-2 rounded-md team-item" data-team-id="${escapeHtml(team.id)}">
                                    <span>${escapeHtml(team.name)}</span>
                                    <button class="text-blue-500 hover:text-blue-700 move-team-btn" data-team-id="${escapeHtml(team.id)}" data-current-group-id="${escapeHtml(group.id)}">
                                        Déplacer
                                    </button>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
        detailsContainer.innerHTML = groupsHtml;

        // Attacher les écouteurs pour les boutons de déplacement
        document.querySelectorAll('.move-team-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                const teamId = e.target.dataset.teamId;
                const currentGroupId = e.target.dataset.currentGroupId;
                window.showMoveTeamModal(teamId, currentGroupId);
            });
        });
    }

    /**
     * Rend la page de sélection des groupes pour les éliminatoires.
     */
    function renderEliminationSelectionPage() {
        if (!APP_CONTAINER || !window.currentTournamentData) {
            console.error("APP_CONTAINER ou currentTournamentData non trouvé.");
            return;
        }

        if (window.allTeams.length === 0) {
            APP_CONTAINER.innerHTML = `<p class="text-red-500">Aucune équipe enregistrée. Veuillez d'abord ajouter des équipes.</p>`;
            return;
        }

        const lastBrassagePhase = window.allBrassagePhases.filter(p => p.type === window.PHASE_TYPE_INITIAL || p.type === window.PHASE_TYPE_SECONDARY_BRASSAGE).pop();
        if (!lastBrassagePhase || !lastBrassagePhase.generated || !lastBrassagePhase.rankings) {
            APP_CONTAINER.innerHTML = `<p class="text-red-500">Veuillez générer et compléter au moins une phase de brassage avant de préparer les éliminatoires.</p>`;
            return;
        }

        const teamsRanked = lastBrassagePhase.rankings.map(ranking => {
            return {
                id: ranking.teamId,
                name: ranking.teamName,
                score: ranking.points // Utiliser les points comme score de classement initial
            };
        });

        // Grouper les équipes par rang pour la sélection
        const groupedTeams = {};
        teamsRanked.forEach(team => {
            const rank = team.score; // Ou tout autre critère de regroupement initial
            if (!groupedTeams[rank]) {
                groupedTeams[rank] = [];
            }
            groupedTeams[rank].push(team);
        });

        // Trier les groupes par rang décroissant (meilleurs rangs en premier)
        const sortedRanks = Object.keys(groupedTeams).sort((a, b) => b - a);

        // Assurez-vous que currentSecondaryGroupsPreview est initialisé
        if (!window.currentSecondaryGroupsPreview.groups) {
            window.currentSecondaryGroupsPreview = {
                id: `elim_seeding_${Date.now()}`, // ID unique pour cette prévisualisation
                groups: {}, // { groupId: { name: 'A', teams: [{id, name}], seeding: 'top', originalRank: 1 } }
                generatedAt: new Date().toISOString()
            };
        }

        let eliminationSelectionHtml = `
            <h2 class="text-2xl font-bold text-blue-600 mb-6 text-center">Préparation des Groupes Éliminatoires</h2>
            <div class="bg-white p-6 rounded-lg shadow-md mb-6">
                <p class="text-gray-700 mb-4">
                    Classement de la dernière phase de brassage (points):
                </p>
                <div class="flex flex-wrap gap-2 mb-4">
                    ${sortedRanks.map(rank => `
                        <span class="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium">
                            ${escapeHtml(String(rank))} points: ${groupedTeams[rank].map(team => escapeHtml(team.name)).join(', ')}
                        </span>
                    `).join('')}
                </div>

                <div class="flex flex-col md:flex-row gap-4 mb-4">
                    <div class="flex-1">
                        <label for="num-groups-elimination" class="block text-gray-700 text-sm font-bold mb-2">Nombre de groupes d'élimination:</label>
                        <input type="number" id="num-groups-elimination" class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline" min="2" value="2">
                    </div>
                    <div class="flex-1">
                        <label for="teams-per-group-elimination" class="block text-gray-700 text-sm font-bold mb-2">Équipes par groupe:</label>
                        <input type="number" id="teams-per-group-elimination" class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline" min="2" value="2">
                    </div>
                </div>
                <div class="flex justify-center gap-4">
                    <button id="auto-distribute-teams" class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded transition duration-150">
                        Distribution automatique
                    </button>
                    <button id="clear-elimination-groups" class="bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-4 rounded transition duration-150">
                        Effacer les groupes
                    </button>
                </div>
            </div>

            <div id="elimination-groups-container" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full">
                ${Object.values(window.currentSecondaryGroupsPreview.groups).map(group => `
                    <div class="bg-white p-6 rounded-lg shadow-md">
                        <h3 class="text-xl font-bold text-gray-800 mb-4">Groupe ${escapeHtml(group.name)}</h3>
                        <div class="space-y-2" data-group-id="${escapeHtml(group.id)}">
                            ${group.teams.map(team => `
                                <div class="flex items-center justify-between bg-gray-100 p-2 rounded-md team-item" data-team-id="${escapeHtml(team.id)}">
                                    <span>${escapeHtml(team.name)}</span>
                                    <button class="text-blue-500 hover:text-blue-700 move-team-btn" data-team-id="${escapeHtml(team.id)}" data-current-group-id="${escapeHtml(group.id)}">
                                        Déplacer
                                    </button>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `).join('')}
            </div>

            <div class="mt-8 text-center">
                <button id="confirm-elimination-groups" class="bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-lg shadow-lg transition duration-150 text-lg">
                    Confirmer les Groupes pour Éliminatoires
                </button>
            </div>
        `;
        APP_CONTAINER.innerHTML = eliminationSelectionHtml;
        setupEliminationSelectionPageLogic();
    }

    /**
     * Rend la page de gestion des éliminatoires.
     */
    function renderEliminatoiresPage() {
        if (!APP_CONTAINER || !window.currentTournamentData) {
            console.error("APP_CONTAINER ou currentTournamentData non trouvé.");
            return;
        }

        const eliminationPhasesKeys = Object.keys(window.eliminationPhases).sort(); // Sort for consistent order
        if (eliminationPhasesKeys.length === 0) {
            APP_CONTAINER.innerHTML = `
                <h2 class="text-2xl font-bold text-blue-600 mb-6 text-center">Éliminatoires</h2>
                <p class="text-gray-600 text-center">Aucune phase d'élimination générée pour l'instant.</p>
                <div class="text-center mt-4">
                    <button onclick="window.location.hash='#brassages'" class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded transition duration-150">
                        Aller aux brassages pour générer les groupes éliminatoires
                    </button>
                </div>
            `;
            return;
        }

        let eliminationHtml = `
            <h2 class="text-2xl font-bold text-blue-600 mb-6 text-center">Gestion des Éliminatoires</h2>
            <div class="flex flex-col gap-8">
        `;

        eliminationPhasesKeys.forEach(roundKey => {
            const roundData = window.eliminationPhases[roundKey];
            const roundName = roundData.name;
            const matches = roundData.matches;
            const teamsInRound = [...new Set(matches.flatMap(m => [m.team1Id, m.team2Id]))];

            eliminationHtml += `
                <div class="bg-white p-6 rounded-lg shadow-md">
                    <h3 class="text-xl font-bold text-gray-800 mb-4">${escapeHtml(roundName)}</h3>
                    <p class="text-gray-700 mb-4">Équipes dans ce tour : ${teamsInRound.length}</p>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            `;

            if (matches.length === 0) {
                eliminationHtml += `<p class="text-gray-600 md:col-span-2">Aucun match dans ce tour pour l'instant.</p>`;
            } else {
                matches.forEach(match => {
                    const team1 = window.allTeams.find(t => t.id === match.team1Id);
                    const team2 = window.allTeams.find(t => t.id === match.team2Id);

                    const team1Name = team1 ? escapeHtml(team1.name) : 'Équipe Inconnue';
                    const team2Name = team2 ? escapeHtml(team2.name) : 'Équipe Inconnue';

                    const isTeam1Eliminated = window.eliminatedTeams.has(match.team1Id);
                    const isTeam2Eliminated = window.eliminatedTeams.has(match.team2Id);

                    let team1Class = '';
                    let team2Class = '';

                    // Appliquer les classes winner-team ou loser-team en fonction des scores
                    if (match.score1 !== undefined && match.score2 !== undefined) {
                        if (match.score1 > match.score2) {
                            team1Class = 'winner-team';
                            team2Class = 'loser-team';
                        } else if (match.score2 > match.score1) {
                            team1Class = 'loser-team';
                            team2Class = 'winner-team';
                        }
                    }

                    // Si l'équipe est marquée comme éliminée, appliquer la classe loser-team
                    if (isTeam1Eliminated && team1Class !== 'winner-team') { // N'écrase pas si déjà gagnant du match actuel
                        team1Class = 'loser-team';
                    }
                    if (isTeam2Eliminated && team2Class !== 'winner-team') { // N'écrase pas si déjà gagnant du match actuel
                        team2Class = 'loser-team';
                    }

                    eliminationHtml += `
                        <div class="bg-gray-50 p-4 rounded-md shadow-sm">
                            <h4 class="text-md font-semibold mb-2">Match ${escapeHtml(match.id)}</h4>
                            <div class="flex items-center space-x-2 mb-2">
                                <span class="flex-1 text-right font-medium ${team1Class}">${team1Name}</span>
                                <input type="number" data-round-id="${escapeHtml(roundKey)}" data-match-id="${escapeHtml(match.id)}" data-team-id="${escapeHtml(match.team1Id)}"
                                    class="elim-score-input w-16 px-2 py-1 border rounded text-center" value="${match.score1 !== undefined ? match.score1 : ''}" min="0">
                                <span class="font-bold">-</span>
                                <input type="number" data-round-id="${escapeHtml(roundKey)}" data-match-id="${escapeHtml(match.id)}" data-team-id="${escapeHtml(match.team2Id)}"
                                    class="elim-score-input w-16 px-2 py-1 border rounded text-center" value="${match.score2 !== undefined ? match.score2 : ''}" min="0">
                                <span class="flex-1 text-left font-medium ${team2Class}">${team2Name}</span>
                            </div>
                            ${match.winnerId ? `<p class="text-sm text-green-700 text-center">Gagnant: ${escapeHtml(window.allTeams.find(t => t.id === match.winnerId)?.name || 'Inconnu')}</p>` : ''}
                        </div>
                    `;
                });
            }

            eliminationHtml += `
                    </div>
                    <div class="flex justify-end mt-4">
                        <button data-round-id="${escapeHtml(roundKey)}" class="save-elim-scores-btn bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded transition duration-150">
                            Enregistrer Scores
                        </button>
                    </div>
                </div>
            `;
        });

        eliminationHtml += `</div>`;
        APP_CONTAINER.innerHTML = eliminationHtml;
        setupEliminatoiresPageLogic(); // Attacher les écouteurs d'événements
    }

    /**
     * Rend la page des classements.
     */
    function renderClassementsPage() {
        if (!APP_CONTAINER || !window.currentTournamentData) {
            console.error("APP_CONTAINER ou currentTournamentData non trouvé.");
            return;
        }

        // 1. Classement général final (basé sur la dernière phase de brassage ou élimination)
        let finalRankings = [];
        const lastBrassagePhase = window.allBrassagePhases.filter(p => p.type === window.PHASE_TYPE_INITIAL || p.type === window.PHASE_TYPE_SECONDARY_BRASSAGE).pop();

        // Collecter les équipes qui ont été éliminées pour les inclure dans le classement final
        const eliminatedTeamDetails = Array.from(window.eliminatedTeams).map(teamId => {
            const team = window.allTeams.find(t => t.id === teamId);
            return {
                teamId: teamId,
                teamName: team ? team.name : 'Inconnu',
                isEliminated: true,
                points: -1, // Un score très bas pour les éliminés
                matchesWon: 0,
                setRatio: 0
            };
        });

        if (lastBrassagePhase && lastBrassagePhase.rankings && lastBrassagePhase.rankings.length > 0) {
            // Commencer avec le classement de la dernière phase de brassage
            // Filtrer les équipes qui sont déjà éliminées (elles seront ajoutées séparément plus tard avec leur statut éliminé)
            finalRankings = lastBrassagePhase.rankings.filter(r => !window.eliminatedTeams.has(r.teamId));

            // Ajuster les points pour les équipes qui ont progressé dans les éliminatoires (complexité à ajouter si besoin)
            // Pour l'instant, le classement final est basé sur le brassage + les éliminés en bas

            // Si des phases éliminatoires ont été jouées, les équipes non-éliminées sont les finalistes.
            const allEliminatedThisRound = new Set();
            let winnersFromLastElimRound = new Set();
            let currentRoundTeams = new Set();

            const eliminationRoundKeys = Object.keys(window.eliminationPhases).sort();
            if (eliminationRoundKeys.length > 0) {
                const lastEliminationRoundKey = eliminationRoundKeys[eliminationRoundKeys.length - 1];
                const lastEliminationRound = window.eliminationPhases[lastEliminationRoundKey];

                lastEliminationRound.matches.forEach(match => {
                    if (match.winnerId) {
                        winnersFromLastElimRound.add(match.winnerId);
                    }
                    if (match.loserId) {
                        allEliminatedThisRound.add(match.loserId);
                    }
                    currentRoundTeams.add(match.team1Id);
                    currentRoundTeams.add(match.team2Id);
                });

                // Les équipes restantes dans `finalRankings` sont celles qui n'ont pas été éliminées
                // et ne sont pas gagnantes de la dernière ronde (car elles n'étaient pas dans cette ronde ou ont perdu plus tôt)
                const qualifiedTeamsNotEliminatedYet = window.allTeams.filter(team => !window.eliminatedTeams.has(team.id));

                // Reconstruire le classement final avec les gagnants de la dernière ronde en tête
                // Puis les autres qualifiés non éliminés, puis les éliminés
                let topRankedTeams = [];
                let midRankedTeams = []; // Équipes qui n'ont pas atteint la dernière ronde ou n'ont pas gagné la dernière ronde mais ne sont pas éliminées.

                qualifiedTeamsNotEliminatedYet.forEach(team => {
                    const teamRankingInfo = lastBrassagePhase.rankings.find(r => r.teamId === team.id) || {
                        teamId: team.id,
                        teamName: team.name,
                        points: 0,
                        matchesWon: 0,
                        setRatio: 0
                    }; // Fallback info

                    if (winnersFromLastElimRound.has(team.id)) {
                        // Ces équipes sont les meilleures si elles ont gagné la dernière ronde
                        topRankedTeams.push({ ...teamRankingInfo, isWinner: true, finalRankTier: 1 });
                    } else if (currentRoundTeams.has(team.id) && !allEliminatedThisRound.has(team.id)) {
                         // Équipes du dernier tour mais n'étant pas le gagnant, et non éliminées encore
                         // Cela peut arriver s'il y a un match nul ou un bye par ex.
                        midRankedTeams.push({ ...teamRankingInfo, finalRankTier: 2 });
                    } else if (!window.eliminatedTeams.has(team.id)) {
                        // Équipes qui ne sont pas éliminées mais n'ont pas participé aux dernières rondes
                        midRankedTeams.push({ ...teamRankingInfo, finalRankTier: 3 });
                    }
                });

                // Trier les différentes couches
                topRankedTeams.sort((a, b) => b.points - a.points || b.matchesWon - a.matchesWon || b.setRatio - a.setRatio);
                midRankedTeams.sort((a, b) => b.points - a.points || b.matchesWon - a.matchesWon || b.setRatio - a.setRatio);
                eliminatedTeamDetails.sort((a, b) => b.points - a.points || b.matchesWon - a.matchesWon || b.setRatio - a.setRatio); // Tri sur -1, donc alphabétique pour les noms

                finalRankings = [...topRankedTeams, ...midRankedTeams, ...eliminatedTeamDetails];

            } else {
                 // S'il n'y a pas de phases éliminatoires, le classement est juste celui du brassage + les éliminés (si applicable)
                 finalRankings = [...lastBrassagePhase.rankings, ...eliminatedTeamDetails];
                 finalRankings.sort((a, b) => {
                     if (b.points !== a.points) return b.points - a.points;
                     if (b.matchesWon !== a.matchesWon) return b.matchesWon - a.matchesWon;
                     return b.setRatio - a.setRatio;
                 });
            }

        } else if (window.allTeams.length > 0) {
             // Si aucune phase de brassage n'a été générée, liste juste les équipes et les éliminées
            finalRankings = window.allTeams.map(team => ({
                teamId: team.id,
                teamName: team.name,
                isEliminated: window.eliminatedTeams.has(team.id),
                points: window.eliminatedTeams.has(team.id) ? -1 : 0,
                matchesWon: 0,
                setRatio: 0
            }));
            finalRankings.sort((a, b) => {
                 if (a.isEliminated === b.isEliminated) {
                     return a.teamName.localeCompare(b.teamName); // Alphabétique si même statut
                 }
                 return a.isEliminated ? 1 : -1; // Éliminés en bas
             });
        }


        let classementHtml = `
            <h2 class="text-2xl font-bold text-blue-600 mb-6 text-center">Classements</h2>
            ${finalRankings.length === 0 ? `<p class="text-gray-600">Aucun classement disponible pour l'instant. Ajoutez des équipes et générez des brassages.</p>` : `
                <div class="bg-white rounded-lg shadow-md overflow-hidden mb-8">
                    <h3 class="text-xl font-bold text-gray-800 p-4 border-b">Classement Général Final</h3>
                    <table class="min-w-full divide-y divide-gray-200">
                        <thead class="bg-gray-50">
                            <tr>
                                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rang</th>
                                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Équipe</th>
                                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Points</th>
                                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Matchs Joués</th>
                                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Matchs Gagnés</th>
                                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Sets Gagnés</th>
                                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Sets Perdus</th>
                                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ratio Sets</th>
                                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Statut</th>
                            </tr>
                        </thead>
                        <tbody class="bg-white divide-y divide-gray-200">
                            ${finalRankings.map((ranking, index) => {
                                const team = window.allTeams.find(t => t.id === ranking.teamId);
                                const isEliminated = window.eliminatedTeams.has(ranking.teamId);
                                const rowClass = isEliminated ? 'text-red-500 line-through opacity-75' : '';
                                return `
                                    <tr class="${rowClass}">
                                        <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${index + 1}</td>
                                        <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${escapeHtml(ranking.teamName)}</td>
                                        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${ranking.points !== -1 ? ranking.points : 'N/A'}</td>
                                        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${ranking.matchesPlayed !== undefined ? ranking.matchesPlayed : 'N/A'}</td>
                                        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${ranking.matchesWon !== undefined ? ranking.matchesWon : 'N/A'}</td>
                                        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${ranking.setsWon !== undefined ? ranking.setsWon : 'N/A'}</td>
                                        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${ranking.setsLost !== undefined ? ranking.setsLost : 'N/A'}</td>
                                        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${ranking.setRatio !== undefined && !isNaN(ranking.setRatio) ? ranking.setRatio.toFixed(2) : 'N/A'}</td>
                                        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${isEliminated ? 'Éliminé' : 'En jeu'}</td>
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            `}

            ${window.allBrassagePhases.length > 0 ? `
                <div class="mb-8">
                    <h3 class="text-xl font-bold text-blue-600 mb-4">Classements par Phase de Brassage</h3>
                    ${window.allBrassagePhases.map(phase => `
                        <div class="bg-white p-6 rounded-lg shadow-md mb-6">
                            <h4 class="text-lg font-bold text-gray-800 mb-4">${escapeHtml(phase.name)}</h4>
                            ${!phase.generated || !phase.pools || phase.pools.length === 0 ? `<p class="text-gray-600">Cette phase n'a pas encore été générée ou ne contient pas de poules.</p>` : `
                                ${phase.pools.map((pool, poolIndex) => `
                                    <div class="mb-4">
                                        <h5 class="text-md font-semibold text-gray-700 mb-2">Poule ${String.fromCharCode(65 + poolIndex)}</h5>
                                        ${pool.rankings && pool.rankings.length > 0 ? `
                                            <table class="min-w-full divide-y divide-gray-200">
                                                <thead class="bg-gray-50">
                                                    <tr>
                                                        <th scope="col" class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rang</th>
                                                        <th scope="col" class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Équipe</th>
                                                        <th scope="col" class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Points</th>
                                                        <th scope="col" class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Matchs G.</th>
                                                        <th scope="col" class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Sets G.</th>
                                                        <th scope="col" class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Sets P.</th>
                                                        <th scope="col" class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ratio Sets</th>
                                                    </tr>
                                                </thead>
                                                <tbody class="bg-white divide-y divide-gray-200">
                                                    ${pool.rankings.map((ranking, rankIndex) => `
                                                        <tr>
                                                            <td class="px-4 py-2 whitespace-nowrap text-sm font-medium text-gray-900">${rankIndex + 1}</td>
                                                            <td class="px-4 py-2 whitespace-nowrap text-sm text-gray-900">${escapeHtml(ranking.teamName)}</td>
                                                            <td class="px-4 py-2 whitespace-nowrap text-sm text-gray-500">${ranking.points}</td>
                                                            <td class="px-4 py-2 whitespace-nowrap text-sm text-gray-500">${ranking.matchesWon}</td>
                                                            <td class="px-4 py-2 whitespace-nowrap text-sm text-gray-500">${ranking.setsWon}</td>
                                                            <td class="px-4 py-2 whitespace-nowrap text-sm text-gray-500">${ranking.setsLost}</td>
                                                            <td class="px-4 py-2 whitespace-nowrap text-sm text-gray-500">${ranking.setRatio.toFixed(2)}</td>
                                                        </tr>
                                                    `).join('')}
                                                </tbody>
                                            </table>
                                        ` : `<p class="text-gray-600">Aucun classement disponible pour cette poule.</p>`}
                                    </div>
                                `).join('')}
                            `}
                        </div>
                    `).join('')}
                </div>
            ` : ''}
        `;
        APP_CONTAINER.innerHTML = classementHtml;
        setupClassementsPageLogic();
    }
    // --- Logique des Pages (Écouteurs d'Événements) ---

    /**
     * Attache les écouteurs d'événements pour le formulaire d'authentification.
     * Cette fonction est appelée après que le HTML de la page d'authentification soit rendu.
     */
    function setupAuthPageLogic() {
        const authForm = document.getElementById('auth-form');
        const emailInput = document.getElementById('email');
        const passwordInput = document.getElementById('password');
        const authSubmitBtn = document.getElementById('auth-submit-btn');
        const toggleAuthModeBtn = document.getElementById('toggle-auth-mode');
        const authHeader = document.getElementById('auth-header');

        if (!authForm || !emailInput || !passwordInput || !authSubmitBtn || !toggleAuthModeBtn || !authHeader) {
            console.error("Éléments du formulaire d'authentification non trouvés après le rendu.");
            return;
        }

        let isLoginMode = true; // true pour connexion, false pour inscription

        const updateAuthModeUI = () => {
            if (isLoginMode) {
                authHeader.textContent = 'Connexion';
                authSubmitBtn.textContent = 'Se connecter';
                toggleAuthModeBtn.textContent = 'Créer un compte';
            } else {
                authHeader.textContent = 'Inscription';
                authSubmitBtn.textContent = 'S\'inscrire';
                toggleAuthModeBtn.textContent = 'Déjà un compte ? Connectez-vous';
            }
        };

        toggleAuthModeBtn.addEventListener('click', (e) => {
            e.preventDefault();
            isLoginMode = !isLoginMode;
            updateAuthModeUI();
        });

        authForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = emailInput.value;
            const password = passwordInput.value;

            if (!email || !password) {
                showToast("Veuillez entrer votre email et votre mot de passe.", "error");
                return;
            }

            try {
                if (isLoginMode) {
                    await window.signInWithEmailAndPassword(window.auth, email, password);
                    showToast("Connexion réussie !", "success");
                } else {
                    await window.createUserWithEmailAndPassword(window.auth, email, password);
                    showToast("Compte créé avec succès ! Vous êtes maintenant connecté.", "success");
                }
                // Redirection gérée par onAuthStateChanged qui appelle handleLocationHash
            } catch (error) {
                console.error("Erreur d'authentification:", error);
                let errorMessage = "Une erreur est survenue lors de l'authentification.";
                switch (error.code) {
                    case 'auth/email-already-in-use':
                        errorMessage = "Cet email est déjà utilisé par un autre compte.";
                        break;
                    case 'auth/invalid-email':
                        errorMessage = "L'adresse email est invalide.";
                        break;
                    case 'auth/operation-not-allowed':
                        errorMessage = "L'authentification par email/mot de passe n'est pas activée.";
                        break;
                    case 'auth/weak-password':
                        errorMessage = "Le mot de passe est trop faible.";
                        break;
                    case 'auth/user-disabled':
                        errorMessage = "Votre compte a été désactivé.";
                        break;
                    case 'auth/user-not-found':
                    case 'auth/wrong-password':
                        errorMessage = "Email ou mot de passe incorrect.";
                        break;
                    case 'auth/missing-password':
                        errorMessage = "Veuillez entrer un mot de passe.";
                        break;
                    case 'auth/too-many-requests':
                        errorMessage = "Trop de tentatives de connexion échouées. Veuillez réessayer plus tard.";
                        break;
                }
                showToast(errorMessage, "error");
            }
        });

        updateAuthModeUI(); // Initialise l'UI au chargement
    }

    /**
     * Attache les écouteurs d'événements pour le tableau de bord des tournois.
     */
    function setupTournamentDashboardLogic() {
        document.querySelectorAll('.select-tournament-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                const tournamentId = e.target.dataset.tournamentId;
                if (tournamentId && window.currentTournamentId !== tournamentId) {
                    window.selectTournament(tournamentId);
                }
            });
        });

        document.querySelectorAll('.delete-tournament-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                const tournamentId = e.target.dataset.tournamentId;
                if (tournamentId) {
                    window.deleteTournament(tournamentId);
                }
            });
        });

        const showCreateFormBtn = document.getElementById('show-create-tournament-form');
        if (showCreateFormBtn) {
            showCreateFormBtn.addEventListener('click', () => {
                const existingForm = document.getElementById('create-tournament-form');
                if (existingForm) return; // Prevent multiple forms

                const createFormContainer = document.createElement('div');
                createFormContainer.innerHTML = `
                    <div class="max-w-md w-full bg-white p-8 rounded-lg shadow-md mt-10 mx-auto">
                        <h3 class="text-xl font-bold text-blue-600 mb-4">Créer un nouveau tournoi</h3>
                        <form id="create-tournament-form">
                            <div class="mb-4">
                                <label for="new-tournament-name" class="block text-gray-700 text-sm font-bold mb-2">Nom du tournoi:</label>
                                <input type="text" id="new-tournament-name" class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline" required>
                            </div>
                            <div class="mb-4">
                                <label for="new-tournament-date" class="block text-gray-700 text-sm font-bold mb-2">Date (AAAA-MM-JJ):</label>
                                <input type="date" id="new-tournament-date" class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline" required>
                            </div>
                            <div class="mb-6">
                                <label for="new-tournament-num-teams" class="block text-gray-700 text-sm font-bold mb-2">Nombre d'équipes prévues:</label>
                                <input type="number" id="new-tournament-num-teams" class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline" min="2" required>
                            </div>
                            <div class="flex justify-end space-x-3">
                                <button type="button" id="cancel-create-tournament" class="bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-4 rounded transition duration-150">
                                    Annuler
                                </button>
                                <button type="submit" class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded transition duration-150">
                                    Créer
                                </button>
                            </div>
                        </form>
                    </div>
                `;
                // Add the new form to APP_CONTAINER
                APP_CONTAINER.innerHTML = ''; // Clear existing list/message before adding form
                APP_CONTAINER.appendChild(createFormContainer);
                // Re-attach logic for the new form
                const newTournamentForm = document.getElementById('create-tournament-form');
                const cancelCreateBtn = document.getElementById('cancel-create-tournament');
                if (newTournamentForm && cancelCreateBtn) {
                    newTournamentForm.addEventListener('submit', async (e) => {
                        e.preventDefault();
                        const name = document.getElementById('new-tournament-name').value;
                        const date = document.getElementById('new-tournament-date').value;
                        const numTeams = parseInt(document.getElementById('new-tournament-num-teams').value, 10);
                        await window.createNewTournament(name, date, numTeams);
                        // After creation, the dashboard will re-render via the Firestore snapshot listener
                    });
                    cancelCreateBtn.addEventListener('click', () => {
                        renderTournamentDashboard(); // Go back to the list/empty message
                    });
                }
            });
        }
    }


    /**
     * Attache les écouteurs d'événements pour la page des équipes.
     */
    function setupEquipesPageLogic() {
        const addTeamForm = document.getElementById('add-team-form');
        if (addTeamForm) {
            addTeamForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const teamNameInput = document.getElementById('team-name');
                const teamLevelInput = document.getElementById('team-level');
                const teamName = teamNameInput.value.trim();
                const teamLevel = parseInt(teamLevelInput.value, 10);

                if (teamName && !isNaN(teamLevel) && teamLevel >= 1 && teamLevel <= 10) {
                    await window.addTeam(teamName, teamLevel);
                    teamNameInput.value = ''; // Réinitialiser le champ
                    teamLevelInput.value = '5'; // Réinitialiser le niveau par défaut
                } else {
                    window.showToast("Veuillez entrer un nom d'équipe valide et un niveau entre 1 et 10.", "error");
                }
            });
        }

        document.querySelectorAll('.edit-team-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                const teamId = e.target.dataset.teamId;
                const team = window.allTeams.find(t => t.id === teamId);
                if (team) {
                    const content = document.createElement('div');
                    content.innerHTML = `
                        <div class="mb-4">
                            <label for="edit-team-name" class="block text-gray-700 text-sm font-bold mb-2">Nom de l'équipe:</label>
                            <input type="text" id="edit-team-name" class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline" value="${escapeHtml(team.name)}" required>
                        </div>
                        <div class="mb-4">
                            <label for="edit-team-level" class="block text-gray-700 text-sm font-bold mb-2">Niveau (1-10, 1 étant le plus fort):</label>
                            <input type="number" id="edit-team-level" class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline" min="1" max="10" value="${escapeHtml(String(team.level))}" required>
                        </div>
                    `;
                    window.showModal('Modifier l\'équipe', content, async () => {
                        const newName = document.getElementById('edit-team-name').value.trim();
                        const newLevel = parseInt(document.getElementById('edit-team-level').value, 10);

                        if (newName && !isNaN(newLevel) && newLevel >= 1 && newLevel <= 10) {
                            if (newName !== team.name || newLevel !== team.level) {
                                await window.updateTeam(teamId, newName, newLevel);
                            } else {
                                window.showToast("Aucune modification détectée.", "info");
                            }
                        } else {
                            window.showToast("Veuillez entrer un nom d'équipe valide et un niveau entre 1 et 10.", "error");
                        }
                    });
                }
            });
        });

        document.querySelectorAll('.delete-team-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                const teamId = e.target.dataset.teamId;
                const team = window.allTeams.find(t => t.id === teamId);
                if (team) {
                    const content = document.createElement('p');
                    content.textContent = `Êtes-vous sûr de vouloir supprimer l'équipe "${escapeHtml(team.name)}" ?`;
                    window.showModal('Confirmer la suppression', content, async () => {
                        await window.deleteTeam(teamId);
                    }, true);
                }
            });
        });
    }

    /**
     * Attache les écouteurs d'événements pour la page de gestion des brassages.
     */
    function setupBrassagesPageLogic() {
        document.getElementById('generate-initial-brassage')?.addEventListener('click', () => {
            window.showModal('Confirmer la génération', document.createTextNode('Ceci va générer la phase de brassage initiale. Continuer ?'), () => {
                window.generateAndEvaluatePools(window.PHASE_TYPE_INITIAL);
            });
        });

        document.getElementById('generate-secondary-brassage')?.addEventListener('click', () => {
            const lastPhase = window.allBrassagePhases[window.allBrassagePhases.length - 1];
            if (!lastPhase || !lastPhase.generated || !lastPhase.rankings) {
                window.showToast("Veuillez générer et compléter la phase précédente pour générer un brassage secondaire.", "error");
                return;
            }
            window.showModal('Confirmer la génération', document.createTextNode('Ceci va générer une nouvelle phase de brassage secondaire basée sur les résultats précédents. Continuer ?'), () => {
                window.generateSecondaryBrassagePhases();
            });
        });

        document.getElementById('generate-elimination-seeding')?.addEventListener('click', () => {
            const lastPhase = window.allBrassagePhases[window.allBrassagePhases.length - 1];
            if (!lastPhase || !lastPhase.generated || !lastPhase.rankings) {
                window.showToast("Veuillez générer et compléter une phase de brassage avant de préparer les groupes éliminatoires.", "error");
                return;
            }
            window.location.hash = '#elimination-selection'; // Rediriger vers la page de sélection des groupes
        });

        document.getElementById('clear-all-brassage-phases')?.addEventListener('click', () => {
            window.showModal('Confirmer l\'effacement', document.createTextNode('Êtes-vous sûr de vouloir effacer TOUTES les phases de brassage et d\'élimination ? Cette action est irréversible.'), () => {
                window.clearAllPhases();
            }, true);
        });

        document.querySelectorAll('.view-phase-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                const phaseId = e.target.dataset.phaseId;
                if (window.currentDisplayedPhaseId === phaseId) {
                    window.currentDisplayedPhaseId = null; // Masquer
                } else {
                    window.currentDisplayedPhaseId = phaseId; // Afficher
                }
                window.saveAllData(); // Sauvegarder l'ID de la phase affichée
                window.renderBrassagesPage(); // Re-render la page pour mettre à jour l'affichage
            });
        });
    }

    /**
     * Attache les écouteurs d'événements pour les détails de la phase de brassage.
     */
    function setupBrassagePhaseDetailsLogic() {
        // Sauvegarde des scores
        document.getElementById('save-matches-btn')?.addEventListener('click', async () => {
            const currentPhase = window.allBrassagePhases.find(p => p.id === window.currentDisplayedPhaseId);
            if (!currentPhase) {
                window.showToast("Aucune phase sélectionnée pour la sauvegarde.", "error");
                return;
            }

            let allScoresEntered = true;
            document.querySelectorAll('.match-score-input').forEach(input => {
                const matchId = input.dataset.matchId;
                const teamId = input.dataset.teamId;
                const score = parseInt(input.value, 10);

                if (isNaN(score)) {
                    allScoresEntered = false;
                    return;
                }

                currentPhase.pools.forEach(pool => {
                    pool.matches.forEach(match => {
                        if (match.id === matchId) {
                            if (match.team1Id === teamId) {
                                match.score1 = score;
                            } else if (match.team2Id === teamId) {
                                match.score2 = score;
                            }
                        }
                    });
                });
            });

            if (!allScoresEntered) {
                window.showToast("Veuillez entrer tous les scores avant de sauvegarder.", "error");
                return;
            }

            // Calculer les points et le classement après l'enregistrement des scores
            currentPhase.pools.forEach(pool => {
                const teamStats = {}; // { teamId: { points: 0, setsWon: 0, setsLost: 0, matchesPlayed: 0, matchesWon: 0 } }
                pool.teams.forEach(teamId => {
                    teamStats[teamId] = { points: 0, setsWon: 0, setsLost: 0, matchesPlayed: 0, matchesWon: 0 };
                });

                pool.matches.forEach(match => {
                    if (match.score1 !== undefined && match.score2 !== undefined) {
                        const team1Stats = teamStats[match.team1Id];
                        const team2Stats = teamStats[match.team2Id];

                        team1Stats.matchesPlayed++;
                        team2Stats.matchesPlayed++;

                        // Calcul des sets (chaque point est un set dans ce contexte simplifié)
                        team1Stats.setsWon += match.score1;
                        team1Stats.setsLost += match.score2;
                        team2Stats.setsWon += match.score2;
                        team2Stats.setsLost += match.score1;

                        if (match.score1 > match.score2) {
                            team1Stats.points += 8; // Victoire
                            team1Stats.matchesWon++;
                        } else if (match.score2 > match.score1) {
                            team2Stats.points += 8; // Victoire
                            team2Stats.matchesWon++;
                        } else {
                            // En cas de match nul, attribuer 4 points à chaque équipe
                            team1Stats.points += 4;
                            team2Stats.points += 4;
                        }
                    }
                });

                // Convertir en tableau pour le tri
                pool.rankings = Object.entries(teamStats).map(([teamId, stats]) => {
                    const team = window.allTeams.find(t => t.id === teamId);
                    return {
                        teamId: teamId,
                        teamName: team ? team.name : 'Inconnu',
                        ...stats,
                        setRatio: stats.setsLost > 0 ? stats.setsWon / stats.setsLost : stats.setsWon // ratio sets
                    };
                });

                // Trier le classement: points > matchs gagnés > ratio sets
                pool.rankings.sort((a, b) => {
                    if (b.points !== a.points) return b.points - a.points;
                    if (b.matchesWon !== a.matchesWon) return b.matchesWon - a.matchesWon;
                    return b.setRatio - a.setRatio;
                });
            });

            currentPhase.generated = isBrassagePhaseComplete(window.currentDisplayedPhaseId); // Marquer la phase comme complétée après sauvegarde des scores
            await window.saveAllData();
            window.showToast("Scores et classements sauvegardés !", "success");
            window.renderBrassagesPage(); // Re-render pour afficher le statut mis à jour
        });

        // Toggle repeated matches display
        document.getElementById('toggleRepeatedMatchesDisplay')?.addEventListener('change', () => {
            window.renderCurrentBrassagePhaseDetails(); // Re-render pour appliquer le filtre
        });

        // Import scores via Excel
        const importScoresBtn = document.getElementById('import-scores-btn');
        const importScoresFileInput = document.getElementById('import-scores-file-input');

        if (importScoresBtn && importScoresFileInput) {
            importScoresBtn.addEventListener('click', () => {
                importScoresFileInput.click();
            });

            importScoresFileInput.addEventListener('change', (event) => {
                const file = event.target.files[0];
                if (file) {
                    const reader = new FileReader();
                    reader.onload = async (e) => {
                        try {
                            const data = new Uint8Array(e.target.result);
                            const workbook = XLSX.read(data, { type: 'array' });
                            const firstSheetName = workbook.SheetNames[0];
                            const worksheet = workbook.Sheets[firstSheetName];
                            const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

                            await window.importScoresFromExcel(json);
                        } catch (error) {
                            console.error("Erreur lors de la lecture du fichier Excel:", error);
                            window.showToast("Erreur lors de l'importation du fichier Excel.", "error");
                        }
                    };
                    reader.readAsArrayBuffer(file);
                }
            });
        }

        // Export scores to Excel
        document.getElementById('export-scores-btn')?.addEventListener('click', () => {
            window.exportScoresToExcel();
        });

        // Validation des groupes pour les éliminatoires (si c'est une phase de type élimination_seeding)
        document.getElementById('validate-groups-btn')?.addEventListener('click', async () => {
            const currentPhase = window.allBrassagePhases.find(p => p.id === window.currentDisplayedPhaseId);
            if (!currentPhase || currentPhase.type !== window.PHASE_TYPE_ELIMINATION_SEEDING) {
                window.showToast("Cette fonction n'est disponible que pour les phases de groupes éliminatoires.", "error");
                return;
            }

            const content = document.createElement('div');
            content.innerHTML = `
                <p class="mb-4">Souhaitez-vous valider ces groupes pour générer les éliminatoires ?</p>
                <div class="mb-4">
                    <label for="elimination-type" class="block text-gray-700 text-sm font-bold mb-2">Type d'élimination:</label>
                    <select id="elimination-type" class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline">
                        <option value="direct">Élimination directe</option>
                        <option value="consolation">Élimination avec consolante (pour les 1er tours)</option>
                    </select>
                </div>
                <div class="mb-4">
                    <label for="number-of-rounds" class="block text-gray-700 text-sm font-bold mb-2">Nombre de tours:</label>
                    <input type="number" id="number-of-rounds" class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline" min="1" value="1">
                </div>
            `;
            window.showModal('Valider les groupes éliminatoires', content, async () => {
                const eliminationType = document.getElementById('elimination-type').value;
                const numberOfRounds = parseInt(document.getElementById('number-of-rounds').value, 10);
                if (eliminationType === 'direct') {
                    await window.validateForDirectElimination(currentPhase.id, numberOfRounds);
                } else {
                    // Logique pour l'élimination avec consolante
                    window.showToast("L'élimination avec consolante n'est pas encore implémentée.", "info");
                    // await window.validateForConsolationElimination(currentPhase.id);
                }
            });
        });

        document.getElementById('reset-elimination-groups-btn')?.addEventListener('click', async () => {
            const currentPhase = window.allBrassagePhases.find(p => p.id === window.currentDisplayedPhaseId);
            if (!currentPhase || currentPhase.type !== window.PHASE_TYPE_ELIMINATION_SEEDING) {
                window.showToast("Cette fonction n'est disponible que pour les phases de groupes éliminatoires.", "error");
                return;
            }
            window.showModal('Confirmer la réinitialisation', document.createTextNode('Êtes-vous sûr de vouloir réinitialiser les groupes éliminatoires ? Cela effacera la sélection actuelle.'), async () => {
                window.currentSecondaryGroupsPreview.groups = {}; // Vider la prévisualisation
                currentPhase.pools = []; // Vider les poules de la phase de seeding
                currentPhase.generated = false; // Marquer comme non généré
                window.eliminationPhases = {}; // Vider les phases d'élimination générées
                window.eliminatedTeams.clear(); // Vider les équipes éliminées
                await window.saveAllData();
                window.showToast("Groupes éliminatoires réinitialisés.", "info");
                window.renderBrassagesPage(); // Re-render la page
            }, true);
        });
    }

    /**
     * Attache les écouteurs d'événements pour la page de sélection des groupes d'élimination.
     */
    function setupEliminationSelectionPageLogic() {
        // Fonctions pour gérer les entrées du nombre de groupes et d'équipes par groupe
        const numGroupsInput = document.getElementById('num-groups-elimination');
        const teamsPerGroupInput = document.getElementById('teams-per-group-elimination');

        // Récupérer les données de la dernière phase de brassage pour les équipes classées
        const lastBrassagePhase = window.allBrassagePhases.filter(p => p.type === window.PHASE_TYPE_INITIAL || p.type === window.PHASE_TYPE_SECONDARY_BRASSAGE).pop();
        const teamsRanked = lastBrassagePhase.rankings.map(ranking => {
            return {
                id: ranking.teamId,
                name: ranking.teamName,
                score: ranking.points // Utiliser les points comme score de classement initial
            };
        });

        document.getElementById('auto-distribute-teams')?.addEventListener('click', () => {
            const numGroups = parseInt(numGroupsInput.value, 10);
            const teamsPerGroup = parseInt(teamsPerGroupInput.value, 10);

            if (isNaN(numGroups) || numGroups < 2 || isNaN(teamsPerGroup) || teamsPerGroup < 2) {
                window.showToast("Veuillez spécifier un nombre valide de groupes (>=2) et d'équipes par groupe (>=2).", "error");
                return;
            }
            if (numGroups * teamsPerGroup > teamsRanked.length) {
                window.showToast(`Vous ne pouvez pas créer ${numGroups} groupes de ${teamsPerGroup} équipes, car vous n'avez que ${teamsRanked.length} équipes qualifiées.`, "error");
                return;
            }

            window._performSecondaryGroupsPreview(teamsRanked, numGroups, teamsPerGroup);
            window.renderEliminationSelectionPage(); // Re-render pour afficher les groupes
            window.showToast("Distribution automatique des équipes effectuée.", "info");
        });

        document.getElementById('clear-elimination-groups')?.addEventListener('click', () => {
            window.showModal('Confirmer l\'effacement', document.createTextNode('Êtes-vous sûr de vouloir effacer tous les groupes d\'élimination prévisualisés ?'), () => {
                window.currentSecondaryGroupsPreview.groups = {};
                window.saveAllData();
                window.renderEliminationSelectionPage();
                window.showToast("Groupes éliminatoires effacés.", "info");
            }, true);
        });

        // Gérer le déplacement manuel des équipes entre groupes
        document.querySelectorAll('.move-team-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                const teamId = e.target.dataset.teamId;
                const currentGroupId = e.target.dataset.currentGroupId;
                window.showMoveTeamModal(teamId, currentGroupId);
            });
        });

        document.getElementById('confirm-elimination-groups')?.addEventListener('click', async () => {
            // Valider que tous les groupes sont remplis et qu'il n'y a pas de doublons
            const groups = window.currentSecondaryGroupsPreview.groups;
            const numGroups = parseInt(numGroupsInput.value, 10);
            const teamsPerGroup = parseInt(teamsPerGroupInput.value, 10);

            if (Object.keys(groups).length === 0) {
                window.showToast("Veuillez générer ou ajouter des équipes aux groupes avant de confirmer.", "error");
                return;
            }

            // Vérifier que tous les groupes ont le nombre d'équipes requis
            let allGroupsValid = true;
            for (const groupId in groups) {
                const group = groups[groupId];
                if (group.teams.length !== teamsPerGroup) {
                    allGroupsValid = false;
                    window.showToast(`Le groupe ${group.name} doit contenir exactement ${teamsPerGroup} équipes.`, "error");
                    break;
                }
            }

            if (!allGroupsValid) return;

            // Vérifier que toutes les équipes dans les groupes sont uniques et proviennent bien de allTeams
            const allTeamsInGroups = [];
            for (const groupId in groups) {
                groups[groupId].teams.forEach(team => allTeamsInGroups.push(team.id));
            }
            if (new Set(allTeamsInGroups).size !== allTeamsInGroups.length) {
                window.showToast("Des équipes sont dupliquées dans les groupes d'élimination.", "error");
                return;
            }
            // Vérifier que toutes les équipes qualifiées ont été utilisées
            if (allTeamsInGroups.length !== teamsRanked.length) {
                window.showToast("Toutes les équipes qualifiées doivent être assignées à un groupe.", "error");
                return;
            }


            window.showModal('Confirmer la création des éliminatoires', document.createTextNode('Ceci va créer une nouvelle phase de brassage de type "élimination_seeding" avec ces groupes, et préparer les éliminatoires. Continuer ?'), async () => {
                await window.validateSecondaryGroupsForElimination();
            });
        });
    }

    /**
     * Attache les écouteurs d'événements pour la page des éliminatoires.
     */
    function setupEliminatoiresPageLogic() {
        document.querySelectorAll('.save-elim-scores-btn').forEach(button => {
            button.addEventListener('click', async (e) => {
                const roundId = e.target.dataset.roundId;
                if (!roundId) {
                    window.showToast("ID de tour non trouvé.", "error");
                    return;
                }

                const currentRound = window.eliminationPhases[roundId];
                if (!currentRound) {
                    window.showToast("Tour non trouvé pour la sauvegarde.", "error");
                    return;
                }

                let allScoresEntered = true;
                currentRound.matches.forEach(match => {
                    // Trouver les inputs pour ce match spécifique
                    const input1 = document.querySelector(`.elim-score-input[data-match-id="${match.id}"][data-team-id="${match.team1Id}"]`);
                    const input2 = document.querySelector(`.elim-score-input[data-match-id="${match.id}"][data-team-id="${match.team2Id}"]`);

                    const score1 = parseInt(input1?.value, 10);
                    const score2 = parseInt(input2?.value, 10);

                    if (isNaN(score1) || isNaN(score2)) {
                        allScoresEntered = false;
                        return;
                    }

                    match.score1 = score1;
                    match.score2 = score2;

                    if (score1 > score2) {
                        match.winnerId = match.team1Id;
                        match.loserId = match.team2Id;
                    } else if (score2 > score1) {
                        match.winnerId = match.team2Id;
                        match.loserId = match.team1Id;
                    } else {
                        match.winnerId = null; // Match nul ou à rejouer
                        match.loserId = null;
                    }
                });

                if (!allScoresEntered) {
                    window.showToast("Veuillez entrer tous les scores pour ce tour avant de sauvegarder.", "error");
                    return;
                }

                // Mettre à jour les équipes éliminées
                currentRound.matches.forEach(match => {
                    if (match.loserId) {
                        window.eliminatedTeams.add(match.loserId);
                    }
                    // Si un match est incomplet (winnerId null), l'équipe n'est pas éliminée pour l'instant
                    // Si un match est rejoué et qu'il y avait un loserId, on doit le retirer si le match change
                });

                await window.saveAllData();
                window.showToast("Scores des éliminatoires sauvegardés !", "success");
                window.renderEliminatoiresPage(); // Re-render pour refléter les gagnants/perdants
            });
        });
    }

    /**
     * Attache les écouteurs d'événements pour la page des classements.
     */
    function setupClassementsPageLogic() {
        // Pas d'écouteurs d'événements spécifiques nécessaires pour cette page simple d'affichage.
        // Si des fonctionnalités interactives sont ajoutées à l'avenir (ex: tri, filtres), les écouteurs iront ici.
    }
