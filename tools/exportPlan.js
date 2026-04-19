/**
 * tools/exportPlan.js  —  Tool 6: export_plan_to_file
 * ─────────────────────────────────────────────────────────────────────────
 * Formats the final improvement plan into a downloadable plain-text file.
 *
 * Input (prepare):
 *   plan        : { plan: string[], priority_skills: string[] }
 *   matchResult : { match_score, matched, missing }
 *
 * Output (prepare):
 *   {
 *     plan           : string[],
 *     priority_skills: string[],
 *     match_score    : number,
 *     matched        : string[],
 *     missing        : string[],
 *     generatedAt    : string    (ISO timestamp)
 *   }
 *
 * formatAsText(exportData):
 *   Returns a formatted string suitable for a .txt download.
 * ─────────────────────────────────────────────────────────────────────────
 */

'use strict';

const ExportPlan = (() => {

  // ── Prepare Export Data ───────────────────────────────────────────────

  /**
   * Assemble a complete export data object from plan + match results.
   * This is stored in memory and passed to formatAsText when download is triggered.
   *
   * @param {Object} plan        - { plan: string[], priority_skills: string[] }
   * @param {Object} matchResult - { match_score, matched, missing }
   * @returns {Object} exportData
   */
  function prepare(plan, matchResult) {
    return {
      plan           : plan.plan            || [],
      priority_skills: plan.priority_skills || [],
      match_score    : matchResult.match_score || 0,
      matched        : matchResult.matched  || [],
      missing        : matchResult.missing  || [],
      generatedAt    : new Date().toISOString(),
    };
  }

  // ── Format as Plain Text ──────────────────────────────────────────────

  /**
   * Convert exportData to a nicely formatted plain-text document.
   *
   * @param {Object} exportData
   * @returns {string}
   */
  function formatAsText(exportData) {
    const {
      plan,
      priority_skills,
      match_score,
      matched,
      missing,
      generatedAt,
    } = exportData;

    const hr = '═'.repeat(60);
    const line = '─'.repeat(60);

    const date = new Date(generatedAt).toLocaleString('en-US', {
      dateStyle: 'full',
      timeStyle: 'short',
    });

    let text = '';

    text += hr + '\n';
    text += '  AGENTIC JOB-FIT ANALYZER — IMPROVEMENT PLAN\n';
    text += hr + '\n';
    text += `  Generated: ${date}\n`;
    text += `  Match Score: ${match_score}%\n`;
    text += hr + '\n\n';

    // Priority Skills
    text += '🔥 PRIORITY SKILLS TO LEARN\n';
    text += line + '\n';
    if (priority_skills.length > 0) {
      priority_skills.forEach((skill, i) => {
        const rank = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
        text += `  ${rank} ${skill}\n`;
      });
    } else {
      text += '  No priority skills identified.\n';
    }
    text += '\n';

    // Action Plan
    text += '📋 ACTION PLAN — STEP BY STEP\n';
    text += line + '\n';
    if (plan.length > 0) {
      plan.forEach((step, i) => {
        text += `  ${i + 1}. ${step}\n\n`;
      });
    } else {
      text += '  No plan steps generated.\n';
    }

    // Skill Summary
    text += '✅ SKILLS YOU ALREADY HAVE\n';
    text += line + '\n';
    if (matched.length > 0) {
      text += '  ' + matched.join(' · ') + '\n\n';
    } else {
      text += '  None matched.\n\n';
    }

    text += '⚠️  SKILLS YOU NEED TO ACQUIRE\n';
    text += line + '\n';
    if (missing.length > 0) {
      text += '  ' + missing.join(' · ') + '\n\n';
    } else {
      text += '  None missing — excellent fit!\n\n';
    }

    // Footer
    text += hr + '\n';
    text += '  Built with Agentic Job-Fit Analyzer (Chrome Extension)\n';
    text += '  EAG V3 · Assignment 3\n';
    text += hr + '\n';

    return text;
  }

  // ── Public API ────────────────────────────────────────────────────────

  return { prepare, formatAsText };

})();
