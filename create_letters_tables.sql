-- ==============================================================================
-- سكريبت إنشاء جداول نظام الخطابات وتتبع QR
-- انسخ هذا الكود بالكامل والصقه في Supabase -> SQL Editor ثم اضغط Run
-- السكريبت آمن لإعادة التشغيل (idempotent) — لا يحذف أي بيانات موجودة.
-- ==============================================================================

-- 1. إدارات توزيع الخطابات
CREATE TABLE IF NOT EXISTS public.letter_departments (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. الجهات المرسلة للخطابات
CREATE TABLE IF NOT EXISTS public.letter_senders (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. أكواد QR (كل كود في صف مستقل — يُعاد استخدام نفس الكود عند فقد الـ QR)
CREATE TABLE IF NOT EXISTS public.archive_qr_codes (
  id BIGSERIAL PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE,
  status VARCHAR(20) DEFAULT 'available'
    CHECK (status IN ('available', 'used', 'archived', 'replaced')),
  letter_id BIGINT,
  used_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. الخطابات
CREATE TABLE IF NOT EXISTS public.letters (
  id BIGSERIAL PRIMARY KEY,
  qr_code_id BIGINT REFERENCES public.archive_qr_codes(id),
  letter_number VARCHAR(100),
  letter_date DATE,
  sender_id BIGINT REFERENCES public.letter_senders(id),
  subject TEXT,
  status VARCHAR(30) DEFAULT 'in_progress'
    CHECK (status IN ('incoming', 'in_progress', 'needs_revision', 'completed', 'archived')),
  notes TEXT,
  image_url TEXT,
  letter_type VARCHAR(50),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- أعمدة إضافية (للأمان عند إعادة التشغيل)
ALTER TABLE public.letters
  ADD COLUMN IF NOT EXISTS image_url TEXT,
  ADD COLUMN IF NOT EXISTS letter_type VARCHAR(50);

-- 5. حركة الخطاب بين الإدارات (كل محطة = صف)
CREATE TABLE IF NOT EXISTS public.letter_movements (
  id BIGSERIAL PRIMARY KEY,
  letter_id BIGINT REFERENCES public.letters(id) ON DELETE CASCADE,
  department_id BIGINT REFERENCES public.letter_departments(id),
  step_order INTEGER NOT NULL DEFAULT 0,
  received_at TIMESTAMP WITH TIME ZONE,
  sent_at TIMESTAMP WITH TIME ZONE,
  action TEXT,
  notes TEXT,
  status VARCHAR(30) DEFAULT 'waiting'
    CHECK (status IN ('in_progress', 'waiting', 'completed', 'needs_revision')),
  received_by VARCHAR(100),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- عمود المستلم (للأمان عند إعادة التشغيل)
ALTER TABLE public.letter_movements
  ADD COLUMN IF NOT EXISTS received_by VARCHAR(100);

-- فهارس للبحث السريع
CREATE INDEX IF NOT EXISTS idx_archive_qr_codes_status ON public.archive_qr_codes(status);
CREATE INDEX IF NOT EXISTS idx_letters_qr_code_id ON public.letters(qr_code_id);
CREATE INDEX IF NOT EXISTS idx_letters_status ON public.letters(status);
CREATE INDEX IF NOT EXISTS idx_letter_movements_letter_id ON public.letter_movements(letter_id);
CREATE INDEX IF NOT EXISTS idx_letter_movements_department_id ON public.letter_movements(department_id);
CREATE INDEX IF NOT EXISTS idx_letter_movements_step_order ON public.letter_movements(step_order);

-- تعطيل RLS (نفس نمط بقية جداول النظام)
ALTER TABLE public.letter_departments DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.letter_senders DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.archive_qr_codes DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.letters DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.letter_movements DISABLE ROW LEVEL SECURITY;

GRANT ALL ON public.letter_departments TO anon, authenticated, postgres, service_role;
GRANT ALL ON public.letter_senders TO anon, authenticated, postgres, service_role;
GRANT ALL ON public.archive_qr_codes TO anon, authenticated, postgres, service_role;
GRANT ALL ON public.letters TO anon, authenticated, postgres, service_role;
GRANT ALL ON public.letter_movements TO anon, authenticated, postgres, service_role;
GRANT ALL ON SEQUENCE public.letter_departments_id_seq TO anon, authenticated, postgres, service_role;
GRANT ALL ON SEQUENCE public.letter_senders_id_seq TO anon, authenticated, postgres, service_role;
GRANT ALL ON SEQUENCE public.archive_qr_codes_id_seq TO anon, authenticated, postgres, service_role;
GRANT ALL ON SEQUENCE public.letters_id_seq TO anon, authenticated, postgres, service_role;
GRANT ALL ON SEQUENCE public.letter_movements_id_seq TO anon, authenticated, postgres, service_role;

-- تحديث كاش PostgREST
NOTIFY pgrst, 'reload schema';