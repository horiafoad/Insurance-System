import { supabase } from '../supabaseClient'; // تأكدي أن مسار الـ supabase صحيح لديكِ

export async function getDataWithCache(tableName, cacheKey) {
  try {
    const { data, error } = await supabase.from(tableName).select('*');
    if (error) throw error;
    localStorage.setItem(cacheKey, JSON.stringify(data));
    return data;
  } catch (err) {
    const cached = localStorage.getItem(cacheKey);
    if (cached) return JSON.parse(cached);
    throw new Error('لا يوجد إنترنت ولا توجد بيانات مخزنة محلياً.');
  }
}