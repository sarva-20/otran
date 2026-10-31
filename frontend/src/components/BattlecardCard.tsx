import { Check, Shield, TrendingDown } from 'lucide-react'
import type { Battlecard, Product } from '@/api/types'
import { CitationChip } from '@/components/CitationChip'
import { cn } from '@/lib/utils'

interface BattlecardCardProps {
  battlecard: Battlecard
  products?: Product[]
  onOpenClaim?: (claimId: string) => void
  className?: string
}

export function BattlecardCard({
  battlecard,
  products = [],
  onOpenClaim,
  className,
}: BattlecardCardProps) {
  const competitor = products.find((p) => p.id === battlecard.competitor_id)
  const competitorName = competitor?.name ?? battlecard.competitor_id

  const strengths = battlecard.strengths ?? []
  const weaknesses = battlecard.weaknesses ?? []
  const counterPoints = battlecard.counter_points ?? []
  const claimIds = battlecard.claim_ids ?? []

  return (
    <div
      className={cn(
        'space-y-4 rounded-2xl border border-border/80 bg-card p-6 shadow-xs transition-colors hover:border-border',
        className,
      )}
    >
      {/* Competitor Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-3">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] font-semibold text-muted-foreground uppercase">
              Competitor Battlecard
            </span>
            <h3 className="text-base font-bold text-foreground">{competitorName}</h3>
          </div>
          {competitor?.url && (
            <p className="font-mono text-xs text-muted-foreground">{competitor.url}</p>
          )}
        </div>
      </div>

      {/* 3 Columns: Strengths, Weaknesses, Counter-points */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* Strengths */}
        <div className="space-y-2 rounded-xl bg-muted/30 p-3.5 border border-border/40">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <Check className="h-3.5 w-3.5 text-accent" />
            <span>Their Strengths</span>
          </div>
          {strengths.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">None documented</p>
          ) : (
            <ul className="space-y-1.5 text-xs text-foreground/90 leading-relaxed">
              {strengths.map((s, idx) => (
                <li key={idx} className="flex items-start gap-1.5">
                  <span className="text-muted-foreground shrink-0 leading-none mt-1">•</span>
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Weaknesses */}
        <div className="space-y-2 rounded-xl bg-muted/30 p-3.5 border border-border/40">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <TrendingDown className="h-3.5 w-3.5 text-warning" />
            <span>Their Vulnerabilities</span>
          </div>
          {weaknesses.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">None documented</p>
          ) : (
            <ul className="space-y-1.5 text-xs text-foreground/90 leading-relaxed">
              {weaknesses.map((w, idx) => (
                <li key={idx} className="flex items-start gap-1.5">
                  <span className="text-muted-foreground shrink-0 leading-none mt-1">•</span>
                  <span>{w}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Counter-points */}
        <div className="space-y-2 rounded-xl bg-muted/30 p-3.5 border border-border/40">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <Shield className="h-3.5 w-3.5 text-accent" />
            <span>Our Counter-Points</span>
          </div>
          {counterPoints.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">None documented</p>
          ) : (
            <ul className="space-y-1.5 text-xs text-foreground/90 leading-relaxed">
              {counterPoints.map((cp, idx) => (
                <li key={idx} className="flex items-start gap-1.5">
                  <span className="text-accent shrink-0 leading-none mt-1">▸</span>
                  <span>{cp}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Cited Evidence Chips */}
      {claimIds.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-border/40">
          <span className="text-[11px] font-medium text-muted-foreground mr-1">
            Supporting evidence:
          </span>
          {claimIds.map((cid) => (
            <CitationChip key={cid} claimId={cid} onOpenClaim={onOpenClaim} />
          ))}
        </div>
      )}
    </div>
  )
}
