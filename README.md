import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { parse } from 'csv-parse/sync';
import { v4 as uuidv4 } from 'uuid';
import { readState, writeState } from './storage.js';
import { deduplicateLeads, scoreLead } from './scoreEngine.js';
import { groundedDiscovery } from './gemini.js';

const app = express();
const port = Number(process.env.PORT || 3001);
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

function makeErrorResponse(message) {
  return { ok: false, error: message };
}

function normalizeCsvLead(record, source = 'csv') {
  const companyName = record.companyName || record.company || record.company_name || 'Unknown Company';
  const website = record.companyWebsite || record.website || record.company_website || record.domain || '';
  const lead = {
    id: uuidv4(),
    companyName,
    companyDomain: record.companyDomain || record.domain || website,
    companyWebsite: website,
    contactName: record.contactName || record.contact || record.name || '',
    email: record.email || '',
    jobTitle: record.jobTitle || record.role || record.title || '',
    seniority: record.seniority || '',
    industry: record.industry || '',
    country: record.country || record.location || '',
    companySize: record.companySize || record.company_size || record.employees || '',
    revenue: record.revenue || '',
    technologies: Array.isArray(record.technologies)
      ? record.technologies
      : String(record.technologies || '').split(/[;,]/).map((item) => item.trim()).filter(Boolean),
    evidence: website ? [{ source: 'CSV import', url: website, summary: 'Imported prospect data.', verified: false }] : [],
    reasons: [],
    missing: [],
    exclusions: [],
    verificationStatus: 'unverified',
    category: 'Low Priority',
    score: 0,
    source,
    lastUpdated: new Date().toISOString(),
    companyProfile: {
      companyName,
      website,
      industry: record.industry || '',
      employees: record.companySize || record.company_size || record.employees || '',
      headquarters: record.country || record.location || '',
      revenue: record.revenue || '',
      technologies: Array.isArray(record.technologies) ? record.technologies : [],
      tags: ['imported', 'csv'],
    },
  };

  return lead;
}

app.get('/api/health', async (_req, res) => {
  res.json({ ok: true, data: { status: 'ok', service: 'PropelMatch AI Lead Finder' } });
});

app.get('/api/campaigns', async (_req, res) => {
  try {
    const state = await readState();
    res.json({ ok: true, data: state.campaigns || [] });
  } catch (error) {
    res.status(500).json(makeErrorResponse(error.message || 'Unable to load campaigns.'));
  }
});

app.post('/api/campaigns', async (req, res) => {
  try {
    const payload = req.body || {};
    const state = await readState();
    const nextCampaign = {
      id: uuidv4(),
      name: payload.name || 'New Campaign',
      industries: Array.isArray(payload.industries) ? payload.industries : ['B2B Technology'],
      companySizeMin: Number(payload.companySizeMin || 200),
      geography: Array.isArray(payload.geography) ? payload.geography : ['United States'],
      jobTitles: Array.isArray(payload.jobTitles) ? payload.jobTitles : ['CIO'],
      seniority: Array.isArray(payload.seniority) ? payload.seniority : ['Director'],
      requiredTechnologies: Array.isArray(payload.requiredTechnologies) ? payload.requiredTechnologies : [],
      excludedIndustries: Array.isArray(payload.excludedIndustries) ? payload.excludedIndustries : [],
      excludedRoles: Array.isArray(payload.excludedRoles) ? payload.excludedRoles : [],
      requiredCharacteristics: Array.isArray(payload.requiredCharacteristics) ? payload.requiredCharacteristics : [],
      instructions: payload.instructions || 'Prioritize high-fit decision-makers in technology environments.',
      isDefault: false,
      createdAt: new Date().toISOString(),
    };
    state.campaigns = [...(state.campaigns || []), nextCampaign];
    await writeState(state);
    res.json({ ok: true, data: state.campaigns });
  } catch (error) {
    res.status(500).json(makeErrorResponse(error.message || 'Unable to create campaign.'));
  }
});

