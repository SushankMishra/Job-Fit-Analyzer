/**
 * tools/youtubeAPI.js  —  Tool 4: search_learning_resources
 * ─────────────────────────────────────────────────────────────────────────
 * Searches the YouTube Data API v3 for learning resources for each
 * missing skill identified by Tool 3.
 *
 * Input:
 *   missingSkills : string[]  — list of skills to search for
 *   youtubeKey    : string    — YouTube Data API v3 key
 *
 * Output:
 *   {
 *     [skillName]: [
 *       { title: string, url: string, channel: string, thumbnail: string },
 *       ...
 *     ]
 *   }
 *
 * Query format per skill:
 *   "<skill> full course beginner playlist"
 *
 * Fallback (no API key):
 *   Returns curated, hardcoded learning resources for ~50 common skills.
 *
 * Rate limiting:
 *   Searches are done sequentially (not in parallel) to avoid quota spikes.
 * ─────────────────────────────────────────────────────────────────────────
 */

'use strict';

const YouTubeAPI = (() => {

  const YT_SEARCH_BASE = 'https://www.googleapis.com/youtube/v3/search';
  const RESULTS_PER_SKILL = 2; // Keep quota usage low

  // ── Live API Search ───────────────────────────────────────────────────

  /**
   * Search YouTube for a single skill.
   * @param {string} skill
   * @param {string} apiKey
   * @returns {Promise<Array<{ title, url, channel, thumbnail }>>}
   */
  async function searchSkill(skill, apiKey) {
    const query  = encodeURIComponent(`${skill} full course beginner playlist`);
    const url    = `${YT_SEARCH_BASE}?part=snippet&q=${query}&type=video&maxResults=${RESULTS_PER_SKILL}&relevanceLanguage=en&key=${apiKey}`;

    const resp = await fetch(url);
    if (!resp.ok) {
      const errBody = await resp.text();
      throw new Error(`YouTube API error (${resp.status}): ${errBody.slice(0, 200)}`);
    }

    const data = await resp.json();
    return (data.items || []).map(item => ({
      title    : item.snippet?.title     || 'Unknown Title',
      url      : `https://www.youtube.com/watch?v=${item.id?.videoId}`,
      channel  : item.snippet?.channelTitle || 'Unknown Channel',
      thumbnail: item.snippet?.thumbnails?.default?.url || '',
    }));
  }

  // ── Curated Fallback Resources ─────────────────────────────────────────

  /**
   * Hardcoded fallback resources mapped by skill name (case-insensitive).
   * Covers the most commonly requested skills.
   */
  const FALLBACK_RESOURCES = {
    'python': [
      { title: 'Python Full Course for Beginners', url: 'https://www.youtube.com/watch?v=_uQrJ0TkZlc', channel: 'Programming with Mosh' },
      { title: 'Python Tutorial – Python Full Course', url: 'https://www.youtube.com/watch?v=XKHEtdqhLK8', channel: 'Bro Code' },
    ],
    'javascript': [
      { title: 'JavaScript Full Course for Beginners', url: 'https://www.youtube.com/watch?v=PkZNo7MFNFg', channel: 'freeCodeCamp' },
      { title: 'JavaScript Tutorial for Beginners', url: 'https://www.youtube.com/watch?v=W6NZfCO5SIk', channel: 'Programming with Mosh' },
    ],
    'typescript': [
      { title: 'TypeScript Full Course for Beginners', url: 'https://www.youtube.com/watch?v=BwuLxPH8IDs', channel: 'freeCodeCamp' },
      { title: 'TypeScript Tutorial for Beginners', url: 'https://www.youtube.com/watch?v=d56mG7DezGs', channel: 'Programming with Mosh' },
    ],
    'react': [
      { title: 'React Course – Beginner\'s Tutorial', url: 'https://www.youtube.com/watch?v=bMknfKXIFA8', channel: 'freeCodeCamp' },
      { title: 'React Tutorial for Beginners', url: 'https://www.youtube.com/watch?v=SqcY0GlETPk', channel: 'Programming with Mosh' },
    ],
    'react.js': [
      { title: 'React Full Course', url: 'https://www.youtube.com/watch?v=bMknfKXIFA8', channel: 'freeCodeCamp' },
    ],
    'node.js': [
      { title: 'Node.js Full Course for Beginners', url: 'https://www.youtube.com/watch?v=f2EqECiTBL8', channel: 'Programming with Mosh' },
      { title: 'Node.js Crash Course', url: 'https://www.youtube.com/watch?v=fBNz5xF-Kx4', channel: 'Traversy Media' },
    ],
    'docker': [
      { title: 'Docker Tutorial for Beginners', url: 'https://www.youtube.com/watch?v=pTFZFxd5lg', channel: 'TechWorld with Nana' },
      { title: 'Docker Full Course', url: 'https://www.youtube.com/watch?v=3c-iBn73dDE', channel: 'TechWorld with Nana' },
    ],
    'kubernetes': [
      { title: 'Kubernetes Tutorial for Beginners', url: 'https://www.youtube.com/watch?v=X48VuDVv0do', channel: 'TechWorld with Nana' },
      { title: 'Kubernetes Full Course', url: 'https://www.youtube.com/watch?v=X48VuDVv0do', channel: 'TechWorld with Nana' },
    ],
    'aws': [
      { title: 'AWS Certified Cloud Practitioner Course', url: 'https://www.youtube.com/watch?v=SOTamWNgDKc', channel: 'freeCodeCamp' },
      { title: 'AWS Tutorial for Beginners', url: 'https://www.youtube.com/watch?v=ulprqHHWlng', channel: 'Simplilearn' },
    ],
    'machine learning': [
      { title: 'Machine Learning Full Course', url: 'https://www.youtube.com/watch?v=GwIo3gDZCVQ', channel: 'Simplilearn' },
      { title: 'Machine Learning for Everybody', url: 'https://www.youtube.com/watch?v=i_LwzRVP7bg', channel: 'freeCodeCamp' },
    ],
    'deep learning': [
      { title: 'Deep Learning Crash Course for Beginners', url: 'https://www.youtube.com/watch?v=VyWAvY2CF9c', channel: 'freeCodeCamp' },
    ],
    'tensorflow': [
      { title: 'TensorFlow 2.0 Complete Course', url: 'https://www.youtube.com/watch?v=tPYj3fFJGjk', channel: 'freeCodeCamp' },
    ],
    'pytorch': [
      { title: 'PyTorch for Deep Learning Full Course', url: 'https://www.youtube.com/watch?v=V_xro1bcAuA', channel: 'freeCodeCamp' },
    ],
    'sql': [
      { title: 'SQL Tutorial – Full Database Course for Beginners', url: 'https://www.youtube.com/watch?v=HXV3zeQKqGY', channel: 'freeCodeCamp' },
    ],
    'postgresql': [
      { title: 'PostgreSQL Tutorial for Beginners', url: 'https://www.youtube.com/watch?v=qw--VYLpxG4', channel: 'freeCodeCamp' },
    ],
    'mongodb': [
      { title: 'MongoDB Full Course', url: 'https://www.youtube.com/watch?v=Www6cTUymCY', channel: 'Traversy Media' },
    ],
    'redis': [
      { title: 'Redis Crash Course', url: 'https://www.youtube.com/watch?v=jgpVdJB2sKQ', channel: 'Traversy Media' },
    ],
    'django': [
      { title: 'Python Django Tutorial for Beginners', url: 'https://www.youtube.com/watch?v=rHux0gMZ3Eg', channel: 'Programming with Mosh' },
    ],
    'fastapi': [
      { title: 'FastAPI Tutorial', url: 'https://www.youtube.com/watch?v=SORiTsvnU28', channel: 'freeCodeCamp' },
    ],
    'git': [
      { title: 'Git and GitHub for Beginners Crash Course', url: 'https://www.youtube.com/watch?v=RGOj5yH7evk', channel: 'freeCodeCamp' },
    ],
    'java': [
      { title: 'Java Full Course', url: 'https://www.youtube.com/watch?v=eIrMbAQSU34', channel: 'Programming with Mosh' },
    ],
    'c++': [
      { title: 'C++ Full Course for Beginners', url: 'https://www.youtube.com/watch?v=vLnPwxZdW4Y', channel: 'freeCodeCamp' },
    ],
    'go': [
      { title: 'Golang Tutorial for Beginners', url: 'https://www.youtube.com/watch?v=yyUHQIec83I', channel: 'TechWorld with Nana' },
    ],
    'rust': [
      { title: 'Rust Programming Course for Beginners', url: 'https://www.youtube.com/watch?v=MsocPEZBd-M', channel: 'freeCodeCamp' },
    ],
    'linux': [
      { title: 'Linux Command Line Full Tutorial', url: 'https://www.youtube.com/watch?v=ZtqBQ68cfJc', channel: 'freeCodeCamp' },
    ],
    'terraform': [
      { title: 'Terraform Course – Automate your AWS cloud infrastructure', url: 'https://www.youtube.com/watch?v=SLB_c_ayRMo', channel: 'freeCodeCamp' },
    ],
    'graphql': [
      { title: 'GraphQL Full Course', url: 'https://www.youtube.com/watch?v=ed8SzALpx1Q', channel: 'freeCodeCamp' },
    ],
    'langchain': [
      { title: 'LangChain Full Course', url: 'https://www.youtube.com/watch?v=lG7Uxts9SXs', channel: 'freeCodeCamp' },
    ],
    'next.js': [
      { title: 'Next.js 13 Full Course', url: 'https://www.youtube.com/watch?v=wm5gMKuwSYk', channel: 'JavaScript Mastery' },
    ],
    'vue': [
      { title: 'Vue.js Full Course', url: 'https://www.youtube.com/watch?v=FXpIoQ_rT_c', channel: 'freeCodeCamp' },
    ],
    'angular': [
      { title: 'Angular Tutorial for Beginners', url: 'https://www.youtube.com/watch?v=k5E2AVpwsko', channel: 'Programming with Mosh' },
    ],
    'spring boot': [
      { title: 'Spring Boot Full Course', url: 'https://www.youtube.com/watch?v=9SGDpanrc8U', channel: 'Amigoscode' },
    ],
    'nlp': [
      { title: 'NLP Zero to Hero', url: 'https://www.youtube.com/watch?v=x7X9w_GIm1s', channel: 'TensorFlow' },
    ],
  };

  /**
   * Find a fallback resource for a skill (case-insensitive partial match).
   */
  function getFallback(skill) {
    const lower = skill.toLowerCase();
    // Exact match
    if (FALLBACK_RESOURCES[lower]) return FALLBACK_RESOURCES[lower];
    // Partial match
    for (const key of Object.keys(FALLBACK_RESOURCES)) {
      if (lower.includes(key) || key.includes(lower)) {
        return FALLBACK_RESOURCES[key];
      }
    }
    // Generic fallback
    return [{
      title  : `Learn ${skill} – Search on YouTube`,
      url    : `https://www.youtube.com/results?search_query=${encodeURIComponent(skill + ' full course beginner')}`,
      channel: 'YouTube Search',
    }];
  }

  // ── Public API ─────────────────────────────────────────────────────────

  /**
   * @param {string[]} missingSkills
   * @param {string}   youtubeKey
   * @returns {Promise<Object>} Map of skill → resource array
   */
  async function search(missingSkills, youtubeKey) {
    const results = {};

    for (const skill of missingSkills) {
      if (!skill) continue;

      if (youtubeKey) {
        try {
          results[skill] = await searchSkill(skill, youtubeKey);
          // Respect rate limit
          await delay(300);
        } catch (err) {
          console.warn(`[YouTubeAPI] Failed for skill "${skill}":`, err.message, '— using fallback');
          results[skill] = getFallback(skill);
        }
      } else {
        // No API key — use curated list
        results[skill] = getFallback(skill);
      }
    }

    return results;
  }

  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  return { search };

})();
