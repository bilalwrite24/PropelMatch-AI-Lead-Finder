export interface Lead {
  id: string;
  companyName: string;
  companyDomain?: string;
  companyWebsite?: string;
  contactName?: string;
  email?: string;
  jobTitle?: string;
  seniority?: string;
  industry?: string;
  country?: string;
  geography?: string;
  companySize?: string;
  revenue?: string;
  technologies?: string[];
  score: number;
  category: 'Qualified for Review' | 'Review Required' | 'Low Priority';
  confidence?: number;
  verificationStatus: 'verified' | 'unverified' | 'partial' | 'not_available';
  evidence: Evidence[];
  reasons: string[];
  missing: string[];
  exclusions: string[];
  source: 'web' | 'csv' | 'manual';
  matchStatus?: 'matched' | 'not_matched';
  contactStatus?: 'available' | 'not_available';
  lastUpdated?: string;
  companyProfile?: CompanyProfile;
}

export interface Evidence {
  source: string;
  url: string;
  summary: string;
  verified: boolean;
}

export interface CompanyProfile {
  companyName: string;
  website?: string;
  industry?: string;
  employees?: string;
  headquarters?: string;
  description?: string;
  revenue?: string;
  technologies?: string[];
  tags?: string[];
}

export interface Campaign {
  id: string;
  name: string;
  industries: string[];
  companySizeMin?: number;
  geography: string[];
  jobTitles: string[];
  seniority: string[];
  requiredTechnologies: string[];
  excludedIndustries: string[];
  excludedRoles: string[];
  requiredCharacteristics: string[];
  instructions: string;
  isDefault?: boolean;
  createdAt?: string;
}

export interface DiscoveryRequest {
  industry: string;
  keywords: string;
  country: string;
  companySize: string;
  jobTitles: string;
  seniority: string;
  technologies: string;
  resultsTarget: number;
  additionalInstructions: string;
}

export interface ApiResponse<T> {
  ok: boolean;
  data?: T;
  error?: string;
}
