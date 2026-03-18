"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export function ServiceBanner() {
  const [suspended, setSuspended] = useState(false);

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/admin/service-status`);
        if (res.ok) {
          const data = await res.json();
          setSuspended(!data.active);
        }
      } catch {
        // If we can't reach the backend, don't show the banner
      }
    };
    checkStatus();
    // Re-check every 5 minutes
    const interval = setInterval(checkStatus, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  if (!suspended) return null;

  return (
    <div className="bg-amber-500 text-black text-center py-3 px-6 text-sm font-medium">
      <AlertTriangle className="inline-block h-4 w-4 mr-2 -mt-0.5" />
      O Merlin atingiu o limite de otimizações disponíveis. Agradecemos sua participação!
      {" / "}
      Merlin has reached its optimization limit. Thank you for participating!
    </div>
  );
}
