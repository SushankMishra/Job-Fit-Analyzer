/**
 * tools/matcher.js  —  Tool 3: match_skills
 * ─────────────────────────────────────────────────────────────────────────
 * Compares resume skills against job requirements to produce a match score.
 *
 * Input:
 *   resumeData : { skills: string[], experience: string[], projects: string[] }
 *   jobData    : { required_skills: string[], preferred_skills: string[] }
 *
 * Output:
 *   {
 *     match_score : number,    // 0–100 percentage
 *     matched     : string[],  // Skills present in both resume and JD
 *     missing     : string[]   // Required skills absent from resume
 *   }
 *
 * Scoring Formula:
 *   - Required skills have 2× weight vs preferred skills
 *   - Score = (required_matched × 2 + preferred_matched × 1) /
 *             (total_required × 2 + total_preferred × 1) × 100
 *   - Clamped to 0–100, rounded to nearest integer
 *
 * Matching Strategy:
 *   - Case-insensitive exact match
 *   - Alias matching (e.g., "Node" matches "Node.js", "JS" matches "JavaScript")
 *   - Substring containment (e.g., resume has "React.js", JD says "React")
 * ─────────────────────────────────────────────────────────────────────────
 */

'use strict';

const Matcher = (() => {

  // ── Alias Map — common tech skill aliases ─────────────────────────────

  const ALIASES = {
    'js'             : ['javascript', 'js'],
    'javascript'     : ['javascript', 'js'],
    'ts'             : ['typescript', 'ts'],
    'typescript'     : ['typescript', 'ts'],
    'node'           : ['node.js', 'nodejs', 'node'],
    'node.js'        : ['node.js', 'nodejs', 'node'],
    'react'          : ['react', 'react.js', 'reactjs'],
    'react.js'       : ['react', 'react.js', 'reactjs'],
    'vue'            : ['vue', 'vue.js', 'vuejs'],
    'vue.js'         : ['vue', 'vue.js', 'vuejs'],
    'next'           : ['next.js', 'nextjs', 'next'],
    'next.js'        : ['next.js', 'nextjs', 'next'],
    'k8s'            : ['kubernetes', 'k8s'],
    'kubernetes'     : ['kubernetes', 'k8s'],
    'ml'             : ['machine learning', 'ml'],
    'machine learning': ['machine learning', 'ml'],
    'dl'             : ['deep learning', 'dl'],
    'deep learning'  : ['deep learning', 'dl'],
    'postgres'       : ['postgresql', 'postgres'],
    'postgresql'     : ['postgresql', 'postgres'],
    'mongo'          : ['mongodb', 'mongo'],
    'mongodb'        : ['mongodb', 'mongo'],
    'tf'             : ['tensorflow', 'tf'],
    'tensorflow'     : ['tensorflow', 'tf'],
    'pt'             : ['pytorch', 'pt'],
    'pytorch'        : ['pytorch', 'pt'],
  };

  /**
   * Get all variants of a skill name for fuzzy matching.
   */
  function getVariants(skill) {
    const lower    = skill.toLowerCase().trim();
    const fromMap  = ALIASES[lower] || [];
    return new Set([lower, ...fromMap]);
  }

  /**
   * Check if a resumeSkill can be considered the same as a jdSkill.
   */
  function isMatch(resumeSkill, jdSkill) {
    const resumeVariants = getVariants(resumeSkill);
    const jdVariants     = getVariants(jdSkill);

    for (const rv of resumeVariants) {
      for (const jv of jdVariants) {
        // Exact match
        if (rv === jv) return true;
        // Substring containment (both ways)
        if (rv.includes(jv) || jv.includes(rv)) return true;
      }
    }
    return false;
  }

  /**
   * Given a list of resume skills, find which jdSkills are matched.
   */
  function findMatches(resumeSkills, jdSkills) {
    const matched = [];
    const missing = [];

    jdSkills.forEach(jdSkill => {
      const found = resumeSkills.some(rs => isMatch(rs, jdSkill));
      if (found) matched.push(jdSkill);
      else        missing.push(jdSkill);
    });

    return { matched, missing };
  }

  // ── Public API ────────────────────────────────────────────────────────

  /**
   * @param {Object} resumeData
   * @param {Object} jobData
   * @returns {{ match_score: number, matched: string[], missing: string[] }}
   */
  function match(resumeData, jobData) {
    const resumeSkills    = resumeData.skills    || [];
    const requiredSkills  = jobData.required_skills  || [];
    const preferredSkills = jobData.preferred_skills || [];

    // Match required and preferred separately
    const reqResult  = findMatches(resumeSkills, requiredSkills);
    const prefResult = findMatches(resumeSkills, preferredSkills);

    // Weighted scoring: required = 2×, preferred = 1×
    const totalWeighted   = (requiredSkills.length * 2) + (preferredSkills.length * 1);
    const matchedWeighted = (reqResult.matched.length * 2) + (prefResult.matched.length * 1);

    let score = totalWeighted > 0
      ? Math.round((matchedWeighted / totalWeighted) * 100)
      : 0;

    score = Math.min(100, Math.max(0, score));

    // Consolidated lists for UI
    const allMatched = [...reqResult.matched, ...prefResult.matched];
    const allMissing = [...reqResult.missing, ...prefResult.missing];

    return {
      match_score: score,
      matched    : [...new Set(allMatched)],
      missing    : [...new Set(allMissing)],
    };
  }

  return { match };

})();
