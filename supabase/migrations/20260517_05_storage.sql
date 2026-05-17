-- Storage bucket for question screenshots
INSERT INTO storage.buckets (id, name, public)
VALUES ('screenshots', 'screenshots', false);

-- Instructors can upload screenshots to their course folders
CREATE POLICY "screenshots: instructor upload" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'screenshots'
    AND auth.uid() IS NOT NULL
  );

-- Instructors can read screenshots for their courses
CREATE POLICY "screenshots: instructor read" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'screenshots'
    AND auth.uid() IS NOT NULL
  );
