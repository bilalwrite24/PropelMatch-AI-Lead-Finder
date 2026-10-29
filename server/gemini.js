function normalizeText(value = '') {
  return String(value).trim().toLowerCase();
}

function normalizeEmail(value = '') {
  return normalizeText(value).replace(/\s+/g, '');
}

function normalizeDomain(value = '') {
  const trimmed = normalizeText(value).replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  return trimmed.replace(/^www\./, '');
}

export function scoreLead(lead, campaign = null) {
  let score = 0;
  const reasons = [];
  const missing = [];
  const exclusions = [];

  const companyName = normalizeText(lead.companyName || '');
  const industry = normalizeText(lead.industry || '');
  const country = normalizeText(lead.country || '');
  const title = normalizeText(lead.jobTitle || '');
  const seniority = normalizeText(lead.seniority || '');

  if (campaign) {
    const companySize = Number.parseInt(String(lead.companySize || '').replace(/[^0-9]/g, ''), 10) || 0;
    if (campaign.companySizeMin && companySize >= campaign.companySizeMin) {
      score += 25;
      reasons.push('Company size meets campaign threshold.');
    } else {
      missing.push('Company size is below the active campaign threshold.');
    }

    const geographyMatch = campaign.geography.some((location) => country.includes(normalizeText(location)));
    if (geographyMatch) {
      score += 10;
      reasons.push('Geography aligns with the campaign target market.');
    } else {
      missing.push('Geography does not match the current campaign market focus.');
    }

    const titleMatch = campaign.jobTitles.some((target) => title.includes(normalizeText(target)));
    const seniorityMatch = campaign.seniority.some((target) => seniority.includes(normalizeText(target)));
    if (titleMatch || seniorityMatch) {
      score += 30;
      reasons.push('Job title or seniority aligns with target decision-makers.');
    } else {
      missing.push('The role does not clearly align with the target job titles or seniority.');
    }

    if (campaign.requiredTechnologies.length) {
      const technologies = (lead.technologies || []).map((tech) => normalizeText(tech));
      const techMatch = campaign.requiredTechnologies.some((tech) => technologies.includes(normalizeText(tech)) || title.includes(normalizeText(tech)) || companyName.includes(normalizeText(tech)));
      if (techMatch) {
        score += 10;
        reasons.push('Technology relevance matches the campaign requirements.');
      } else {
        missing.push('No clear technology fit found for the active campaign.');
      }
    }

    if (campaign.excludedRoles.length) {
      const hasExcludedRole = campaign.excludedRoles.some((role) => title.includes(normalizeText(role)) || companyName.includes(normalizeText(role)));
      if (hasExcludedRole) {
        exclusions.push('Role is explicitly excluded by the active campaign rules.');
      }
    }

    if (campaign.excludedIndustries.length && lead.industry) {
      const isExcludedIndustry = campaign.excludedIndustries.some((entry) => normalizeText(lead.industry).includes(normalizeText(entry)));
      if (isExcludedIndustry) {
        exclusions.push('Industry is excluded by the active campaign rules.');
      }
    }
  }

  if (industry) {
    score += 20;
    reasons.push('Industry reflects the target market fit.');
  } else {
    missing.push('Industry is missing, so company fit is not yet confirmed.');
  }

  if (lead.evidence && lead.evidence.length > 0) {
    score += 15;
    reasons.push('Supporting evidence is available and grounded in source links.');
  } else {
    missing.push('No grounded evidence is currently available.');
  }

  if (lead.companyName && !companyName.includes('example')) {
    score += 5;
  }

  let normalizedScore = Math.max(0, Math.min(100, score));

  if (exclusions.length > 0) {
    normalizedScore = 0;
  }

  let category = 'Low Priority';
  if (normalizedScore >= 80) {
    category = 'Qualified for Review';
  } else if (normalizedScore >= 60) {
    category = 'Review Required';
  }

  return {
    score: Math.round(normalizedScore),
    category,
    reasons: reasons.length ? reasons : ['No direct fit signal yet.'],
    missing,
    exclusions,
    verificationStatus: lead.evidence && lead.evidence.length ? 'verified' : 'unverified',
    confidence: Math.min(100, Math.max(15, normalizedScore)),
    normalizedEmail: normalizeEmail(lead.email || ''),
    domain: normalizeDomain(lead.companyDomain || lead.companyWebsite || ''),
  };
}

export function deduplicateLeads(leads) {
  const map = new Map();

  for (const lead of leads) {
    const key = [
      normalizeEmail(lead.email || ''),
      normalizeDomain(lead.companyDomain || lead.companyWebsite || ''),
      normalizeText(lead.companyName || ''),
      normalizeText(lead.jobTitle || ''),
    ].join('::');

    if (!map.has(key)) {
      map.set(key, lead);
    }
  }

  return Array.from(map.values());
}
