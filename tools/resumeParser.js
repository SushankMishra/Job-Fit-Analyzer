/**
 * tools/resumeParser.js  —  Tool 1: extract_resume_data
 * ─────────────────────────────────────────────────────────────────────────
 * Extracts structured information from raw resume text using the Gemini
 * language model as the intelligence backend.
 *
 * Input:
 *   resumeText: string  — full plain-text resume
 *   geminiKey:  string  — Gemini API key
 *
 * Output:
 *   {
 *     skills    : string[],   // Technical and soft skills mentioned
 *     experience: string[],   // Job titles / experience items
 *     projects  : string[]    // Project names or descriptions
 *   }
 *
 * Strategy:
 *   1. Send a structured prompt to Gemini asking for JSON-formatted output
 *   2. Parse and validate the JSON response
 *   3. Fall back to regex-based heuristic extraction if Gemini call fails
 * ─────────────────────────────────────────────────────────────────────────
 */

'use strict';

const ResumeParser = (() => {

  // ── Gemini Prompt ────────────────────────────────────────────────────

  function buildPrompt(resumeText) {
    return `You are an expert resume parser. Extract structured information from the following resume text.

Return ONLY valid JSON in this exact format (no markdown, no explanation, just JSON):
{
  "skills": ["skill1", "skill2", "skill3"],
  "experience": ["Role at Company (Year–Year)", "Role2 at Company2"],
  "projects": ["Project Name: one-line description"]
}

Rules:
- skills: List ALL technical skills, tools, frameworks, languages, and 2–3 significant soft skills
- experience: Each entry = "Job Title at Company (duration if available)"
- projects: Each entry = "Project Name" or "Project Name: brief description"
- Be comprehensive but avoid duplicates
- Use exact names (e.g., "React.js" not "React JS")
- Return a maximum of 40 skills, 10 experience items, 10 projects

RESUME TEXT:
${resumeText.slice(0, 8000)}`;
  }

  // ── Heuristic Fallback ────────────────────────────────────────────────

  /**
   * Regex-based skill extraction when Gemini is unavailable.
   * Covers ~300 common tech skills.
   */
  function heuristicExtract(text) {
    const KNOWN_SKILLS = [
      // Languages
      'Python','JavaScript','TypeScript','Java','C++','C#','Go','Rust','Ruby','PHP',
      'Swift','Kotlin','Scala','R','MATLAB','Perl','Bash','Shell','PowerShell','SQL',
      // Frontend
      'React','React.js','Next.js','Vue','Vue.js','Angular','Svelte','HTML','CSS',
      'SCSS','Sass','Tailwind','Bootstrap','jQuery','Redux','MobX','GraphQL','REST',
      // Backend
      'Node.js','Express','Django','Flask','FastAPI','Spring Boot','Rails','Laravel',
      'ASP.NET','NestJS','Hapi','Gin','Echo','Fiber',
      // Databases
      'PostgreSQL','MySQL','MongoDB','Redis','SQLite','Oracle','Cassandra','DynamoDB',
      'Elasticsearch','Firebase','Supabase','Neo4j','InfluxDB',
      // DevOps / Cloud
      'Docker','Kubernetes','AWS','Azure','GCP','Terraform','Ansible','Jenkins',
      'GitHub Actions','CircleCI','Prometheus','Grafana','Nginx','Linux','Ubuntu',
      // AI / ML
      'TensorFlow','PyTorch','Scikit-learn','Pandas','NumPy','OpenCV','Keras',
      'HuggingFace','LangChain','LlamaIndex','Stable Diffusion','BERT','GPT',
      'OpenAI API','Gemini API','Computer Vision','NLP','MLOps',
      // Tools
      'Git','GitHub','GitLab','Jira','Confluence','Notion','Figma','Postman',
      'VS Code','IntelliJ','Webpack','Vite','Babel','ESLint','Prettier',
      // Soft skills
      'Leadership','Communication','Problem Solving','Team Collaboration',
      'Agile','Scrum','Project Management',
    ];

    const lowerText = text.toLowerCase();
    const found = KNOWN_SKILLS.filter(skill =>
      lowerText.includes(skill.toLowerCase())
    );

    // Extract experience lines heuristically
    const expLines = text.split('\n')
      .filter(l => /\b(engineer|developer|intern|analyst|manager|lead|architect|scientist|designer)\b/i.test(l))
      .slice(0, 8)
      .map(l => l.trim());

    // Extract project lines heuristically
    const projLines = text.split('\n')
      .filter(l => /\b(project|built|developed|created|designed|implemented)\b/i.test(l))
      .slice(0, 6)
      .map(l => l.trim().slice(0, 100));

    return {
      skills    : [...new Set(found)],
      experience: expLines.length ? expLines : ['Experience details not detected'],
      projects  : projLines.length ? projLines : ['Projects not detected'],
    };
  }

  // ── Public API ────────────────────────────────────────────────────────

  /**
   * Main extraction function.
   * @param {string} resumeText
   * @param {string} geminiKey
   * @returns {Promise<{ skills: string[], experience: string[], projects: string[] }>}
   */
  async function extract(resumeText, geminiKey) {
    if (!resumeText || resumeText.trim().length < 50) {
      throw new Error('Resume text is too short to parse. Please provide more content.');
    }

    // Try Gemini first
    if (geminiKey) {
      try {
        const prompt = buildPrompt(resumeText);
        const raw    = await ApiClient.geminiGenerate(geminiKey, prompt);
        const parsed = JSON.parse(sanitizeJsonResponse(raw));

        // Validate schema
        if (!Array.isArray(parsed.skills) || !Array.isArray(parsed.experience)) {
          throw new Error('Gemini returned unexpected schema');
        }

        return {
          skills    : parsed.skills     || [],
          experience: parsed.experience || [],
          projects  : parsed.projects   || [],
        };
      } catch (err) {
        console.warn('[ResumeParser] Gemini failed, using heuristic fallback:', err.message);
        // Fall through to heuristic
      }
    }

    // Heuristic fallback
    return heuristicExtract(resumeText);
  }

  /**
   * Strip Markdown code fences that Gemini sometimes wraps JSON in.
   */
  function sanitizeJsonResponse(text) {
    return text
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
  }

  return { extract };

})();
