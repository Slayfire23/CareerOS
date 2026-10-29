"use client";

import { useActionState } from "react";
import { ConfirmButton } from "@/components/confirm-button";
import { saveTechnicalSkill, removeTechnicalSkill, type SkillState } from "@/app/dashboard/skills-actions";
import { SKILL_LEVELS, type Skill } from "@/lib/technical-skills";

function SkillRow({ skill }: { skill: Skill }) {
  const [state, action, pending] = useActionState(removeTechnicalSkill, {} as SkillState);
  const level = SKILL_LEVELS.find((item) => item.value === skill.proficiency)?.label;
  return <li className="rounded-lg border p-3">
    <div className="flex items-center justify-between gap-3">
      <p><strong>{skill.name}</strong> — {level ? `${level} (self-assessed)` : "Proficiency not specified"}</p>
      <form action={action}>
        <input type="hidden" name="skillId" value={skill.id} />
        <ConfirmButton label="Remove" ariaLabel={`Remove ${skill.name}`} confirmLabel="remove" pending={pending} pendingLabel="Removing…" />
      </form>
    </div>
    {state.error && <p role="alert">{state.error}</p>}
  </li>;
}

export function TechnicalSkills({ skills }: { skills: Skill[] }) {
  const [state, action, pending] = useActionState(saveTechnicalSkill, {} as SkillState);
  return <section aria-labelledby="technical-skills-heading" className="space-y-5">
    <h2 id="technical-skills-heading" className="text-lg font-semibold">Technical skills</h2>
    <p className="text-sm text-muted">Add skills such as TypeScript, SolidWorks, or AutoCAD. Proficiency is optional and self-assessed.</p>
    {skills.length ? <ul className="space-y-2">{skills.map((skill) => <SkillRow key={skill.id} skill={skill} />)}</ul> : <p>No technical skills added yet.</p>}
    <form action={action} aria-label="Add or update technical skill" className="space-y-4">
      <fieldset disabled={pending} className="space-y-4">
        <div><label htmlFor="skill-name" className="label">Skill name</label>
          <input id="skill-name" name="name" required maxLength={100} className="field" /></div>
        <div><label htmlFor="skill-level" className="label">Proficiency (self-assessed, optional)</label>
          <select id="skill-level" name="proficiency" defaultValue="" className="field">
            <option value="">Not specified</option>
            {SKILL_LEVELS.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
          </select></div>
        <p className="hint">To update a level, enter the same skill name and save again. Leaving the level unspecified clears it.</p>
        <button type="submit" className="btn btn-primary">{pending ? "Saving skill…" : "Save skill"}</button>
      </fieldset>
      {state.error && <p role="alert">{state.error}</p>}
      {state.message && <p role="status">{state.message}</p>}
    </form>
  </section>;
}
