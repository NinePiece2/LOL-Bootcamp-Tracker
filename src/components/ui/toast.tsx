import React, { createContext, useContext, useState, useCallback } from 'react';

type Toast = {
  id: string;
  title?: string;
  description?: string;
  variant?: 'success' | 'error' | 'info';
};

type ToastContextValue = {
  toast: (t: Omit<Toast, 'id'>) => void;
};

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((t: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).slice(2, 9);
    const toastObj: Toast = { id, ...t };
    setToasts((prev) => [toastObj, ...prev].slice(0, 5));

    // Auto-remove after 4s
    setTimeout(() => {
      setToasts((prev) => prev.filter((x) => x.id !== id));
    }, 4000);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div aria-live="assertive" className="fixed top-4 right-4 z-50 space-y-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`max-w-sm w-full pointer-events-auto rounded-lg shadow-lg ring-1 ring-black/5 overflow-hidden ${
              t.variant === 'success' ? 'bg-green-600 text-white' : t.variant === 'error' ? 'bg-red-600 text-white' : 'bg-gray-800 text-white'
            }`}
          >
            <div className="p-3">
              {t.title && <div className="font-semibold">{t.title}</div>}
              {t.description && <div className="text-sm mt-1">{t.description}</div>}
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
};
