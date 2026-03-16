/* SHODAN ULTIMATE COCKPIT - GOLD STANDARD LOGIC */
/* Version 2.0 | Secured & Optimized | Author: 0xN0X0N */

/**
 * CORE STATE
 */
let sessionData = {}; // Format: { facet: [ {name, value}, ... ] }
let currentFacet = null;
let scanActive = false;
let activeBaseQuery = ""; // Tracks the current target context for pivots
const HIGH_VALUE_FACETS = [
    'ip', 'port', 'org', 'http.title', 'vuln', 'ssl.jarm',
    'http.favicon.hash', 'http.component', 'country', 'product', 'version'
];

const CONFIG = {
    webhook: localStorage.getItem('shodan_webhook') || "",
    customProxy: localStorage.getItem('shodan_custom_proxy') || "https://plain-mouse-770d.youcant892.workers.dev/?url=",
};

/**
 * INITIALIZATION ENGINE
 */
document.addEventListener('DOMContentLoaded', () => {
    // Sync UI with config
    const elements = {
        'pref-webhook': CONFIG.webhook,
        'pref-custom-proxy': CONFIG.customProxy
    };

    Object.keys(elements).forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = elements[id];
    });

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
});

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

function toggleSettings() {
    document.getElementById('settings-modal')?.classList.toggle('hidden');
}

function saveSettings() {
    const wh = document.getElementById('pref-webhook').value;
    const cp = document.getElementById('pref-custom-proxy').value;

    localStorage.setItem('shodan_webhook', wh);
    localStorage.setItem('shodan_custom_proxy', cp);

    CONFIG.webhook = wh;
    CONFIG.customProxy = cp;

    toggleSettings();
    log("Neural parameters synchronized.", "CORE", "text-blue-400");
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

    // Mission Logic: Exclusively use private Cloudflare Relay for maximum stealth
    if (!CONFIG.customProxy) throw new Error("RELAY_ENDPOINT_UNDEFINED");
    const proxyUrl = `${CONFIG.customProxy}${encodeURIComponent(targetUrl)}`;

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

    for (const facet of facetsToProbe) {
        log(`Probing facet: ${facet}`, "SIGNAL");
        const result = await fetchFacet(query, facet);

        if (result.success && result.results.length > 0) {
            sessionData[facet] = result.results;
            createTab(facet, result.results.length);
            if (!currentFacet) switchFacet(facet); // Auto-display first finding

            // Notification Sync
            if (CONFIG.webhook) sendWebhook(input, facet, result.results[0].name, result.results.length);
        } else if (!result.success) {
            log(`Communication failure: ${result.error}`, "RETRY", "text-red-500/50");
        }

        // Anti-Detection Delay
        await new Promise(r => setTimeout(r, 2000 + Math.random() * 1500));
    }

    scanActive = false;
    document.getElementById('scan-btn').disabled = false;
    document.getElementById('scan-btn').innerText = "AUDIT_COMPLETE";
    log("Mission objective achieved. Data indexed.", "MISSION", "text-blue-500");
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

    // UI Feedback
    document.querySelectorAll('#facet-tabs button').forEach(b => b.classList.remove('tab-active'));
    document.getElementById(`tab-${facet}`)?.classList.add('tab-active');

    renderResults(sessionData[facet]);
}

function renderResults(data, filterTerm = "") {
    const container = document.getElementById('cards-container');
    if (!container) return;

    container.innerHTML = ""; // Hard wipe

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

    // Limit display for performance
    const renderLimit = 200;
    const batch = filtered.slice(0, renderLimit);

    batch.forEach(item => {
        const card = document.createElement('div');
        card.className = "result-card glass group animate-fade-in";

        // Context-Aware Pivot Logic: Combined base query with the specific facet item
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

    if (filtered.length > renderLimit) {
        const banner = document.createElement('div');
        banner.className = "col-span-full mt-10 p-6 glass rounded-2xl text-center text-[10px] text-gray-600 uppercase font-black tracking-[0.2em]";
        banner.textContent = `+ ${filtered.length - renderLimit} results truncated for stream stability`;
        container.appendChild(banner);
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

async function sendWebhook(target, facet, topHit, count) {
    const payload = {
        embeds: [{
            title: "🎯 Shodan Cockpit Finder",
            color: 15548997,
            fields: [
                { name: "Target", value: `\`${target}\``, inline: true },
                { name: "Facet", value: `\`${facet}\``, inline: true },
                { name: "Findings", value: `\`${count}\``, inline: true },
                { name: "Principal Hit", value: `\`${topHit}\`` }
            ],
            footer: { text: "QUANTA / 0xN0X0N Stealth Audit" },
            timestamp: new Date().toISOString()
        }]
    };
    try {
        await fetch(CONFIG.webhook, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
    } catch (e) { }
}
