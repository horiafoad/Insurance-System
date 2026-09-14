-- ==============================================================================
-- تفعيل حذف أرشيف الأوامر التنفيذية من شاشة الأرشيف داخليًا
--
-- مهم للغاية: هذا السكريبت لا يغيّر أي جدول ولا أي عمود ولا يحذف أي بيانات.
-- يضيف فقط سياسات DELETE (صلاحيات الحذف) للجداول وللملفات المخزنة داخل البكت،
-- وهي مطلوبة لكي يعمل زر «حذف» داخل التطبيق عبر مفتاح anon.
--
-- انسخ هذا الكود بالكامل والصقه في Supabase -> SQL Editor ثم اضغط Run (مرة واحدة كافية).
-- آمن لإعادة التشغيل (idempotent).
-- ==============================================================================

DROP POLICY IF EXISTS "Allow delete executive order persons" ON public.executive_order_persons;
DROP POLICY IF EXISTS "Allow delete executive orders items" ON public.executive_orders;
DROP POLICY IF EXISTS "Allow delete executive orders files" ON storage.objects;

-- 1) حذف صف الشخص (الأوامر المرتبطة تُحذف تلقائيًا عبر ON DELETE CASCADE)
CREATE POLICY "Allow delete executive order persons"
  ON public.executive_order_persons FOR DELETE
  TO anon, authenticated USING (true);

-- 2) حذف الأوامر مباشرة (احتياطي)
CREATE POLICY "Allow delete executive orders items"
  ON public.executive_orders FOR DELETE
  TO anon, authenticated USING (true);

-- 3) حذف ملفات PDF من بكت storage بمجرد أن تكون لبكت executive-orders
CREATE POLICY "Allow delete executive orders files"
  ON storage.objects FOR DELETE
  TO anon, authenticated USING (bucket_id = 'executive-orders');

-- تحديث كاش PostgREST
NOTIFY pgrst, 'reload schema';