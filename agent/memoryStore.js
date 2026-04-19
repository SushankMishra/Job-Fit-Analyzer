/**
 * agent/memoryStore.js
 * ─────────────────────────────────────────────────────────────────────────
 * In-session memory store for the agentic pipeline.
 *
 * This module maintains the FULL execution history of every agent run:
 *   • All reasoning steps (thinking, tool calls, tool results)
 *   • Intermediate data produced by each tool
 *   • The final output produced by the pipeline
 *
 * The memory is scoped to a single browser session (not persisted to
 * chrome.storage, since it is large and ephemeral).
 *
 * Design pattern: Singleton object with a reset-on-each-run strategy.
 * ─────────────────────────────────────────────────────────────────────────
 */

'use strict';

const MemoryStore = (() => {

  // ── Private State ───────────────────────────────────────────────────────

  let _runId    = null;   // Unique ID for the current run
  let _started  = null;   // Timestamp when the run started
  let _steps    = [];     // Array of { type, title, description, data, timestamp }
  let _context  = {};     // Key-value context passed between tool steps

  /*
   * Context keys used across the pipeline:
   *   resumeText       → raw resume string from user
   *   jobText          → raw job description string from user
   *   resumeData       → structured output of extract_resume_data tool
   *   jobData          → structured output of extract_job_requirements tool
   *   matchResult      → output of match_skills tool
   *   resources        → output of search_learning_resources tool (per skill)
   *   plan             → output of generate_improvement_plan tool
   *   exportData       → formatted final output for download
   */

  // ── Public API ──────────────────────────────────────────────────────────

  return {

    /**
     * Begin a new agent run. Clears all previous state.
     * @param {Object} inputs - { resumeText, jobText }
     */
    startRun(inputs = {}) {
      _runId   = `run_${Date.now()}`;
      _started = Date.now();
      _steps   = [];
      _context = { ...inputs };
      console.log(`[MemoryStore] New run started: ${_runId}`);
    },

    /**
     * Append a step to the execution log.
     * @param {Object} step - { type, title, description, data }
     * @returns The completed step object (with timestamp).
     */
    addStep(step) {
      const entry = {
        type       : step.type || 'thinking',
        title      : step.title || '',
        description: step.description || '',
        data       : step.data || {},
        timestamp  : Date.now(),
        runId      : _runId,
      };
      _steps.push(entry);
      console.log(`[MemoryStore] Step [${entry.type}]: ${entry.title}`);
      return entry;
    },

    /**
     * Read a value from the shared context.
     * @param {string} key
     * @returns {*}
     */
    get(key) {
      return _context[key];
    },

    /**
     * Write a value to the shared context.
     * @param {string} key
     * @param {*} value
     */
    set(key, value) {
      _context[key] = value;
    },

    /**
     * Write multiple key-value pairs to context at once.
     * @param {Object} obj
     */
    merge(obj) {
      Object.assign(_context, obj);
    },

    /**
     * Return a full snapshot of the current run.
     * @returns {{ runId, started, steps, context }}
     */
    snapshot() {
      return {
        runId  : _runId,
        started: _started,
        steps  : [..._steps],
        context: { ..._context },
      };
    },

    /**
     * Return all steps logged so far.
     * @returns {Array}
     */
    getSteps() {
      return [..._steps];
    },

    /**
     * Return the full context object.
     * @returns {Object}
     */
    getContext() {
      return { ..._context };
    },

    /**
     * Return the unique run ID.
     * @returns {string|null}
     */
    getRunId() {
      return _runId;
    },

    /**
     * Calculate elapsed time since run start.
     * @returns {number} milliseconds
     */
    elapsed() {
      return _started ? Date.now() - _started : 0;
    },
  };

})();
