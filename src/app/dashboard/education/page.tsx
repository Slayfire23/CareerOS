import type { Metadata } from "next";
import { Education } from "@/components/education";
import { ProfileSectionPage } from "@/components/section-page";
import { Card } from "@/components/ui";

export const metadata: Metadata = { title: "Education" };

export default function EducationPage() {
  return <ProfileSectionPage title="Education" description="Degrees, diplomas, certificates, and current study." render={profile => <Card><Education entries={profile.educationEntries} /></Card>} />;
}
