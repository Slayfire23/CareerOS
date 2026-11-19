// What a user agrees to before any cloud AI analysis. The consent screen renders these lists, and
// the evidence builder and redaction enforce them. Changing the provider, model family, the fields
// sent, or what is said about redaction requires a new CLOUD_CONSENT_VERSION, which asks every
// user to consent again.
//
// Version 2: states that text cleaning is automatic and incomplete, instead of implying that all
// names and organizations are removed.

export const CLOUD_CONSENT_VERSION = 2;
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
  "Your name and email address as fields, and your account details",
  "The company field of your experience and the school field of your education",
  "The job description, company, and posting link",
  "Resumes and resume text",
  "Salary, location, and other preferences",
] as const;

/** How free text is cleaned before sending, stated with its limits. */
export const CLOUD_TEXT_CLEANING =
  "Before sending, CareerOS automatically replaces your profile name, the employer and school names in your profile, " +
  "this job's company, your account email, and any email addresses, phone numbers, and links it finds in the text above.";
export const CLOUD_TEXT_LIMITS =
  "This cleaning is not guaranteed to catch everything. Other names you wrote in descriptions or requirements, such as " +
  "colleagues, clients, products, or other organizations, can still be sent. Remove anything you don't want shared " +
  "before choosing cloud analysis.";

export function hasCurrentCloudConsent(user: { aiCloudConsentAt: Date | null; aiCloudConsentVersion: number | null }): boolean {
  return user.aiCloudConsentAt !== null && user.aiCloudConsentVersion === CLOUD_CONSENT_VERSION;
}
