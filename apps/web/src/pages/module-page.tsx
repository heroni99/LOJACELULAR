import { ModulePlaceholder } from "@/components/app/module-placeholder";

type ModulePageProps = {
  path?: string;
  title: string;
  description: string;
  moduleLabel: string;
  summary: string;
  bullets: string[];
  primaryAction?: {
    label: string;
    to: string;
  };
};

export function ModulePage(props: ModulePageProps) {
  return <ModulePlaceholder {...props} />;
}
