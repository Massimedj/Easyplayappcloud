(function() {
    // --- Constantes et Variables Globales ---
    const APP_CONTAINER = document.getElementById('app-container');

    // Les clés localStorage sont supprimées car nous utilisons Firestore pour la persistance des données
    // const TEAM_DATA_KEY = 'volleyTeamsData';
    // const BRASSAGE_PHASES_KEY = 'volleyBrassagePhases';
    // const ELIMINATION_PHASES_KEY = 'volleyEliminationPhases';
    // const SECONDARY_GROUPS_SELECTION_KEY = 'volleySecondaryGroupsSelection';
    // const POOL_GENERATION_BASIS_KEY = 'volleyPoolGenerationBasis';
    // const SECONDARY_GROUPS_PREVIEW_KEY = 'volleySecondaryGroupsPreview';
    // const ELIMINATED_TEAMS_KEY = 'volleyEliminatedTeams';

    const PHASE_TYPE_INITIAL = 'initial_brassage';
    const PHASE_TYPE_SECONDARY_BRASSAGE = 'secondary_brassage';
    const PHASE_TYPE_ELIMINATION_SEEDING = 'elimination_seeding'; // Phase spéciale pour le regroupement éliminatoire

    let allTeams = [];
    let allBrassagePhases = [];
    let eliminationPhases = {};
    let currentSecondaryGroupsPreview = {}; // Pour la prévisualisation des groupes secondaires, maintenant persistant
    let eliminatedTeams = new Set(); // Set pour stocker les IDs des équipes éliminées

    let currentDisplayedPhaseId = null; // ID de la phase de brassage actuellement affichée

    // Map pour suivre les occurrences de matchs dans les différentes phases
    // Clé: chaîne canonique représentant la paire d'équipes (ex: "team1_id-team2_id" triée)
    // Valeur: Set d'IDs de phases où cette paire a joué
    let matchOccurrenceMap = new Map();

    // --- Cache des éléments DOM de la modale ---
    const actionModal = document.getElementById('actionModal');
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');
    const modalCancelBtn = document.getElementById('modalCancelBtn');
    let modalConfirmBtn = document.getElementById('modalConfirmBtn'); // CORRECTION: Utilisez 'let' ici

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
     * Affiche un message temporaire à l'utilisateur.
     * @param {HTMLElement} element L'élément DOM où afficher le message.
     * @param {string} message Le message à afficher.
     * @param {boolean} isError Indique si le message est une erreur (couleur rouge).
     */
    function showMessage(element, message, isError = false) {
        if (element) {
            element.textContent = message;
            element.className = `mt-3 text-sm text-center ${isError ? 'text-red-500' : 'text-green-500'}`;
            setTimeout(() => {
                if (element) {
                    element.textContent = '';
                    element.className = 'mt-3 text-sm text-center';
                }
            }, 5000);
        } else {
            console.error("ERREUR: Tentative d'affichage d'un message, mais l'élément cible est nul ou indéfini:", message);
        }
    }

    /**
     * Affiche une modale générique.
     * @param {string} title Le titre de la modale.
     * @param {HTMLElement} bodyContent Le contenu HTML à afficher dans le corps de la modale.
     * @param {Function} confirmCallback La fonction à appeler si l'utilisateur confirme.
     * @param {boolean} isDelete Indique si la modale est pour une suppression (bouton rouge).
     */
    function showModal(title, bodyContent, confirmCallback, isDelete = false) {
        modalTitle.textContent = title;
        modalBody.innerHTML = '';
        modalBody.appendChild(bodyContent);
        actionModal.classList.remove('hidden');

        if (isDelete) {
            modalConfirmBtn.classList.remove('bg-blue-600', 'hover:bg-blue-700', 'focus:ring-blue-500');
            modalConfirmBtn.classList.add('bg-red-600', 'hover:bg-red-700', 'focus:ring-red-500');
        } else {
            modalConfirmBtn.classList.remove('bg-red-600', 'hover:bg-red-700', 'focus:ring-red-500');
            modalConfirmBtn.classList.add('bg-blue-600', 'hover:bg-blue-700', 'focus:ring-blue-500');
        }

        // Directement assigner onclick handler. Cela écrasera tout gestionnaire précédent.
        modalConfirmBtn.onclick = () => {
            confirmCallback(); // Exécuter la logique de confirmation spécifique
            hideModal(); // Puis masquer la modale
        };

        modalCancelBtn.onclick = () => {
            hideModal();
        };
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

    // --- Fonctions de Persistance (Firestore) ---

    /**
     * Chemin du document Firestore pour les données du tournoi de l'utilisateur.
     * @returns {import("https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js").DocumentReference|null} La référence du document ou null si Firebase n'est pas prêt.
     */
    function getUserTournamentDocRef() {
        if (window.db && window.userId && window.appId) {
            return window.doc(window.db, 'artifacts', window.appId, 'users', window.userId, 'tournamentData', 'currentTournament');
        }
        console.error("Firebase ou User ID non initialisé. Impossible d'obtenir la référence du document.");
        return null;
    }

    /**
     * Sauvegarde toutes les données du tournoi dans Firestore.
     * Cette fonction est appelée chaque fois que des données sont modifiées.
     */
    async function saveAllDataToFirestore() {
        const docRef = getUserTournamentDocRef();
        if (!docRef) {
            showMessage(document.getElementById('message') || APP_CONTAINER, "Erreur: Impossible de sauvegarder les données, Firebase non prêt.", true);
            return;
        }

        try {
            const dataToSave = {
                allTeams: allTeams,
                allBrassagePhases: allBrassagePhases,
                eliminationPhases: eliminationPhases,
                currentSecondaryGroupsPreview: currentSecondaryGroupsPreview,
                // Convertir le Set en Array pour le stockage Firestore
                eliminatedTeams: Array.from(eliminatedTeams),
                currentDisplayedPhaseId: currentDisplayedPhaseId,
                // Sauvegarder les paramètres de la page Brassages
                poolGenerationBasis: localStorage.getItem('volleyPoolGenerationBasis') || 'initialLevels',
                teamsPerPoolSetting: localStorage.getItem('volleyTeamsPerPoolSetting') || '3',
                secondaryGroupsSelection: localStorage.getItem('volleySecondaryGroupsSelection') || '2'
            };
            await window.setDoc(docRef, dataToSave);
            console.log("Données sauvegardées avec succès dans Firestore.");
            // showMessage(document.getElementById('message') || APP_CONTAINER, "Données sauvegardées.", false); // Peut être trop fréquent
        } catch (e) {
            console.error("Erreur lors de la sauvegarde des données dans Firestore:", e);
            showMessage(document.getElementById('message') || APP_CONTAINER, "Erreur lors de la sauvegarde des données.", true);
        }
    }

    /**
     * Charge toutes les données du tournoi depuis Firestore.
     * Met également en place un listener en temps réel.
     */
    async function loadAllData() {
        const docRef = getUserTournamentDocRef();
        if (!docRef) {
            console.warn("Firebase non prêt lors du chargement des données. Tentative de réessai...");
            return;
        }

        // Mettre en place un listener en temps réel
        window.onSnapshot(docRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                allTeams = data.allTeams || [];
                allBrassagePhases = data.allBrassagePhases || [];
                eliminationPhases = data.eliminationPhases || {};
                currentSecondaryGroupsPreview = data.currentSecondaryGroupsPreview || {};
                // Convertir l'Array en Set lors du chargement
                eliminatedTeams = new Set(data.eliminatedTeams || []);
                currentDisplayedPhaseId = data.currentDisplayedPhaseId || null;

                // Charger les paramètres depuis Firestore (qui étaient stockés dans localStorage)
                localStorage.setItem('volleyPoolGenerationBasis', data.poolGenerationBasis || 'initialLevels');
                localStorage.setItem('volleyTeamsPerPoolSetting', data.teamsPerPoolSetting || '3');
                localStorage.setItem('volleySecondaryGroupsSelection', data.secondaryGroupsSelection || '2');

                console.log("Données chargées ou mises à jour depuis Firestore.");

                // Reconstruire matchOccurrenceMap après le chargement des phases
                rebuildMatchOccurrenceMap();

                // Rendre la page après le chargement initial des données
                // ou après une mise à jour en temps réel
                handleLocationHash();
            } else {
                console.log("Aucune donnée trouvée dans Firestore. Initialisation des données par défaut.");
                // Si aucune donnée n'existe, on peut initialiser avec des valeurs par défaut
                // et les sauvegarder pour créer le document.
                allTeams = [];
                allBrassagePhases = [];
                eliminationPhases = {};
                currentSecondaryGroupsPreview = {};
                eliminatedTeams = new Set();
                currentDisplayedPhaseId = null;
                matchOccurrenceMap = new Map(); // S'assurer qu'elle est réinitialisée aussi
                saveAllDataToFirestore(); // Crée le document initial dans Firestore
                handleLocationHash(); // Rendre la page vide
            }
        }, (error) => {
            console.error("Erreur lors de l'écoute des données Firestore:", error);
            showMessage(document.getElementById('message') || APP_CONTAINER, "Erreur de synchronisation des données.", true);
        });
    }

    /**
     * Rebuilds the match occurrence map.
     * This helps track which team pairs have played in which phases.
     */
    function rebuildMatchOccurrenceMap(phasesToEvaluate = allBrassagePhases) {
        matchOccurrenceMap = new Map(); // Reset the map
        phasesToEvaluate.forEach(phase => {
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

    // --- Fonctions de Rendu des Pages (Vues) ---

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

    function setupEquipesPageLogic() {
        const teamNameInput = document.getElementById('teamName');
        const teamLevelInput = document.getElementById('teamLevel');
        const addTeamBtn = document.getElementById('addTeamBtn');
        const teamsListDiv = document.getElementById('teamsList');
        const clearTeamsBtn = document.getElementById('clearTeamsBtn');
        const messageElement = document.getElementById('message');
        const excelFileInput = document.getElementById('excelFileInput');
        const importTeamsBtn = document.getElementById('importTeamsBtn');
        const importMessageElement = document.getElementById('importMessage');
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
                        showModal('Éditer l\'équipe', formDiv, () => {
                            const newName = document.getElementById('editTeamName').value.trim();
                            const newLevel = parseInt(document.getElementById('editTeamLevel').value);

                            if (!newName) {
                                showMessage(messageElement, "Le nom de l'équipe ne peut pas être vide.", true);
                                return;
                            }
                            // Check for duplicate name during edit, excluding the current team being edited
                            if (teamExists(newName) && newName.toLowerCase() !== teamToEdit.name.toLowerCase()) {
                                showMessage(messageElement, `Une équipe nommée "${escapeHtml(newName)}" existe déjà.`, true);
                                return;
                            }
                            if (isNaN(newLevel) || newLevel < 1 || newLevel > 10) {
                                showMessage(messageElement, "Le niveau doit être un nombre entre 1 et 10.", true);
                                return;
                            }

                            teamToEdit.name = newName;
                            teamToEdit.level = newLevel;
                            saveAllDataToFirestore(); // Utilisation de la fonction de sauvegarde Firestore
                            renderTeams();
                            showMessage(messageElement, `Équipe "${escapeHtml(newName)}" mise à jour.`);
                        });
                    }
                });
            });

            document.querySelectorAll('.delete-team-btn').forEach(button => {
                button.addEventListener('click', (event) => {
                    const teamId = event.target.dataset.id;
                    const teamToDelete = allTeams.find(t => t.id === teamId);
                    if (teamToDelete) {
                        const messageContent = document.createElement('p');
                        messageContent.textContent = `Êtes-vous sûr de vouloir supprimer l'équipe "${escapeHtml(teamToDelete.name)}" ? Cette action est irréversible.`;
                        messageContent.className = 'text-gray-700';

                        showModal('Confirmer la suppression', messageContent, () => {
                            allTeams = allTeams.filter(team => team.id !== teamId);
                            // Supprimer l'équipe des éliminées si elle y était
                            eliminatedTeams.delete(teamId);
                            saveAllDataToFirestore(); // Utilisation de la fonction de sauvegarde Firestore
                            renderTeams();
                            showMessage(messageElement, `Équipe "${escapeHtml(teamToDelete.name)}" supprimée.`);
                        }, true);
                    }
                });
            });
        }

        addTeamBtn.addEventListener('click', () => {
            const name = teamNameInput.value.trim();
            const level = parseInt(teamLevelInput.value);

            if (!name) {
                showMessage(messageElement, "Le nom de l'équipe ne peut pas être vide.", true);
                return;
            }
            // Check for duplicate name
            if (teamExists(name)) {
                showMessage(messageElement, `L'équipe "${escapeHtml(name)}" existe déjà. Veuillez choisir un nom différent.`, true);
                return;
            }
            if (isNaN(level) || level < 1 || level > 10) {
                showMessage(messageElement, "Le niveau doit être un nombre entre 1 et 10.", true);
                return;
            }

            const newTeam = {
                id: 'team_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9),
                name: name,
                level: level
            };
            allTeams.push(newTeam);
            saveAllDataToFirestore(); // Utilisation de la fonction de sauvegarde Firestore
            renderTeams();
            teamNameInput.value = '';
            teamLevelInput.value = '5';
            showMessage(messageElement, `Équipe "${escapeHtml(name)}" ajoutée avec succès !`);
        });

        clearTeamsBtn.addEventListener('click', () => {
            const messageContent = document.createElement('p');
            messageContent.textContent = "Êtes-vous sûr de vouloir supprimer TOUTES les équipes ? Cette action est irréversible.";
            messageContent.className = 'text-gray-700';

            showModal('Confirmer la suppression de toutes les équipes', messageContent, () => {
                allTeams = [];
                eliminatedTeams.clear(); // Effacer toutes les équipes éliminées
                saveAllDataToFirestore(); // Utilisation de la fonction de sauvegarde Firestore
                renderTeams();
                showMessage(messageElement, "Toutes les équipes ont été supprimées.");
            }, true);
        });

        importTeamsBtn.addEventListener('click', () => {
            const file = excelFileInput.files[0];
            if (!file) {
                showMessage(importMessageElement, "Veuillez sélectionner un fichier Excel.", true);
                return;
            }

            const reader = new FileReader();
            reader.onload = (e) => {
                const data = new Uint8Array(e.target.result);
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
                    allTeams.push(...newTeams);
                    saveAllDataToFirestore(); // Utilisation de la fonction de sauvegarde Firestore
                    renderTeams();
                    let successMsg = `${importedCount} équipe(s) importée(s) avec succès.`;
                    if (skippedNames.length > 0) {
                        successMsg += ` ${failedCount} équipe(s) ignorée(s) (noms déjà existants ou données invalides) : ${skippedNames.map(escapeHtml).join(', ')}.`;
                    }
                    showMessage(importMessageElement, successMsg);
                } else if (json.length > 0) { // If there were rows, but none imported successfully
                     let errorMsg = "Aucune équipe n'a pu être importée.";
                     if (skippedNames.length > 0) {
                         errorMsg += ` Les équipes suivantes existent déjà : ${skippedNames.map(escapeHtml).join(', ')}.`;
                     }
                     errorMsg += " Vérifiez le format des colonnes ('Nom', 'Niveau') et la validité des données (niveau entre 1 et 10).";
                     showMessage(importMessageElement, errorMsg, true);
                } else { // File was empty or only headers
                    showMessage(importMessageElement, "Aucune nouvelle équipe n'a été trouvée dans le fichier ou le fichier est vide.", true);
                }
                excelFileInput.value = ''; // Clear the input after processing
            };
            reader.onerror = (ex) => {
                showMessage(importMessageElement, "Erreur lors de la lecture du fichier : " + ex.message, true);
                console.error("Erreur de lecture de fichier:", ex);
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
                    <!-- Preview of groups will be rendered here -->
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
        const messageElement = document.getElementById('message');
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
        const basisMessageElement = document.getElementById('basisMessage');
        const basisHelpText = document.getElementById('basisHelpText');

        // New elements for step-by-step phase creation
        const nextBrassagePhaseContainer = document.getElementById('nextBrassagePhaseContainer');
        const createNextBrassagePhaseBtn = document.getElementById('createNextBrassagePhaseBtn');
        const nextBrassagePhaseMessage = document.getElementById('nextBrassagePhaseMessage');

        // NOUVEAU: Éléments pour la validation directe
        const validateForDirectEliminationBtn = document.getElementById('validateForDirectEliminationBtn');
        const directEliminationMessage = document.getElementById('directEliminationMessage');


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
                    showMessage(msgElement, `Impossible de former des poules de ${requestedTeamsPerPool} équipes: il manque des équipes de niveau ${level}.`, true);
                    return null;
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
                showMessage(msgElement, "Aucune équipe disponible pour former les poules dans ce groupe.", true);
                return null;
            }

            const numInternalTiers = requestedTeamsPerPool; // Represents how many tiers we divide teams into
            const totalTeamsInGroup = teamsForThisGroup.length;

            if (numInternalTiers < 1) {
                showMessage(msgElement, "Le nombre d'équipes par poule doit être au moins 1.", true);
                return null;
            }

            // Sort teams within the group by their ranking (points, then diff score)
            const sortedTeamsWithinGroup = [...teamsForThisGroup].sort((a, b) => b.totalPoints - a.totalPoints || b.totalDiffScore - a.totalDiffScore);

            const teamsGroupedByInternalTier = new Map();
            for(let i = 0; i < numInternalTiers; i++) {
                teamsGroupedByInternalTier.set(i, []);
            }

            // Distribute teams evenly into `numInternalTiers` based on their sorted order
            for (let i = 0; i < totalTeamsInGroup; i++) {
                const tierIndex = i % numInternalTiers; // Round-robin distribution into tiers
                teamsGroupedByInternalTier.get(tierIndex).push(sortedTeamsWithinGroup[i]);
            }

            // Determine the number of pools based on the smallest tier size
            let minTierSize = Infinity;
            const tierKeys = Array.from(teamsGroupedByInternalTier.keys()).sort((a,b)=>a-b);

            for (const tier of tierKeys) {
                const teamsInThisTier = teamsGroupedByInternalTier.get(tier);
                minTierSize = Math.min(minTierSize, teamsInThisTier.length);
            }

            if (minTierSize === 0 || minTierSize === Infinity || minTierSize < 1) {
                showMessage(msgElement, `Pas assez d'équipes pour former des poules équilibrées de ${requestedTeamsPerPool} équipes à partir de ce groupe. Réduisez le nombre d'équipes par poule ou ajoutez des équipes.`, true);
                return null;
            }

            const numberOfPools = minTierSize;
            const generatedPools = [];

            // Generate random offsets for each tier to diversify pool compositions
            // This is the core change to minimize repetitions: each tier will start its team selection
            // from a different point, rotating through its members for each pool.
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
                    // Apply offset to pick team from tier, ensuring we wrap around if index exceeds length
                    const actualIndex = (i + tierOffsets[tier]) % teamsInThisTier.length;
                    
                    if (teamsInThisTier && teamsInThisTier[actualIndex]) {
                        // We need to pass the full team object here, not just id/name.
                        // The `teamsForThisGroup` already contain the original team objects and their calculated scores.
                        const originalTeam = allTeams.find(t => t.id === teamsInThisTier[actualIndex].id);
                        if (originalTeam) {
                            pool.teams.push({
                                ...originalTeam, // Original team properties (id, name, level)
                                totalPoints: teamsInThisTier[actualIndex].totalPoints, // Calculated points
                                totalDiffScore: teamsInThisTier[actualIndex].totalDiffScore // Calculated diff score
                            });
                        } else {
                            console.warn(`Original team data not found for ID: ${teamsInThisTier[actualIndex].id}`);
                            pool.teams.push(teamsInThisTier[actualIndex]); // Fallback to partial data
                        }
                        
                    } else {
                        console.warn(`ATTENTION: Tentative de prendre une équipe de tiers vide ou hors limite pour la poule ${pool.name}, tier ${tier}, index ${actualIndex}.`);
                    }
                }

                shuffleArray(pool.teams); // Shuffle teams within the pool after selection

                // Generate matches for this pool (round-robin)
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
            // Calculate remaining teams (those not used in any pool)
            teamsGroupedByInternalTier.forEach(group => {
                remainingTeamsCount += (group.length - numberOfPools);
            });

            return { pools: generatedPools, remainingTeamsCount: remainingTeamsCount };
        }


        // Modified renderPools to accept showRepeats parameter
        function renderPools(pools, phaseName = "Poules Actuelles", phaseId = null, showRepeats = false) {
            poolsDisplay.innerHTML = '';
            currentPhaseTitle.textContent = 'Poules de ' + phaseName;
            currentDisplayedPhaseId = phaseId;

            if (pools.length === 0) {
                poolsDisplay.innerHTML = '<p class="text-gray-500 text-center md:col-span-2">Aucune poule générée pour cette phase.</p>';
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
                                     showMessage(messageElement, "Un match ne peut pas être un match nul. Veuillez entrer un vainqueur.", true);
                                }
                            }
                            saveAllDataToFirestore(); // Utilisation de la fonction de sauvegarde Firestore
                            renderPhaseHistory(); // To update next phase button visibility

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
                                showMessage(messageElement, "Score enregistré automatiquement pour " + escapeHtml(match.team1Name) + " vs " + escapeHtml(match.team2Name) + " !");
                            } else {
                                showMessage(messageElement, "Saisie en cours...", false);
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
                    showRepeatedMatchDetailsModal(team1Name, team2Name, team1Id, team2Id, currentDisplayedPhaseId);
                });
            });
        }

        // Helper function to render pools with current display settings
        function renderPoolsWithCurrentSettings(pools, phaseName, phaseId) {
            const showRepeats = toggleRepeatedMatchesDisplay ? toggleRepeatedMatchesDisplay.checked : false;
            renderPools(pools, phaseName, phaseId, showRepeats);
        }

        /**
         * Checks if a given brassage phase is complete (all matches have scores and a winner).
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
                        generateOrDisplayButton.className = 'generate-or-display-button bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition duration-150 text-sm ml-2';
                        generateOrDisplayButton.addEventListener('click', () => {
                            generatePoolsForPhase(phase.id); // Call the unified generation function
                        });
                    }

                    const deleteButton = document.createElement('button');
                    deleteButton.textContent = 'X';
                    deleteButton.className = 'delete-phase-button bg-red-500 text-white w-6 h-6 flex items-center justify-center rounded-full text-xs hover:bg-red-600 transition duration-150';
                    deleteButton.title = 'Supprimer cette phase';
                    deleteButton.addEventListener('click', () => {
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
            const currentBasis = localStorage.getItem('volleyPoolGenerationBasis');
            const initialOrSecondaryPhases = allBrassagePhases.filter(p => p.type === PHASE_TYPE_INITIAL || p.type === PHASE_TYPE_SECONDARY_BRASSAGE);
            initialOrSecondaryPhases.sort((a,b) => a.timestamp - b.timestamp);

            const lastBrassagePhase = initialOrSecondaryPhases[initialOrSecondaryPhases.length - 1];
            const hasUngeneratedPhase = initialOrSecondaryPhases.some(p => !p.generated);

            if (currentBasis === 'previousResults' && lastBrassagePhase && isBrassagePhaseComplete(lastBrassagePhase) && !hasUngeneratedPhase) {
                nextBrassagePhaseContainer.classList.remove('hidden');
                nextBrassagePhaseMessage.textContent = "La phase de brassage précédente est complète. Vous pouvez créer la prochaine phase.";
                nextBrassagePhaseMessage.classList.remove('text-red-500');
                nextBrassagePhaseMessage.classList.add('text-green-500');
            } else if (currentBasis === 'previousResults' && lastBrassagePhase && !isBrassagePhaseComplete(lastBrassagePhase)) {
                nextBrassagePhaseContainer.classList.remove('hidden');
                nextBrassagePhaseMessage.textContent = `Veuillez compléter les scores de la phase "${escapeHtml(lastBrassagePhase ? lastBrassagePhase.name : 'Phase Inconnue')}" pour créer la phase suivante.`;
                nextBrassagePhaseMessage.classList.remove('text-green-500');
                nextBrassagePhaseMessage.classList.add('text-red-500');
            } else if (currentBasis === 'previousResults' && hasUngeneratedPhase) {
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
            secondaryGroupsPreviewDisplay.innerHTML = '';
            refreshSecondaryGroupScoresBtn.classList.add('hidden'); // Hide by default, show only if groups are rendered

            if (Object.keys(currentSecondaryGroupsPreview).length === 0) {
                secondaryGroupsPreviewDisplay.innerHTML = '<p class="text-gray-500 text-center w-full md:col-span-2 lg:col-span-3">Créez les groupes ici après avoir cliqué sur "Créer les groupes".</p>';
                // Ensure buttons are hidden if there's no data
                validateSecondaryGroupsBtn.classList.add('hidden');
                generateSecondaryBrassagesBtn.classList.add('hidden');
                refreshSecondaryGroupScoresBtn.classList.add('hidden'); // Hide refresh button
                currentSecondaryGroupsPreview = {}; // Clear preview if invalid selection
                saveAllDataToFirestore(); // Utilisation de la fonction de sauvegarde Firestore
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
            if (Object.keys(currentSecondaryGroupsPreview).length === 0) {
                showMessage(secondaryPreviewMessage, "Aucune prévisualisation de groupe secondaire à actualiser.", true);
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
            const numberOfSecondaryGroupsInput = document.getElementById('numberOfSecondaryGroups');
            const numGroupsValue = parseInt(numberOfSecondaryGroupsInput.value);
            const groupNamesMap = { 2: ["Principale", "Consolante"], 3: ["Principale", "Consolante", "Super Consolante"] };
            const selectedGroupNames = groupNamesMap[numGroupsValue];
            
            renderSecondaryGroupsPreview(selectedGroupNames); // This will redraw the display with updated scores
            saveAllDataToFirestore(); // Utilisation de la fonction de sauvegarde Firestore

            if (displayUpdated) {
                showMessage(secondaryPreviewMessage, "Scores des groupes secondaires actualisés avec les dernières données de classement.", false);
            } else {
                showMessage(secondaryPreviewMessage, "Les scores des groupes secondaires sont déjà à jour.", false);
            }
        }


        function deletePhaseById(phaseIdToDelete) {
            const initialLength = allBrassagePhases.length;
            allBrassagePhases = allBrassagePhases.filter(phase => phase.id !== phaseIdToDelete);

            if (allBrassagePhases.length < initialLength) {
                saveAllDataToFirestore(); // Utilisation de la fonction de sauvegarde Firestore
                renderPhaseHistory();
                showMessage(messageElement, "La phase a été supprimée avec succès !");

                if (currentDisplayedPhaseId === phaseIdToDelete) {
                    poolsDisplay.innerHTML = '<p class="text-gray-500 text-center md:col-span-2">Les poules de la phase sélectionnée s\'afficheront ici.</p>';
                    currentPhaseTitle.textContent = 'Poules de la Phase Actuelle';
                    currentDisplayedPhaseId = null;
                }
            } else {
                showMessage(messageElement, "Erreur: Phase non trouvée pour la suppression.", true);
            }
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
                showMessage(messageElement, "Aucune équipe n'a été ajoutée. Veuillez gérer les équipes d'abord.", true);
                console.log("DEBUG: No teams available, exiting.");
                return;
            }

            const requestedTeamsPerPool = parseInt(numPoolsInput.value);

            if (isNaN(requestedTeamsPerPool) || requestedTeamsPerPool < 1) {
                showMessage(messageElement, "Veuillez entrer un nombre valide d'équipes par poule (au moins 1).", true);
                console.log("DEBUG: Invalid teams per pool (less than 1), exiting.");
                return;
            }

            if (requestedTeamsPerPool > 10) {
                showMessage(messageElement, "Le nombre d'équipes par poule ne peut pas dépasser 10 (le niveau maximum des équipes).", true);
                console.log("DEBUG: Teams per pool exceeds max level (10), exiting.");
                return;
            }

            const phaseToGenerate = allBrassagePhases.find(p => p.id === phaseIdToUpdate);
            if (!phaseToGenerate) {
                showMessage(messageElement, "Erreur: Phase à générer introuvable.", true);
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

            // Get the user's selected pool generation basis directly from localStorage
            // We read it fresh every time to avoid caching issues.
            const selectedBasis = localStorage.getItem('volleyPoolGenerationBasis');
            console.log(`DEBUG: User's selected basis from localStorage (volleyPoolGenerationBasis): "${selectedBasis}"`);

            let effectiveUseInitialLevels;

            if (isFirstActualBrassagePhaseOverall) {
                // The very first brassage phase (initial or secondary, though usually initial) MUST use initial levels.
                effectiveUseInitialLevels = true;
                showMessage(basisMessageElement, "La toute première phase de brassage utilise toujours les niveaux initiaux des équipes.", false);
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
                    showMessage(messageElement, "Erreur logique: La phase précédente est introuvable pour une génération basée sur les résultats.", true);
                    console.log("DEBUG: Previous phase not found for results-based generation, exiting.");
                    return;
                }
                console.log(`DEBUG: Previous phase to check: ${previousBrassagePhase.name} (ID: ${previousBrassagePhase.id})`);
                if (!isBrassagePhaseComplete(previousBrassagePhase)) {
                    showMessage(messageElement, `Veuillez compléter tous les scores de la phase précédente ("${escapeHtml(previousBrassagePhase.name)}") avant de générer les poules basées sur les résultats.`, true);
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
                    showMessage(messageElement, "Aucune équipe avec des scores enregistrés pour générer des poules basées sur les résultats précédents. Les niveaux initiaux seront utilisés.", true);
                    console.log("DEBUG: No teams with scores for results-based generation, falling back to all teams.");
                    return allTeams; // Fallback
                }
                console.log(`DEBUG: Teams for generation based on scores (${teamsWithScores.length} teams):`, teamsWithScores.map(t => `${t.name} (Pts: ${t.totalPoints}, Diff: ${t.totalDiffScore})`).join(', '));
                return teamsWithScores.length > 0 ? teamsWithScores : allTeams; // Use teamsWithScores if available, else allTeams
            })();

            if (teamsForGeneration.length === 0) {
                 showMessage(messageElement, "Aucune équipe disponible pour générer des poules.", true);
                 console.log("DEBUG: No teams for generation, exiting.");
                 return;
            }
            if (teamsForGeneration.length < requestedTeamsPerPool) {
                showMessage(messageElement, `Pas assez d'équipes (${teamsForGeneration.length}) pour former des poules de ${requestedTeamsPerPool} équipes. Réduisez le nombre d'équipes par poule ou ajoutez des équipes.` + (effectiveUseInitialLevels ? "" : " Assurez-vous d'avoir suffisamment d'équipes avec des scores valides."), true);
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
                const result = generateAndEvaluatePools(phaseToGenerate.type, teamsForGeneration, requestedTeamsPerPool, messageElement, phaseIdToUpdate);
                
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
                showMessage(messageElement, "Impossible de générer des poules valides après plusieurs tentatives. Vérifiez le nombre d'équipes et les paramètres.", true);
                console.log("DEBUG: Failed to generate valid pools after all attempts, exiting.");
                return;
            }

            const phaseIndex = allBrassagePhases.findIndex(p => p.id === phaseIdToUpdate);
            if (phaseIndex > -1) {
                allBrassagePhases[phaseIndex].pools = bestPools;
                allBrassagePhases[phaseIndex].generated = true; 
                saveAllDataToFirestore(); // Utilisation de la fonction de sauvegarde Firestore
                renderPhaseHistory();
                renderPoolsWithCurrentSettings(bestPools, allBrassagePhases[phaseIndex].name, phaseIdToUpdate);

                let successMessage = bestPools.length + " poule(s) générée(s) avec succès pour cette phase ! ";
                if (minRepetitions > 0) {
                    successMessage += `Ceci a entraîné ${minRepetitions} rencontre(s) répétée(s) (minimum trouvé après ${MAX_ATTEMPTS} tentatives).`;
                } else {
                    successMessage += `Aucune rencontre répétée détectée dans cette phase.`;
                }
                if (bestRemainingTeamsCount > 0) {
                    successMessage += ` ${bestRemainingTeamsCount} équipe(s) n'ont pas pu être assignée(s) à une poule.`;
                }
                showMessage(messageElement, successMessage);
                console.log("DEBUG: Pool generation successful.");
            } else {
                showMessage(messageElement, "Erreur: Phase à générer introuvable après les vérifications.", true);
                console.log("DEBUG: Phase not found after final checks, exiting.");
            }
            console.log("--- DEBUG: Exiting generatePoolsForPhase ---");
        }


        // Renommage de la fonction `previewSecondaryGroups` en `_performSecondaryGroupsPreview`
        // et ajout d'un wrapper `previewSecondaryGroups` pour la modale d'avertissement.
        function _performSecondaryGroupsPreview() {
            const numGroups = parseInt(numberOfSecondaryGroupsInput.value);
            if (isNaN(numGroups) || (numGroups !== 2 && numGroups !== 3)) {
                showMessage(secondaryPreviewMessage, "Veuillez choisir 2 ou 3 groupes de niveau pour la création.", true);
                secondaryGroupsPreviewDisplay.innerHTML = '';
                validateSecondaryGroupsBtn.classList.add('hidden');
                generateSecondaryBrassagesBtn.classList.add('hidden');
                refreshSecondaryGroupScoresBtn.classList.add('hidden'); // Hide refresh button
                currentSecondaryGroupsPreview = {}; // Clear preview if invalid selection
                saveAllDataToFirestore(); // Utilisation de la fonction de sauvegarde Firestore
                return;
            }

            const globalRankings = getGlobalRankings(allTeams, allBrassagePhases);
            if (globalRankings.length === 0) {
                showMessage(secondaryPreviewMessage, "Aucune équipe classée disponible pour créer les groupes. Générez et terminez des phases de brassage initiales d'abord.", true);
                secondaryGroupsPreviewDisplay.innerHTML = '';
                validateSecondaryGroupsBtn.classList.add('hidden');
                generateSecondaryBrassagesBtn.classList.add('hidden');
                refreshSecondaryGroupScoresBtn.classList.add('hidden'); // Hide refresh button
                currentSecondaryGroupsPreview = {}; // Clear preview if no rankings
                saveAllDataToFirestore(); // Utilisation de la fonction de sauvegarde Firestore
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
            saveAllDataToFirestore(); // Utilisation de la fonction de sauvegarde Firestore
            showMessage(secondaryPreviewMessage, `Création des ${numGroups} groupes de niveau terminée. Ajustez si nécessaire.`);
        }

        // Wrapper pour `_performSecondaryGroupsPreview` avec avertissement
        function previewSecondaryGroupsWithWarning() {
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
            showModal(`Gérer l'équipe : ${escapeHtml(teamName)}`, modalContentDiv, () => { /* Aucune action par défaut */ });

            document.getElementById('moveTeamOptionBtn').addEventListener('click', () => {
                hideModal(); // Cacher la modale d'options
                showMoveTeamModal(teamId, teamName, currentGroup, totalPoints, totalDiffScore, allGroupNames);
            });

            document.getElementById('toggleEliminationOptionBtn').addEventListener('click', () => {
                if (eliminatedTeams.has(teamId)) {
                    eliminatedTeams.delete(teamId);
                    showMessage(secondaryPreviewMessage, `${escapeHtml(teamName)} remise en jeu.`);
                } else {
                    eliminatedTeams.add(teamId);
                    showMessage(secondaryPreviewMessage, `${escapeHtml(teamName)} éliminée.`);
                }
                saveAllDataToFirestore(); // Utilisation de la fonction de sauvegarde Firestore
                // Re-render la prévisualisation des groupes secondaires pour que les changements soient visibles
                const numGroupsValue = parseInt(localStorage.getItem('volleySecondaryGroupsSelection') || numberOfSecondaryGroupsInput.value);
                const groupNamesMap = { 2: ["Principale", "Consolante"], 3: ["Principale", "Consolante", "Super Consolante"] };
                renderSecondaryGroupsPreview(groupNamesMap[numGroupsValue]);
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


        function showMoveTeamModal(teamId, teamName, currentGroup, totalPoints, totalDiffScore, allGroupNames) {
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
                const moveModalMessage = document.getElementById('moveModalMessage');

                if (newGroup === currentGroup) {
                    return; // hideModal is handled by showModal's callback
                }

                moveTeamBetweenSecondaryGroups(teamId, currentGroup, newGroup);
            });
        }

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

                const numGroupsValue = parseInt(localStorage.getItem('volleySecondaryGroupsSelection') || numberOfSecondaryGroupsInput.value);
                const groupNamesMap = { 2: ["Principale", "Consolante"], 3: ["Principale", "Consolante", "Super Consolante"] };
                renderSecondaryGroupsPreview(groupNamesMap[numGroupsValue]);
                saveAllDataToFirestore(); // Utilisation de la fonction de sauvegarde Firestore
                showMessage(secondaryPreviewMessage, `Équipe ${escapeHtml(teamToMove.name)} déplacée vers ${escapeHtml(toGroup)}.`);

            } else {
                console.error("ERROR: Team not found for movement:", teamId);
            }
        }

        function validateSecondaryGroupsForElimination() {
            const messageContent = document.createElement('p');
            messageContent.textContent = "Confirmer la composition actuelle des groupes pour les phases éliminatoires ? Cette action enregistre ce regroupement.";
            messageContent.className = 'text-gray-700';

            showModal('Valider les Groupes', messageContent, () => {
                if (Object.keys(currentSecondaryGroupsPreview).length === 0) {
                    showMessage(secondaryPreviewMessage, "Aucun groupe à valider. Créez les groupes d'abord.", true);
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
                saveAllDataToFirestore(); // Utilisation de la fonction de sauvegarde Firestore
                showMessage(secondaryPreviewMessage, "Répartition des groupes validée et enregistrée pour les éliminatoires !");
            });
        }

        // NOUVELLE FONCTION : Validation directe pour l'élimination
        function validateForDirectElimination() {
            const messageContent = document.createElement('p');
            messageContent.innerHTML = `
                Êtes-vous sûr de vouloir valider toutes les équipes (non éliminées)
                pour la phase éliminatoire en vous basant sur le classement général ?
                <br>
                **Attention :** Cette action écrasera toute configuration de groupes secondaires préalablement validée
                et passera les équipes sélectionnées à l'étape éliminatoire principale.
            `;
            messageContent.className = 'text-gray-700';

            showModal('Confirmer la validation directe pour l\'élimination', messageContent, () => {
                if (allTeams.length === 0) {
                    showMessage(directEliminationMessage, "Aucune équipe enregistrée. Veuillez ajouter des équipes d'abord.", true);
                    return;
                }

                const globalRankings = getGlobalRankings(allTeams, allBrassagePhases);
                if (globalRankings.length === 0) {
                    showMessage(directEliminationMessage, "Aucune équipe classée disponible. Veuillez générer et terminer des phases de brassage d'abord.", true);
                    return;
                }

                // Filter out eliminated teams from the rankings
                const eligibleTeams = globalRankings.filter(rankEntry => !eliminatedTeams.has(rankEntry.teamObject.id));

                if (eligibleTeams.length === 0) {
                    showMessage(directEliminationMessage, "Aucune équipe éligible (non éliminée) trouvée pour la phase éliminatoire.", true);
                    return;
                }

                // Create a single group for all eligible teams
                const directEliminationGroup = {
                    "Principale": eligibleTeams.map(r => ({
                        ...r.teamObject, // Original team properties (id, name, level)
                        totalPoints: r.totalPoints, // Calculated points
                        totalDiffScore: r.totalDiffScore, // Calculated diff score
                        previewGroup: "Principale" // Indicate they belong to the main group
                    }))
                };
                
                // Clear any existing secondary groups preview data
                currentSecondaryGroupsPreview = {}; 
                saveAllDataToFirestore(); // Utilisation de la fonction de sauvegarde Firestore

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
                saveAllDataToFirestore(); // Utilisation de la fonction de sauvegarde Firestore
                showMessage(directEliminationMessage, "Toutes les équipes éligibles validées pour l'élimination directe !");
                window.location.hash = '#eliminatoires'; // Redirect to elimination page
            }, true); // Use red style for confirmation as it overwrites
        }


        function generateSecondaryBrassagePhases() {
            console.log("DEBUG: Lancement de generateSecondaryBrassagePhases...");

            const teamsPerPoolForNewPhases = parseInt(numPoolsInput.value);

            if (isNaN(teamsPerPoolForNewPhases) || teamsPerPoolForNewPhases < 1) {
                showMessage(secondaryPreviewMessage, "Veuillez entrer un nombre valide d'équipes par poule (au moins 1) pour les phases secondaires.", true);
                return;
            }

            if (Object.keys(currentSecondaryGroupsPreview).length === 0) {
                showMessage(secondaryPreviewMessage, "Veuillez d'abord créer les groupes de brassage secondaires.", true);
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
                    showMessage(secondaryPreviewMessage, `Le groupe "${escapeHtml(groupName)}" n'a pas assez d'équipes pour former des poules de ${teamsPerPoolForNewPhases} équipes. (${teamsInGroup.length} équipes disponibles)`, true);
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
                    showMessage(secondaryPreviewMessage, `Impossible de générer des poules pour le groupe ${escapeHtml(groupName)}. Vérifiez si vous avez suffisamment d'équipes dans ce groupe pour les poules de ${teamsPerPoolForNewPhases} équipes.`, true);
                    generationFailed = true;
                    break;
                }
            }

            if (!generationFailed && newPhases.length > 0 && newPhases.length === numGroups) {
                allBrassagePhases.push(...newPhases);
                saveAllDataToFirestore(); // Utilisation de la fonction de sauvegarde Firestore
                renderPhaseHistory();
                renderPoolsWithCurrentSettings(newPhases[0].pools, newPhases[0].name, newPhases[0].id);
                showMessage(secondaryPreviewMessage, `${newPhases.length} phases de brassage secondaires générées avec succès !`);
            } else if (generationFailed) {
                console.error("ERREUR: La génération des phases supplémentaires a échoué pour au moins un groupe.");
            } else {
                showMessage(secondaryPreviewMessage, "Aucune phase de brassage secondaire n'a pu être générée. Vérifiez vos paramètres et le classement actuel.", true);
                console.error("ERREUR: Aucune phase secondaire n'a été générée malgré aucune erreur explicite.");
            }
        }

        function clearAllPhases() {
            const messageContent = document.createElement('p');
            messageContent.textContent = "Êtes-vous sûr de vouloir supprimer TOUTES les phases de brassage (initiales et secondaires) ? Cette action est irréversible.";
            messageContent.className = 'text-gray-700';

            showModal('Confirmer la suppression de toutes les phases', messageContent, () => {
                allBrassagePhases = [];
                currentSecondaryGroupsPreview = {}; // Clear secondary groups preview
                saveAllDataToFirestore(); // Utilisation de la fonction de sauvegarde Firestore

                renderPhaseHistory();
                poolsDisplay.innerHTML = '<p class="text-gray-500 text-center md:col-span-2">Les poules de la phase sélectionnée s\'afficheront ici.</p>';
                currentPhaseTitle.textContent = 'Poules de la Phase Actuelle';
                currentDisplayedPhaseId = null;
                secondaryGroupsPreviewDisplay.innerHTML = '<p class="text-gray-500 text-center w-full md:col-span-2 lg:col-span-3">Créez les groupes ici après avoir cliqué sur "Créer les groupes".</p>';
                validateSecondaryGroupsBtn.classList.add('hidden');
                generateSecondaryBrassagesBtn.classList.add('hidden');
                refreshSecondaryGroupScoresBtn.classList.add('hidden'); // Hide refresh button
                showMessage(messageElement, "Toutes les phases de brassage ont été supprimées.");
            }, true); // Use red style for confirmation button
        }

        // --- Initialisation et Événements pour la page Brassages ---

        // Load saved settings
        const savedTeamsPerPool = localStorage.getItem('volleyTeamsPerPoolSetting');
        if (savedTeamsPerPool) {
            numPoolsInput.value = savedTeamsPerPool;
        }

        // Load and set the dropdown for secondary groups
        const savedSecondaryGroupsSelection = localStorage.getItem('volleySecondaryGroupsSelection');
        if (savedSecondaryGroupsSelection) {
            numberOfSecondaryGroupsInput.value = savedSecondaryGroupsSelection;
        }

        // Initialize pool generation basis radio buttons
        const savedPoolGenerationBasis = localStorage.getItem('volleyPoolGenerationBasis') || 'initialLevels';
        if (savedPoolGenerationBasis === 'previousResults') {
            basisPreviousResultsRadio.checked = true;
        } else {
            basisInitialLevelsRadio.checked = true;
        }
        // Update UI based on initial selection
        updatePoolGenerationBasisUI();


        // Event listeners for basis selection
        basisInitialLevelsRadio.addEventListener('change', () => {
            localStorage.setItem('volleyPoolGenerationBasis', 'initialLevels');
            updatePoolGenerationBasisUI();
        });

        basisPreviousResultsRadio.addEventListener('change', () => {
            localStorage.setItem('volleyPoolGenerationBasis', 'previousResults');
            updatePoolGenerationBasisUI();
        });
        
        function updatePoolGenerationBasisUI() {
        let selectedBasis = localStorage.getItem('volleyPoolGenerationBasis');
        console.log(`DEBUG: updatePoolGenerationBasisUI - Initial selectedBasis from localStorage: "${selectedBasis}"`);

        // Si selectedBasis est null (première charge) ou "null" (problème de sérialisation), définir une valeur par défaut.
        if (selectedBasis === null || selectedBasis === "null") {
            selectedBasis = 'initialLevels'; // Défaut à 'initialLevels'
            localStorage.setItem('volleyPoolGenerationBasis', selectedBasis); // Enregistrer la valeur par défaut
            console.log("DEBUG: volleyPoolGenerationBasis was null or 'null', defaulted to 'initialLevels' and saved to localStorage.");
        }
        console.log(`DEBUG: updatePoolGenerationBasisUI - Final selectedBasis after default check: "${selectedBasis}"`);


        const initialLevelsRadio = document.getElementById('basisInitialLevels');
        const previousResultsRadio = document.getElementById('basisPreviousResults');
        const numberOfGlobalPhasesInput = document.getElementById('numberOfGlobalPhases');
        const basisHelpText = document.getElementById('basisHelpText');

        if (initialLevelsRadio && previousResultsRadio) {
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
        } else {
             console.warn("DEBUG: Radio buttons for pool generation basis not found in DOM.");
        }
        // Assurez-vous que l'historique des phases et la visibilité des boutons sont mis à jour
        renderPhaseHistory(); // Cette fonction appelle updateNextPhaseButtonVisibility en interne
    }


        createGlobalPhasesStructureBtn.addEventListener('click', () => {
            const numPhases = parseInt(numberOfGlobalPhasesInput.value);
            const selectedBasis = localStorage.getItem('volleyPoolGenerationBasis');

            if (allTeams.length === 0) {
                showMessage(messageElement, "Aucune équipe n'a été ajoutée. Veuillez gérer les équipes d'abord.", true);
                return;
            }

            if (isNaN(numPhases) || numPhases < 1) {
                showMessage(messageElement, "Veuillez entrer un nombre valide de phases globales à créer (au moins 1).", true);
                return;
            }

            // Get existing actual brassage phases (initial and secondary)
            const existingBrassagePhases = allBrassagePhases.filter(p => p.type === PHASE_TYPE_INITIAL || p.type === PHASE_TYPE_SECONDARY_BRASSAGE);
            const hasUngeneratedPhase = existingBrassagePhases.some(p => !p.generated);
            const lastBrassagePhase = existingBrassagePhases[existingBrassagePhases.length - 1];

            if (selectedBasis === 'previousResults') {
                if (existingBrassagePhases.length > 0 && !isBrassagePhaseComplete(lastBrassagePhase)) {
                     showMessage(messageElement, `La phase "${escapeHtml(lastBrassagePhase.name)}" n'est pas terminée. Veuillez compléter ses scores ou la supprimer pour créer une nouvelle phase.`, true);
                     return;
                }
                if (hasUngeneratedPhase) {
                    showMessage(messageElement, "Une phase de brassage est en attente de génération. Veuillez générer ses poules en cliquant sur 'Générer les poules' ou la supprimer.", true);
                    return;
                }
                if (numPhases > 1) { // This case should be prevented by readOnly, but as a safeguard
                    showMessage(messageElement, "Lorsque la méthode de génération est 'Base sur les résultats cumulés des brassages précédents', vous ne pouvez créer qu'une seule phase à la fois.", true);
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
            saveAllDataToFirestore(); // Utilisation de la fonction de sauvegarde Firestore
            localStorage.setItem('volleyTeamsPerPoolSetting', numPoolsInput.value);
            renderPhaseHistory();
            poolsDisplay.innerHTML = '<p class="text-gray-500 text-center md:col-span-2">Les poules de la phase sélectionnée s\'afficheront ici.</p>';
            currentPhaseTitle.textContent = 'Poules de la Phase Actuelle';
            currentDisplayedPhaseId = null;

            if (selectedBasis === 'previousResults') {
                 showMessage(messageElement, `Une seule phase ('Phase Globale ${nextPhaseNumber}') a été créée. Veuillez générer ses poules, puis compléter ses scores pour débloquer la création de la phase suivante.`, false);
            } else {
                 showMessage(messageElement, `${numPhases} phases globales créées. Générez les poules pour chaque phase.`);
            }
        });

        // New event listener for creating the next phase when basis is previousResults
        createNextBrassagePhaseBtn.addEventListener('click', () => {
            const selectedBasis = localStorage.getItem('volleyPoolGenerationBasis');
            if (selectedBasis !== 'previousResults') {
                showMessage(nextBrassagePhaseMessage, "Cette option n'est disponible que lorsque la génération est basée sur les résultats précédents.", true);
                return;
            }

            const initialOrSecondaryPhases = allBrassagePhases.filter(p => p.type === PHASE_TYPE_INITIAL || p.type === PHASE_TYPE_SECONDARY_BRASSAGE);
            initialOrSecondaryPhases.sort((a,b) => a.timestamp - b.timestamp);

            const lastBrassagePhase = initialOrSecondaryPhases[initialOrSecondaryPhases.length - 1];
            const hasUngeneratedPhase = initialOrSecondaryPhases.some(p => !p.generated);

            if (!lastBrassagePhase || !isBrassagePhaseComplete(lastBrassagePhase)) {
                showMessage(nextBrassagePhaseMessage, `Veuillez compléter tous les scores de la phase "${escapeHtml(lastBrassagePhase ? lastBrassagePhase.name : 'précédente')}" avant de créer la phase suivante.`, true);
                return;
            }
            if (hasUngeneratedPhase) {
                showMessage(nextBrassagePhaseMessage, "Une phase de brassage est en attente de génération. Veuillez générer ses poules en cliquant sur 'Générer les poules' ou la supprimer.", true);
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
            saveAllDataToFirestore(); // Utilisation de la fonction de sauvegarde Firestore
            renderPhaseHistory();
            showMessage(nextBrassagePhaseMessage, `Phase Globale ${nextPhaseNumber} créée avec succès !`);
        });

        previewSecondaryGroupsBtn.addEventListener('click', previewSecondaryGroupsWithWarning); // Use the wrapper function
        numberOfSecondaryGroupsInput.addEventListener('change', () => {
            // If the user changes the number of groups, clear the current preview
            // because the structure might be different.
            currentSecondaryGroupsPreview = {};
            secondaryGroupsPreviewDisplay.innerHTML = '<p class="text-gray-500 text-center w-full md:col-span-2 lg:col-span-3">Créez les groupes ici après avoir cliqué sur "Créer les groupes".</p>';
            validateSecondaryGroupsBtn.classList.add('hidden');
            generateSecondaryBrassagesBtn.classList.add('hidden');
            refreshSecondaryGroupScoresBtn.classList.add('hidden'); // Hide refresh button
            saveAllDataToFirestore(); // Utilisation de la fonction de sauvegarde Firestore
        });

        validateSecondaryGroupsBtn.addEventListener('click', validateSecondaryGroupsForElimination);

        generateSecondaryBrassagesBtn.addEventListener('click', () => {
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
            const numGroupsValue = parseInt(localStorage.getItem('volleySecondaryGroupsSelection') || numberOfSecondaryGroupsInput.value);
            const groupNamesMap = { 2: ["Principale", "Consolante"], 3: ["Principale", "Consolante", "Super Consolante"] };
            const selectedGroupNames = groupNamesMap[numGroupsValue];
            
            // Ensure the dropdown reflects the loaded state
            if (numberOfSecondaryGroupsInput.value !== numGroupsValue.toString()) {
                numberOfSecondaryGroupsInput.value = numGroupsValue;
            }

            renderSecondaryGroupsPreview(selectedGroupNames);
        }
    }

    // NOUVEAU: Fonction pour la page de sélection des équipes éliminées
    function renderEliminationSelectionPage() {
        APP_CONTAINER.innerHTML = `
            <h1 class="text-3xl font-bold text-center text-gray-800 mb-8">Sélection des Équipes Éliminées</h1>

            <section class="p-6 bg-gray-50 rounded-lg border border-gray-200">
                <p class="text-gray-700 mb-4">Cochez les équipes qui seront exclues des phases éliminatoires. Elles n'apparaîtront pas dans les arbres de tournoi.</p>
                <div id="eliminationTeamsList" class="space-y-3">
                    <!-- Checkboxes for teams will be injected here -->
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
            eliminatedTeams.clear(); // Clear existing selections
            document.querySelectorAll('#eliminationTeamsList input[type="checkbox"]:checked').forEach(checkbox => {
                eliminatedTeams.add(checkbox.dataset.teamId);
            });
            saveAllDataToFirestore(); // Utilisation de la fonction de sauvegarde Firestore
            showMessage(eliminationSelectionMessage, "Sélection des équipes éliminées sauvegardée !");
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
        const eliminationMessage = document.getElementById('eliminationMessage');
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
                showMessage(eliminationMessage, "Aucune phase de classement secondaire (Principale, Consolante, Super Consolante) n'a été validée sur la page 'Brassages'. Veuillez les générer et les valider d'abord.", true);
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
                    // DEBUT DE LA MODIFICATION
                    const matchFrame = document.createElement('div');
                    matchFrame.className = 'match-frame bg-gray-50 border border-gray-300 rounded-lg p-3 mb-4 shadow-sm w-full'; // Cadran pour le match
                    matchFrame.dataset.matchId = match.id;
                    // FIN DE LA MODIFICATION

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

                    // MODIFICATION: Insérer le contenu du match à l'intérieur du nouveau matchFrame
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
                    // MODIFICATION: Ajouter le matchFrame (cadran) au lieu du matchBox (qui n'est plus utilisé comme parent direct)
                    roundDiv.appendChild(matchFrame);
                });
                bracketContainer.appendChild(roundDiv);
            });

            // La sélection des écouteurs doit maintenant cibler les select à l'intérieur de .match-frame
            containerElement.querySelectorAll('.match-frame .score-input').forEach(select => {
                select.addEventListener('change', updateMatchScoreAndWinner);
            });
        }

        function updateMatchScoreAndWinner(event) {
            const matchId = event.target.dataset.matchId;
            const teamNum = event.target.dataset.team;
            let score = parseInt(event.target.value); // Value from select will be a string, parse to int
            
            // Allow empty string for clearing input (selected value from placeholder option)
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
                !targetMatch.team2 || targetMatch.team2.id === null || targetMatch.team2.id === 'BYE') {
                showMessage(eliminationMessage, "Ce match est un BYE ou ses équipes ne sont pas encore déterminées. Les scores ne peuvent pas être saisis.", true);
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
                    showMessage(eliminationMessage, "Un match ne peut pas être un match nul. Veuillez entrer un vainqueur.", true);
                }
            }

            saveAllDataToFirestore(); // Utilisation de la fonction de sauvegarde Firestore

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
                    team2NameSpan.classList.add('winner-team');
                    team1NameSpan.classList.add('loser-team');
                }
            }

            propagateWinnerLoser(targetMatch.id, targetMatch.winnerId, targetMatch.loserId, targetBracket);

            // Re-render the specific bracket to update dynamic team names in next rounds
            renderBracket(targetBracket, document.getElementById(targetBracket.groupType.toLowerCase() + 'Bracket'));

            if (targetMatch.winnerId) {
                showMessage(eliminationMessage, `Score pour ${escapeHtml(targetMatch.team1.name)} vs ${escapeHtml(targetMatch.team2.name)} mis à jour et vainqueur déterminé !`);
            } else {
                showMessage(eliminationMessage, "Saisie du score en cours...", false);
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
            saveAllDataToFirestore(); // Utilisation de la fonction de sauvegarde Firestore
        }

        function generateAllEliminationPhases() {
            eliminationBracketsDisplay.innerHTML = '';
            showMessage(eliminationMessage, "Génération des tournois éliminatoires...");

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

            saveAllDataToFirestore(); // Utilisation de la fonction de sauvegarde Firestore
            showMessage(eliminationMessage, "Phases éliminatoires générées avec succès !");
        }

        function resetAllEliminationPhases() {
            const messageContent = document.createElement('p');
            messageContent.textContent = "Êtes-vous sûr de vouloir réinitialiser TOUTES les phases éliminatoires ? Cette action est irréversible.";
            messageContent.className = 'text-gray-700';

            showModal('Confirmer la réinitialisation complète', messageContent, () => {
                eliminationPhases = {};
                saveAllDataToFirestore(); // Utilisation de la fonction de sauvegarde Firestore
                eliminationBracketsDisplay.innerHTML = '<p class="text-gray-500 text-center">Cliquez sur "Générer les Phases Éliminatoires" pour afficher les tournois.</p>';
                showMessage(eliminationMessage, "Toutes les phases éliminatoires ont été réinitialisées.");
            }, true);
        }

        function resetGroupEliminationPhase(groupType) {
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
                        saveAllDataToFirestore(); // Utilisation de la fonction de sauvegarde Firestore
                        renderBracket(newBracketData, document.getElementById(groupType.toLowerCase() + 'Bracket'));
                        showMessage(eliminationMessage, `Phase éliminatoire pour le groupe "${escapeHtml(groupType)}" réinitialisée.`);
                    } else {
                        showMessage(eliminationMessage, `Impossible de réinitialiser le groupe "${escapeHtml(groupType)}" : pas assez d'équipes éligibles (${eligibleTeamsInGroup.length} restante(s)) ou données manquantes.`, true);
                        const groupContainer = document.getElementById(groupType.toLowerCase() + 'Bracket');
                        if (groupContainer) {
                             groupContainer.innerHTML = `<p class="text-gray-500 text-center">Aucun tournoi à afficher pour le groupe ${escapeHtml(groupType)}.</p>`;
                        }
                    }
                } else {
                     showMessage(eliminationMessage, `Impossible de réinitialiser le groupe "${escapeHtml(groupType)}" : groupe non configuré.`, true);
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
            showMessage(eliminationMessage, "Phases éliminatoires chargées depuis la sauvegarde.");
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
                    <label for="togglePhaseDetails" class="text-gray-700 text-sm">Afficher/Masquer les détails par phase</label>
                </div>
                <div id="phaseDetailsDisplay" class="space-y-6 hidden">
                    <!-- Phase detail tables will be injected here -->
                    <p class="text-gray-500 text-center">Aucun détail par phase disponible.</p>
                </div>
            </section>
        `;
        setupClassementsPageLogic();
    }

    function setupClassementsPageLogic() {
        const rankingsTableBody = document.getElementById('rankingsTableBody');
        const rankingsMessage = document.getElementById('rankingsMessage');
        const togglePhaseDetailsCheckbox = document.getElementById('togglePhaseDetails');
        const phaseDetailsDisplay = document.getElementById('phaseDetailsDisplay');

        function renderRankings() {
            rankingsTableBody.innerHTML = '';
            phaseDetailsDisplay.innerHTML = ''; // Clear previous phase details

            if (allTeams.length === 0) {
                 rankingsTableBody.innerHTML = `
                    <tr>
                        <td colspan="4" class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-center">
                            Aucune équipe enregistrée.
                        </td>
                    </tr>
                `;
                rankingsMessage.textContent = "Veuillez ajouter des équipes sur la page 'Équipes'.";
                phaseDetailsDisplay.innerHTML = '<p class="text-gray-500 text-center">Aucun détail par phase disponible car aucune équipe n\'est enregistrée.</p>';
                return;
            }

            const globalRankings = getGlobalRankings(allTeams, allBrassagePhases);

            if (globalRankings.length === 0) {
                 rankingsTableBody.innerHTML = `
                    <tr>
                        <td colspan="4" class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-center">
                            Aucun classement généré. Les phases de brassage n'ont peut-être pas de scores saisis.
                        </td>
                    </tr>
                `;
                rankingsMessage.textContent = "Saisissez les scores des matchs de brassage pour voir le classement.";
                phaseDetailsDisplay.innerHTML = '<p class="text-gray-500 text-center">Aucun détail par phase disponible car aucun score de brassage n\'est saisi.</p>';
                return;
            }

            // Render Global Rankings Table
            globalRankings.forEach((rankEntry, index) => {
                const row = document.createElement('tr');
                row.className = 'hover:bg-gray-50';
                row.innerHTML = `
                    <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${index + 1}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${escapeHtml(rankEntry.teamObject.name)}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${escapeHtml(rankEntry.totalPoints.toString())}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${escapeHtml(rankEntry.totalDiffScore.toString())}</td>
                `;
                rankingsTableBody.appendChild(row);
            });

            rankingsMessage.textContent = `${globalRankings.length} équipes classées.`;


            // Render Per-Phase Details
            const brassagePhasesWithScores = allBrassagePhases.filter(p => 
                (p.type === PHASE_TYPE_INITIAL || p.type === PHASE_TYPE_SECONDARY_BRASSAGE) && p.generated && p.pools && p.pools.some(pool => pool.matches && pool.matches.length > 0)
            ).sort((a,b) => a.timestamp - b.timestamp);

            if (brassagePhasesWithScores.length === 0) {
                 phaseDetailsDisplay.innerHTML = '<p class="text-gray-500 text-center">Aucun détail par phase disponible. Générez et terminez des phases de brassage.</p>';
            } else {
                brassagePhasesWithScores.forEach(phase => {
                    const phaseDiv = document.createElement('div');
                    phaseDiv.className = 'bg-white p-4 rounded-lg shadow-sm border border-gray-200';
                    phaseDiv.innerHTML = `
                        <h3 class="text-xl font-semibold text-gray-800 mb-3">${escapeHtml(phase.name)}</h3>
                        <div class="overflow-x-auto">
                            <table class="min-w-full divide-y divide-gray-200">
                                <thead class="bg-gray-50">
                                    <tr>
                                        <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider rounded-tl-lg">Nom de l'équipe</th>
                                        <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Points</th>
                                        <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider rounded-tr-lg">Diff. Score</th>
                                    </tr>
                                </thead>
                                <tbody class="bg-white divide-y divide-gray-200">
                                    <!-- Teams for this phase will be inserted here -->
                                </tbody>
                            </table>
                        </div>
                    `;
                    const tbody = phaseDiv.querySelector('tbody');

                    // Sort teams by points/diff within this specific phase for clarity
                    const teamsInThisPhaseRanked = [...globalRankings].map(entry => {
                        const phaseData = entry.detailsByPhase[phase.id] || { points: 0, diffScore: 0 };
                        return { teamObject: entry.teamObject, points: phaseData.points, diffScore: phaseData.diffScore };
                    }).sort((a, b) => {
                        if (b.points !== a.points) return b.points - a.points;
                        if (b.diffScore !== a.diffScore) return b.diffScore - a.diffScore;
                        return a.teamObject.name.localeCompare(b.teamObject.name);
                    });

                    teamsInThisPhaseRanked.forEach(teamEntry => {
                        const row = document.createElement('tr');
                        row.className = 'hover:bg-gray-50';
                        row.innerHTML = `
                            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${escapeHtml(teamEntry.teamObject.name)}</td>
                            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${escapeHtml(teamEntry.points.toString())}</td>
                            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${escapeHtml(teamEntry.diffScore.toString())}</td>
                        `;
                        tbody.appendChild(row);
                    });
                    phaseDetailsDisplay.appendChild(phaseDiv);
                });
            }
        }

        togglePhaseDetailsCheckbox.addEventListener('change', () => {
            if (togglePhaseDetailsCheckbox.checked) {
                phaseDetailsDisplay.classList.remove('hidden');
            } else {
                phaseDetailsDisplay.classList.add('hidden');
            }
        });

        renderRankings();
    }

    // --- Gestion du Routage SPA ---

    const routes = {
        '#home': renderHomePage,
        '#equipes': renderEquipesPage,
        '#brassages': renderBrassagesPage,
        '#eliminatoires': renderEliminatoiresPage,
        '#elimination-selection': renderEliminationSelectionPage, // Route pour la sélection des équipes éliminées
        '#classements': renderClassementsPage,
    };

    /**
     * Gère le changement de route en fonction du hash de l'URL.
     */
    function handleLocationHash() {
        let path = window.location.hash || '#home';
        const renderFunction = routes[path];
        if (renderFunction) {
            renderFunction();
            // Mettre à jour la classe "active" de la navigation
            document.querySelectorAll('.nav-link').forEach(link => {
                if (link.getAttribute('href') === path) {
                    link.classList.add('border-b-2', 'border-blue-200');
                } else {
                    link.classList.remove('border-b-2', 'border-blue-200');
                }
            });
        } else {
            console.warn(`Route inconnue: ${path}. Redirection vers l'accueil.`);
            window.location.hash = '#home';
        }
    }

    // --- Initialisation de l'Application ---
    document.addEventListener('DOMContentLoaded', () => {
        // La fonction loadAllData() est maintenant appelée par le script Firebase dans index.html
        // après que window.db et window.userId sont disponibles.
        // handleLocationHash() est également appelée par loadAllData().

        // Écouter les changements de hash dans l'URL pour le routage
        window.addEventListener('hashchange', handleLocationHash);

        // Attacher les gestionnaires d'événements pour les boutons de la modale globale
        // Assurez-vous que modalCancelBtn est bien référencé
        if (modalCancelBtn) {
            modalCancelBtn.addEventListener('click', hideModal);
        } else {
            console.error("modalCancelBtn non trouvé au chargement du DOM. La modale pourrait ne pas fonctionner correctement.");
        }

        // Ajout de la transparence à la barre de navigation lors du défilement
        const navBar = document.querySelector('nav');
        if (navBar) {
            let isScrolled = false;
            window.addEventListener('scroll', () => {
                if (window.scrollY > 0) {
                    if (!isScrolled) {
                        navBar.classList.add('bg-blue-700/70', 'transition-colors', 'duration-300'); // Plus transparent
                        navBar.classList.remove('bg-blue-700/90');
                        isScrolled = true;
                    }
                } else {
                    if (isScrolled) {
                        navBar.classList.remove('bg-blue-700/70');
                        navBar.classList.add('bg-blue-700/90'); // Moins transparent
                        isScrolled = false;
                    }
                }
            });
        }
    });

})();
