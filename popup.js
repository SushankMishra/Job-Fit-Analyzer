/**
 * popup.js
 * ─────────────────────────────────────────────────────────────────────────
 * Main UI controller for the Agentic Job-Fit Analyzer popup.
 * Responsibilities:
 *   • Theme toggle (light/dark) with persistence via chrome.storage
 *   • Tab navigation
 *   • File upload handling (drag-and-drop + click)
 *   • Page scraping via content.js message
 *   • Delegating the agent run to AgentController
 *   • Listening to agent events and updating UI (chain log, progress steps)
 *   • Populating the Results tab from final agent output
 *   • API key management (save/test) in Settings tab
 *   • Download button wiring
 * ─────────────────────────────────────────────────────────────────────────
 */

'use strict';

// ── DOM References ────────────────────────────────────────────────────────

const themeToggle     = document.getElementById('theme-toggle');
const themeIcon       = document.getElementById('theme-icon');
const tabBtns         = document.querySelectorAll('.tab-btn');
const tabPanels       = document.querySelectorAll('.tab-panel');

const resumeDropZone  = document.getElementById('resume-drop-zone');
const resumeFileInput = document.getElementById('resume-file-input');
const fileBadge       = document.getElementById('file-badge-container');
const resumeTextarea  = document.getElementById('resume-text');
const jobTextarea     = document.getElementById('job-description');
const scrapePageBtn   = document.getElementById('scrape-page-btn');
const runAgentBtn     = document.getElementById('run-agent-btn');
const runBtnIcon      = document.getElementById('run-btn-icon');
const runBtnText      = document.getElementById('run-btn-text');

const chainEmpty      = document.getElementById('chain-empty');
const reasoningChain  = document.getElementById('reasoning-chain');
const runningIndicator= document.getElementById('running-indicator');
const runningStatusTxt= document.getElementById('running-status-text');

const resultsEmpty    = document.getElementById('results-empty');
const resultsContent  = document.getElementById('results-content');

const scoreCircle     = document.getElementById('score-circle');
const scoreValue      = document.getElementById('score-value');
const scoreLabel      = document.getElementById('score-label');
const matchedGrid     = document.getElementById('matched-skills-grid');
const missingGrid     = document.getElementById('missing-skills-grid');
const resourcesList   = document.getElementById('resources-list');
const priorityGrid    = document.getElementById('priority-skills-grid');
const planStepsList   = document.getElementById('plan-steps-list');
const downloadBanner  = document.getElementById('download-banner');
const downloadPlanBtn = document.getElementById('download-plan-btn');

const geminiKeyInput  = document.getElementById('gemini-api-key');
const saveGeminiBtn   = document.getElementById('save-gemini-key');
const testGeminiBtn   = document.getElementById('test-gemini-btn');
const geminiDot       = document.getElementById('gemini-dot');
const geminiStatusTxt = document.getElementById('gemini-status-text');

const ytKeyInput      = document.getElementById('youtube-api-key');
const saveYtBtn       = document.getElementById('save-youtube-key');
const testYtBtn       = document.getElementById('test-youtube-btn');
const ytDot           = document.getElementById('youtube-dot');
const ytStatusTxt     = document.getElementById('youtube-status-text');

const maxSkillsInput  = document.getElementById('max-skills-search');
const saveSettingsBtn = document.getElementById('save-agent-settings');
const toastContainer  = document.getElementById('toast-container');

const progressSteps   = document.querySelectorAll('.progress-step');

// ── State ─────────────────────────────────────────────────────────────────

let agentRunning   = false;
let lastPlanExport = null; // Holds { plan, priority_skills, match_score } for download

// ── Theme Management ──────────────────────────────────────────────────────

function applyTheme(dark) {
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  themeIcon.textContent = dark ? '🌙' : '☀️';
  themeToggle.checked   = dark;
}

function loadTheme() {
  chrome.storage.local.get(['theme'], (res) => {
    const dark = (res.theme === 'dark');
    applyTheme(dark);
  });
}

themeToggle.addEventListener('change', () => {
  const dark = themeToggle.checked;
  applyTheme(dark);
  chrome.storage.local.set({ theme: dark ? 'dark' : 'light' });
});

// ── Tab Navigation ────────────────────────────────────────────────────────

tabBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    tabBtns.forEach(b => b.classList.remove('active'));
    tabPanels.forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.tab).classList.add('active');
  });
});

function switchToTab(tabId) {
  tabBtns.forEach(b => b.classList.remove('active'));
  tabPanels.forEach(p => p.classList.remove('active'));
  const btn = document.querySelector(`[data-tab="${tabId}"]`);
  if (btn) btn.classList.add('active');
  const panel = document.getElementById(tabId);
  if (panel) panel.classList.add('active');
}

// ── File Upload ───────────────────────────────────────────────────────────

resumeDropZone.addEventListener('click', () => resumeFileInput.click());

resumeDropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  resumeDropZone.classList.add('drag-over');
});
resumeDropZone.addEventListener('dragleave', () => resumeDropZone.classList.remove('drag-over'));
resumeDropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  resumeDropZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) handleFileUpload(file);
});

resumeFileInput.addEventListener('change', () => {
  const file = resumeFileInput.files[0];
  if (file) handleFileUpload(file);
});

function handleFileUpload(file) {
  if (file.size > 5 * 1024 * 1024) {
    showToast('File too large (max 5 MB)', 'error');
    return;
  }

  const isPdf = file.name.toLowerCase().endsWith('.pdf');

  // Show loading state immediately
  fileBadge.innerHTML = `<div class="file-badge" style="background:var(--tag-bg);color:var(--tag-text);">
    ⏳ ${isPdf ? 'Parsing PDF…' : 'Reading…'} ${file.name}
  </div>`;
  resumeDropZone.style.opacity = '0.7';

  FileParserUtil.readFileAsText(file)
    .then(text => {
      resumeDropZone.style.opacity = '1';

      if (!text || text.trim().length < 30) {
        fileBadge.innerHTML = `<div class="file-badge" style="background:var(--tag-missing-bg);color:var(--tag-missing-text);">
          ⚠️ No text found — please paste manually
        </div>`;
        showToast('Could not extract text from file. Paste it manually.', 'info');
        return;
      }

      resumeTextarea.value = text;
      fileBadge.innerHTML = `<div class="file-badge">✅ ${file.name} (${text.trim().split(/\s+/).length} words)</div>`;
      showToast(`Loaded: ${file.name}`, 'success');
    })
    .catch(err => {
      resumeDropZone.style.opacity = '1';
      fileBadge.innerHTML = `<div class="file-badge" style="background:var(--tag-missing-bg);color:var(--tag-missing-text);">❌ Parse error</div>`;
      showToast('Could not read file: ' + err.message, 'error');
      console.error('[FileUpload] Error:', err);
    });
}

// ── Page Scraping ─────────────────────────────────────────────────────────

scrapePageBtn.addEventListener('click', async () => {
  scrapePageBtn.textContent = '⏳ Scraping...';
  scrapePageBtn.disabled = true;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const response = await chrome.tabs.sendMessage(tab.id, { action: 'scrapeJobDescription' });
    if (response && response.text) {
      jobTextarea.value = response.text.trim();
      showToast('Job description scraped!', 'success');
    } else {
      showToast('No job description found on page.', 'info');
    }
  } catch (err) {
    showToast('Scraping failed: ' + err.message, 'error');
  } finally {
    scrapePageBtn.textContent = '🌐 Auto-scrape from current tab';
    scrapePageBtn.disabled = false;
  }
});

// ── Agent Run ─────────────────────────────────────────────────────────────

runAgentBtn.addEventListener('click', async () => {
  if (agentRunning) return;

  const resumeText = resumeTextarea.value.trim();
  const jobText    = jobTextarea.value.trim();

  if (!resumeText) { showToast('Please provide your resume text.', 'error'); return; }
  if (!jobText)    { showToast('Please provide a job description.', 'error'); return; }

  // Get API keys from storage
  chrome.storage.local.get(['geminiKey', 'youtubeKey', 'maxSkills'], async (cfg) => {
    if (!cfg.geminiKey) {
      showToast('Gemini API key required. Go to Config tab.', 'error');
      switchToTab('settings-tab');
      return;
    }

    setRunning(true);
    clearResults();
    resetProgressSteps();
    clearChainLog();
    switchToTab('agent-tab');

    const maxSkills = parseInt(cfg.maxSkills || '5', 10);

    try {
      await AgentController.run({
        resumeText,
        jobText,
        geminiKey : cfg.geminiKey,
        youtubeKey: cfg.youtubeKey || '',
        maxSkills,
        onStep    : handleAgentStep,
        onProgress: handleAgentProgress,
        onComplete: handleAgentComplete,
        onError   : handleAgentError,
      });
    } catch (err) {
      handleAgentError(err);
    }
  });
});

