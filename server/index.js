const SEARCH_MODEL = 'gemini-2.0-flash';
const SEARCH_MODELS = new Set(['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-2.5-flash', 'gemini-2.5-pro']);

function getGeminiApiKey() {
  return process.env.GEMINI_API_KEY || '';
}

export async function groundedDiscovery(searchConfig) {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error('Gemini API key is not configured. Add GEMINI_API_KEY to the server environment to enable live discovery. CSV import remains available as an alternative.');
  }

  const modelName = searchConfig.model || SEARCH_MODEL;
  if (!SEARCH_MODELS.has(modelName)) {
    throw new Error(`Model '${modelName}' does not support Google Search grounding in the current configuration.`);
  }

  const payload = {
    model: modelName,
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: `Find real B2B companies and decision-makers matching this ICP. Use Google Search grounding and return valid JSON only. The structure should be an array of objects with fields: companyName, website, industry, country, companySize, jobTitle, contactName, seniority, matchReason, evidence, sourceUrl. Based on the prompt: ${JSON.stringify(searchConfig)}`,
          },
        ],
      },
    ],
    tools: [{ googleSearch: {} }],
    generationConfig: {
      responseMimeType: 'application/json',
    },
  };

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Gemini Search grounding request failed: ${detail}`);
  }

  const result = await response.json();
  const candidateText = result?.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('') || '';

  if (!candidateText) {
    throw new Error('The Gemini grounding call returned without usable results.');
  }

  try {
    const parsed = JSON.parse(candidateText);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    throw new Error('The Gemini response was not valid JSON. Search results were not usable.');
  }
}
