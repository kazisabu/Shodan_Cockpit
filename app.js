/* SHODAN ULTIMATE COCKPIT - GOLD STANDARD LOGIC */
/* Version 2.0 | Secured & Optimized | Author: 0xN0X0N */

/**
 * CORE STATE
 */
let sessionData = {}; // Format: { facet: [ {name, value}, ... ] }
let currentFacet = null;
let scanActive = false;
let activeBaseQuery = ""; // Tracks the current target context for pivots
let facetChartInstance = null;
let renderOffset = 0;
const RENDER_BATCH_SIZE = 50;

const HIGH_VALUE_FACETS = [
    'ip', 'port', 'org', 'http.title', 'vuln', 'ssl.jarm',
    'http.favicon.hash', 'http.component', 'country', 'product', 'version'
];

/**
 * INITIALIZATION ENGINE
 */
document.addEventListener('DOMContentLoaded', () => {
    // Keyboard Shortcuts
    document.getElementById('target')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') executeScan();
    });


    // Elite Mouse Navigation for Tabs
    const facetTabs = document.getElementById('facet-tabs');
    if (facetTabs) {
        facetTabs.addEventListener('wheel', (evt) => {
            evt.preventDefault();
            facetTabs.scrollLeft += evt.deltaY;
        }, { passive: false });
    }

    // Load Last Session
    loadSession();

    // Initialize Overlay for mobile
    const overlay = document.createElement('div');
    overlay.className = "sidebar-overlay";
    overlay.id = "sidebar-overlay";
    overlay.onclick = toggleSidebar;
    document.body.appendChild(overlay);
});

function loadSession() {
    const saved = localStorage.getItem('shodan_last_session');
    if (saved) {
        try {
            const data = JSON.parse(saved);
            sessionData = data.sessionData || {};
            activeBaseQuery = data.activeBaseQuery || "";

            if (Object.keys(sessionData).length > 0) {
                document.getElementById('placeholder')?.classList.add('hidden');
                document.getElementById('facet-tabs').innerHTML = '';
                Object.keys(sessionData).forEach(facet => {
                    createTab(facet, sessionData[facet].length);
                });
                switchFacet(Object.keys(sessionData)[0]);
                log("Restored previous session data.", "CORE", "text-blue-400");
            }
        } catch (e) {
            localStorage.removeItem('shodan_last_session');
        }
    }
}

function saveSession() {
    localStorage.setItem('shodan_last_session', JSON.stringify({
        sessionData,
        activeBaseQuery
    }));
}

function wipeSession(confirmed = false) {
    if (!confirmed) return toggleWipeModal();

    localStorage.removeItem('shodan_last_session');
    sessionData = {};
    activeBaseQuery = "";
    currentFacet = null;

    document.getElementById('placeholder')?.classList.remove('hidden');
    document.getElementById('cards-container').innerHTML = '';
    document.getElementById('facet-tabs').innerHTML = '<div class="flex flex-col"><span class="text-[10px] text-gray-600 uppercase font-black tracking-[0.3em]">Standby</span><span class="text-[8px] text-gray-800 font-bold">NO_ACTIVE_SESSION</span></div>';
    document.getElementById('stat-results').innerText = "0000";
    document.getElementById('stat-targets').innerText = "00";
    document.getElementById('chart-section')?.classList.add('hidden');

    toggleWipeModal();
    log("Neural cache purged successfully.", "CORE", "text-red-400");
}





/**
 * UI CONTROLLER
 */
function log(msg, tags = "SYSTEM", color = "text-green-500/50") {

    const box = document.getElementById('console');
    if (!box) return;

    const entry = document.createElement('div');
    entry.className = `flex gap-2 animate-fade-in ${color}`;

    const tagSpan = document.createElement('span');
    tagSpan.className = "text-gray-800 shrink-0 font-bold";
    tagSpan.textContent = `[${tags}]`;

    const msgSpan = document.createElement('span');
    msgSpan.textContent = msg;

    entry.appendChild(tagSpan);
    entry.appendChild(msgSpan);
    box.appendChild(entry);
    box.scrollTop = box.scrollHeight;
}

