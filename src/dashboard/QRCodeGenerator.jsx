import React, { useEffect, useRef } from "react";
import QRCode from "qrcode";

export default function QRCodeGenerator({
  value,
  size = 200,
  showDownload = true,
}) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!value || !canvasRef.current) return;

    QRCode.toCanvas(canvasRef.current, value, {
      width: size,
      margin: 2,
      errorCorrectionLevel: "H",
    }).catch((error) => {
      console.error("QR Code generation error:", error);
    });
  }, [value, size]);

  const handleDownload = () => {
    if (!canvasRef.current) return;

    const link = document.createElement("a");
    link.download = "QR-Code.png";
    link.href = canvasRef.current.toDataURL("image/png");
    link.click();
  };

  if (!value) {
    return null;
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "10px",
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          width: `${size}px`,
          height: `${size}px`,
          background: "#fff",
          display: "block",
        }}
      />

      {showDownload && (
        <button
          type="button"
          onClick={handleDownload}
          style={{
            border: "none",
            borderRadius: "8px",
            padding: "8px 16px",
            cursor: "pointer",
            fontSize: "14px",
            fontWeight: "600",
          }}
        >
          تحميل QR
        </button>
      )}
    </div>
  );
}