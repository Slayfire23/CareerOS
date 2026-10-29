"use client";
import { useActionState, useState } from "react";
import { saveSalaryExpectations, type SalaryState } from "@/app/dashboard/salary-actions";
import { SALARY_CURRENCIES, SALARY_PERIODS, salaryAmount, type SalaryExpectations } from "@/lib/salary-expectations";
export function SalaryExpectationsForm({profile}:{profile:SalaryExpectations}) {
 const [minimum,setMinimum]=useState(salaryAmount(profile.salaryMinCents));
 const [maximum,setMaximum]=useState(salaryAmount(profile.salaryMaxCents));
 const [currency,setCurrency]=useState(profile.salaryCurrency??"");
 const [period,setPeriod]=useState(profile.salaryPeriod??"");
 const [state,action,pending]=useActionState(saveSalaryExpectations,{} as SalaryState);
 return <form action={action} aria-labelledby="salary-heading" className="space-y-5">
  <h2 id="salary-heading" className="text-lg font-semibold">Salary expectations</h2>
  <p className="text-sm text-muted">Optional base pay before taxes, excluding bonuses and equity. Enter either or both amounts. Clear both amounts to remove your salary expectations.</p>
  <fieldset disabled={pending} className="grid gap-4 sm:grid-cols-2">
   <div><label htmlFor="salaryMin" className="label">Minimum pay</label><input id="salaryMin" name="salaryMin" type="number" min="0" max="9999999.99" step="0.01" value={minimum} onChange={e=>setMinimum(e.target.value)} className="field" /></div>
   <div><label htmlFor="salaryMax" className="label">Maximum pay</label><input id="salaryMax" name="salaryMax" type="number" min="0" max="9999999.99" step="0.01" value={maximum} onChange={e=>setMaximum(e.target.value)} className="field" /></div>
   <div><label htmlFor="salaryCurrency" className="label">Currency</label><select id="salaryCurrency" name="salaryCurrency" required={!!(minimum||maximum)} value={currency} onChange={e=>setCurrency(e.target.value)} className="field"><option value="">Not specified</option>{SALARY_CURRENCIES.map(value=><option key={value} value={value}>{value}</option>)}</select></div>
   <div><label htmlFor="salaryPeriod" className="label">Pay period</label><select id="salaryPeriod" name="salaryPeriod" required={!!(minimum||maximum)} value={period} onChange={e=>setPeriod(e.target.value)} className="field"><option value="">Not specified</option>{SALARY_PERIODS.map(({value,label})=><option key={value} value={value}>{label}</option>)}</select></div>
   <button type="submit" className="btn btn-primary sm:col-span-2 sm:justify-self-start">{pending?"Saving…":"Save salary expectations"}</button>
  </fieldset>
  {state.error&&<p role="alert">{state.error}</p>}{state.message&&<p role="status">{state.message}</p>}
 </form>;
}