function setRunning(running) {
  agentRunning = running;
  runAgentBtn.disabled = running;
  runBtnIcon.textContent = running ? '' : '🚀';
  runBtnText.textContent = running ? 'Agent Running...' : 'Analyze with AI Agent';
  if (running) {
    const spinner = document.createElement('div');
    spinner.className = 'btn-spinner';
    spinner.id = 'run-spinner';
    runBtnIcon.replaceWith(spinner);
  } else {
    const spinner = document.getElementById('run-spinner');
    if (spinner) spinner.replaceWith(runBtnIcon);
    runBtnIcon.textContent = '🚀';
  }
  runningIndicator.style.display = running ? 'flex' : 'none';
}

// ── Agent Event Handlers ──────────────────────────────────────────────────

/**
 * Called for every reasoning chain step.
 * type: 'thinking' | 'tool-call' | 'tool-result' | 'error' | 'final'
 */
function handleAgentStep({ type, title, description, data, timestamp }) {
  chainEmpty.style.display = 'none';
  reasoningChain.style.display = 'flex';

  const entry = document.createElement('div');
  entry.className = 'chain-entry';

  const ICONS = {
    thinking    : '💭',
    'tool-call' : '🔧',
    'tool-result': '✅',
    error       : '❌',
    final       : '🎉',
  };

  const hasData = data && Object.keys(data).length > 0;
  const toggleId = `toggle-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const blockId  = `block-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  entry.innerHTML = `
    <div class="chain-line"></div>
    <div class="chain-dot ${type}">${ICONS[type] || '•'}</div>
    <div class="chain-content">
      <div class="chain-header">
        <span class="chain-title">${escapeHtml(title)}</span>
        <span class="chain-time">${formatTime(timestamp)}</span>
      </div>
      <div class="chain-desc">${escapeHtml(description)}</div>
      ${hasData ? `
        <button class="collapsible-toggle" id="${toggleId}">
          <span class="collapsible-arrow">▶</span> View Data
        </button>
        <div class="json-block" id="${blockId}">
          <pre>${syntaxHighlightJson(data)}</pre>
        </div>
      ` : ''}
    </div>
  `;

  reasoningChain.appendChild(entry);

  if (hasData) {
    const toggleBtn = document.getElementById(toggleId);
    const jsonBlock = document.getElementById(blockId);
    toggleBtn.addEventListener('click', () => {
      const isOpen = jsonBlock.classList.toggle('open');
      toggleBtn.classList.toggle('open', isOpen);
      toggleBtn.querySelector('.collapsible-arrow').textContent = isOpen ? '▼' : '▶';
    });
  }

  // Auto-scroll chain
  entry.scrollIntoView({ behavior: 'smooth', block: 'end' });
}

function handleAgentProgress({ stepIndex, status, statusText }) {
  runningStatusTxt.textContent = statusText || 'Processing...';
  progressSteps.forEach((el, i) => {
    el.classList.remove('active', 'done');
    if (i < stepIndex) el.classList.add('done');
    else if (i === stepIndex) el.classList.add('active');
  });
  // Mark done dots with checkmark
  progressSteps.forEach((el, i) => {
    const dot = el.querySelector('.step-dot');
    if (el.classList.contains('done')) {
      dot.textContent = '✓';
    } else if (!el.classList.contains('active')) {
      dot.textContent = String(i + 1);
    }
  });
}

function handleAgentComplete({ matchResult, resources, plan, exportData }) {
  setRunning(false);
  runningStatusTxt.textContent = 'Complete!';

  // Mark all steps done
  progressSteps.forEach(el => {
    el.classList.remove('active');
    el.classList.add('done');
    el.querySelector('.step-dot').textContent = '✓';
  });

  lastPlanExport = exportData;
  populateResults(matchResult, resources, plan);
  showToast('Analysis complete! 🎉', 'success');

  // Auto-switch to results tab after short delay
  setTimeout(() => switchToTab('results-tab'), 600);
}