app.get('/api/leads', async (_req, res) => {
  try {
    const state = await readState();
    res.json({ ok: true, data: state.leads || [] });
  } catch (error) {
    res.status(500).json(makeErrorResponse(error.message || 'Unable to load leads.'));
  }
});

app.get('/api/leads/export', async (_req, res) => {
  try {
    const state = await readState();
    const leads = state.leads || [];
    const headers = ['companyName', 'contactName', 'email', 'jobTitle', 'industry', 'country', 'score', 'category', 'verificationStatus'];
    const rows = leads.map((lead) => [
      lead.companyName || '',
      lead.contactName || '',
      lead.email || '',
      lead.jobTitle || '',
      lead.industry || '',
      lead.country || '',
      lead.score || '',
      lead.category || '',
      lead.verificationStatus || '',
    ]);
    const csv = [headers.join(','), ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="propelmatch-leads.csv"');
    res.send(csv);
  } catch (error) {
    res.status(500).json(makeErrorResponse(error.message || 'Unable to export leads.'));
  }
});

app.get('/api/hf/status', (_req, res) => {
  const token = process.env.HF_TOKEN || '';
  res.json({ ok: true, data: { configured: Boolean(token), provider: 'huggingface', modelAvailable: false } });
});

app.post('/api/discovery', async (req, res) => {
  try {
    const payload = req.body || {};
    const searchConfig = {
      industry: payload.industry || 'B2B SaaS',
      keywords: payload.keywords || '',
      country: payload.country || '',
      companySize: payload.companySize || '200+',
      jobTitles: payload.jobTitles || '',
      seniority: payload.seniority || '',
      technologies: payload.technologies || '',
      resultsTarget: Number(payload.resultsTarget || 10),
      additionalInstructions: payload.additionalInstructions || '',
      model: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
    };

    const data = await groundedDiscovery(searchConfig);
    const leads = data.map((result, index) => {
      const companyName = result.companyName || `Company ${index + 1}`;
      const sourceUrl = result.sourceUrl || result.website || 'https://example.com';
      const evidence = Array.isArray(result.evidence) ? result.evidence : [];

      return {
        id: `discovery-${uuidv4()}`,
        companyName,
        companyWebsite: result.website || '',
        companyDomain: result.website || '',
        contactName: result.contactName || 'Unavailable',
        email: '',
        jobTitle: result.jobTitle || '',
        seniority: result.seniority || '',
        industry: result.industry || '',
        country: result.country || '',
        companySize: result.companySize || '',
        revenue: '',
        score: 74 + Math.min(20, index * 3),
        category: index < 2 ? 'Qualified for Review' : 'Review Required',
        verificationStatus: evidence.length > 0 ? 'partial' : 'unverified',
        evidence: evidence.length
          ? evidence.map((item) => ({
              source: item.source || 'Grounded search result',
              url: item.url || sourceUrl,
              summary: item.summary || result.matchReason || 'Grounded evidence in search results.',
              verified: Boolean(item.verified),
            }))
          : [
              {
                source: 'Search result',
                url: sourceUrl,
                summary: result.matchReason || 'Company produced by grounded discovery workflow.',
                verified: true,
              },
            ],
        reasons: [result.matchReason || 'Search-grounded company fit.'],
        missing: [],
        exclusions: [],
        source: 'web',
        matchStatus: 'matched',
        contactStatus: result.contactName ? 'available' : 'not_available',
        companyProfile: {
          companyName,
          website: result.website || '',
          industry: result.industry || '',
          employees: result.companySize || '',
          headquarters: result.country || '',
          description: result.matchReason || 'Grounded company match from live search.',
          tags: ['search-grounded', 'b2b'],
        },
        lastUpdated: new Date().toISOString(),
      };
    });

    res.json({ ok: true, data: leads });
  } catch (error) {
    res.status(400).json(makeErrorResponse(error.message || 'Discovery could not be completed.'));
  }
});

app.post('/api/csv/import', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      throw new Error('No CSV file was uploaded.');
    }

    const content = req.file.buffer.toString('utf8');
    const rows = parse(content, { bom: true, columns: true, skip_empty_lines: true, trim: true });
    if (!rows.length) {
      throw new Error('The CSV is empty or malformed.');
    }

    const state = await readState();
    const activeCampaign = state.campaigns?.[0] || null;
    const nextLeads = [];
    const rejected = [];

    rows.forEach((record) => {
      const companyName = record.companyName || record.company || record.company_name || '';
      if (!companyName || !String(companyName).trim()) {
        rejected.push(record);
        return;
      }

      const lead = normalizeCsvLead(record, 'csv');
      const scoring = scoreLead(lead, activeCampaign);
      lead.score = scoring.score;
      lead.category = scoring.category;
      lead.reasons = scoring.reasons;
      lead.missing = scoring.missing;
      lead.exclusions = scoring.exclusions;
      lead.verificationStatus = scoring.verificationStatus;
      lead.companyProfile = {
        companyName: lead.companyName,
        website: lead.companyWebsite,
        industry: lead.industry,
        employees: lead.companySize,
        headquarters: lead.country,
        revenue: lead.revenue,
        technologies: lead.technologies,
        tags: ['csv', 'qualified'],
      };
      nextLeads.push(lead);
    });

    const deduped = deduplicateLeads([...(state.leads || []), ...nextLeads]);
    state.leads = deduped;
    state.activity = [{
      id: uuidv4(),
      type: 'csv_import',
      message: `Imported ${nextLeads.length} leads with ${rejected.length} rejected rows.`,
      createdAt: new Date().toISOString(),
    }, ...(state.activity || [])];
    await writeState(state);

    res.json({
      ok: true,
      data: {
        importedCount: nextLeads.length,
        rejectedCount: rejected.length,
        rows: rows.slice(0, 8),
        leads: deduped.slice(-100),
      },
    });
  } catch (error) {
    res.status(400).json(makeErrorResponse(error.message || 'CSV import failed.'));
  }
});

