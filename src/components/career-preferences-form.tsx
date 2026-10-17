"use client";

import { useActionState, useState } from "react";
import { saveCareerPreferences, type PreferencesState } from "@/app/dashboard/preferences-actions";
import { WORK_ARRANGEMENTS, EMPLOYMENT_TYPES, type CareerPreferences } from "@/lib/career-preferences";

export function CareerPreferencesForm({ profile }: { profile: CareerPreferences }) {
  const [roles, setRoles] = useState(profile.targetRoles.join("\n"));
  const [industries, setIndustries] = useState(profile.industries.join("\n"));
  const [arrangements, setArrangements] = useState(profile.workArrangements);
  const [employment, setEmployment] = useState(profile.employmentTypes);
  const [state, action, pending] = useActionState(saveCareerPreferences, {} as PreferencesState);
  const toggle = (values: string[], value: string) => values.includes(value)
    ? values.filter((item) => item !== value) : [...values, value];

  return <form action={action} aria-labelledby="career-preferences-heading" className="space-y-5">
    <h2 id="career-preferences-heading" className="text-xl font-semibold">Career preferences</h2>
    <p>All fields are optional. Leave them blank if you are still exploring.</p>
    <fieldset disabled={pending} className="space-y-5">
      <div>
        <label htmlFor="targetRoles" className="mb-2 block">Target roles</label>
        <textarea id="targetRoles" name="targetRoles" rows={3} maxLength={1100}
          value={roles} onChange={(event) => setRoles(event.target.value)}
          aria-describedby="targetRoles-help" className="w-full rounded-lg border p-3" />
        <p id="targetRoles-help" className="text-sm">One role per line. Up to 10 roles, 100 characters each.</p>
      </div>
      <div>
        <label htmlFor="industries" className="mb-2 block">Industries of interest</label>
        <textarea id="industries" name="industries" rows={3} maxLength={1100}
          value={industries} onChange={(event) => setIndustries(event.target.value)}
          aria-describedby="industries-help" className="w-full rounded-lg border p-3" />
        <p id="industries-help" className="text-sm">One industry per line. Up to 10 industries, 100 characters each.</p>
      </div>
      <fieldset className="space-y-2">
        <legend className="mb-2 font-semibold">Work arrangement</legend>
        {WORK_ARRANGEMENTS.map(({ value, label }) => <label key={value} className="flex items-center gap-2">
          <input type="checkbox" name="workArrangements" value={value} checked={arrangements.includes(value)}
            onChange={() => setArrangements(toggle(arrangements, value))} />{label}
        </label>)}
      </fieldset>
      <fieldset className="space-y-2">
        <legend className="mb-2 font-semibold">Employment type</legend>
        {EMPLOYMENT_TYPES.map(({ value, label }) => <label key={value} className="flex items-center gap-2">
          <input type="checkbox" name="employmentTypes" value={value} checked={employment.includes(value)}
            onChange={() => setEmployment(toggle(employment, value))} />{label}
        </label>)}
      </fieldset>
      <button type="submit" className="rounded-lg bg-blue-700 px-5 py-3 font-semibold text-white disabled:opacity-50">
        {pending ? "Saving preferences…" : "Save career preferences"}
      </button>
    </fieldset>
    {state.error && <p role="alert" className="text-red-600 dark:text-red-400">{state.error}</p>}
    {state.message && <p role="status">{state.message}</p>}
  </form>;
}
