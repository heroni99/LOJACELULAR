import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type DetailTabItem = {
  id: string;
  label: string;
  content: ReactNode;
  badge?: ReactNode;
};

export function DetailTabs({
  tabs,
  defaultTabId,
  activeTabId: activeTabIdProp,
  onActiveTabIdChange
}: {
  tabs: DetailTabItem[];
  defaultTabId?: string;
  activeTabId?: string;
  onActiveTabIdChange?: (tabId: string) => void;
}) {
  const [internalActiveTabId, setInternalActiveTabId] = useState(defaultTabId ?? tabs[0]?.id ?? "");
  const activeTabId = activeTabIdProp ?? internalActiveTabId;

  useEffect(() => {
    if (!tabs.length) {
      setInternalActiveTabId("");
      return;
    }

    if (!tabs.some((tab) => tab.id === activeTabId)) {
      const fallbackTabId = defaultTabId ?? tabs[0].id;
      setInternalActiveTabId(fallbackTabId);
      onActiveTabIdChange?.(fallbackTabId);
    }
  }, [activeTabId, defaultTabId, onActiveTabIdChange, tabs]);

  if (!tabs.length) {
    return null;
  }

  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0];

  return (
    <div className="space-y-4">
      <div
        className="overflow-x-auto rounded-[var(--radius-card)] border p-2"
        style={{
          backgroundColor: "var(--color-surface-2)",
          borderColor: "var(--color-border)"
        }}
      >
        <div className="flex min-w-max items-center gap-2">
          {tabs.map((tab) => {
            const active = tab.id === activeTab.id;

            return (
              <button
                className={cn(
                  "inline-flex items-center gap-2 rounded-[10px] px-3 py-2 text-sm font-medium transition-colors",
                  active ? "bg-white/10 text-white" : "text-white/70 hover:bg-white/5 hover:text-white"
                )}
                key={tab.id}
                onClick={() => {
                  setInternalActiveTabId(tab.id);
                  onActiveTabIdChange?.(tab.id);
                }}
                type="button"
              >
                <span>{tab.label}</span>
                {tab.badge}
              </button>
            );
          })}
        </div>
      </div>

      <div
        className="overflow-hidden rounded-[var(--radius-card)] border"
        style={{
          backgroundColor: "var(--color-surface-2)",
          borderColor: "var(--color-border)"
        }}
      >
        {activeTab.content}
      </div>
    </div>
  );
}
