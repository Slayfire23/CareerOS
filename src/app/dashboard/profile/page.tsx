import type { Metadata } from "next";
import { ProfileForm } from "@/components/profile-form";
import { ProfileSectionPage } from "@/components/section-page";
import { Card } from "@/components/ui";

export const metadata: Metadata = { title: "Profile" };

export default function ProfilePage() {
  return <ProfileSectionPage title="Profile" description="Your name, headline, and career goals." render={profile => <Card><ProfileForm profile={profile} /></Card>} />;
}