function toggleChart() {
    const section = document.getElementById('chart-section');
    section?.classList.toggle('hidden');
}


function toggleWipeModal() {
    document.getElementById('wipe-modal')?.classList.toggle('hidden');
}



function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if (!sidebar || !overlay) return;

    sidebar.classList.toggle('sidebar-open');
    overlay.classList.toggle('active');
}


function clearLogs() {
    const console = document.getElementById('console');
    if (console) console.innerHTML = '<div class="text-gray-800">[LOGS_WIPED]</div>';
}

/**
 * STEALTH FETCH ENGINE
 */
async function fetchFacet(query, facet) {
    const targetUrl = `https://www.shodan.io/search/facet?query=${encodeURIComponent(query)}&facet=${facet}`;
    const defaultProxy = "https://plain-mouse-770d.youcant892.workers.dev/?url=";
    const proxyUrl = `${defaultProxy}${encodeURIComponent(targetUrl)}`;


    try {
        const res = await fetch(proxyUrl);
        if (!res.ok) throw new Error(`ENDPOINT_OFFLINE_${res.status}`);

        const html = await res.text();

        if (!html || html.includes('Rate limit reached')) throw new Error("THROTTLED_BY_PROVIDER");

        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const rows = doc.querySelectorAll('.facet-row');

        const results = [];
        rows.forEach(row => {
            const name = row.querySelector('.name')?.innerText.trim();
            const value = row.querySelector('.value')?.innerText.trim();
            if (name && value) results.push({ name, value });
        });

        return { success: true, results, facet, url: targetUrl };
    } catch (err) {
        return { success: false, error: err.message, facet };
    }
}

/**
 * MISSION CONTROLLER
 */
async function executeScan() {
    if (scanActive) return;
    const input = document.getElementById('target').value.trim();
    if (!input) return log("Target undefined. Input required.", "ERROR", "text-red-500");

    // Reset UI State
    sessionData = {};
    currentFacet = null;
    scanActive = true;

    // Close sidebar on mobile when scan starts
    if (window.innerWidth < 1024) {
        document.getElementById('sidebar')?.classList.remove('sidebar-open');
        document.getElementById('sidebar-overlay')?.classList.remove('active');
    }


    document.getElementById('placeholder')?.classList.add('hidden');
    document.getElementById('cards-container').innerHTML = '';
    document.getElementById('facet-tabs').innerHTML = '';
    document.getElementById('scan-btn').disabled = true;
    document.getElementById('scan-btn').innerText = "AUDITING...";

    // Context Detection
    let qtype = document.getElementById('type').value;
    let query = "";

    if (qtype === "query") {
        query = input; // Use raw input as the query
    } else {
        if (qtype === "auto") {
            if (/^(\d{1,3}\.){3}\d{1,3}(\/\d+)?$/.test(input)) qtype = "net";
            else if (input.includes('.') && input.split('.').length === 2) qtype = "domain";
            else qtype = "hostname";
        }
        query = qtype === "net" ? `net:${input}` : qtype === 'org' ? `org:"${input}"` : `${qtype}:"${input}"`;
    }

    activeBaseQuery = query; // Lock the base for pivots

    // Facet Selection
    let customFacetsInput = document.getElementById('custom-facets').value.trim();
    let facetsToProbe = customFacetsInput
        ? customFacetsInput.split(',').map(f => f.trim()).filter(f => f.length > 0)
        : HIGH_VALUE_FACETS;

    log(`Initializing audit: ${input}`, "MISSION", "text-white font-black");
    document.getElementById('stat-targets').innerText = "01";

    for (let i = 0; i < facetsToProbe.length; i++) {
        const facet = facetsToProbe[i];
        const progress = Math.round(((i + 1) / facetsToProbe.length) * 100);

        log(`Probing facet: ${facet}`, "SIGNAL");
        updateProgressBar(progress, facet);

        const result = await fetchFacet(query, facet);

        if (result.success && result.results.length > 0) {
            sessionData[facet] = result.results;
            createTab(facet, result.results.length);
            if (!currentFacet) switchFacet(facet); // Auto-display first finding
            saveSession();
        } else if (!result.success) {

            log(`Communication failure: ${result.error}`, "RETRY", "text-red-500/50");
        }

        // Anti-Detection Delay
        await new Promise(r => setTimeout(r, 1500 + Math.random() * 1000));
    }

    scanActive = false;
    document.getElementById('scan-btn').disabled = false;
    document.getElementById('scan-btn').innerText = "AUDIT_COMPLETE";
    updateProgressBar(0, "READY");
    log("Mission objective achieved. Data indexed.", "MISSION", "text-blue-500");
}

