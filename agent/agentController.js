/**
 * agent/agentController.js
 * ─────────────────────────────────────────────────────────────────────────
 * The heart of the agentic pipeline.
 *
 * Orchestrates the 6-step agent loop:
 *
 *   Step 1 → extract_resume_data     (Tool 1 via Gemini LLM)
 *   Step 2 → extract_job_requirements (Tool 2 via Gemini LLM)
 *   Step 3 → match_skills             (Tool 3 — local logic + LLM scoring)
 *   Step 4 → search_learning_resources (Tool 4 — YouTube Data API v3)
 *   Step 5 → generate_improvement_plan (Tool 5 via Gemini LLM)
 *   Step 6 → export_plan_to_file      (Tool 6 — local formatter)
 *
 * Each step:
 *   1. Logs a THINKING entry ("I need to do X because Y")
 *   2. Logs a TOOL-CALL entry with the tool name + input
 *   3. Executes the tool (async)
 *   4. Logs a TOOL-RESULT entry with the output
 *   5. Merges result into MemoryStore context
 *   6. Emits progress to the UI via callbacks
 *
 * All previous context is preserved and forwarded into each successive step.
 * ─────────────────────────────────────────────────────────────────────────
 */

'use strict';

const AgentController = (() => {

  // ── Internal: Emit a reasoning chain entry ────────────────────────────

  function emit(callbacks, stepEntry) {
    if (typeof callbacks.onStep === 'function') {
      callbacks.onStep(stepEntry);
    }
  }

  function progress(callbacks, stepIndex, statusText) {
    if (typeof callbacks.onProgress === 'function') {
      callbacks.onProgress({ stepIndex, statusText });
    }
  }

  // ── Internal: Thinking log helper ─────────────────────────────────────

  function think(callbacks, title, description) {
    const entry = MemoryStore.addStep({ type: 'thinking', title, description, data: {} });
    emit(callbacks, entry);
  }

  // ── Internal: Tool call + result wrapper ──────────────────────────────

  async function callTool(callbacks, toolName, toolFn, toolInput) {

    // Log tool call
    const callEntry = MemoryStore.addStep({
      type       : 'tool-call',
      title      : `🔧 Tool: ${toolName}`,
      description: `Invoking ${toolName} with the following inputs...`,
      data       : { tool: toolName, input: toolInput },
    });
    emit(callbacks, callEntry);

    // Execute
    let result;
    try {
      result = await toolFn(toolInput);
    } catch (err) {
      const errEntry = MemoryStore.addStep({
        type       : 'error',
        title      : `❌ Tool Failed: ${toolName}`,
        description: err.message || String(err),
        data       : { tool: toolName, error: err.message },
      });
      emit(callbacks, errEntry);
      throw err;
    }

    // Log tool result
    const resultEntry = MemoryStore.addStep({
      type       : 'tool-result',
      title      : `✅ Result: ${toolName}`,
      description: `${toolName} completed successfully.`,
      data       : result,
    });
    emit(callbacks, resultEntry);

    return result;
  }

  // ── Main Run Function ─────────────────────────────────────────────────

  /**
   * @param {Object} opts
   * @param {string}   opts.resumeText   - Raw resume text
   * @param {string}   opts.jobText      - Raw job description text
   * @param {string}   opts.geminiKey    - Gemini API key
   * @param {string}   opts.youtubeKey   - YouTube Data API v3 key (optional)
   * @param {number}   opts.maxSkills    - Max number of missing skills to search (default 5)
   * @param {Function} opts.onStep       - Called for each reasoning chain entry
   * @param {Function} opts.onProgress   - Called for each pipeline step progress
   * @param {Function} opts.onComplete   - Called when pipeline finishes successfully
   * @param {Function} opts.onError      - Called on unrecoverable error
   */
  async function run(opts) {
    const {
      resumeText,
      jobText,
      geminiKey,
      youtubeKey  = '',
      maxSkills   = 5,
      onStep,
      onProgress,
      onComplete,
      onError,
    } = opts;

    const callbacks = { onStep, onProgress, onComplete, onError };

    // Initialize memory
    MemoryStore.startRun({ resumeText, jobText });

    try {

      // ──────────────────────────────────────────────────────────────────
      // STEP 1 — Extract Resume Data
      // ──────────────────────────────────────────────────────────────────

      progress(callbacks, 0, 'Extracting resume data...');

      think(callbacks,
        '💭 Planning: Parse Resume',
        'I need to extract structured information (skills, experience, projects) from the raw resume text before I can match it against the job requirements. I will use Tool 1: extract_resume_data.'
      );

      const resumeData = await callTool(
        callbacks,
        'extract_resume_data',
        (input) => ResumeParser.extract(input.resumeText, input.geminiKey),
        { resumeText, geminiKey }
      );

      MemoryStore.set('resumeData', resumeData);

      // ──────────────────────────────────────────────────────────────────
      // STEP 2 — Extract Job Requirements
      // ──────────────────────────────────────────────────────────────────

      progress(callbacks, 1, 'Extracting job requirements...');

      think(callbacks,
        '💭 Planning: Parse Job Description',
        `Resume parsed. I found ${resumeData.skills.length} skills. Now I need to extract required and preferred skills from the job description using Tool 2: extract_job_requirements.`
      );

      const jobData = await callTool(
        callbacks,
        'extract_job_requirements',
        (input) => JobParser.extract(input.jobText, input.geminiKey),
        { jobText, geminiKey }
      );

      MemoryStore.set('jobData', jobData);

      // ──────────────────────────────────────────────────────────────────
      // STEP 3 — Match Skills
      // ──────────────────────────────────────────────────────────────────

      progress(callbacks, 2, 'Matching skills...');

      think(callbacks,
        '💭 Planning: Compare Skill Sets',
        `Job requires ${jobData.required_skills.length} required + ${jobData.preferred_skills.length} preferred skills. I will now compare this against the candidate's ${resumeData.skills.length} skills using Tool 3: match_skills.`
      );

      const matchResult = await callTool(
        callbacks,
        'match_skills',
        (input) => Matcher.match(input.resumeData, input.jobData),
        { resumeData, jobData }
      );

      MemoryStore.set('matchResult', matchResult);

      // ──────────────────────────────────────────────────────────────────
      // STEP 4 — Search Learning Resources (YouTube API)
      // ──────────────────────────────────────────────────────────────────

      progress(callbacks, 3, 'Fetching learning resources...');

      const missingSkills = (matchResult.missing || []).slice(0, maxSkills);

      think(callbacks,
        '💭 Planning: Find Learning Resources',
        `Match score: ${matchResult.match_score}%. Missing ${matchResult.missing.length} skills. I will search YouTube for the top ${missingSkills.length} missing skills using Tool 4: search_learning_resources. ${!youtubeKey ? '⚠️ No YouTube key configured — using curated fallback resources.' : ''}`
      );

      const resources = await callTool(
        callbacks,
        'search_learning_resources',
        (input) => YouTubeAPI.search(input.missingSkills, input.youtubeKey),
        { missingSkills, youtubeKey }
      );

      MemoryStore.set('resources', resources);

      // ──────────────────────────────────────────────────────────────────
      // STEP 5 — Generate Improvement Plan
      // ──────────────────────────────────────────────────────────────────

      progress(callbacks, 4, 'Generating improvement plan...');

      think(callbacks,
        '💭 Planning: Build Improvement Plan',
        `Learning resources collected for ${Object.keys(resources).length} skills. Now using Tool 5: generate_improvement_plan with Gemini to create a prioritised, actionable improvement plan based on all gathered context.`
      );

      const plan = await callTool(
        callbacks,
        'generate_improvement_plan',
        (input) => PlanGenerator.generate(input.matchResult, input.resources, input.geminiKey),
        { matchResult, resources, geminiKey }
      );

      MemoryStore.set('plan', plan);

      // ──────────────────────────────────────────────────────────────────
      // STEP 6 — Export Plan
      // ──────────────────────────────────────────────────────────────────

      progress(callbacks, 5, 'Preparing export...');

      think(callbacks,
        '💭 Planning: Prepare Download',
        'Improvement plan generated. Running Tool 6: export_plan_to_file to format the plan as a downloadable TXT file.'
      );

      const exportData = await callTool(
        callbacks,
        'export_plan_to_file',
        (input) => ExportPlan.prepare(input.plan, input.matchResult),
        { plan, matchResult }
      );

      MemoryStore.set('exportData', exportData);

      // ──────────────────────────────────────────────────────────────────
      // FINAL — Pipeline Complete
      // ──────────────────────────────────────────────────────────────────

      const finalEntry = MemoryStore.addStep({
        type       : 'final',
        title      : '🎉 Agent Pipeline Complete',
        description: `Full analysis done in ${(MemoryStore.elapsed() / 1000).toFixed(1)}s. Match score: ${matchResult.match_score}%. Plan has ${plan.plan.length} action steps.`,
        data       : {
          match_score     : matchResult.match_score,
          matched_count   : matchResult.matched.length,
          missing_count   : matchResult.missing.length,
          resources_count : Object.keys(resources).length,
          plan_steps      : plan.plan.length,
          priority_skills : plan.priority_skills,
          elapsed_ms      : MemoryStore.elapsed(),
        },
      });
      emit(callbacks, finalEntry);

      if (typeof onComplete === 'function') {
        onComplete({ matchResult, resources, plan, exportData });
      }

    } catch (err) {
      console.error('[AgentController] Pipeline error:', err);
      if (typeof onError === 'function') {
        onError(err);
      }
    }
  }

  // ── Public API ────────────────────────────────────────────────────────

  return { run };

})();
