import type { Metadata } from "next";
import { TechnicalSkills } from "@/components/technical-skills";
import { ProfileSectionPage } from "@/components/section-page";
import { Card } from "@/components/ui";

export const metadata: Metadata = { title: "Skills" };

export default function SkillsPage() {
  return <ProfileSectionPage title="Skills" description="Skills you have, with an optional self-assessed level." render={profile => <Card><TechnicalSkills skills={profile.technicalSkills} /></Card>} />;
}
