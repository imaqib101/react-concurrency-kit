import { useState, useEffect } from 'react';

export interface NetworkStatus {
  online: boolean;
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
  saveData?: boolean;
}

export function useNetworkStatus(): NetworkStatus {
  const getNetworkInfo = () => {
    if (typeof window === 'undefined') return { online: true };
    const nav = navigator as any;
    const connection = nav.connection || nav.mozConnection || nav.webkitConnection;
    return {
      online: navigator.onLine,
      effectiveType: connection?.effectiveType,
      downlink: connection?.downlink,
      rtt: connection?.rtt,
      saveData: connection?.saveData,
    };
  };

  const [status, setStatus] = useState<NetworkStatus>(getNetworkInfo);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleOnline = () => setStatus({ ...getNetworkInfo(), online: true });
    const handleOffline = () => setStatus({ ...getNetworkInfo(), online: false });

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const nav = navigator as any;
    const connection = nav.connection || nav.mozConnection || nav.webkitConnection;
    const handleConnectionChange = () => {
      setStatus(getNetworkInfo());
    };

    if (connection) {
      connection.addEventListener('change', handleConnectionChange);
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (connection) {
        connection.removeEventListener('change', handleConnectionChange);
      }
    };
  }, []);

  return status;
}
