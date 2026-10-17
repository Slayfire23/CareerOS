# CareerOS — Product Requirements

Status: updated October 16, 2026. Milestone 1 core functionality is implemented and deployed at https://career-os-flax-chi.vercel.app. Live account/profile/email workflows were verified by the owner. Milestone 2 is in progress; preferences and technical skills are deployed and verified by the owner; the full first-release feature list below is still the product roadmap. Open foundation follow-ups are tracked in TASKS.md.

## Vision

CareerOS is a free-to-users, AI-assisted career development and job-search platform. Its first users are two siblings pursuing software/technology and mechanical engineering opportunities. It should support other career paths as it grows. Hosting and external services may have operating costs.

## First release

- Account registration, sign-in, sign-out, and private career profiles.
- Multiple resumes per user, with uploads, storage, and preservation of older versions.
- Manual job entry and job-description analysis.
- Explainable qualification assessments: strengths, gaps, mandatory requirements, and uncertainty.
- Recommendations about which existing resume suits a role.
- Application tracking and status history.

## Product principles

- Never invent experience, qualifications, certifications, or achievements.
- Separate user-confirmed facts, user preferences, and AI inferences.
- Explore realistic adjacent careers using transferable skills; do not restrict discovery to one title.
- Distinguish strong matches, stretch opportunities, and career expansion opportunities.
- Require user approval for resume changes and application submissions.
- Enforce private-data ownership on the server; hiding records in the interface is insufficient.
- Design for users to review, correct, export, and delete their stored information.

## Later releases

Automatic job discovery, AI resume improvement, application assistance, interview coaching, email integration, and personalized recommendation feedback. Recommendations should learn from user feedback without treating model guesses as verified facts. Redis, queues, and advanced infrastructure will be introduced when these workflows require them.

## Milestones

1. Foundation: Next.js/TypeScript, PostgreSQL/Prisma, authentication, migrations, environment configuration, and initial automated tests. Success: two users can register, sign in, sign out, and manage separate basic profiles through a protected dashboard.
2. Career profiles and resumes: employment history, skills, projects, preferences, and multiple resume versions.
3. AI job analysis: analyze pasted job descriptions, explain qualifications and blockers, and recommend resumes without fabricating claims.
4. Application tracking: application records, status history, filtering, and basic feedback. The initial live deployment was brought forward into Milestone 1.

## Quality goals

Automated coverage for account boundaries and critical workflows, understandable recommendations, and no fabricated claims. Duplicate handling is required when application imports are introduced. Measure performance once a working baseline exists.

## Learning workflow

Build one checkpoint at a time. Explain the design, implement it, verify it, and review the relevant concept before expanding scope. Completion must be supported by executed checks, not just generated code.

## Milestone 2 starting scope

Replace overreliance on the single careerGoals paragraph with structured target roles/related paths, technical skills, professional experience, work arrangement, salary expectations (currency and pay period), industries, and location/commute preferences. Preserve existing free text during migration. Extend projects/education and private resume version management incrementally. No AI matching or resume storage is implemented yet.
