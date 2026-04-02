import { createContext, useContext, type ReactNode } from "react";
import type { AuthSession, PermissionKey } from "@/shared";

type AppSessionContextValue = {
  session: AuthSession;
  authEnabled: boolean;
  hasPermission(permission?: PermissionKey | PermissionKey[]): boolean;
  onLogout(): void;
};

const AppSessionContext = createContext<AppSessionContextValue | null>(null);

export function AppSessionProvider({
  children,
  value
}: {
  children: ReactNode;
  value: AppSessionContextValue;
}) {
  return (
    <AppSessionContext.Provider value={value}>{children}</AppSessionContext.Provider>
  );
}

export function useAppSession() {
  const context = useContext(AppSessionContext);

  if (!context) {
    throw new Error("useAppSession precisa ser usado dentro de AppSessionProvider.");
  }

  return context;
}
