import type { ComponentType } from 'react'
import {
  BarChart3,
  Compass,
  Cpu,
  Download,
  FileText,
  GitCompare,
  MessageSquareQuote,
  ShieldCheck,
} from 'lucide-react'
import type { AgentName } from '@/api/types'

export interface AgentConfig {
  name: AgentName
  label: string
  icon: ComponentType<{ className?: string }>
  badgeClass: string
  iconClass: string
}

export const AGENT_CONFIGS: Record<AgentName, AgentConfig> = {
  orchestrator: {
    name: 'orchestrator',
    label: 'Orchestrator',
    icon: Cpu,
    badgeClass: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800',
    iconClass: 'text-purple-600 dark:text-purple-400',
  },
  discovery: {
    name: 'discovery',
    label: 'Discovery',
    icon: Compass,
    badgeClass: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800',
    iconClass: 'text-sky-600 dark:text-sky-400',
  },
  collector: {
    name: 'collector',
    label: 'Collector',
    icon: Download,
    badgeClass: 'bg-accent/10 text-accent border-accent/25',
    iconClass: 'text-accent',
  },
  extractor: {
    name: 'extractor',
    label: 'Extractor',
    icon: FileText,
    badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800',
    iconClass: 'text-indigo-600 dark:text-indigo-400',
  },
  verifier: {
    name: 'verifier',
    label: 'Verifier',
    icon: ShieldCheck,
    badgeClass: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200 dark:bg-fuchsia-950/40 dark:text-fuchsia-300 dark:border-fuchsia-800',
    iconClass: 'text-fuchsia-600 dark:text-fuchsia-400',
  },
  diff: {
    name: 'diff',
    label: 'Diff',
    icon: GitCompare,
    badgeClass: 'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-800',
    iconClass: 'text-teal-600 dark:text-teal-400',
  },
  analyst: {
    name: 'analyst',
    label: 'Analyst',
    icon: BarChart3,
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
    iconClass: 'text-slate-700 dark:text-slate-300',
  },
  qa: {
    name: 'qa',
    label: 'Q&A',
    icon: MessageSquareQuote,
    badgeClass: 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-800',
    iconClass: 'text-violet-600 dark:text-violet-400',
  },
}

export function getAgentConfig(agent: string): AgentConfig {
  const normalized = agent.toLowerCase() as AgentName
  return (
    AGENT_CONFIGS[normalized] ?? {
      name: 'orchestrator',
      label: agent,
      icon: Cpu,
      badgeClass: 'bg-muted text-foreground border-border',
      iconClass: 'text-muted-foreground',
    }
  )
}
