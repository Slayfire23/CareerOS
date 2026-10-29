import type { Metadata } from "next";
import { CareerPreferencesForm } from "@/components/career-preferences-form";
import { LocationPreferencesForm } from "@/components/location-preferences-form";
import { SalaryExpectationsForm } from "@/components/salary-expectations-form";
import { ProfileSectionPage } from "@/components/section-page";
import { Card } from "@/components/ui";

export const metadata: Metadata = { title: "Preferences" };

export default function PreferencesPage() {
  return <ProfileSectionPage title="Preferences" description="Target roles, work arrangements, location, and salary. Each card saves separately." render={profile => <div className="space-y-6">
    <Card><CareerPreferencesForm profile={profile} /></Card>
    <Card><LocationPreferencesForm profile={profile} /></Card>
    <Card><SalaryExpectationsForm profile={profile} /></Card>
  </div>} />;
}
