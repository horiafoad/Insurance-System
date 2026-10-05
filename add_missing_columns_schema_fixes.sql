-- ============================================================================
-- add_missing_columns_schema_fixes.sql
-- ============================================================================
-- الغرض: حفظ إصلاحات الـSchema التي كشفها فحص المشروع، كملف executable واحد
--        يُنفَّذ على الـSupabase الجديد فقط.
--
-- ⚠️ لا يُنفَّذ على المشروع القديم إطلاقًا.
--    المشروع القديم مقيّد (402) ولا يجوز تعديله.
--
-- WHY: هذه الأعمدة يستخدمها الكود فعليًا، لكنها غير موجودة في ملفات DDL
--      المحلية. أي بناء جديد بدونها يكسر الصفحات التالية:
--        • FacultySalariesPage.jsx  → faculty_salary_pages
--        • UserManagement.jsx       → letter_sectors
--        • OrgStructurePage.jsx     → letter_sectors
--
-- كلstatement هنا additive وidempotent: يمكن تشغيله أكثر من مرة بأمان،
-- ولا يحذف أي عمود ولا يغيّر أي جدول ولا يلمس أي بيانات.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) faculty_salary_pages
--    FacultySalariesPage.jsx:354-364 يُدرج الصفوف بهذه الحقول:
--      period_year, period_month, page_number, text_content,
--      page_image_url, source_file_name, source_file_url,
--      storage_provider, storage_key
--    أي أنهاexpects source_file_name و source_file_url، وغير موجودة في
--    faculty_salary_archive.sql (المستخدَم لإنشاء الجدول).
-- ---------------------------------------------------------------------------
alter table public.faculty_salary_pages
  add column if not exists source_file_name text;

alter table public.faculty_salary_pages
  add column if not exists source_file_url text;

comment on column public.faculty_salary_pages.source_file_name
  is 'اسم ملف المفردة الأصلي الذي اشتُقّت منه هذه الصفحة';

comment on column public.faculty_salary_pages.source_file_url
  is 'مرجع/رابط ملف المفردة الأصلي (r2://... أو رابط قديم)';

-- ---------------------------------------------------------------------------
-- 2) faculty_salary_pages — تعارض NOT NULL
--    faculty_salary_archive.sql:v1-10 يعرّف:
--      file_name text not null,
--      file_url  text not null,
--    لكن كود الواجهة لا يُرسل أيًا منهما عند الإدراج (انظر أعلاه)،
--    فيرفض PostgreSQL الإدراج بـ not-null violation.
--    الحل: جعل العمودين يقبلان NULL. هذا لا يغيّر الاسم ولا يحذف شيئًا،
--    ويمرّر القيم الفارغة كـ NULL (أدق من اختلاق سلسلة فارغة).
-- ---------------------------------------------------------------------------
alter table public.faculty_salary_pages
  alter column file_name drop not null;

alter table public.faculty_salary_pages
  alter column file_url drop not null;

-- ---------------------------------------------------------------------------
-- 3) letter_sectors.sort_order
--    المستخدم في:
--      UserManagement.jsx  → .select("id,name,is_active,sort_order").order("sort_order")
--      OrgStructurePage.jsx
--    غير موجود في create_letter_sectors.sql، لكن create_org_structure.sql:12
--    يُدرج فيه القيم. الافتراضي 0 يحفظ ترتيبًا مستقرًا للصفوف القديمة.
-- ---------------------------------------------------------------------------
alter table public.letter_sectors
  add column if not exists sort_order integer default 0;

-- ---------------------------------------------------------------------------
-- 4) R2 columns — تحقق فقط (لا إضافة مزدوجة)
--    storage_provider / storage_key تُضاف رسميًا عبر
--    add_r2_storage_columns.sql (حلقة PL/pgSQL) — وهو المصدر المعتمد.
--    هنا نتحقق فقط ونضيف الناقص إن كان الملفين لم يُنفَّذا، حتى لا يبقى
--    عمود مفقود دون خطأ صامت.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'faculty_salary_pages','faculty_salary_archive','faculty_salary_imports',
    'employee_salary_archive','employee_salary_imports','salary_import_files',
    'issues','issue_details','case_documents','letters',
    'executive_order_persons','scanner_inbox'
  ] loop
    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = t
        and column_name = 'storage_provider'
    ) then
      execute format('alter table public.%I add column if not exists storage_provider text', t);
    end if;

    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = t
        and column_name = 'storage_key'
    ) then
      execute format('alter table public.%I add column if not exists storage_key text', t);
    end if;
  end loop;
end $$;

comment on column public.scanner_inbox.source_fingerprint
  is 'sha256(الاسم|الحجم|mtime) — الأساس في منع الرفع المكرّر';

-- إعادة تحميل PostgREST لالتقاط الأعمدة الجديدة
notify pgrst, 'reload schema';

-- ============================================================================
-- لا يحتوي هذا الملف على أي بيانات (INSERT/COPY) — DDL فقط.
-- لا يحتوي على أي secret.
-- ============================================================================
