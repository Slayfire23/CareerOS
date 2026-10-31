// What a user agrees to before any cloud AI analysis. The consent screen renders these lists, and
// the evidence builder and redaction enforce them. Changing the provider, model family, or the
// fields sent requires a new CLOUD_CONSENT_VERSION, which asks every user to consent again.

export const CLOUD_CONSENT_VERSION = 1;
export const CLOUD_PROVIDER_NAME = "Anthropic";
export const CLOUD_MODEL_LABEL = "Claude Sonnet 5.5";

export const CLOUD_SENT = [
  "The requirements you reviewed and saved for this job (not the job description itself)",
  "Skill names and the levels you chose",
  "Job titles, dates, and descriptions from your experience",
  "Qualifications, fields of study, dates, and descriptions from your education",
  "Project titles, descriptions, contributions, results, and skills",
] as const;

export const CLOUD_NOT_SENT = [
  "Your name, email address, and account details",
  "Company and school names (also removed from descriptions, along with email addresses, phone numbers, and links)",
  "The job description, company, and posting link",
  "Resumes and resume text",
  "Salary, location, and other preferences",
] as const;

export function hasCurrentCloudConsent(user: { aiCloudConsentAt: Date | null; aiCloudConsentVersion: number | null }): boolean {
  return user.aiCloudConsentAt !== null && user.aiCloudConsentVersion === CLOUD_CONSENT_VERSION;
}
