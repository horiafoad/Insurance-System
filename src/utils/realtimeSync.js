import { useEffect, useRef } from "react";
import { supabase } from "../supabaseClient";

/* =========================================================================
   Realtime Synchronization — Supabase "postgres_changes"
   -------------------------------------------------------------------------
   وحدة واحدة مشتركة لكل صفحات التطبيق:
   - useRealtimeSync(): اشتراك بجدول ويستدعي apply(payload) عند أي
     INSERT / UPDATE / DELETE واردة من مستخدم آخر (بدون polling).
   - applyRowChange(): تعديل قائمة الحالة محليًا (الصف المتأثر فقط)
     دون إعادة جلب كامل، مع مفتاح أساسي افتراضي id لجميع جداول المشروع.
   الاشتراك يُنظّف تلقائيًا عند إلغاء تركيب الصفحة (رفع StrictMode الآمن).
   ========================================================================= */

/* إدراج/استبدال صف في قائمة محليًا */
export function upsertRowInList(list, row, { pk = "id", insert = "head", sort } = {}) {
  if (!Array.isArray(list)) return list;
  if (!row || row[pk] == null) return list;
  const index = list.findIndex((item) => item && item[pk] === row[pk]);
  let next;
  if (index === -1) {
    next = insert === "tail" ? [...list, row] : [row, ...list];
  } else {
    next = [...list];
    next[index] = row;
  }
  if (typeof sort === "function") return next.sort(sort);
  return next;
}

/* حذف صف من قائمة محليًا */
export function removeRowFromList(list, row, { pk = "id" } = {}) {
  if (!Array.isArray(list)) return list;
  if (!row) return list;
  const key = row[pk];
  if (key == null) return list;
  return list.filter((item) => item && item[pk] !== key);
}

/* تطبيق حدث realtime (INSERT/UPDATE/DELETE) على قائمة الحالة */
export function applyRowChange(list, payload, { pk = "id", insert = "head", sort, mapRow, mapOld } = {}) {
  if (!Array.isArray(list)) return list;
  if (!payload || !payload.eventType) return list;
  const { eventType } = payload;

  if (eventType === "INSERT") {
    const row = mapRow ? mapRow(payload.new) : payload.new;
    return upsertRowInList(list, row, { pk, insert, sort });
  }

  if (eventType === "UPDATE") {
    const row = mapRow ? mapRow(payload.new) : payload.new;
    return upsertRowInList(list, row, { pk, insert, sort });
  }

  if (eventType === "DELETE") {
    const old = mapOld ? mapOld(payload.old || payload.new) : payload.old || payload.new;
    return removeRowFromList(list, old, { pk });
  }

  return list;
}

/* =========================================================================
   الاشتراك في أحداث جدول معيّن
   -------------------------------------------------------------------------
   useRealtimeSync({ table, filter, apply, enabled })
   - table   : اسم الجدول (public schema).
   - filter  : (اختياري) شرط supabase مثل { column: "eq.5" } — لازم يكون ثابتًا.
   - apply   : (payload) => void  — يُستدعى لكل حدث حي على الجدول.
   - enabled : (اختياري، افتراضي true) عند false لا يُفتح أي اشتراك
               (يُستخدم للصفحات العامة فلترة الصف المسجَّل فقط).
   عند فشل الاتصال يُجري realtime-js إعادة الاشتراك تلقائيًا (خارجي) ونكتفي
   بالتنظيف عند الإزالة.
   ========================================================================= */
export function useRealtimeSync({ table, filter, apply, enabled = true }) {
  const applyRef = useRef(apply);
  applyRef.current = apply;

  const filterRef = useRef(filter);
  filterRef.current = filter;

  useEffect(() => {
    if (!enabled) return undefined;

    const channelName = `rt-${table}-${Math.random().toString(36).slice(2, 8)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table,
          ...(filter ? { filter } : {}),
        },
        (payload) => {
          try {
            if (applyRef.current) applyRef.current(payload);
          } catch (err) {
            console.error(`[realtimeSync] خطأ في معالجة حدث ${table}:`, err);
          }
        }
      )
      .subscribe((status, err) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn(`[realtimeSync] ${table}: حالة القناة ${status}`, err);
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [table, filter, enabled]);
}