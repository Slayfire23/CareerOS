export const SALARY_CURRENCIES = ["USD", "CAD", "EUR", "GBP"] as const;
export const SALARY_PERIODS = [{value:"hour",label:"Hourly"},{value:"month",label:"Monthly"},{value:"year",label:"Yearly"}] as const;
export type SalaryExpectations = { salaryMinCents: number | null; salaryMaxCents: number | null; salaryCurrency: string | null; salaryPeriod: string | null };
export function salaryAmount(cents: number | null): string {
 if (cents === null) return "";
 return Math.floor(cents / 100) + "." + String(cents % 100).padStart(2,"0");
}
export function parseSalaryExpectations(form: FormData): SalaryExpectations {
 function single(key: string) {
  const values=form.getAll(key);
  if(values.length!==1 || typeof values[0]!=="string") throw new Error("Invalid salary fields. Reload and try again.");
  return values[0].trim();
 }
 function amount(key: string) {
  const value=single(key);if(!value)return null;
  if(!/^\d{1,7}(\.\d{1,2})?$/.test(value)) throw new Error("Enter pay from 0 to 9,999,999.99 with at most two decimals, without commas.");
  const [whole,fraction=""]=value.split(".");return Number(whole)*100+Number(fraction.padEnd(2,"0"));
 }
 const salaryMinCents=amount("salaryMin"),salaryMaxCents=amount("salaryMax");
 const salaryCurrency=single("salaryCurrency"),salaryPeriod=single("salaryPeriod");
 if(salaryCurrency && !SALARY_CURRENCIES.some(value=>value===salaryCurrency))throw new Error("Choose a listed currency.");
 if(salaryPeriod && !SALARY_PERIODS.some(option=>option.value===salaryPeriod))throw new Error("Choose a listed pay period.");
 if(salaryMinCents===null && salaryMaxCents===null)return {salaryMinCents:null,salaryMaxCents:null,salaryCurrency:null,salaryPeriod:null};
 if(!salaryCurrency || !salaryPeriod)throw new Error("Choose a currency and pay period for your salary amounts.");
 if(salaryMinCents!==null && salaryMaxCents!==null && salaryMinCents>salaryMaxCents)throw new Error("Minimum pay cannot exceed maximum pay.");
 return {salaryMinCents,salaryMaxCents,salaryCurrency,salaryPeriod};
}
