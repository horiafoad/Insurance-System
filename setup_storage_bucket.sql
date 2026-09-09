-- إنشاء Storage bucket للملفات
-- نفذ هذا الأمر في Supabase SQL Editor

-- إنشاء bucket للملفات
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'issues-files',
  'issues-files',
  true,
  104857600, -- 100MB
  ARRAY[
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/pdf'
  ]
) ON CONFLICT (id) DO NOTHING;
