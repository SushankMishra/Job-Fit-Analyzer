/**
 * tools/jobParser.js  —  Tool 2: extract_job_requirements
 * ─────────────────────────────────────────────────────────────────────────
 * Extracts required and preferred skills from a raw job description using
 * the Gemini language model.
 *
 * Input:
 *   jobText   : string  — full job description text
 *   geminiKey : string  — Gemini API key
 *
 * Output:
 *   {
 *     required_skills  : string[],  // Must-have skills explicitly required
 *     preferred_skills : string[]   // Nice-to-have / bonus skills
 *   }
 *
 * Strategy:
 *   1. Gemini-based structured extraction (primary)
 *   2. Regex / keyword heuristic fallback (if Gemini unavailable)
 *
 * The distinction between required vs preferred is important because it
 * affects the match score weighting in Tool 3 (match_skills).
 * ─────────────────────────────────────────────────────────────────────────
 */

'use strict';

const JobParser = (() => {

  // ── Gemini Prompt ─────────────────────────────────────────────────────

  function buildPrompt(jobText) {
    return `You are an expert job description analyst. Extract the technical and soft skill requirements from the job description below.

Return ONLY valid JSON in this exact format (no markdown, no explanation):
{
  "required_skills": ["skill1", "skill2"],
  "preferred_skills": ["skill3", "skill4"]
}

Definitions:
- required_skills: Explicitly stated as "required", "must have", "you will need", "responsibilities require", or core job duties
- preferred_skills: Stated as "plus", "preferred", "nice to have", "bonus", "ideal but not required", or implicitly secondary

Rules:
- Include programming languages, frameworks, tools, platforms, methodologies, and relevant soft skills
- Normalise names (e.g., "React.js" not "ReactJS")
- Maximum 30 required_skills, 15 preferred_skills
- If you cannot distinguish required vs preferred, place majority in required_skills
- Return empty arrays [] if a category has no clear skills

JOB DESCRIPTION:
${jobText.slice(0, 6000)}`;
  }

  // ── Heuristic Fallback ────────────────────────────────────────────────

  const TECH_SKILLS_REGEX = [
    'Python','JavaScript','TypeScript','Java','C\\+\\+','C#','Go','Rust','Ruby','PHP',
    'Swift','Kotlin','Scala','R','SQL','NoSQL',
    'React','Next\\.js','Vue','Angular','Svelte','HTML','CSS','SCSS','Tailwind',
    'Redux','GraphQL','REST','Node\\.js','Express','Django','Flask','FastAPI',
    'Spring Boot','Rails','Laravel','ASP\\.NET',
    'PostgreSQL','MySQL','MongoDB','Redis','DynamoDB','Firebase','Elasticsearch',
    'Docker','Kubernetes','AWS','Azure','GCP','Terraform','CI/CD','Jenkins',
    'Git','GitHub','GitLab','Linux','Agile','Scrum','Jira',
    'TensorFlow','PyTorch','Scikit-learn','Machine Learning','Deep Learning','NLP','LLM',
    'OpenAI','Gemini','LangChain','MLOps','Data Science',
  ];

  const REQUIRED_SIGNALS  = /\b(require[ds]?|must\s+have|essential|mandatory|you\s+will|need\s+to)\b/i;
  const PREFERRED_SIGNALS = /\b(prefer|nice[\s-]to[\s-]have|bonus|ideal|plus|advantage|desirable)\b/i;

  function heuristicExtract(text) {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 5);

    const required  = new Set();
    const preferred = new Set();

    // Pass 1: classify by line signals
    lines.forEach(line => {
      const isRequired  = REQUIRED_SIGNALS.test(line);
      const isPreferred = PREFERRED_SIGNALS.test(line);

      TECH_SKILLS_REGEX.forEach(skill => {
        const regex = new RegExp(`\\b${skill}\\b`, 'i');
        if (regex.test(line)) {
          if (isPreferred && !isRequired) {
            preferred.add(skill.replace(/\\\./g, '.'));
          } else {
            required.add(skill.replace(/\\\./g, '.'));
          }
        }
      });
    });

    // If nothing classified as required/preferred, just scan full text
    if (required.size === 0) {
      TECH_SKILLS_REGEX.forEach(skill => {
        const regex = new RegExp(`\\b${skill}\\b`, 'i');
        if (regex.test(text)) required.add(skill.replace(/\\\./g, '.'));
      });
    }

    return {
      required_skills : [...required],
      preferred_skills: [...preferred],
    };
  }

  // ── Public API ────────────────────────────────────────────────────────

  /**
   * @param {string} jobText
   * @param {string} geminiKey
   * @returns {Promise<{ required_skills: string[], preferred_skills: string[] }>}
   */
  async function extract(jobText, geminiKey) {
    if (!jobText || jobText.trim().length < 50) {
      throw new Error('Job description text is too short. Please provide more content.');
    }

    if (geminiKey) {
      try {
        const prompt = buildPrompt(jobText);
        const raw    = await ApiClient.geminiGenerate(geminiKey, prompt);
        const parsed = JSON.parse(sanitizeJson(raw));

        if (!Array.isArray(parsed.required_skills)) {
          throw new Error('Schema mismatch from Gemini');
        }

        return {
          required_skills : parsed.required_skills  || [],
          preferred_skills: parsed.preferred_skills || [],
        };
      } catch (err) {
        console.warn('[JobParser] Gemini failed, falling back to heuristic:', err.message);
      }
    }

    return heuristicExtract(jobText);
  }

  function sanitizeJson(text) {
    return text
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
  }

  return { extract };

})();
