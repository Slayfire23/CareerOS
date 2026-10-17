"use client";

import { useActionState } from "react";
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
        <button type="submit" disabled={pending} aria-label={`Remove ${skill.name}`} className="rounded border px-3 py-2 disabled:opacity-50">{pending ? "Removing…" : "Remove"}</button>
      </form>
    </div>
    {state.error && <p role="alert" className="text-red-600 dark:text-red-400">{state.error}</p>}
  </li>;
}

export function TechnicalSkills({ skills }: { skills: Skill[] }) {
  const [state, action, pending] = useActionState(saveTechnicalSkill, {} as SkillState);
  return <section aria-labelledby="technical-skills-heading" className="space-y-5">
    <h2 id="technical-skills-heading" className="text-xl font-semibold">Technical skills</h2>
    <p>Add skills such as TypeScript, SolidWorks, or AutoCAD. Proficiency is optional and self-assessed.</p>
    {skills.length ? <ul className="space-y-2">{skills.map((skill) => <SkillRow key={skill.id} skill={skill} />)}</ul> : <p>No technical skills added yet.</p>}
    <form action={action} aria-label="Add or update technical skill" className="space-y-4">
      <fieldset disabled={pending} className="space-y-4">
        <div><label htmlFor="skill-name" className="mb-2 block">Skill name</label>
          <input id="skill-name" name="name" required maxLength={100} className="w-full rounded-lg border p-3" /></div>
        <div><label htmlFor="skill-level" className="mb-2 block">Proficiency (self-assessed, optional)</label>
          <select id="skill-level" name="proficiency" defaultValue="" className="w-full rounded-lg border p-3">
            <option value="">Not specified</option>
            {SKILL_LEVELS.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
          </select></div>
        <p className="text-sm">To update a level, enter the same skill name and save again. Leaving the level unspecified clears it.</p>
        <button type="submit" className="rounded-lg bg-blue-700 px-5 py-3 font-semibold text-white disabled:opacity-50">{pending ? "Saving skill…" : "Save skill"}</button>
      </fieldset>
      {state.error && <p role="alert" className="text-red-600 dark:text-red-400">{state.error}</p>}
      {state.message && <p role="status">{state.message}</p>}
    </form>
  </section>;
}
