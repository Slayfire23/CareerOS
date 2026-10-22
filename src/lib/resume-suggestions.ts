export type ResumeSuggestions={displayName:string;headline:string;skills:string[]};
const heading=/^(?:summary|profile|objective|professional summary|skills|technical skills|core competencies|experience|work experience|professional experience|employment|education|projects|certifications|awards|languages|interests|references|contact)(?:\s*:)?$/i;
export function suggestResumeFields(text:string):ResumeSuggestions{
 const lines=text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
 const first=lines[0]??"";
 const displayName=!heading.test(first)&&/^[\p{L}][\p{L} .'-]{1,99}$/u.test(first)&&first.split(/\s+/).length>=2&&first.split(/\s+/).length<=5?first:"";
 const second=lines[1]??"";
 const headline=displayName&&second.length<=200&&!heading.test(second)&&!/[\d@]|https?:|www\./i.test(second)?second:"";
 const skills:string[]=[];let inSkills=false;
 for(const line of lines){
  const inline=line.match(/^(?:technical skills|skills|core competencies)\s*:\s*(.*)$/i);
  if(inline){inSkills=true;if(!inline[1])continue;add(inline[1]);continue;}
  if(heading.test(line)){inSkills=/^(?:technical skills|skills|core competencies):?$/i.test(line);continue;}
  if(inSkills)add(line);
 }
 function add(line:string){for(const item of line.split(/[,;|•]/)){const value=item.replace(/^[-*]\s*/,"").trim().replace(/\s+/g," ");if(value&&value.length<=100&&!skills.some(s=>s.toLowerCase()===value.toLowerCase())&&skills.length<30)skills.push(value);}}
 return {displayName,headline,skills};
}
export function parseReviewedResume(form:FormData){
 function single(key:string,max:number){const values=form.getAll(key);if(values.length!==1||typeof values[0]!=="string"||values[0].length>max)throw new Error("Invalid review fields. Reload and try again.");return values[0];}
 function checked(key:string){const values=form.getAll(key);if(values.length>1||(values.length===1&&values[0]!=="on"))throw new Error("Invalid field selection.");return values.length===1;}
 const useName=checked("useName"),useHeadline=checked("useHeadline"),useSkills=checked("useSkills");
 if(!useName&&!useHeadline&&!useSkills)throw new Error("Select at least one field to save.");
 const displayName=useName?single("displayName",100).trim():undefined;
 const headline=useHeadline?single("headline",200).trim():undefined;
 if(useName&&!displayName)throw new Error("Enter a name before selecting it.");
 if(useHeadline&&!headline)throw new Error("Enter a headline before selecting it.");
 const skills=useSkills?single("skills",3100).split(/\r?\n/).map(v=>v.trim().replace(/\s+/g," ")).filter(Boolean):[];
 if(useSkills&&(!skills.length||skills.length>30||skills.some(v=>v.length>100||v.toLowerCase().length>100)))throw new Error("Enter 1–30 skills, at most 100 characters each.");
 return {displayName,headline,skills:[...new Map(skills.map(v=>[v.toLowerCase(),v])).values()],baseName:useName?single("baseName",100):undefined,baseHeadline:useHeadline?single("baseHeadline",200):undefined};
}
