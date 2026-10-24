create policy "org members read resumes" on storage.objects for select to authenticated
  using (bucket_id = 'resumes' and public.is_org_member(((storage.foldername(name))[1])::uuid, auth.uid()));