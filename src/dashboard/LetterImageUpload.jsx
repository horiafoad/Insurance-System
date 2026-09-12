import React, { useState } from "react";
import { supabase } from "../supabaseClient"; // âš ï¸ ØµØ­Ù‘Ø­ Ø§Ù„Ù…Ø³Ø§Ø± Ø­Ø³Ø¨ Ù…ÙƒØ§Ù† Ø§Ù„Ù…Ù„Ù Ø¹Ù†Ø¯Ùƒ

// Ø±ÙØ¹ ØµÙˆØ±Ø© Ø§Ø®ØªÙŠØ§Ø±ÙŠØ© Ù…Ø±ØªØ¨Ø·Ø© Ø¨Ø®Ø·Ø§Ø¨ Ù…ÙˆØ¬ÙˆØ¯ Ø¨Ø§Ù„ÙØ¹Ù„ (Ø¨Ù†Ø¯ 6):
//   - Ø§Ø®ØªÙŠØ§Ø±ÙŠØ© 100%: Ù…ÙÙŠØ´ Ø£ÙŠ validation Ø¨ÙŠÙ…Ù†Ø¹ Ø­ÙØ¸/ØªØ­Ø±ÙŠÙƒ Ø§Ù„Ø®Ø·Ø§Ø¨ Ù„Ùˆ
//     Ù…ÙÙŠØ´ ØµÙˆØ±Ø©.
//   - Ø¨ØªØ±ÙØ¹ Ù„Ù†ÙØ³ Ø§Ù„Ù€ bucket "letter-images" (Ø§ØªØ¹Ù…Ù„ ÙÙŠ Ø§Ù„Ù€ migration)
//     ÙˆØ¨ØªØ±Ø¬Ø¹ Ø±Ø§Ø¨Ø· Ø¹Ø§Ù… Ø¨ÙŠØªØ®Ø²Ù† ÙÙŠ letters.image_url ÙÙ‚Ø· â€” Ù…ÙÙŠØ´ Ø®Ø·Ø§Ø¨
//     Ø¬Ø¯ÙŠØ¯ ÙˆÙ„Ø§ QR Ø¬Ø¯ÙŠØ¯ Ø¨ÙŠØªØ¹Ù…Ù„.
//
// Ø§Ù„Ø§Ø³ØªØ®Ø¯Ø§Ù…:
//   <LetterImageUpload
//     letterId={letter.id}
//     currentImageUrl={letter.image_url}
//     onUploaded={(url) => { ...Ø­Ø¯Ù‘Ø« letter.image_url Ù…Ø­Ù„ÙŠÙ‹Ø§... }}
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

      // ØªØ­Ø¯ÙŠØ« Ù†ÙØ³ ØµÙ Ø§Ù„Ø®Ø·Ø§Ø¨ ÙÙ‚Ø· â€” Ù…ÙÙŠØ´ ØµÙ Ø¬Ø¯ÙŠØ¯
      const { error: updateError } = await supabase
        .from("letters")
        .update({ image_url: publicUrl })
        .eq("id", letterId);

      if (updateError) throw updateError;

      onUploaded?.(publicUrl);
    } catch (err) {
      console.error("Image upload error:", err);
      setError("Ø­ØµÙ„ Ø®Ø·Ø£ Ø£Ø«Ù†Ø§Ø¡ Ø±ÙØ¹ Ø§Ù„ØµÙˆØ±Ø©ØŒ Ø­Ø§ÙˆÙ„ ØªØ§Ù†ÙŠ");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {currentImageUrl && (
        <img
          src={currentImageUrl}
          alt="ØµÙˆØ±Ø© Ø§Ù„Ø®Ø·Ø§Ø¨"
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
        ðŸ“Ž {currentImageUrl ? "Ø§Ø³ØªØ¨Ø¯Ø§Ù„ Ø§Ù„ØµÙˆØ±Ø©" : "Ø¥Ø±ÙØ§Ù‚ ØµÙˆØ±Ø© (Ø§Ø®ØªÙŠØ§Ø±ÙŠ)"}
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
          Ø¬Ø§Ø±ÙŠ Ø§Ù„Ø±ÙØ¹...
        </span>
      )}

      {error && (
        <span style={{ fontSize: 12, color: "#DC2626" }}>{error}</span>
      )}
    </div>
  );
}

