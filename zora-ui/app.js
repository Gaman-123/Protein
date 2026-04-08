const API_BASE = 'http://localhost:8000';
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const runBtn = document.getElementById('run-btn');
const consoleOutput = document.getElementById('console-output');
const resultsContent = document.getElementById('results-content');
const runIdDisplay = document.getElementById('run-id-display');
const backendStatus = document.getElementById('backend-status');
const pipelineStatus = document.getElementById('pipeline-status');

// --- Backend Health Check ---
async function checkBackend() {
    try {
        const res = await fetch(`${API_BASE}/health`);
        const data = await res.json();
        if (data.status === 'ok') {
            backendStatus.textContent = 'ONLINE';
            backendStatus.style.color = '#10b981';
        }
    } catch (e) {
        backendStatus.textContent = 'OFFLINE';
        backendStatus.style.color = '#ef4444';
    }
}
setInterval(checkBackend, 5000);
checkBackend();

// --- Drag & Drop Handlers ---
dropZone.onclick = () => fileInput.click();
dropZone.ondragover = (e) => { e.preventDefault(); dropZone.classList.add('active'); };
dropZone.ondragleave = () => dropZone.classList.remove('active');
dropZone.ondrop = (e) => {
    e.preventDefault();
    dropZone.classList.remove('active');
    fileInput.files = e.dataTransfer.files;
    updateDropZoneText();
};
fileInput.onchange = () => updateDropZoneText();

function updateDropZoneText() {
    if (fileInput.files.length > 0) {
        dropZone.querySelector('p').textContent = `File selected: ${fileInput.files[0].name}`;
    }
}

// --- Console Log Helper ---
function logToConsole(message, type = 'system') {
    const line = document.createElement('div');
    line.className = `console-line ${type}`;
    const timestamp = new Date().toLocaleTimeString([], { hour12: false });
    line.textContent = `[${timestamp}] ${message}`;
    consoleOutput.appendChild(line);
    consoleOutput.scrollTop = consoleOutput.scrollHeight;
}

// --- SSE Handling ---
function connectSSE(runId) {
    logToConsole(`Connecting to data stream for ${runId}...`, 'system');
    const eventSource = new EventSource(`${API_BASE}/run/${runId}/stream`);

    eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        console.log('SSE:', data);

        if (data.type === 'agent_update') {
            const agentName = data.agent.replace('zora_', '').toUpperCase();
            logToConsole(`${agentName}: ${data.output_summary}`, 'agent');
            pipelineStatus.textContent = agentName;
        } else if (data.type === 'error') {
            logToConsole(`ERROR: ${data.error_message}`, 'error');
            pipelineStatus.textContent = 'FAILED';
            eventSource.close();
        } else if (data.type === 'pipeline_complete') {
            logToConsole('PIPELINE COMPLETE.', 'success');
            pipelineStatus.textContent = 'COMPLETED';
            eventSource.close();
            fetchResults(runId);
        }
    };

    eventSource.onerror = (e) => {
        console.error('SSE Error:', e);
        eventSource.close();
    };
}

// --- Fetch Results ---
async function fetchResults(runId) {
    try {
        const res = await fetch(`${API_BASE}/api/run/${runId}/status`);
        const data = await res.json();
        // The narrator stores the final summary in synthesis or similar fields depending on backend logic
        // For simplicity, we just display the final state
        resultsContent.innerHTML = `
            <div class="result-box">
                <p><strong>Status:</strong> ${data.status}</p>
                <p><strong>Analysis Summary:</strong> Check backend console for full narration (TTS enabled in config).</p>
                <p><em>Real-time visualization coming soon.</em></p>
            </div>
        `;
    } catch (e) {
        logToConsole(`Failed to fetch final results: ${e.message}`, 'error');
    }
}

// --- Run Pipeline ---
runBtn.onclick = async () => {
    if (fileInput.files.length === 0) {
        alert('Please select a file first.');
        return;
    }

    runBtn.disabled = true;
    runBtn.textContent = 'Initializing...';
    consoleOutput.innerHTML = '';
    resultsContent.innerHTML = '<div class="empty-state">Processing...</div>';
    logToConsole('Starting Zora Intelligence Pipeline...', 'system');

    const formData = new FormData();
    formData.append('file', fileInput.files[0]);
    formData.append('target_column', document.getElementById('target-column').value);

    try {
        const response = await fetch(`${API_BASE}/api/run`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        const result = await response.json();
        runIdDisplay.textContent = `Run ID: ${result.run_id}`;
        logToConsole(`Run queued successfully. ID: ${result.run_id}`, 'success');
        
        connectSSE(result.run_id);
    } catch (e) {
        logToConsole(`Failed to start run: ${e.message}`, 'error');
        runBtn.disabled = false;
        runBtn.textContent = 'Initialize Pipeline';
    }
};