function handleAgentError(err) {
  setRunning(false);
  runningStatusTxt.textContent = 'Error occurred';
  handleAgentStep({
    type       : 'error',
    title      : 'Agent Error',
    description: err.message || String(err),
    data       : { error: err.message, stack: err.stack },
    timestamp  : Date.now(),
  });
  showToast('Agent failed: ' + (err.message || 'Unknown error'), 'error');
}

// ── Populate Results Tab ─────────────────────────────────────────────────

function populateResults(matchResult, resources, plan) {
  resultsEmpty.style.display  = 'none';
  resultsContent.style.display = 'block';
  downloadBanner.style.display = 'flex';

  // Score
  const score = matchResult.match_score || 0;
  const pct   = `${score}%`;
  scoreCircle.style.setProperty('--score-pct', pct);
  scoreValue.textContent = pct;
  scoreLabel.textContent = scoreDescription(score);

  // Matched skills
  matchedGrid.innerHTML = '';
  (matchResult.matched || []).forEach(skill => {
    matchedGrid.innerHTML += `<span class="skill-tag matched">✅ ${escapeHtml(skill)}</span>`;
  });
  if (!matchResult.matched?.length) matchedGrid.innerHTML = `<span class="text-muted">No matched skills found.</span>`;

  // Missing skills
  missingGrid.innerHTML = '';
  (matchResult.missing || []).forEach(skill => {
    missingGrid.innerHTML += `<span class="skill-tag missing">⚠️ ${escapeHtml(skill)}</span>`;
  });
  if (!matchResult.missing?.length) missingGrid.innerHTML = `<span class="text-muted">No missing skills — great fit!</span>`;

  // Resources
  resourcesList.innerHTML = '';
  const resourceEntries = Object.entries(resources || {});
  if (resourceEntries.length === 0) {
    resourcesList.innerHTML = `<span class="text-muted">No resources fetched (YouTube API key may not be configured).</span>`;
  } else {
    resourceEntries.forEach(([skill, videos]) => {
      (videos || []).forEach(vid => {
        resourcesList.innerHTML += `
          <div class="resource-item">
            <div class="resource-icon">▶</div>
            <div class="resource-meta">
              <div class="resource-skill">${escapeHtml(skill)}</div>
              <div class="resource-title">${escapeHtml(vid.title)}</div>
              <a class="resource-link" href="${escapeHtml(vid.url)}" target="_blank">🔗 Watch on YouTube</a>
            </div>
          </div>
        `;
      });
    });
  }

  // Priority skills
  priorityGrid.innerHTML = '';
  (plan.priority_skills || []).forEach((skill, i) => {
    const cls = i === 0 ? 'high' : i < 3 ? 'medium' : 'low';
    priorityGrid.innerHTML += `<span class="priority-badge ${cls}">🔥 ${escapeHtml(skill)}</span>`;
  });

  // Plan steps
  planStepsList.innerHTML = '';
  (plan.plan || []).forEach((step, i) => {
    planStepsList.innerHTML += `
      <div class="plan-item">
        <div class="plan-number">${i + 1}</div>
        <div class="plan-text">${escapeHtml(step)}</div>
      </div>
    `;
  });
}

function scoreDescription(score) {
  if (score >= 80) return '🟢 Excellent match!';
  if (score >= 60) return '🟡 Good match — some gaps';
  if (score >= 40) return '🟠 Moderate match — work needed';
  return '🔴 Low match — significant gaps';
}

// ── Download Plan ─────────────────────────────────────────────────────────

downloadPlanBtn.addEventListener('click', () => {
  if (!lastPlanExport) {
    showToast('No plan to download yet.', 'info');
    return;
  }
  const content = ExportPlan.formatAsText(lastPlanExport);
  DownloadHelper.downloadText(content, 'job-fit-improvement-plan.txt');
  showToast('Plan downloaded!', 'success');
});

// ── API Key Management ─────────────────────────────────────────────────────

function saveKey(storageKey, value, dotEl, statusEl, label) {
  if (!value.trim()) { showToast('Key cannot be empty', 'error'); return; }
  chrome.storage.local.set({ [storageKey]: value.trim() }, () => {
    showToast(`${label} key saved!`, 'success');
    updateKeyStatus(dotEl, statusEl, 'saved');
  });
}

