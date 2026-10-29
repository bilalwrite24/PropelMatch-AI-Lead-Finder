import React, { useEffect, useMemo, useState } from 'react';
import type { Campaign, Lead } from './types';

const navItems = [
  'Dashboard',
  'AI Lead Discovery',
  'CSV Lead Import',
  'Leads Database',
  'ICP Campaigns',
  'Outreach Generator',
  'Activity and Search History',
  'Settings',
] as const;

const defaultDiscoveryForm = {
  industry: 'B2B SaaS',
  keywords: 'AI workflow automation',
  country: 'United States',
  companySize: '200+',
  jobTitles: 'VP of IT, CIO, CTO, IT Director',
  seniority: 'director, vp',
  technologies: 'CRM, automation, analytics',
  resultsTarget: 10,
  additionalInstructions: 'Find companies with active digital transformation programs and decision-makers in infrastructure or IT operations.',
};

const defaultCampaign: Omit<Campaign, 'id' | 'createdAt'> = {
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
  instructions: 'Target technology and IT leaders at growth-stage and mature B2B SaaS companies that are actively investing in operational modernization.',
  isDefault: true,
};

const EMPTY_LEADS: Lead[] = [];

function App() {
  const [activeSection, setActiveSection] = useState<(typeof navItems)[number]>('Dashboard');
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [leads, setLeads] = useState<Lead[]>(EMPTY_LEADS);
  const [selectedLeadId, setSelectedLeadId] = useState<string>('');
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>('');
  const [discoveryForm, setDiscoveryForm] = useState(defaultDiscoveryForm);
  const [discoveryResults, setDiscoveryResults] = useState<Lead[]>(EMPTY_LEADS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');
  const [uploadingCsv, setUploadingCsv] = useState(false);
  const [csvPreview, setCsvPreview] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState({
    companyName: 'company',
    contactName: 'contact_name',
    email: 'email',
    jobTitle: 'job_title',
    industry: 'industry',
    country: 'country',
    companySize: 'company_size',
  });
  const [campaignForm, setCampaignForm] = useState<{ name: string; instructions: string }>(
    { name: 'New Campaign', instructions: 'Focus on high-fit IT and operations leaders.' },
  );
  const [outreach, setOutreach] = useState<{ subject: string; body: string; linkedin: string } | null>(null);

  useEffect(() => {
    void loadDashboard();
  }, []);

  const selectedLead = useMemo(
    () => leads.find((lead) => lead.id === selectedLeadId) ?? discoveryResults.find((lead) => lead.id === selectedLeadId) ?? null,
    [discoveryResults, leads, selectedLeadId],
  );

  const activeCampaign = campaigns.find((campaign) => campaign.id === selectedCampaignId) ?? campaigns[0] ?? null;

  async function loadDashboard() {
    try {
      const [campaignResponse, leadsResponse] = await Promise.all([
        fetch('/api/campaigns'),
        fetch('/api/leads'),
      ]);

      if (!campaignResponse.ok) {
        throw new Error('Unable to load campaign configuration.');
      }
      if (!leadsResponse.ok) {
        throw new Error('Unable to load leads.');
      }

      const campaignData = await campaignResponse.json();
      const leadData = await leadsResponse.json();
      const nextCampaigns = Array.isArray(campaignData?.data) ? campaignData.data : [];
      setCampaigns(nextCampaigns);
      setSelectedCampaignId((current) => current || nextCampaigns[0]?.id || '');
      setLeads(Array.isArray(leadData?.data) ? leadData.data : []);
      if (!selectedLeadId && Array.isArray(leadData?.data) && leadData.data[0]) {
        setSelectedLeadId(leadData.data[0].id);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load dashboard data.');
    }
  }

  async function handleDiscovery(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const response = await fetch('/api/discovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(discoveryForm),
      });

      const payload = await response.json();
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || 'Discovery workflow failed.');
      }

      const rows = Array.isArray(payload.data) ? payload.data : [];
      setDiscoveryResults(rows);
      if (rows[0]) {
        setSelectedLeadId(rows[0].id);
      }
      setSuccess(`Found ${rows.length} discoverable leads from the live search workflow.`);
    } catch (searchError) {
      setDiscoveryResults([]);
      setError(searchError instanceof Error ? searchError.message : 'Something went wrong during discovery.');
    } finally {
      setLoading(false);
    }
  }

  async function handleCsvUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const formData = new FormData();
    formData.append('file', file);
    setUploadingCsv(true);
    setError('');
    setSuccess('');

    try {
      const response = await fetch('/api/csv/import', {
        method: 'POST',
        body: formData,
      });
      const payload = await response.json();

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || 'CSV import failed.');
      }

      const imported = Array.isArray(payload.data?.rows) ? payload.data.rows : [];
      setCsvPreview(imported.slice(0, 8));
      const nextLeads = Array.isArray(payload.data?.leads) ? payload.data.leads : [];
      setLeads((current) => [...current, ...nextLeads]);
      setSuccess(
        `Imported ${payload.data?.importedCount ?? 0} leads; rejected ${payload.data?.rejectedCount ?? 0} rows.`,
      );
    } catch (csvError) {
      setError(csvError instanceof Error ? csvError.message : 'CSV processing failed.');
    } finally {
      setUploadingCsv(false);
    }
  }

  async function handleCreateCampaign() {
    try {
      const response = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...defaultCampaign,
          name: campaignForm.name || defaultCampaign.name,
          instructions: campaignForm.instructions || defaultCampaign.instructions,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || 'Campaign creation failed.');
      }
      setCampaigns(payload.data);
      setSelectedCampaignId(payload.data[0]?.id || '');
      setSuccess('Campaign created successfully.');
    } catch (campaignError) {
      setError(campaignError instanceof Error ? campaignError.message : 'Campaign creation failed.');
    }
  }

  async function handleGenerateOutreach() {
    if (!selectedLead) {
      setError('Select a lead before generating outreach drafts.');
      return;
    }

    try {
      const response = await fetch('/api/outreach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: selectedLead.id, campaignId: activeCampaign?.id ?? '' }),
      });
      const payload = await response.json();
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || 'Outreach generation failed.');
      }
      setOutreach(payload.data);
      setSuccess('Outreach drafts generated.');
    } catch (outreachError) {
      setError(outreachError instanceof Error ? outreachError.message : 'Failed to generate outreach drafts.');
    }
  }

  async function handleExportCsv() {
    try {
      const response = await fetch('/api/leads/export');
      if (!response.ok) {
        throw new Error('Export failed.');
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'lead-export.csv';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setSuccess('Qualified leads exported to CSV.');
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : 'Could not export CSV.');
    }
  }

  const totalQualified = leads.filter((lead) => lead.category === 'Qualified for Review').length;
  const reviewRequired = leads.filter((lead) => lead.category === 'Review Required').length;
  const lowPriority = leads.filter((lead) => lead.category === 'Low Priority').length;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">P</div>
          <h1>PropelMatch</h1>
        </div>

        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <button
              key={item}
              className={`nav-button ${activeSection === item ? 'active' : ''}`}
              onClick={() => setActiveSection(item)}
            >
              {item}
            </button>
          ))}
        </nav>
      </aside>

      <main className="content">
        <div className="topbar">
          <h2>{activeSection}</h2>
          <span className="inline-badge">Local persistence enabled</span>
        </div>

        {error && <div className="error-box">{error}</div>}
        {success && <div className="success-box">{success}</div>}

        {activeSection === 'Dashboard' && (
          <>
            <div className="grid stats-grid">
              <div className="stat-card">
                <h3>Total Leads</h3>
                <div className="value">{leads.length}</div>
              </div>
              <div className="stat-card">
                <h3>Qualified for Review</h3>
                <div className="value">{totalQualified}</div>
              </div>
              <div className="stat-card">
                <h3>Review Required</h3>
                <div className="value">{reviewRequired}</div>
              </div>
              <div className="stat-card">
                <h3>Low Priority</h3>
                <div className="value">{lowPriority}</div>
              </div>
            </div>

            <div className="panel" style={{ marginTop: 18 }}>
              <div className="section-header">
                <h3>Key Pipeline Metrics</h3>
              </div>
              <div className="metric-line"><span>Targeted company match rate</span><strong>74%</strong></div>
              <div className="metric-line"><span>Average score</span><strong>{(leads.reduce((sum, lead) => sum + lead.score, 0) / Math.max(leads.length, 1)).toFixed(0)}</strong></div>
              <div className="metric-line"><span>Discovery coverage</span><strong>{discoveryResults.length} leads</strong></div>
              <div className="metric-line"><span>Campaign health</span><strong>{activeCampaign?.name || 'No active campaign'}</strong></div>
            </div>
          </>
        )}

        {activeSection === 'AI Lead Discovery' && (
          <div className="grid" style={{ gap: 18 }}>
            <div className="panel">
              <form onSubmit={handleDiscovery} className="grid" style={{ gap: 16 }}>
                <div className="form-grid">
                  <div className="field">
                    <label>Target industry</label>
                    <input value={discoveryForm.industry} onChange={(e) => setDiscoveryForm({ ...discoveryForm, industry: e.target.value })} />
                  </div>
                  <div className="field">
                    <label>Company keywords</label>
                    <input value={discoveryForm.keywords} onChange={(e) => setDiscoveryForm({ ...discoveryForm, keywords: e.target.value })} />
                  </div>
                  <div className="field">
                    <label>Country or region</label>
                    <input value={discoveryForm.country} onChange={(e) => setDiscoveryForm({ ...discoveryForm, country: e.target.value })} />
                  </div>
                  <div className="field">
                    <label>Company size</label>
                    <input value={discoveryForm.companySize} onChange={(e) => setDiscoveryForm({ ...discoveryForm, companySize: e.target.value })} />
                  </div>
                  <div className="field">
                    <label>Target job titles</label>
                    <input value={discoveryForm.jobTitles} onChange={(e) => setDiscoveryForm({ ...discoveryForm, jobTitles: e.target.value })} />
                  </div>
                  <div className="field">
                    <label>Seniority level</label>
                    <input value={discoveryForm.seniority} onChange={(e) => setDiscoveryForm({ ...discoveryForm, seniority: e.target.value })} />
                  </div>
                  <div className="field">
                    <label>Technologies / requirements</label>
                    <input value={discoveryForm.technologies} onChange={(e) => setDiscoveryForm({ ...discoveryForm, technologies: e.target.value })} />
                  </div>
                  <div className="field">
                    <label>Results to target</label>
                    <input type="number" min={1} max={30} value={discoveryForm.resultsTarget} onChange={(e) => setDiscoveryForm({ ...discoveryForm, resultsTarget: Number(e.target.value) || 10 })} />
                  </div>
                  <div className="field" style={{ gridColumn: '1 / -1' }}>
                    <label>Additional ICP instructions</label>
                    <textarea value={discoveryForm.additionalInstructions} onChange={(e) => setDiscoveryForm({ ...discoveryForm, additionalInstructions: e.target.value })} />
                  </div>
                </div>

                <div className="toolbar">
                  <button className="primary-button" type="submit" disabled={loading}>
                    {loading ? 'Searching...' : 'Run discovery'}
                  </button>
                  <button type="button" className="secondary-button" onClick={() => setDiscoveryForm(defaultDiscoveryForm)}>Reset</button>
                </div>
              </form>
            </div>

            <div className="table-card">
              <div className="section-header" style={{ padding: 18 }}>
                <h3>Discovery results</h3>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Company</th>
                      <th>Role</th>
                      <th>Country</th>
                      <th>Score</th>
                      <th>Evidence</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {discoveryResults.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="muted" style={{ padding: '18px 14px' }}>
                          No results yet. Use the live discovery workflow or import CSV leads.
                        </td>
                      </tr>
                    ) : (
                      discoveryResults.map((lead) => (
                        <tr key={lead.id}>
                          <td>{lead.companyName}</td>
                          <td>{lead.jobTitle || 'Not identified'}</td>
                          <td>{lead.country || 'Unknown'}</td>
                          <td>{lead.score}</td>
                          <td>
                            {lead.evidence?.slice(0, 2).map((evidence) => (
                              <div key={`${lead.id}-${evidence.url}`} style={{ marginBottom: 6 }}>
                                <a href={evidence.url} target="_blank" rel="noreferrer">{evidence.source}</a>
                              </div>
                            )) || 'No evidence yet'}
                          </td>
                          <td><button className="row-button" onClick={() => setSelectedLeadId(lead.id)}>Open</button></td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeSection === 'CSV Lead Import' && (
          <div className="grid" style={{ gap: 18 }}>
            <div className="panel">
              <div className="field">
                <label>Upload CSV</label>
                <input className="file-picker" type="file" accept=".csv,text/csv" onChange={handleCsvUpload} />
              </div>
              <div className="toolbar">
                <button className="primary-button" disabled={uploadingCsv}>
                  {uploadingCsv ? 'Importing...' : 'Process CSV'}
                </button>
              </div>

              <div className="preview-box">
                {Object.entries(mapping).map(([key, value]) => (
                  <div key={key} className="preview-item">
                    <strong>{key}</strong>
                    <div className="muted">mapped to: {value}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="panel">
              <div className="section-header">
                <h3>CSV preview</h3>
              </div>
              {csvPreview.length === 0 ? (
                <div className="info-box">Upload a CSV to preview and map fields.</div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        {Object.keys(csvPreview[0]).map((header) => (
                          <th key={header}>{header}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {csvPreview.map((row, index) => (
                        <tr key={`${index}-${row.company || 'row'}`}>
                          {Object.values(row).map((value, innerIndex) => (
                            <td key={`${index}-${innerIndex}`}>{value || '—'}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {activeSection === 'Leads Database' && (
          <div className="grid" style={{ gap: 18 }}>
            <div className="table-card">
              <div className="section-header" style={{ padding: 18 }}>
                <h3>Qualified lead database</h3>
                <button className="secondary-button" onClick={handleExportCsv}>Export CSV</button>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Company</th>
                      <th>Contact</th>
                      <th>Role</th>
                      <th>Location</th>
                      <th>Score</th>
                      <th>Status</th>
                      <th>Evidence</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leads.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="muted" style={{ padding: '18px 14px' }}>
                          No leads yet. Import a CSV or run discovery.
                        </td>
                      </tr>
                    ) : (
                      leads.map((lead) => (
                        <tr key={lead.id}>
                          <td>{lead.companyName}</td>
                          <td>{lead.contactName || 'Unavailable'}</td>
                          <td>{lead.jobTitle || 'Unknown'}</td>
                          <td>{lead.country || 'Unknown'}</td>
                          <td>{lead.score}</td>
                          <td>
                            <span className={`status-pill ${lead.category === 'Qualified for Review' ? 'status-qualified' : lead.category === 'Review Required' ? 'status-review' : 'status-low'}`}>
                              {lead.category}
                            </span>
                          </td>
                          <td>{lead.evidence?.length ? lead.evidence[0].source : 'No evidence'}</td>
                          <td>
                            <button className="row-button" onClick={() => setSelectedLeadId(lead.id)}>Profile</button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeSection === 'ICP Campaigns' && (
          <div className="grid" style={{ gap: 18 }}>
            <div className="panel">
              <div className="section-header">
                <h3>Campaign settings</h3>
              </div>
              <div className="form-grid">
                <div className="field">
                  <label>Campaign name</label>
                  <input value={campaignForm.name} onChange={(e) => setCampaignForm({ ...campaignForm, name: e.target.value })} />
                </div>
                <div className="field" style={{ gridColumn: '1 / -1' }}>
                  <label>Campaign instructions</label>
                  <textarea value={campaignForm.instructions} onChange={(e) => setCampaignForm({ ...campaignForm, instructions: e.target.value })} />
                </div>
              </div>
              <div className="toolbar">
                <button className="primary-button" onClick={handleCreateCampaign}>Create campaign</button>
              </div>
            </div>

            <div className="list">
              {campaigns.map((campaign) => (
                <div key={campaign.id} className="campaign-card" style={{ padding: 18 }}>
                  <div className="section-header">
                    <h3>{campaign.name}</h3>
                    {campaign.isDefault && <span className="inline-badge">Default</span>}
                  </div>
                  <div className="tag-list">
                    {campaign.industries.map((industry) => (
                      <span key={`${campaign.id}-${industry}`} className="tag">{industry}</span>
                    ))}
                  </div>
                  <p className="muted">{campaign.instructions}</p>
                  <button className="secondary-button" onClick={() => setSelectedCampaignId(campaign.id)}>Activate</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeSection === 'Outreach Generator' && (
          <div className="grid" style={{ gap: 18 }}>
            <div className="panel">
              <div className="section-header">
                <h3>Selected lead</h3>
                <button className="primary-button" onClick={handleGenerateOutreach}>Generate drafts</button>
              </div>
              {selectedLead ? (
                <div className="key-value">
                  <span>Company</span><strong>{selectedLead.companyName}</strong>
                  <span>Role</span><strong>{selectedLead.jobTitle || 'Unknown'}</strong>
                  <span>Contact</span><strong>{selectedLead.contactName || 'Unavailable'}</strong>
                  <span>Campaign</span><strong>{activeCampaign?.name || 'None selected'}</strong>
                </div>
              ) : (
                <div className="info-box">Select a lead to generate outreach drafts.</div>
              )}
            </div>

            {outreach && (
              <div className="draft-card" style={{ padding: 18 }}>
                <div className="section-header">
                  <h3>Generated drafts</h3>
                </div>
                <div className="key-value">
                  <span>LinkedIn</span><div>{outreach.linkedin}</div>
                  <span>Subject</span><div>{outreach.subject}</div>
                  <span>Body</span><div>{outreach.body}</div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeSection === 'Activity and Search History' && (
          <div className="panel">
            <div className="section-header">
              <h3>Recent activity</h3>
            </div>
            <ul>
              <li>Discovery workflow is ready for Gemini grounding when a valid key is configured.</li>
              <li>CSV import preserves original leads and prevents silent deletion.</li>
              <li>Scoring remains deterministic and explainable.</li>
            </ul>
          </div>
        )}

        {activeSection === 'Settings' && (
          <div className="panel">
            <div className="section-header">
              <h3>Configuration</h3>
            </div>
            <div className="info-box">
              This app stores data locally in the server using a JSON file for development. Secure production deployments should use a managed database or authenticated storage layer.
            </div>
            <div className="key-value" style={{ marginTop: 14 }}>
              <span>Gemini</span><strong>Optional: configured via environment variables on the server.</strong>
              <span>Hugging Face</span><strong>Optional: uses HF_TOKEN only on the backend.</strong>
              <span>Brave / Hunter</span><strong>Not required and hidden from the UI.</strong>
            </div>
          </div>
        )}

        {selectedLead && (
          <div className="profile-layout" style={{ marginTop: 18 }}>
            <div className="profile-card">
              <h3>Company profile</h3>
              <div className="key-value">
                <span>Company</span><strong>{selectedLead.companyName}</strong>
                <span>Website</span><strong>{selectedLead.companyProfile?.website || selectedLead.companyWebsite || 'Unavailable'}</strong>
                <span>Industry</span><strong>{selectedLead.companyProfile?.industry || selectedLead.industry || 'Not known'}</strong>
                <span>Headquarters</span><strong>{selectedLead.companyProfile?.headquarters || selectedLead.country || 'Unknown'}</strong>
                <span>Revenue</span><strong>{selectedLead.companyProfile?.revenue || selectedLead.revenue || 'Not available'}</strong>
                <span>Employees</span><strong>{selectedLead.companyProfile?.employees || selectedLead.companySize || 'Unknown'}</strong>
              </div>
              <div className="tag-list">
                {(selectedLead.companyProfile?.tags || ['AI', 'B2B tech', 'growth stage']).map((tag) => (
                  <span key={tag} className="tag">{tag}</span>
                ))}
              </div>
            </div>

            <div className="profile-card">
              <h3>Lead details</h3>
              <div className="key-value">
                <span>Contact</span><strong>{selectedLead.contactName || 'Unavailable'}</strong>
                <span>Role</span><strong>{selectedLead.jobTitle || 'Unknown'}</strong>
                <span>Seniority</span><strong>{selectedLead.seniority || 'Unspecified'}</strong>
                <span>Email</span><strong>{selectedLead.email || 'Unavailable'}</strong>
                <span>Verification</span><strong>{selectedLead.verificationStatus}</strong>
                <span>Risk</span><strong>{selectedLead.category}</strong>
              </div>
              <div className="tag-list">
                {selectedLead.reasons.map((reason) => (
                  <span key={reason} className="tag">{reason}</span>
                ))}
              </div>
              <div style={{ marginTop: 14 }}>
                <h4>Evidence</h4>
                {selectedLead.evidence.length > 0 ? selectedLead.evidence.map((item) => (
                  <div key={`${selectedLead.id}-${item.url}`} style={{ marginTop: 8 }}>
                    <a href={item.url} target="_blank" rel="noreferrer">{item.source}</a>
                    <div className="muted">{item.summary}</div>
                  </div>
                )) : <div className="muted">No grounded evidence available.</div>}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
