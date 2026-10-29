import type { Metadata } from "next";
import { Projects } from "@/components/projects";
import { ProfileSectionPage } from "@/components/section-page";
import { Card } from "@/components/ui";

export const metadata: Metadata = { title: "Projects" };

export default function ProjectsPage() {
  return <ProfileSectionPage title="Projects" description="Optional. Projects and accomplishments from any field. Leaving this empty is fine." render={profile => <Card><Projects entries={profile.projects} /></Card>} />;
}
