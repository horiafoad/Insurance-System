import { useState, useEffect } from 'react';

export default function NetworkBanner() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (isOnline) return null;

  return (
    <div style={{ background: 'red', color: 'white', textAlign: 'center', padding: '6px', fontWeight: 'bold' }}>
      ⚠️ انقطع الإنترنت - يعمل التطبيق بالبيانات المحفوظة مؤقتاً
    </div>
  );
}