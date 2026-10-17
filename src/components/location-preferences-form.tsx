"use client";
import { useActionState, useState } from "react";
import { saveLocationPreferences, type LocationState } from "@/app/dashboard/location-actions";
import { RELOCATION_CHOICES, type LocationPreferences } from "@/lib/location-preferences";

export function LocationPreferencesForm({ profile }: { profile: LocationPreferences }) {
  const [locations, setLocations] = useState(profile.preferredLocations.join("\n"));
  const [relocation, setRelocation] = useState(profile.relocationWillingness ?? "");
  const [commute, setCommute] = useState(profile.maxCommuteMinutes?.toString() ?? "");
  const [state, action, pending] = useActionState(saveLocationPreferences, {} as LocationState);
  return <form action={action} aria-labelledby="location-heading" className="space-y-5">
    <h2 id="location-heading" className="text-xl font-semibold">Location and commute preferences</h2>
    <p>All fields are optional. These preferences do not change your remote, hybrid, or on-site choices.</p>
    <fieldset disabled={pending} className="space-y-4">
      <div><label htmlFor="preferredLocations" className="mb-2 block">Preferred cities or regions</label>
        <textarea id="preferredLocations" name="preferredLocations" rows={3} maxLength={1100} value={locations} onChange={event => setLocations(event.target.value)} aria-describedby="locations-help" className="w-full rounded border p-3" />
        <p id="locations-help">One location per line, up to 10 locations of 100 characters each. Include a state or country when helpful.</p>
      </div>
      <div><label htmlFor="relocationWillingness" className="mb-2 block">Willing to relocate</label>
        <select id="relocationWillingness" name="relocationWillingness" value={relocation} onChange={event => setRelocation(event.target.value)} className="w-full rounded border p-3">
          <option value="">Not specified</option>
          {RELOCATION_CHOICES.map(choice => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
        </select>
      </div>
      <div><label htmlFor="maxCommuteMinutes" className="mb-2 block">Maximum one-way commute (minutes)</label>
        <input id="maxCommuteMinutes" name="maxCommuteMinutes" type="number" min={0} max={300} step={1} value={commute} onChange={event => setCommute(event.target.value)} aria-describedby="commute-help" className="w-full rounded border p-3" />
        <p id="commute-help">Whole minutes from 0 to 300. Leave blank if unspecified; 0 means no commute.</p>
      </div>
      <button className="rounded bg-blue-700 px-5 py-3 text-white disabled:opacity-50" type="submit">{pending ? "Saving…" : "Save location preferences"}</button>
    </fieldset>
    {state.error && <p role="alert">{state.error}</p>}
    {state.message && <p role="status">{state.message}</p>}
  </form>;
}
