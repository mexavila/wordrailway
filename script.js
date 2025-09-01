// script.js (versión para servidor)

document.addEventListener('DOMContentLoaded', () => {
    const API_KEY = 'AIzaSyDu1CdA9mdrd04RujBHvj6NSuAjLkDnIp0'; // 👈 ¡IMPORTANTE!
    const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${API_KEY}`;
    const SERVER_API_URL = 'https://words-production-376a.up.railway.app/api';

    // ... (El resto de los selectores del DOM son los mismos) ...
    const evaluateButton = document.getElementById('evaluateButton');
    const textToEvaluate = document.getElementById('textToEvaluate');
    const resultsDiv = document.getElementById('results');
    const censoredTextSpan = document.getElementById('censoredText');
    const isValidSpan = document.getElementById('isValid');
    const profanityScoreSpan = document.getElementById('profanityScore');
    const viewReportButton = document.getElementById('viewReportButton');
    const reportContent = document.getElementById('reportContent');
    const reportModalBody = document.querySelector('#reportModal .modal-body');

    let blacklist = [];
    let whitelist = [];

    // --- LÓGICA DE LISTAS CONECTADA AL SERVIDOR ---

    const loadListsFromServer = async () => {
        try {
            const response = await fetch(`${SERVER_API_URL}/lists`);
            const data = await response.json();
            blacklist = data.blacklist || [];
            whitelist = data.whitelist || [];
            renderLists();
        } catch (error) {
            console.error("Error loading lists from server:", error);
            alert("Could not connect to the server to load lists.");
        }
    };

    const saveListsToServer = async () => {
        try {
            await fetch(`${SERVER_API_URL}/lists`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ blacklist, whitelist }),
            });
        } catch (error) {
            console.error("Error saving lists to server:", error);
            alert("Could not save lists to the server.");
        }
    };
    
    // El renderizado es visual, no necesita cambios
    const renderLists = () => {
        const blacklistUl = document.getElementById('blacklist');
        const whitelistUl = document.getElementById('whitelist');
        blacklistUl.innerHTML = '';
        whitelistUl.innerHTML = '';
        const createListItem = (word, listName) => `
            <li class="list-group-item d-flex justify-content-between align-items-center">
                ${word}
                <button class="btn btn-sm btn-outline-danger" onclick="window.app.deleteWord('${listName}', '${word}')">X</button>
            </li>`;
        blacklist.forEach(word => blacklistUl.innerHTML += createListItem(word, 'blacklist'));
        whitelist.forEach(word => whitelistUl.innerHTML += createListItem(word, 'whitelist'));
    };

    window.app = {
        addWord: (listName, inputId) => {
            const input = document.getElementById(inputId);
            const word = input.value.trim().toLowerCase();
            if (word) {
                const list = listName === 'blacklist' ? blacklist : whitelist;
                if (!list.includes(word)) {
                    list.push(word);
                    renderLists();
                    saveListsToServer(); // Guardar cambios en el servidor
                }
                input.value = '';
            }
        },
        deleteWord: (listName, wordToDelete) => {
            if (listName === 'blacklist') {
                blacklist = blacklist.filter(word => word !== wordToDelete);
            } else {
                whitelist = whitelist.filter(word => word !== wordToDelete);
            }
            renderLists();
            saveListsToServer(); // Guardar cambios en el servidor
        }
    };

    document.getElementById('addBlacklistWord').addEventListener('click', () => window.app.addWord('blacklist', 'newBlacklistWord'));
    document.getElementById('addWhitelistWord').addEventListener('click', () => window.app.addWord('whitelist', 'newWhitelistWord'));
    
    // --- LÓGICA DE LOG CONECTADA AL SERVIDOR ---

    const logEvaluationToServer = async (text, result) => {
        try {
            await fetch(`${SERVER_API_URL}/log`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text, result }),
            });
        } catch (error) {
            console.error("Error sending log to server:", error);
        }
    };

    const fetchAndShowReport = async () => {
        try {
            const response = await fetch(`${SERVER_API_URL}/log`);
            const reportText = await response.text();
			reportModalBody.style.whiteSpace = 'pre-wrap';
            reportModalBody.textContent = reportText;
        } catch (error) {
            console.error("Error fetching report:", error);
            reportModalBody.textContent = "Error loading report.";
        }
    };

    viewReportButton.addEventListener('click', fetchAndShowReport);
    
    // --- LÓGICA DE EVALUACIÓN CON LLM (SIN CAMBIOS GRANDES) ---
    const evaluateText = async () => {
        const text = textToEvaluate.value;
        if (!text.trim()) {
            alert('Please write something to evaluate.');
            return;
        }
        setLoading(true);
        const prompt = `
            You are a content moderation expert. Your task is to analyze the following text and determine its profanity level.
            You must follow these rules strictly:
            1.  **Blacklist**: If a word from the text is in the following list of forbidden words, the text is automatically invalid and must be censored. Blacklist: [${blacklist.join(', ')}]
            2.  **Whitelist**: If a word from the text is on this list, it is considered acceptable and should not be flagged as profanity, even if it seems offensive. Whitelist: [${whitelist.join(', ')}]
            3.  **Contextual Analysis**: If there are no blacklisted words, use your judgment to evaluate the text's intent and context.
            4.  **Scoring**: Assign a profanity score from 0 to 5:
                - 0: Totally acceptable and respectful.
                - 1: Slightly inappropriate or ambiguous.
                - 2: Clearly rude but low-impact (e.g., "silly", "dumb").
                - 3: Offensive and vulgar.
                - 4: Contains strong insults or blacklisted words.
                - 5: Hate speech, direct threats, or extremely toxic content.
            5.  **Censoring**: Replace each letter of the words you consider profane (especially those from the blacklist) with an asterisk (*).

            The text to analyze is: "${text}"

            Your response MUST be only a valid JSON object with the following structure, with no additional text before or after:
            {
              "isValid": boolean,
              "profanityScore": number,
              "censoredText": "string"
            }
        `;


        try {
            const response = await fetch(GEMINI_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
            });
            if (!response.ok) throw new Error(`API Error: ${response.statusText}`);
            const data = await response.json();
            let jsonString = data.candidates[0].content.parts[0].text;
            const startIndex = jsonString.indexOf('{');
            const endIndex = jsonString.lastIndexOf('}');
            if (startIndex !== -1 && endIndex !== -1) {
                jsonString = jsonString.substring(startIndex, endIndex + 1);
            }
            const result = JSON.parse(jsonString);
            displayResults(result);
            logEvaluationToServer(text, result); // ¡Aquí guardamos el log!
        } catch (error) {
            console.error('Evaluation Error:', error);
        } finally {
            setLoading(false);
        }
    };

    // ... (El resto de las funciones como displayResults, setLoading, etc., son las mismas de antes)
    const displayResults = (result) => {
        censoredTextSpan.innerHTML = result.censoredText;
        isValidSpan.textContent = result.isValid ? 'Yes 👍' : 'No 👎';
        isValidSpan.className = `badge ${result.isValid ? 'bg-success' : 'bg-danger'}`;
        profanityScoreSpan.textContent = result.profanityScore;
        let scoreColor = 'bg-success';
        if (result.profanityScore >= 2 && result.profanityScore < 4) scoreColor = 'bg-warning text-dark';
        if (result.profanityScore >= 4) scoreColor = 'bg-danger';
        profanityScoreSpan.className = `badge ${scoreColor}`;
        resultsDiv.style.display = 'block';
    };
    const setLoading = (isLoading) => {
        const buttonText = isLoading ? 'Evaluating...' : 'Evaluate Text';
        evaluateButton.disabled = isLoading;
        evaluateButton.innerHTML = isLoading ? `<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> ${buttonText}` : buttonText;
    };
    
    evaluateButton.addEventListener('click', evaluateText);
    loadListsFromServer(); // Cargar las listas al iniciar
});