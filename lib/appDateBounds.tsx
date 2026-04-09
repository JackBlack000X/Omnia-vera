import { firstDayOfMonthYmd, formatYmd } from '@/lib/date';
import React, { createContext, useContext, useMemo } from 'react';

type AppDateBoundsValue = {
  installYmd: string;
  installMonthStartYmd: string;
  todayYmd: string;
  nonPastYmd: string;
};

const AppDateBoundsContext = createContext<AppDateBoundsValue | null>(null);

export function AppDateBoundsProvider({
  installYmd,
  children,
}: {
  installYmd: string;
  children: React.ReactNode;
}) {
  const todayYmd = formatYmd();
  const value = useMemo<AppDateBoundsValue>(() => {
    const safeInstallYmd = /^\d{4}-\d{2}-\d{2}$/.test(installYmd) ? installYmd : todayYmd;
    return {
      installYmd: safeInstallYmd,
      installMonthStartYmd: firstDayOfMonthYmd(safeInstallYmd),
      todayYmd,
      nonPastYmd: todayYmd,
    };
  }, [installYmd, todayYmd]);

  return <AppDateBoundsContext.Provider value={value}>{children}</AppDateBoundsContext.Provider>;
}

export function useAppDateBounds(): AppDateBoundsValue {
  const value = useContext(AppDateBoundsContext);
  if (!value) {
    throw new Error('useAppDateBounds must be used inside AppDateBoundsProvider');
  }
  return value;
}