function updateKeyStatus(dot, statusTxt, state) {
  dot.className = 'api-status-dot';
  if (state === 'saved') {
    dot.classList.add('ok');
    statusTxt.textContent = 'Key saved';
  } else if (state === 'ok') {
    dot.classList.add('ok');
    statusTxt.textContent = 'Verified ✓';
  } else if (state === 'error') {
    dot.classList.add('error');
    statusTxt.textContent = 'Invalid key';
  } else if (state === 'checking') {
    dot.classList.add('checking');
    statusTxt.textContent = 'Testing...';
  } else {
    statusTxt.textContent = 'Not configured';
  }
}

saveGeminiBtn.addEventListener('click', () => saveKey('geminiKey', geminiKeyInput.value, geminiDot, geminiStatusTxt, 'Gemini'));
saveYtBtn.addEventListener('click',     () => saveKey('youtubeKey', ytKeyInput.value, ytDot, ytStatusTxt, 'YouTube'));

testGeminiBtn.addEventListener('click', async () => {
  const key = geminiKeyInput.value.trim();
  if (!key) { showToast('Enter a key first', 'error'); return; }
  updateKeyStatus(geminiDot, geminiStatusTxt, 'checking');
  try {
    await ApiClient.testGemini(key);
    updateKeyStatus(geminiDot, geminiStatusTxt, 'ok');
    showToast('Gemini API key valid!', 'success');
  } catch (e) {
    updateKeyStatus(geminiDot, geminiStatusTxt, 'error');
    showToast('Gemini test failed: ' + e.message, 'error');
  }
});

testYtBtn.addEventListener('click', async () => {
  const key = ytKeyInput.value.trim();
  if (!key) { showToast('Enter a key first', 'error'); return; }
  updateKeyStatus(ytDot, ytStatusTxt, 'checking');
  try {
    await ApiClient.testYouTube(key);
    updateKeyStatus(ytDot, ytStatusTxt, 'ok');
    showToast('YouTube API key valid!', 'success');
  } catch (e) {
    updateKeyStatus(ytDot, ytStatusTxt, 'error');
    showToast('YouTube test failed: ' + e.message, 'error');
  }
});

saveSettingsBtn.addEventListener('click', () => {
  const max = parseInt(maxSkillsInput.value, 10);
  if (isNaN(max) || max < 1 || max > 10) { showToast('Max skills must be 1–10', 'error'); return; }
  chrome.storage.local.set({ maxSkills: String(max) }, () => showToast('Settings saved!', 'success'));
});

// ── Load Stored Keys on Open ──────────────────────────────────────────────

function loadStoredKeys() {
  chrome.storage.local.get(['geminiKey', 'youtubeKey', 'maxSkills'], (res) => {
    if (res.geminiKey)  { geminiKeyInput.value = res.geminiKey;  updateKeyStatus(geminiDot, geminiStatusTxt, 'saved'); }
    if (res.youtubeKey) { ytKeyInput.value     = res.youtubeKey; updateKeyStatus(ytDot, ytStatusTxt, 'saved'); }
    if (res.maxSkills)  { maxSkillsInput.value  = res.maxSkills; }
  });
}

// ── Helper Utilities ──────────────────────────────────────────────────────

function clearResults() {
  resultsEmpty.style.display  = 'block';
  resultsContent.style.display = 'none';
  lastPlanExport = null;
}

function clearChainLog() {
  reasoningChain.innerHTML   = '';
  reasoningChain.style.display = 'none';
  chainEmpty.style.display   = 'block';
}

function resetProgressSteps() {
  progressSteps.forEach((el, i) => {
    el.classList.remove('active', 'done');
    el.querySelector('.step-dot').textContent = String(i + 1);
  });
}

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'toastOut 0.3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function escapeHtml(str) {
  if (typeof str !== 'string') str = JSON.stringify(str, null, 2);
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function syntaxHighlightJson(obj) {
  let json = JSON.stringify(obj, null, 2);
  // Basic coloring via escaping — real color done via CSS pre styling
  return escapeHtml(json);
}

// ── Boot ──────────────────────────────────────────────────────────────────

loadTheme();
loadStoredKeys();
