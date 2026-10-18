-- Run once in the Supabase SQL editor. Not a Prisma migration.
BEGIN;
INSERT INTO storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
VALUES ('careeros-resumes','careeros-resumes',false,2097152,ARRAY['application/pdf'])
ON CONFLICT (id) DO UPDATE SET public=false,file_size_limit=2097152,allowed_mime_types=ARRAY['application/pdf'];
CREATE POLICY "careeros_resume_read" ON storage.objects FOR SELECT TO authenticated USING
 (bucket_id='careeros-resumes' AND (storage.foldername(name))[1]=(SELECT auth.uid()::text));
CREATE POLICY "careeros_resume_upload" ON storage.objects FOR INSERT TO authenticated WITH CHECK
 (bucket_id='careeros-resumes' AND (storage.foldername(name))[1]=(SELECT auth.uid()::text));
CREATE POLICY "careeros_resume_delete" ON storage.objects FOR DELETE TO authenticated USING
 (bucket_id='careeros-resumes' AND (storage.foldername(name))[1]=(SELECT auth.uid()::text));
-- Restrictive guards prevent unrelated broad permissive policies from granting access.
CREATE POLICY "careeros_resume_owner_guard" ON storage.objects AS RESTRICTIVE FOR ALL TO authenticated
 USING (bucket_id<>'careeros-resumes' OR (storage.foldername(name))[1]=(SELECT auth.uid()::text))
 WITH CHECK (bucket_id<>'careeros-resumes' OR (storage.foldername(name))[1]=(SELECT auth.uid()::text));
CREATE POLICY "careeros_resume_no_overwrite" ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated
 USING (bucket_id<>'careeros-resumes') WITH CHECK (bucket_id<>'careeros-resumes');
CREATE POLICY "careeros_resume_no_anonymous" ON storage.objects AS RESTRICTIVE FOR ALL TO anon
 USING (bucket_id<>'careeros-resumes') WITH CHECK (bucket_id<>'careeros-resumes');
COMMIT;
