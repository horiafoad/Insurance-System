import React, { useState } from "react";
import { supabase } from "../../supabaseClient"; // ⚠️ صحّح المسار حسب مكان الملف عندك

// رفع صورة اختيارية مرتبطة بخطاب موجود بالفعل (بند 6):
//   - اختيارية 100%: مفيش أي validation بيمنع حفظ/تحريك الخطاب لو
//     مفيش صورة.
//   - بترفع لنفس الـ bucket "letter-images" (اتعمل في الـ migration)
//     وبترجع رابط عام بيتخزن في letters.image_url فقط — مفيش خطاب
//     جديد ولا QR جديد بيتعمل.
//
// الاستخدام:
//   <LetterImageUpload
//     letterId={letter.id}
//     currentImageUrl={letter.image_url}
//     onUploaded={(url) => { ...حدّث letter.image_url محليًا... }}
//   />

export default function LetterImageUpload({
  letterId,
  currentImageUrl,
  onUploaded,
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !letterId) return;

    setUploading(true);
    setError(null);

    try {
      const ext = file.name.split(".").pop();
      const path = `letters/${letterId}-${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("letter-images")
        .upload(path, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from("letter-images")
        .getPublicUrl(path);

      const publicUrl = publicUrlData?.publicUrl;

      // تحديث نفس صف الخطاب فقط — مفيش صف جديد
      const { error: updateError } = await supabase
        .from("letters")
        .update({ image_url: publicUrl })
        .eq("id", letterId);

      if (updateError) throw updateError;

      onUploaded?.(publicUrl);
    } catch (err) {
      console.error("Image upload error:", err);
      setError("حصل خطأ أثناء رفع الصورة، حاول تاني");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {currentImageUrl && (
        <img
          src={currentImageUrl}
          alt="صورة الخطاب"
          style={{
            width: "100%",
            maxWidth: 260,
            borderRadius: 12,
            border: "1px solid #E2E8F0",
          }}
        />
      )}

      <label
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontSize: 13,
          fontWeight: 700,
          color: "#334155",
          cursor: "pointer",
        }}
      >
        📎 {currentImageUrl ? "استبدال الصورة" : "إرفاق صورة (اختياري)"}
        <input
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          disabled={uploading}
          style={{ display: "none" }}
        />
      </label>

      {uploading && (
        <span style={{ fontSize: 12, color: "#64748B" }}>
          جاري الرفع...
        </span>
      )}

      {error && (
        <span style={{ fontSize: 12, color: "#DC2626" }}>{error}</span>
      )}
    </div>
  );
}