function updateProgressBar(percent, status) {
    const bar = document.getElementById('scan-progress-bar');
    const label = document.getElementById('scan-progress-label');
    if (bar) bar.style.width = `${percent}%`;
    if (label) label.innerText = `${status} ${percent}%`;
}


/**
 * NAVIGATION & DATA RENDERING
 */
function createTab(facet, count) {
    const tabs = document.getElementById('facet-tabs');
    if (!tabs) return;

    if (Object.keys(sessionData).length === 1) tabs.innerHTML = ''; // Wipe standby msg

    const btn = document.createElement('button');
    btn.id = `tab-${facet}`;
    btn.innerHTML = `${facet} <span class="text-red-600/80 ml-2 font-mono">${count}</span>`;
    btn.onclick = () => switchFacet(facet);
    tabs.appendChild(btn);

    // Update Global Counter
    let total = 0;
    Object.values(sessionData).forEach(arr => total += arr.length);
    document.getElementById('stat-results').innerText = total.toString().padStart(4, '0');
}

function switchFacet(facet) {
    currentFacet = facet;
    renderOffset = 0;

    // UI Feedback
    document.querySelectorAll('#facet-tabs button').forEach(b => b.classList.remove('tab-active'));
    document.getElementById(`tab-${facet}`)?.classList.add('tab-active');

    updateChart(sessionData[facet]);
    renderResults(sessionData[facet], "", false);
}


function updateChart(data) {
    const ctx = document.getElementById('facetChart');
    if (!ctx || data.length === 0) return;

    document.getElementById('chart-section')?.classList.remove('hidden');

    const topData = data.slice(0, 10);
    const labels = topData.map(d => d.name.length > 20 ? d.name.substring(0, 17) + '...' : d.name);
    const values = topData.map(d => parseInt(d.value.replace(/,/g, '')));

    if (facetChartInstance) {
        facetChartInstance.destroy();
    }

    facetChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Global Hits',
                data: values,
                backgroundColor: 'rgba(220, 38, 38, 0.4)',
                borderColor: 'rgba(220, 38, 38, 1)',
                borderWidth: 1,
                borderRadius: 8,
                barThickness: 20
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#666', font: { size: 9, family: 'JetBrains Mono' } }
                },
                y: {
                    grid: { display: false },
                    ticks: { color: '#fff', font: { size: 10, family: 'Outfit', weight: 'bold' } }
                }
            }
        }
    });
}


function sortResults(type) {
    if (!currentFacet || !sessionData[currentFacet]) return;

    const data = [...sessionData[currentFacet]];
    if (type === 'hits') {
        data.sort((a, b) => parseInt(b.value.replace(/,/g, '')) - parseInt(a.value.replace(/,/g, '')));
    } else if (type === 'alpha') {
        data.sort((a, b) => a.name.localeCompare(b.name));
    }

    renderResults(data);
}