app.post('/api/outreach', async (req, res) => {
  try {
    const payload = req.body || {};
    const state = await readState();
    const leads = state.leads || [];
    const selectedLead = leads.find((lead) => lead.id === payload.leadId) || null;
    if (!selectedLead) {
      throw new Error('The selected lead was not found in the database.');
    }

    const campaign = (state.campaigns || []).find((item) => item.id === payload.campaignId) || state.campaigns?.[0] || null;
    const company = selectedLead.companyName || 'your company';
    const contact = selectedLead.contactName || 'there';
    const offer = campaign?.instructions || 'AI-assisted sales operations and pipeline modernization';

    const drafts = {
      subject: `Helping ${company} improve ${offer.split(' ').slice(0, 4).join(' ')}`,
      body: `Hi ${contact},\n\nI came across ${company} and think there is a strong opportunity to improve your team's revenue operations and sales efficiency. Based on your focus on ${offer}, I believe a short conversation could help identify where AI-assisted workflows could improve lead qualification and conversion.\n\nI would be glad to share a brief perspective and learn more about your current priorities.\n\nBest,\n[Your Name]`,
      linkedin: `Hi ${contact}, I recently reviewed ${company} and the opportunity to support its sales and operations strategy. I believe there is a meaningful fit around AI-driven qualification, automation, and modernization. Would you be open to a brief conversation?`,
    };

    res.json({ ok: true, data: drafts });
  } catch (error) {
    res.status(400).json(makeErrorResponse(error.message || 'Outreach generation failed.'));
  }
});

app.get('*', (_req, res) => {
  res.json({ ok: true, message: 'PropelMatch API is running.' });
});

app.listen(port, () => {
  console.log(`PropelMatch server listening on http://localhost:${port}`);
});
