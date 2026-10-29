"use client";

import { useActionState, useState } from "react";
import {
  saveProfile,
  type ProfileState,
} from "@/app/dashboard/actions";

type Profile = {
  displayName: string;
  headline: string | null;
  careerGoals: string | null;
};

export function ProfileForm({ profile }: { profile: Profile }) {
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [headline, setHeadline] = useState(profile.headline ?? "");
  const [careerGoals, setCareerGoals] = useState(profile.careerGoals ?? "");

  const initialState: ProfileState = {};
  const [state, formAction, pending] = useActionState(
    saveProfile,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-5">
      <h2 className="text-lg font-semibold">Your career profile</h2>

      <fieldset disabled={pending} className="space-y-5">
        <div>
          <label htmlFor="displayName" className="label">
            Display name
          </label>
          <input
            id="displayName"
            name="displayName"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            autoComplete="name"
            required
            maxLength={100}
            className="field"
          />
        </div>

        <div>
          <label htmlFor="headline" className="label">
            Headline (optional)
          </label>
          <input
            id="headline"
            name="headline"
            value={headline}
            onChange={(event) => setHeadline(event.target.value)}
            maxLength={200}
            placeholder="For example: Full-stack developer"
            className="field"
          />
        </div>

        <div>
          <label htmlFor="careerGoals" className="label">
            Career goals (optional)
          </label>
          <textarea
            id="careerGoals"
            name="careerGoals"
            value={careerGoals}
            onChange={(event) => setCareerGoals(event.target.value)}
            maxLength={5000}
            rows={5}
            placeholder="What kinds of roles and opportunities interest you?"
            className="field"
          />
        </div>

        <button
          type="submit"
          className="btn btn-primary"
        >
          {pending ? "Saving…" : "Save profile"}
        </button>
      </fieldset>

      {state.error && (
        <p role="alert">
          {state.error}
        </p>
      )}

      {state.message && (
        <p role="status">
          {state.message}
        </p>
      )}
    </form>
  );
}