-- ==============================================================================
-- إضافة عمود "آخر تحديث" لجدول الطلبات الإلكترونية
--
-- عمود "الملاحظات" (notes) موجود بالفعل — لا حاجة لإضافته.
-- هذا السكريبت:
--   • يضيف عمود updated_at فقط إن لم يكن موجودًا (لا يلمس أي بيانات).
--   • يملأه بقيم created_at للصفوف القديمة (حتى يظهر "آخر تحديث" للطلبات السابقة).
-- آمن للتكرار (idempotent) — لا يحذف أو يغيّر أي بيانات.
-- ==============================================================================

ALTER TABLE public.service_requests
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE;

UPDATE public.service_requests
SET updated_at = created_at
WHERE updated_at IS NULL;