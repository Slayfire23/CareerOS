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
    <h2 id="location-heading" className="text-lg font-semibold">Location and commute preferences</h2>
    <p className="text-sm text-muted">All fields are optional. These preferences do not change your remote, hybrid, or on-site choices.</p>
    <fieldset disabled={pending} className="space-y-4">
      <div><label htmlFor="preferredLocations" className="label">Preferred cities or regions</label>
        <textarea id="preferredLocations" name="preferredLocations" rows={3} maxLength={1100} value={locations} onChange={event => setLocations(event.target.value)} aria-describedby="locations-help" className="field" />
        <p id="locations-help" className="hint">One location per line, up to 10 locations of 100 characters each. Include a state or country when helpful.</p>
      </div>
      <div><label htmlFor="relocationWillingness" className="label">Willing to relocate</label>
        <select id="relocationWillingness" name="relocationWillingness" value={relocation} onChange={event => setRelocation(event.target.value)} className="field">
          <option value="">Not specified</option>
          {RELOCATION_CHOICES.map(choice => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
        </select>
      </div>
      <div><label htmlFor="maxCommuteMinutes" className="label">Maximum one-way commute (minutes)</label>
        <input id="maxCommuteMinutes" name="maxCommuteMinutes" type="number" min={0} max={300} step={1} value={commute} onChange={event => setCommute(event.target.value)} aria-describedby="commute-help" className="field" />
        <p id="commute-help" className="hint">Whole minutes from 0 to 300. Leave blank if unspecified; 0 means no commute.</p>
      </div>
      <button className="btn btn-primary" type="submit">{pending ? "Saving…" : "Save location preferences"}</button>
    </fieldset>
    {state.error && <p role="alert">{state.error}</p>}
    {state.message && <p role="status">{state.message}</p>}
  </form>;
}
