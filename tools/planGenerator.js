/**
 * tools/planGenerator.js  —  Tool 5: generate_improvement_plan
 * ─────────────────────────────────────────────────────────────────────────
 * Uses Gemini LLM to create a personalized, actionable improvement plan
 * based on the skill match analysis and available learning resources.
 *
 * Input:
 *   matchResult : { match_score, matched, missing }
 *   resources   : { [skill]: [{ title, url }] }
 *   geminiKey   : string
 *
 * Output:
 *   {
 *     plan            : string[],   // Ordered list of action steps
 *     priority_skills : string[]    // Top skills to focus on (ranked)
 *   }
 *
 * Strategy:
 *   1. Build a rich prompt that includes match score, missing skills,
 *      and available resources
 *   2. Ask Gemini to return a structured JSON plan
 *   3. Fallback: generate a template-based plan if Gemini unavailable
 * ─────────────────────────────────────────────────────────────────────────
 */

'use strict';

const PlanGenerator = (() => {

  // ── Gemini Prompt ─────────────────────────────────────────────────────

  function buildPrompt(matchResult, resources) {
    const missingList  = (matchResult.missing || []).join(', ');
    const matchedList  = (matchResult.matched || []).join(', ');
    const resourceText = Object.entries(resources)
      .map(([skill, vids]) =>
        `  ${skill}: ${(vids||[]).map(v => v.title).join(' | ')}`
      )
      .join('\n');

    return `You are a senior career coach and technical mentor. A developer has just received their job-fit analysis results.

MATCH SCORE: ${matchResult.match_score}%
MATCHED SKILLS: ${matchedList || 'None'}
MISSING SKILLS: ${missingList || 'None'}

AVAILABLE LEARNING RESOURCES:
${resourceText || '  No resources fetched'}

Your task: Create a personalized, actionable improvement plan to help this developer become a strong candidate for the role.

Return ONLY valid JSON in this exact format:
{
  "plan": [
    "Step 1: ...",
    "Step 2: ...",
    "Step 3: ...",
    ...up to 10 steps
  ],
  "priority_skills": ["skill1", "skill2", "skill3", "skill4", "skill5"]
}

Plan rules:
- Each step should be concrete and actionable (not vague)
- First 2–3 steps: address the highest-priority missing skills
- Include time estimates where useful (e.g., "Spend 2 weeks on...")
- Reference the provided learning resources where relevant
- Later steps: cover portfolio projects, practice, and interview prep
- priority_skills: rank missing skills from most to least critical for the role
- Maximum 10 plan steps, 5 priority skills

Make the plan realistic, encouraging, and developer-friendly.`;
  }

  // ── Template Fallback Plan ────────────────────────────────────────────

  function templatePlan(matchResult) {
    const missing  = matchResult.missing  || [];
    const score    = matchResult.match_score;
    const top3     = missing.slice(0, 3);
    const rest     = missing.slice(3, 5);

    const plan = [];

    if (score >= 80) {
      plan.push('You are already a strong match! Focus on polishing your existing skills and preparing for technical interviews.');
    } else if (score >= 60) {
      plan.push(`Strengthen your core profile: focus on filling ${missing.length} skill gaps while leveraging your ${matchResult.matched.length} existing matched skills.`);
    } else {
      plan.push(`Your match score is ${score}%. This is a significant skills gap — follow this structured plan over the next 8–12 weeks.`);
    }

    top3.forEach((skill, i) => {
      plan.push(`Week ${i * 2 + 1}–${i * 2 + 2}: Learn ${skill} — start with beginner tutorials, then build a small hands-on project.`);
    });

    if (rest.length > 0) {
      plan.push(`After mastering the top skills, explore: ${rest.join(', ')} — these are secondary priorities.`);
    }

    plan.push('Build 1–2 portfolio projects that demonstrate all the newly learned skills in a real-world context.');
    plan.push('Contribute to an open-source project using your new skills to gain collaborative experience.');
    plan.push('Practice mock technical interviews and review common questions for the target role.');
    plan.push('Update your resume and LinkedIn to highlight newly acquired skills and projects.');
    plan.push('Apply to 3–5 similar roles while continuing to develop your skills — iteration is key.');

    return {
      plan           : plan.slice(0, 10),
      priority_skills: top3,
    };
  }

  // ── Public API ────────────────────────────────────────────────────────

  /**
   * @param {Object} matchResult
   * @param {Object} resources
   * @param {string} geminiKey
   * @returns {Promise<{ plan: string[], priority_skills: string[] }>}
   */
  async function generate(matchResult, resources, geminiKey) {
    if (geminiKey) {
      try {
        const prompt = buildPrompt(matchResult, resources);
        const raw    = await ApiClient.geminiGenerate(geminiKey, prompt);
        const parsed = JSON.parse(sanitizeJson(raw));

        if (!Array.isArray(parsed.plan)) {
          throw new Error('Schema mismatch');
        }

        return {
          plan           : parsed.plan            || [],
          priority_skills: parsed.priority_skills || [],
        };
      } catch (err) {
        console.warn('[PlanGenerator] Gemini failed, using template fallback:', err.message);
      }
    }

    return templatePlan(matchResult);
  }

  function sanitizeJson(text) {
    return text
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
  }

  return { generate };

})();
