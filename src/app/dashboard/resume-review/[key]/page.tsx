import {Suspense} from "react";
import Link from "next/link";
import {connection} from "next/server";
import {notFound} from "next/navigation";
import {getCurrentProfile} from "@/lib/profile";
import {validResumeKey,resumeDisplayName} from "@/lib/resume-files";
import {ResumeReview} from "@/components/resume-review";
async function Content({params}:{params:Promise<{key:string}>}){await connection();const profile=await getCurrentProfile();const {key}=await params;if(!validResumeKey(key)||!profile)notFound();return <><Link className="underline" href="/dashboard">Back to dashboard</Link><h1 className="text-3xl font-bold">Review resume suggestions</h1><p className="break-all">{resumeDisplayName(key)}</p><ResumeReview resumeKey={key} profile={{displayName:profile.displayName,headline:profile.headline,skills:profile.technicalSkills.map(s=>s.name)}}/></>;}
export default function Page({params}:{params:Promise<{key:string}>}){return <div className="space-y-6"><Suspense fallback={<p role="status">Loading review…</p>}><Content params={params}/></Suspense></div>;}
