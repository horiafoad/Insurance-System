import React, { useState } from "react";
import { supabase } from "../supabaseClient";
import { styles } from "./styles";

export default function ConnectionTest() {
  const [testResults, setTestResults] = useState([]);
  const [loading, setLoading] = useState(false);

  const addResult = (test, status, message, details = "") => {
    setTestResults(prev => [...prev, { test, status, message, details, time: new Date().toLocaleTimeString() }]);
  };

  const runTests = async () => {
    setTestResults([]);
    setLoading(true);

    // اختبار 1: الاتصال بـ Supabase
    try {
      const { data, error } = await supabase.from('issues').select('count').single();
      if (error) throw error;
      addResult("اتصال Supabase", "success", "تم الاتصال بقاعدة البيانات بنجاح");
    } catch (err) {
      addResult("اتصال Supabase", "error", "فشل الاتصال بقاعدة البيانات", err.message);
    }

    // اختبار 2: التحقق من الجداول
    try {
      const { data, error } = await supabase
        .from('issues')
        .select('*')
        .limit(1);
      
      if (error) {
        if (error.code === '42P01') {
          addResult("التحقق من الجداول", "error", "جدول issues غير موجود", "نفذ ملف create_issues_tables.sql");
        } else {
          throw error;
        }
      } else {
        addResult("التحقق من الجداول", "success", "الجداول موجودة");
      }
    } catch (err) {
      addResult("التحقق من الجداول", "error", "فشل التحقق من الجداول", err.message);
    }

    // اختبار 3: التحقق من Storage bucket
    try {
      const { data, error } = await supabase.storage.listBuckets();
      if (error) throw error;
      
      const bucketExists = data?.some(b => b.name === "issues-files");
      if (bucketExists) {
        addResult("Storage Bucket", "success", "Bucket issues-files موجود");
      } else {
        addResult("Storage Bucket", "error", "Bucket issues-files غير موجود", "نفذ ملف setup_storage_bucket.sql");
      }
    } catch (err) {
      addResult("Storage Bucket", "error", "فشل التحقق من Storage", err.message);
    }

    // اختبار 4: صلاحيات القراءة
    try {
      const { data, error } = await supabase
        .from('issues')
        .select('*')
        .limit(1);
      
      if (error) {
        addResult("صلاحيات القراءة", "error", "فشل قراءة البيانات", error.message);
      } else {
        addResult("صلاحيات القراءة", "success", "صلاحيات القراءة تعمل");
      }
    } catch (err) {
      addResult("صلاحيات القراءة", "error", "فشل اختبار الصلاحيات", err.message);
    }

    // اختبار 5: صلاحيات الكتابة
    try {
      const testData = {
        case_number: `TEST_${Date.now()}`,
        case_title: "اختبار صلاحيات الكتابة",
        case_type: "individual",
        file_type: "test",
        status: "test"
      };
      
      const { data, error } = await supabase
        .from('issues')
        .insert(testData)
        .select()
        .single();
      
      if (error) {
        addResult("صلاحيات الكتابة", "error", "فشل الكتابة في قاعدة البيانات", error.message);
      } else {
        // حذف سجل الاختبار
        await supabase.from('issues').delete().eq('id', data.id);
        addResult("صلاحيات الكتابة", "success", "صلاحيات الكتابة تعمل");
      }
    } catch (err) {
      addResult("صلاحيات الكتابة", "error", "فشل اختبار الكتابة", err.message);
    }

    setLoading(false);
  };

  const getStatusStyle = (status) => {
    if (status === "success") {
      return { background: "#D1FAE5", color: "#065F46", border: "1px solid #A7F3D0" };
    } else if (status === "error") {
      return { background: "#FEE2E2", color: "#DC2626", border: "1px solid #FECACA" };
    } else {
      return { background: "#FEF3C7", color: "#92400E", border: "1px solid #FDE68A" };
    }
  };

  return (
    <div style={styles.card}>
      <div style={styles.cardHeader}>
        <div>
          <h2 style={styles.cardTitle}>🔧 اختبار الاتصال</h2>
          <p style={styles.cardSub}>اختبار الاتصال بقاعدة البيانات والStorage</p>
        </div>
        <button
          onClick={runTests}
          disabled={loading}
          style={{
            ...styles.primaryButton,
            opacity: loading ? 0.6 : 1,
            cursor: loading ? "not-allowed" : "pointer"
          }}
        >
          {loading ? "جاري الاختبار..." : "🚀 تشغيل الاختبارات"}
        </button>
      </div>

      {testResults.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 12 }}>نتائج الاختبارات:</h3>
          {testResults.map((result, index) => (
            <div
              key={index}
              style={{
                ...getStatusStyle(result.status),
                borderRadius: 8,
                padding: 12,
                marginBottom: 8
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <strong>{result.test}</strong>
                <span style={{ fontSize: 12 }}>{result.time}</span>
              </div>
              <div style={{ marginTop: 4 }}>{result.message}</div>
              {result.details && (
                <div style={{ 
                  marginTop: 6, 
                  fontSize: 12, 
                  padding: 8, 
                  background: "rgba(0,0,0,0.05)", 
                  borderRadius: 4 
                }}>
                  💡 {result.details}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 20, padding: 16, background: "#F8FAFC", borderRadius: 8 }}>
        <h4 style={{ margin: "0 0 8px", fontSize: 14 }}>📋 خطوات حل المشاكل:</h4>
        <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13, lineHeight: 1.8 }}>
          <li>تأكد من صحة البيانات في ملف <code>.env</code></li>
          <li>نفذ ملف <code>create_issues_tables.sql</code> في Supabase SQL Editor</li>
          <li>نفذ ملف <code>setup_storage_bucket.sql</code> في Supabase SQL Editor</li>
          <li>تحقق من أن مشروع Supabase نشط (ليس paused)</li>
          <li>تحقق من صلاحيات RLS في إعدادات قاعدة البيانات</li>
        </ol>
      </div>
    </div>
  );
}