function renderResults(data, filterTerm = "", append = false) {
    const container = document.getElementById('cards-container');
    if (!container) return;

    if (!append) {
        container.innerHTML = "";
        renderOffset = 0;
    }

    const filtered = filterTerm
        ? data.filter(i => i.name.toLowerCase().includes(filterTerm.toLowerCase()))
        : data;

    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="col-span-full py-32 text-center animate-fade-in opacity-30">
                <span class="text-[10px] font-black uppercase tracking-[0.5em]">No findings matching filter criteria</span>
            </div>
        `;
        return;
    }

    const batch = filtered.slice(renderOffset, renderOffset + RENDER_BATCH_SIZE);

    // Remove existing 'Load More' button if present
    document.getElementById('load-more-btn')?.remove();

    batch.forEach(item => {
        const card = document.createElement('div');
        card.className = "result-card glass group animate-fade-in";

        const pivotQuery = `${activeBaseQuery} ${currentFacet}:"${item.name}"`;
        const pivotUrl = `https://www.shodan.io/search?query=${encodeURIComponent(pivotQuery)}`;

        card.onclick = () => window.open(pivotUrl, '_blank');

        card.innerHTML = `
            <div class="flex justify-between items-start mb-4">
                <div class="flex flex-col">
                    <span class="text-[8px] font-black text-gray-700 uppercase tracking-widest leading-none mb-1">${currentFacet}</span>
                    <span class="text-[7px] text-green-600/50 font-bold tracking-tighter">DATA_INDEX_STABLE</span>
                </div>
                <div class="w-8 h-[1px] bg-red-600/20 group-hover:w-full transition-all duration-700"></div>
            </div>
            <div class="text-sm font-black text-white mb-8 break-all select-all leading-tight tracking-tight group-hover:text-red-500 transition-colors" title="${item.name}">
                ${item.name}
            </div>
            <div class="mt-auto pt-4 border-t border-white/5 flex justify-between items-end">
                <div class="flex flex-col gap-1">
                    <span class="text-[7px] text-gray-600 font-bold uppercase tracking-widest">Global Density</span>
                    <span class="text-white font-mono text-xs font-black">${item.value}</span>
                </div>
                <div class="flex flex-col items-end gap-1">
                    <span class="text-[7px] text-gray-600 font-bold uppercase tracking-widest">Pivot Ready</span>
                    <div class="w-4 h-4 rounded-md border border-red-600/20 flex items-center justify-center group-hover:bg-red-600 group-hover:border-red-600 transition-all">
                        <svg class="w-3 h-3 text-red-600 group-hover:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path>
                        </svg>
                    </div>
                </div>
            </div>
        `;
        container.appendChild(card);
    });

    renderOffset += batch.length;

    if (renderOffset < filtered.length) {
        const btn = document.createElement('button');
        btn.id = 'load-more-btn';
        btn.className = "col-span-full mt-10 p-6 glass rounded-2xl text-center text-[10px] text-white hover:bg-red-600 transition-all uppercase font-black tracking-[0.2em]";
        btn.textContent = `Load More Findings (${filtered.length - renderOffset} remaining)`;
        btn.onclick = () => renderResults(data, filterTerm, true);
        container.appendChild(btn);
    }
}


function filterResults() {
    if (!currentFacet || !sessionData[currentFacet]) return;
    const term = document.getElementById('result-filter').value;
    renderResults(sessionData[currentFacet], term);
}

/**
 * EXFILTRATION HUB
 */
function downloadReport(format = 'json') {
    if (Object.keys(sessionData).length === 0) return alert("Archive empty. Mission data required.");

    let content, type, ext;
    if (format === 'json') {
        content = JSON.stringify(sessionData, null, 2);
        type = 'application/json';
        ext = 'json';
    } else {
        let csv = "FACET,ENTITY,HITS\n";
        Object.keys(sessionData).forEach(f => {
            sessionData[f].forEach(row => {
                csv += `"${f}","${row.name.replace(/"/g, '""')}","${row.value}"\n`;
            });
        });
        content = csv;
        type = 'text/csv';
        ext = 'csv';
    }

    const blob = new Blob([content], { type: type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `shodan_audit_${Date.now()}.${ext}`;
    a.click();
}
