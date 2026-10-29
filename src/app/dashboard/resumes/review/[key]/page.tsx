import type { Metadata } from "next";
import {Suspense} from "react";
import Link from "next/link";
import {connection} from "next/server";
import {notFound} from "next/navigation";
import {getCurrentProfile} from "@/lib/profile";
import {validResumeKey,resumeDisplayName} from "@/lib/resume-files";
import {SECTIONS} from "@/lib/sections";
import {ResumeReview} from "@/components/resume-review";
import {Card,LoadingBlock,PageHeader} from "@/components/ui";
export const metadata: Metadata = {title:"Review resume suggestions"};
async function Content({params}:{params:Promise<{key:string}>}){await connection();const profile=await getCurrentProfile();const {key}=await params;if(!validResumeKey(key)||!profile)notFound();return <><PageHeader eyebrow={resumeDisplayName(key)} title="Review resume suggestions"/><Card><ResumeReview resumeKey={key} profile={{displayName:profile.displayName,headline:profile.headline,skills:profile.technicalSkills.map(s=>s.name)}}/></Card></>;}
export default function Page({params}:{params:Promise<{key:string}>}){return <div className="space-y-6"><Link className="text-sm font-medium text-accent-text hover:underline" href={SECTIONS.resumes.href}>← Back to resumes</Link><Suspense fallback={<LoadingBlock label="Loading review…"/>}><Content params={params}/></Suspense></div>;}
