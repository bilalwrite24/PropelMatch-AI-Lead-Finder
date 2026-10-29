import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.join(__dirname, 'data');
const stateFile = path.join(dataDir, 'app.json');

async function ensureStorage() {
  await fs.mkdir(dataDir, { recursive: true });
  try {
    await fs.access(stateFile);
  } catch {
    const defaultState = {
      campaigns: [
        {
          id: 'default-campaign',
          name: 'PropelMatch Default Campaign',
          industries: ['B2B Technology', 'AI', 'SaaS', 'Cybersecurity', 'IT Services'],
          companySizeMin: 200,
          geography: ['United States', 'Canada', 'United Kingdom', 'Europe'],
          jobTitles: ['CIO', 'CTO', 'VP of IT', 'IT Director', 'VP of Infrastructure', 'VP of Cloud', 'IT Operations leadership'],
          seniority: ['Director', 'VP', 'Head of IT', 'CIO', 'CTO'],
          requiredTechnologies: ['CRM', 'Cloud', 'Automation', 'AI'],
          excludedIndustries: ['Consulting', 'Staffing'],
          excludedRoles: ['Founder', 'CEO', 'Consultant'],
          requiredCharacteristics: ['High employee count', 'Digital transformation focus'],
          instructions: 'Target technology and IT leaders at growth-stage and mature B2B SaaS companies that are investing in digital modernization.',
          isDefault: true,
          createdAt: new Date().toISOString(),
        },
      ],
      leads: [],
      activity: [
        {
          id: 'seed-activity',
          type: 'system',
          message: 'PropelMatch initialized with a default ICP campaign and local storage.',
          createdAt: new Date().toISOString(),
        },
      ],
    };
    await fs.writeFile(stateFile, JSON.stringify(defaultState, null, 2), 'utf8');
  }
}

async function readState() {
  await ensureStorage();
  const content = await fs.readFile(stateFile, 'utf8');
  return JSON.parse(content || '{}');
}

async function writeState(nextState) {
  await ensureStorage();
  await fs.writeFile(stateFile, JSON.stringify(nextState, null, 2), 'utf8');
}

export { readState, writeState, ensureStorage };
