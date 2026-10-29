import type { Metadata } from "next";
import { ProfessionalExperience } from "@/components/professional-experience";
import { ProfileSectionPage } from "@/components/section-page";
import { Card } from "@/components/ui";

export const metadata: Metadata = { title: "Experience" };

export default function ExperiencePage() {
  return <ProfileSectionPage title="Experience" description="Roles you have held, most recent first." render={profile => <Card><ProfessionalExperience entries={profile.professionalExperiences} /></Card>} />;
}
