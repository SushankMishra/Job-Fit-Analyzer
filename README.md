# 🤖 Agentic Job-Fit Analyzer

> **A Chrome Extension (Manifest V3) that implements a real multi-step AI Agent pipeline to analyze your resume against job descriptions — powered by Gemini Pro + YouTube Data API.**

---

## 📋 Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture Diagram](#2-architecture-diagram)
3. [Agent Workflow Explanation](#3-agent-workflow-explanation)
4. [Setup Instructions](#4-setup-instructions)
5. [Example Usage](#5-example-usage)
6. [Tool System Explanation](#6-tool-system-explanation)
7. [Reasoning Chain Explanation](#7-reasoning-chain-explanation)
8. [Download Feature Explanation](#8-download-feature-explanation)
9. [Theme System (Light/Dark)](#9-theme-system-lightdark)
10. [File Structure](#10-file-structure)

---

## 1. Project Overview

The **Agentic Job-Fit Analyzer** is a Chrome Extension that behaves like a real AI agent — not a single API call. It takes your resume and a job description, then runs a **6-step agentic pipeline** that:

- Extracts structured skills from your resume using **Gemini Pro**
- Extracts required/preferred skills from the job description using **Gemini Pro**
- Matches the two skill sets with a **weighted scoring algorithm**
- Searches **YouTube Data API v3** for learning resources for each missing skill
- Generates a **personalized improvement plan** using Gemini Pro
- Packages the plan as a **downloadable TXT file**

Every step is **visible in the UI** — you can see the agent thinking, making tool calls, and receiving results in real time via the Reasoning Chain view.

---

## 2. Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     CHROME EXTENSION POPUP                      │
│                                                                 │
│  ┌──────────┐   ┌─────────────┐   ┌──────────┐  ┌──────────┐  │
│  │  Input   │   │  Agent Log  │   │ Results  │  │ Settings │  │
│  │   Tab    │   │    Tab      │   │   Tab    │  │   Tab    │  │
│  └────┬─────┘   └──────┬──────┘   └────┬─────┘  └──────────┘  │
│       │                │               │                       │
│       ▼                ▼               ▼                       │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   popup.js (UI Controller)              │   │
│  └───────────────────────┬─────────────────────────────────┘   │
│                          │ triggers                            │
│                          ▼                                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              AgentController.run()                      │   │
│  │  ┌────────────────────────────────────────────────┐    │   │
│  │  │              MemoryStore                        │    │   │
│  │  │  (preserves ALL context across steps)           │    │   │
│  │  └────────────────────────────────────────────────┘    │   │
│  └──────────────────────┬──────────────────────────────────┘   │
│                         │ orchestrates                         │
│                         ▼                                      │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    TOOL PIPELINE                         │  │
│  │                                                          │  │
│  │  Tool 1: ResumeParser    ──→ Gemini Pro API              │  │
│  │  Tool 2: JobParser       ──→ Gemini Pro API              │  │
│  │  Tool 3: Matcher         ──→ Local Algorithm             │  │
│  │  Tool 4: YouTubeAPI      ──→ YouTube Data API v3         │  │
│  │  Tool 5: PlanGenerator   ──→ Gemini Pro API              │  │
│  │  Tool 6: ExportPlan      ──→ Local Formatter             │  │
│  │                                                          │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

External Services:
  ┌─────────────────────┐    ┌──────────────────────────┐
  │ Gemini Pro API      │    │ YouTube Data API v3       │
  │ (generativelanguage │    │ (googleapis.com/youtube)  │
  │  .googleapis.com)   │    │                           │
  └─────────────────────┘    └──────────────────────────┘

Persistence:
  ┌─────────────────────┐
  │  chrome.storage     │
  │  • API keys         │
  │  • Theme preference │
  │  • Agent settings   │
  └─────────────────────┘
```

---

## 3. Agent Workflow Explanation

The pipeline follows the **ReAct pattern**: Reasoning → Acting → Observing, repeated for each step.

```
INPUT: Resume Text + Job Description
           │
           ▼
┌─────────────────────────────────────┐
│  STEP 1: extract_resume_data        │
│                                     │
│  Thinking: "I need to parse the     │
│  resume to find skills, experience, │
│  and projects before I can compare" │
│                                     │
│  Tool Call → Gemini Pro             │
│  Tool Result → { skills, exp, ... } │
└────────────────┬────────────────────┘
                 │ passes resumeData
                 ▼
┌─────────────────────────────────────┐
│  STEP 2: extract_job_requirements   │
│                                     │
│  Thinking: "Now I need to parse the │
│  job description to get required    │
│  and preferred skills"              │
│                                     │
│  Tool Call → Gemini Pro             │
│  Tool Result → { required, pref }   │
└────────────────┬────────────────────┘
                 │ passes jobData
                 ▼
┌─────────────────────────────────────┐
│  STEP 3: match_skills               │
│                                     │
│  Thinking: "Compare resume skills   │
│  vs job requirements with weighted  │
│  scoring (required 2x, pref 1x)"    │
│                                     │
│  Tool Call → Local Matcher          │
│  Tool Result → { score, matched,    │
│                  missing }          │
└────────────────┬────────────────────┘
                 │ passes matchResult
                 ▼
┌─────────────────────────────────────┐
│  STEP 4: search_learning_resources  │
│  (For EACH missing skill)           │
│                                     │
│  Thinking: "For each gap, find the  │
│  best YouTube tutorials and courses"│
│                                     │
│  Tool Call → YouTube Data API v3    │
│  Query: "<skill> full course        │
│           beginner playlist"        │
│  Tool Result → { skill: [videos] }  │
└────────────────┬────────────────────┘
                 │ passes resources
                 ▼
┌─────────────────────────────────────┐
│  STEP 5: generate_improvement_plan  │
│                                     │
│  Thinking: "With all information    │
│  gathered, create an actionable     │
│  personalized improvement plan"     │
│                                     │
│  Tool Call → Gemini Pro             │
│  (passes FULL context: score,       │
│   missing skills, resources)        │
│  Tool Result → { plan, priority }   │
└────────────────┬────────────────────┘
                 │ passes plan
                 ▼
┌─────────────────────────────────────┐
│  STEP 6: export_plan_to_file        │
│                                     │
│  Thinking: "Format everything as a  │
│  downloadable document"             │
│                                     │
│  Tool Call → Local ExportPlan       │
│  Tool Result → exportData object    │
└────────────────┬────────────────────┘
                 │
                 ▼
           FINAL OUTPUT
     (Results Tab + Download)
```

**Context Preservation:** The `MemoryStore` object preserves ALL intermediate results. When Gemini generates the improvement plan (Step 5), it receives the match score, all missing skills, and all YouTube resources gathered in Step 4 — full context, not a summary.

---

## 4. Setup Instructions

### Prerequisites
- Google Chrome browser (v120+)
- Google Gemini API key (required for LLM steps)
- YouTube Data API v3 key (optional — curated fallbacks used if absent)

### Step 1: Get API Keys

**Gemini API Key (Required):**
1. Go to [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
2. Click "Create API Key"
3. Copy the key (starts with `AIza...`)

**YouTube Data API Key (Optional but recommended):**
1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project or select existing
3. Search "YouTube Data API v3" in the API Library
4. Click "Enable"
5. Go to Credentials → Create Credentials → API Key
6. Copy the key

### Step 2: Load the Extension

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer Mode** (top-right toggle)
3. Click **"Load unpacked"**
4. Select the `agentic-job-fit-extension/` folder
5. The extension icon appears in your toolbar

### Step 3: Configure API Keys

1. Click the extension icon to open the popup
2. Navigate to the **⚙️ Config** tab
3. Enter your Gemini API key → click **Save** and **Test**
4. Enter your YouTube API key → click **Save** and **Test** (optional)
5. Set Max Skills to Search (default: 5) to control YouTube API quota

### Step 4: Run Your First Analysis

1. Navigate to the **📄 Input** tab
2. Paste or upload your resume (PDF/DOCX/TXT)
3. Paste a job description (or navigate to a job posting and click **Auto-scrape**)
4. Click **🚀 Analyze with AI Agent**
5. Watch the agent pipeline execute in the **🧠 Agent** tab
6. View results in the **📊 Results** tab

---

## 5. Example Usage

### Example Resume Snippet
```
John Doe | Senior Software Engineer
Email: john@example.com

SKILLS:
Python, Django, Flask, PostgreSQL, Redis, Docker, Git, React, JavaScript

EXPERIENCE:
Backend Engineer at TechCorp (2021–2024)
- Built REST APIs in Python/Django serving 1M+ users
- Managed PostgreSQL databases and Redis caching

PROJECTS:
- E-commerce Platform: Full-stack app with React + Django
- ML Pipeline: Automated data processing with scikit-learn
```

### Example Job Description
```
Senior Backend Engineer — CloudScale Inc.

Requirements:
- 3+ years Python experience (required)
- FastAPI or Django (required)
- Kubernetes and Docker (required)
- AWS (required)
- PostgreSQL (required)
- Redis experience preferred
- Experience with CI/CD pipelines preferred
- Knowledge of GraphQL a plus
```

### Example Agent Execution Trace

```
[10:30:01] 💭 THINKING: Planning: Parse Resume
           "I need to extract structured information..."

[10:30:01] 🔧 TOOL CALL: extract_resume_data
           Input: { resumeText: "John Doe | Senior..." }

[10:30:03] ✅ TOOL RESULT: extract_resume_data
           {
             "skills": ["Python", "Django", "Flask", "PostgreSQL",
                        "Redis", "Docker", "Git", "React", "JavaScript"],
             "experience": ["Backend Engineer at TechCorp (2021–2024)"],
             "projects": ["E-commerce Platform", "ML Pipeline"]
           }

[10:30:03] 💭 THINKING: Planning: Parse Job Description
           "Resume parsed. Found 9 skills. Now extracting job requirements..."

[10:30:03] 🔧 TOOL CALL: extract_job_requirements
           Input: { jobText: "Senior Backend Engineer..." }

[10:30:05] ✅ TOOL RESULT: extract_job_requirements
           {
             "required_skills": ["Python", "FastAPI", "Django",
                                 "Kubernetes", "Docker", "AWS", "PostgreSQL"],
             "preferred_skills": ["Redis", "CI/CD", "GraphQL"]
           }

[10:30:05] 💭 THINKING: Planning: Compare Skill Sets
           "Job requires 7 required + 3 preferred skills. Comparing..."

[10:30:05] 🔧 TOOL CALL: match_skills

[10:30:05] ✅ TOOL RESULT: match_skills
           {
             "match_score": 67,
             "matched": ["Python", "Django", "Docker", "PostgreSQL", "Redis"],
             "missing": ["FastAPI", "Kubernetes", "AWS", "CI/CD", "GraphQL"]
           }

[10:30:05] 💭 THINKING: Planning: Find Learning Resources
           "Score: 67%. Searching YouTube for 5 missing skills..."

[10:30:05] 🔧 TOOL CALL: search_learning_resources (FastAPI)
[10:30:05] ✅ TOOL RESULT: [FastAPI Tutorial - freeCodeCamp]

[10:30:06] 🔧 TOOL CALL: search_learning_resources (Kubernetes)
[10:30:06] ✅ TOOL RESULT: [Kubernetes Full Course - TechWorld with Nana]

... (continues for each skill)

[10:30:10] 💭 THINKING: Planning: Generate Improvement Plan
           "All resources gathered. Creating personalized plan with Gemini..."

[10:30:10] 🔧 TOOL CALL: generate_improvement_plan
[10:30:13] ✅ TOOL RESULT: { plan: [...10 steps...], priority_skills: [...] }

[10:30:13] 🔧 TOOL CALL: export_plan_to_file
[10:30:13] ✅ TOOL RESULT: { formatted export data }

[10:30:13] 🎉 AGENT COMPLETE: Analysis done in 12.3s. Score: 67%.
```

---

## 6. Tool System Explanation

The extension implements 6 distinct, non-merged tools, each in its own file:

| Tool | File | Input | Output | Backend |
|------|------|-------|--------|---------|
| `extract_resume_data` | `tools/resumeParser.js` | Raw resume text | `{ skills, experience, projects }` | Gemini Pro |
| `extract_job_requirements` | `tools/jobParser.js` | Job description text | `{ required_skills, preferred_skills }` | Gemini Pro |
| `match_skills` | `tools/matcher.js` | resumeData + jobData | `{ match_score, matched, missing }` | Local algorithm |
| `search_learning_resources` | `tools/youtubeAPI.js` | Missing skill list | `{ skill: [videos] }` | YouTube API v3 |
| `generate_improvement_plan` | `tools/planGenerator.js` | matchResult + resources | `{ plan, priority_skills }` | Gemini Pro |
| `export_plan_to_file` | `tools/exportPlan.js` | plan + matchResult | exportData object | Local formatter |

### Tool Communication
Tools do NOT call each other directly. The `AgentController` orchestrates the pipeline:
1. Calls Tool → Gets result
2. Stores result in `MemoryStore`
3. Passes stored results as input to next tool
4. Emits reasoning chain entry to UI

---

## 7. Reasoning Chain Explanation

The **Agent tab** shows a live, chronological log of every thought and action the agent takes. Each entry has:

| Type | Icon | Color | Meaning |
|------|------|-------|---------|
| `thinking` | 💭 | Yellow | Agent reasoning about what to do next |
| `tool-call` | 🔧 | Blue/Indigo | Agent invoking a tool with specific inputs |
| `tool-result` | ✅ | Green | Tool returned a result (click to expand JSON) |
| `error` | ❌ | Red | Something went wrong (with details) |
| `final` | 🎉 | Purple | Pipeline completed, summary of results |

**Collapsible JSON View:** Every `tool-call` and `tool-result` entry has a **"View Data"** button that expands a JSON code block showing the exact inputs/outputs passed. This makes the pipeline fully transparent.

**Progress Steps Bar:** At the top of the Agent tab, 6 numbered steps show which pipeline step is currently active (pulsing dot), completed (✓), or pending (grey).

---

## 8. Download Feature Explanation

The **Download Plan** button appears in the Results tab after a successful run.

**What gets downloaded:**
A `.txt` file containing:
- Match score and generation timestamp
- Priority skills ranked by importance (🥇🥈🥉)
- All action plan steps numbered sequentially
- Full list of matched skills (what you already have)
- Full list of missing skills (what you need to learn)

**How it works:**
1. `ExportPlan.prepare()` (Tool 6) assembles the export data object during the pipeline
2. `ExportPlan.formatAsText()` formats it as a human-readable string
3. `DownloadHelper.downloadText()` creates a `Blob`, generates a URL, and triggers a browser download via a hidden `<a>` tag

**File format:** Plain text (`.txt`) for maximum compatibility. Can be opened in any text editor, emailed, or converted to PDF.

---

## 9. Theme System (Light/Dark)

### Toggle Location
Top-right corner of the popup header — a ☀️/🌙 toggle switch.

### How It Works

1. **CSS Variables Architecture:**
   All colors are defined as CSS variables in `:root` (light) and `[data-theme="dark"]` (dark).
   ```css
   :root {
     --bg-color: #f8fafc;
     --text-color: #0f172a;
     --card-bg: #ffffff;
     /* ...30+ variables */
   }

   [data-theme="dark"] {
     --bg-color: #0a0f1e;
     --text-color: #f1f5f9;
     --card-bg: #1e293b;
   }
   ```

2. **Instant Switch:**
   When the toggle is clicked, `popup.js` updates the `data-theme` attribute on `<html>`:
   ```javascript
   document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
   ```
   Because all elements reference CSS variables, the entire UI updates in one frame — no reload needed.

3. **Persistence:**
   The user's preference is saved to `chrome.storage.local` under the key `"theme"`:
   ```javascript
   chrome.storage.local.set({ theme: dark ? 'dark' : 'light' });
   ```
   On popup open, `loadTheme()` reads from storage and applies the saved theme before anything is rendered.

4. **Transition Smoothing:**
   All themed elements use `transition: 0.22s cubic-bezier(0.4, 0, 0.2, 1)` on `background`, `color`, and `border-color` for smooth theme changes.

---

## 10. File Structure

```
agentic-job-fit-extension/
│
├── manifest.json          ← Chrome Extension Manifest V3
├── popup.html             ← Extension popup UI (4 tabs)
├── popup.js               ← UI controller (theme, tabs, agent wiring)
├── styles.css             ← Complete design system (CSS variables, components)
├── background.js          ← Service worker (install events, message routing)
├── content.js             ← Page content scraper (job description extraction)
│
├── agent/
│   ├── agentController.js ← 6-step pipeline orchestrator (ReAct pattern)
│   └── memoryStore.js     ← In-session context store (preserves all step data)
│
├── tools/
│   ├── resumeParser.js    ← Tool 1: extract_resume_data (Gemini + heuristic fallback)
│   ├── jobParser.js       ← Tool 2: extract_job_requirements (Gemini + heuristic)
│   ├── matcher.js         ← Tool 3: match_skills (weighted scoring + alias matching)
│   ├── youtubeAPI.js      ← Tool 4: search_learning_resources (YouTube v3 + curated fallbacks)
│   ├── planGenerator.js   ← Tool 5: generate_improvement_plan (Gemini + template fallback)
│   └── exportPlan.js      ← Tool 6: export_plan_to_file (text formatter)
│
├── utils/
│   ├── apiClient.js       ← Centralised Gemini + YouTube API HTTP client
│   ├── fileParser.js      ← PDF/DOCX/TXT reader (no external dependencies)
│   └── downloadHelper.js  ← Browser download trigger (Blob + chrome.downloads)
│
└── icons/
    ├── icon16.png
    ├── icon32.png
    ├── icon48.png
    └── icon128.png
```

---

## 🔒 Privacy & Security

- **No data sent anywhere** except the APIs you configure
- Resume and job description text only go to Gemini API (your key, your quota)
- API keys stored in `chrome.storage.local` (sandboxed to your Chrome profile)
- No analytics, no tracking, no external servers

---

## 🐛 Troubleshooting

| Problem | Solution |
|---------|----------|
| "Gemini API key required" | Go to Config tab, add your key, click Save + Test |
| Low match score | Ensure your resume uses exact skill names (e.g., "React.js" not "React") |
| No YouTube resources | Add YouTube API key in Config tab, or use the curated fallbacks |
| Auto-scrape returns nothing | The job site may block content scripts; paste the JD manually |
| PDF text not extracted | Paste resume text manually (good for scanned/image PDFs) |

---

## 📜 License

MIT License — Free to use, modify, and distribute.

---

*Built for EAG V3 · Assignment 3 | Agentic AI Systems*
