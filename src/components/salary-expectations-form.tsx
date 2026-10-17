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
  <h2 id="salary-heading" className="text-xl font-semibold">Salary expectations</h2>
  <p>Optional base pay before taxes, excluding bonuses and equity. Enter either or both amounts. Clear both amounts to remove your salary expectations.</p>
  <fieldset disabled={pending} className="space-y-4">
   <div><label htmlFor="salaryMin" className="mb-2 block">Minimum pay</label><input id="salaryMin" name="salaryMin" type="number" min="0" max="9999999.99" step="0.01" value={minimum} onChange={e=>setMinimum(e.target.value)} className="w-full rounded border p-3" /></div>
   <div><label htmlFor="salaryMax" className="mb-2 block">Maximum pay</label><input id="salaryMax" name="salaryMax" type="number" min="0" max="9999999.99" step="0.01" value={maximum} onChange={e=>setMaximum(e.target.value)} className="w-full rounded border p-3" /></div>
   <div><label htmlFor="salaryCurrency" className="mb-2 block">Currency</label><select id="salaryCurrency" name="salaryCurrency" required={!!(minimum||maximum)} value={currency} onChange={e=>setCurrency(e.target.value)} className="w-full rounded border p-3"><option value="">Not specified</option>{SALARY_CURRENCIES.map(value=><option key={value} value={value}>{value}</option>)}</select></div>
   <div><label htmlFor="salaryPeriod" className="mb-2 block">Pay period</label><select id="salaryPeriod" name="salaryPeriod" required={!!(minimum||maximum)} value={period} onChange={e=>setPeriod(e.target.value)} className="w-full rounded border p-3"><option value="">Not specified</option>{SALARY_PERIODS.map(({value,label})=><option key={value} value={value}>{label}</option>)}</select></div>
   <button type="submit" className="rounded bg-blue-700 px-5 py-3 text-white disabled:opacity-50">{pending?"Saving…":"Save salary expectations"}</button>
  </fieldset>
  {state.error&&<p role="alert">{state.error}</p>}{state.message&&<p role="status">{state.message}</p>}
 </form>;
}
