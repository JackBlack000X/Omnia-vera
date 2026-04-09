import React, { createContext, useContext, ReactNode } from 'react';

type ThemeType = 'classic';

interface ThemeContextType {
  activeTheme: ThemeType;
  setActiveTheme: (theme: ThemeType) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function AppThemeProvider({ children }: { children: ReactNode }) {
  return (
    <ThemeContext.Provider
      value={{
        activeTheme: 'classic',
        setActiveTheme: () => {},
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useAppTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    return {
      activeTheme: 'classic',
      setActiveTheme: () => {},
    };
  }
  return context;
}








