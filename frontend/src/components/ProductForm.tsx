import * as React from 'react'
import {
  AlertCircle,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  Loader2,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
} from 'lucide-react'
import type { AnalysisCreate } from '@/api/types'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useCreateAnalysis } from '@/hooks/useCreateAnalysis'
import {
  DEFAULT_DIMENSIONS,
  DEMO_COMPETITORS,
  DEMO_DIMENSIONS,
  DEMO_OUR_PRODUCT,
} from '@/lib/demo'
import { humanizeDimension } from '@/lib/format'
import { cn } from '@/lib/utils'

interface CompetitorField {
  id: string
  name: string
  url: string
  extraUrlsText: string
  showExtraUrls: boolean
}

interface ProductFormProps {
  id?: string
  className?: string
  onLoadDemoReady?: (loadDemoFn: () => void) => void
}

function normalizeUrl(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (!/^https?:\/\//i.test(trimmed)) {
    return `https://${trimmed}`
  }
  return trimmed
}

function isValidHttpUrl(string: string): boolean {
  try {
    const url = new URL(string)
    return (url.protocol === 'http:' || url.protocol === 'https:') && Boolean(url.hostname)
  } catch {
    return false
  }
}

function parseExtraUrls(text: string): { urls: string[]; hasInvalid: boolean } {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

  const urls: string[] = []
  let hasInvalid = false

  for (const raw of lines) {
    const normalized = normalizeUrl(raw)
    if (isValidHttpUrl(normalized)) {
      urls.push(normalized)
    } else {
      hasInvalid = true
    }
  }

  return { urls, hasInvalid }
}

export function ProductForm({ id = 'analysis-form', className, onLoadDemoReady }: ProductFormProps) {
  const createAnalysis = useCreateAnalysis()

  // Form state
  const [ourName, setOurName] = React.useState('')
  const [ourUrl, setOurUrl] = React.useState('')
  const [competitors, setCompetitors] = React.useState<CompetitorField[]>([
    { id: 'comp-1', name: '', url: '', extraUrlsText: '', showExtraUrls: false },
  ])

  // Dimensions state: default all 5 ON
  const [availableDimensions, setAvailableDimensions] = React.useState<string[]>([
    ...DEFAULT_DIMENSIONS,
  ])
  const [selectedDimensions, setSelectedDimensions] = React.useState<string[]>([
    ...DEFAULT_DIMENSIONS,
  ])
  const [customDimensionInput, setCustomDimensionInput] = React.useState('')

  // Touched state for inline validation
  const [touched, setTouched] = React.useState<{
    ourName?: boolean
    ourUrl?: boolean
    competitors?: Record<number, { name?: boolean; url?: boolean; extraUrls?: boolean }>
    dimensions?: boolean
    submitted?: boolean
  }>({})

  // First input ref for autofocus
  const ourNameInputRef = React.useRef<HTMLInputElement>(null)

  // Autofocus our product name on mount
  React.useEffect(() => {
    ourNameInputRef.current?.focus()
  }, [])

  // Provide load demo handler to parent if requested
  const handleLoadDemo = React.useCallback(() => {
    setOurName(DEMO_OUR_PRODUCT.name)
    setOurUrl(DEMO_OUR_PRODUCT.url)
    setCompetitors(
      DEMO_COMPETITORS.map((c, i) => ({
        id: `comp-demo-${i}`,
        name: c.name,
        url: c.url,
        extraUrlsText: (c.extra_urls ?? []).join('\n'),
        showExtraUrls: (c.extra_urls ?? []).length > 0,
      })),
    )
    setSelectedDimensions([...DEMO_DIMENSIONS])
    setTouched({})
    createAnalysis.reset()
    ourNameInputRef.current?.focus()
  }, [createAnalysis])

  React.useEffect(() => {
    if (onLoadDemoReady) {
      onLoadDemoReady(handleLoadDemo)
    }
  }, [handleLoadDemo, onLoadDemoReady])

  // Field blurs: prepend https:// if missing
  const handleOurUrlBlur = () => {
    const normalized = normalizeUrl(ourUrl)
    if (normalized !== ourUrl) {
      setOurUrl(normalized)
    }
    setTouched((prev) => ({ ...prev, ourUrl: true }))
  }

  const handleCompetitorUrlBlur = (index: number) => {
    const current = competitors[index]
    if (!current) return
    const normalized = normalizeUrl(current.url)
    if (normalized !== current.url) {
      setCompetitors((prev) =>
        prev.map((c, i) => (i === index ? { ...c, url: normalized } : c)),
      )
    }
    setTouched((prev) => ({
      ...prev,
      competitors: {
        ...prev.competitors,
        [index]: { ...prev.competitors?.[index], url: true },
      },
    }))
  }

  // Competitor operations
  const addCompetitor = () => {
    if (competitors.length >= 4) return
    const nextId = `comp-${Date.now()}`
    setCompetitors((prev) => [
      ...prev,
      { id: nextId, name: '', url: '', extraUrlsText: '', showExtraUrls: false },
    ])
  }

  const removeCompetitor = (index: number) => {
    if (competitors.length <= 1) return
    setCompetitors((prev) => prev.filter((_, i) => i !== index))
    setTouched((prev) => {
      const nextCompTouched = { ...prev.competitors }
      delete nextCompTouched[index]
      return { ...prev, competitors: nextCompTouched }
    })
  }

  const toggleExtraUrls = (index: number) => {
    setCompetitors((prev) =>
      prev.map((c, i) => (i === index ? { ...c, showExtraUrls: !c.showExtraUrls } : c)),
    )
  }

  // Dimensions handling
  const toggleDimension = (dim: string) => {
    setSelectedDimensions((prev) => {
      const next = prev.includes(dim) ? prev.filter((d) => d !== dim) : [...prev, dim]
      return next
    })
    setTouched((prev) => ({ ...prev, dimensions: true }))
  }

  const addCustomDimension = (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    const raw = customDimensionInput.trim().toLowerCase()
    if (!raw) return
    const formatted = raw
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
    if (!formatted) return

    if (!availableDimensions.includes(formatted)) {
      setAvailableDimensions((prev) => [...prev, formatted])
    }
    if (!selectedDimensions.includes(formatted)) {
      setSelectedDimensions((prev) => [...prev, formatted])
    }
    setCustomDimensionInput('')
  }

  // Duplicate URL check
  const normalizedOurUrl = normalizeUrl(ourUrl).toLowerCase()
  const duplicateUrlIndexes = React.useMemo(() => {
    const dupes: Record<number, string> = {}
    competitors.forEach((c, i) => {
      const norm = normalizeUrl(c.url).toLowerCase()
      if (!norm) return
      if (norm === normalizedOurUrl) {
        dupes[i] = 'Competitor URL matches our product URL'
        return
      }
      for (let j = 0; j < i; j++) {
        const prevNorm = normalizeUrl(competitors[j]?.url ?? '').toLowerCase()
        if (norm === prevNorm) {
          dupes[i] = 'Duplicate competitor URL'
          break
        }
      }
    })
    return dupes
  }, [competitors, normalizedOurUrl])

  // Validation calculations
  const errors = React.useMemo(() => {
    const errs: {
      ourName?: string
      ourUrl?: string
      competitors: Record<number, { name?: string; url?: string; extraUrls?: string }>
      dimensions?: string
    } = { competitors: {} }

    // Our product name
    if (!ourName.trim()) {
      errs.ourName = 'Product name is required'
    }

    // Our product URL
    const ourNorm = normalizeUrl(ourUrl)
    if (!ourNorm) {
      errs.ourUrl = 'Product URL is required'
    } else if (!isValidHttpUrl(ourNorm)) {
      errs.ourUrl = 'Enter a valid URL (e.g. https://example.com)'
    } else {
      const matchesCompetitor = competitors.some(
        (c) => normalizeUrl(c.url).toLowerCase() === ourNorm.toLowerCase(),
      )
      if (matchesCompetitor) {
        errs.ourUrl = 'Our product URL matches a competitor URL'
      }
    }

    // Competitors
    competitors.forEach((c, idx) => {
      const compErr: { name?: string; url?: string; extraUrls?: string } = {}
      if (!c.name.trim()) {
        compErr.name = 'Competitor name is required'
      }
      const compNorm = normalizeUrl(c.url)
      if (!compNorm) {
        compErr.url = 'Competitor URL is required'
      } else if (!isValidHttpUrl(compNorm)) {
        compErr.url = 'Enter a valid URL (e.g. https://example.com)'
      } else if (duplicateUrlIndexes[idx]) {
        compErr.url = duplicateUrlIndexes[idx]
      }

      if (c.extraUrlsText.trim()) {
        const { hasInvalid } = parseExtraUrls(c.extraUrlsText)
        if (hasInvalid) {
          compErr.extraUrls = 'Each extra URL must be a valid http(s) link'
        }
      }

      if (Object.keys(compErr).length > 0) {
        errs.competitors[idx] = compErr
      }
    })

    // Dimensions
    if (selectedDimensions.length === 0) {
      errs.dimensions = 'Select at least one comparison dimension'
    }

    return errs
  }, [competitors, duplicateUrlIndexes, ourName, ourUrl, selectedDimensions])

  const isValid =
    !errors.ourName &&
    !errors.ourUrl &&
    Object.keys(errors.competitors).length === 0 &&
    !errors.dimensions

  // Keyboard navigation: Enter moves to next input; on last input triggers submit
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return
    if (e.currentTarget.id === 'custom-dimension-input') return

    e.preventDefault()
    const form = e.currentTarget.closest('form')
    if (!form) return

    const inputs = Array.from(
      form.querySelectorAll<HTMLInputElement>(
        'input[type="text"]:not(#custom-dimension-input), input[type="url"]',
      ),
    )
    const currentIndex = inputs.indexOf(e.currentTarget)
    if (currentIndex >= 0 && currentIndex < inputs.length - 1) {
      inputs[currentIndex + 1]?.focus()
    } else {
      void handleSubmit()
    }
  }

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault()

    // Prepend https:// where needed
    const normalizedOur = normalizeUrl(ourUrl)
    setOurUrl(normalizedOur)
    setCompetitors((prev) =>
      prev.map((c) => ({
        ...c,
        url: normalizeUrl(c.url),
      })),
    )

    setTouched({
      ourName: true,
      ourUrl: true,
      dimensions: true,
      submitted: true,
      competitors: competitors.reduce<Record<number, { name: boolean; url: boolean; extraUrls: boolean }>>(
        (acc, _, idx) => {
          acc[idx] = { name: true, url: true, extraUrls: true }
          return acc
        },
        {},
      ),
    })

    if (!isValid) {
      // Focus first invalid field
      window.setTimeout(() => {
        if (errors.ourName) {
          document.getElementById('our-product-name')?.focus()
        } else if (errors.ourUrl) {
          document.getElementById('our-product-url')?.focus()
        } else {
          for (let i = 0; i < competitors.length; i++) {
            if (errors.competitors[i]?.name) {
              document.getElementById(`competitor-name-${i}`)?.focus()
              return
            }
            if (errors.competitors[i]?.url) {
              document.getElementById(`competitor-url-${i}`)?.focus()
              return
            }
            if (errors.competitors[i]?.extraUrls) {
              document.getElementById(`competitor-extra-urls-${i}`)?.focus()
              return
            }
          }
          if (errors.dimensions) {
            document.getElementById('dimensions-group')?.scrollIntoView({ behavior: 'smooth' })
          }
        }
      }, 50)
      return
    }

    // Build AnalysisCreate body
    const body: AnalysisCreate = {
      our_product: {
        name: ourName.trim(),
        url: normalizedOur,
      },
      competitors: competitors.map((c) => {
        const { urls } = parseExtraUrls(c.extraUrlsText)
        return {
          name: c.name.trim(),
          url: normalizeUrl(c.url),
          ...(urls.length > 0 ? { extra_urls: urls } : {}),
        }
      }),
      dimensions: selectedDimensions,
    }

    createAnalysis.mutate(body)
  }

  const isPending = createAnalysis.isPending

  return (
    <Card id={id} className={cn('relative shadow-sm', className)}>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 border-b border-border/60 pb-5">
        <div>
          <CardTitle className="text-xl">Set up competitive analysis</CardTitle>
          <CardDescription className="mt-1">
            Specify your product, 1 to 4 competitors, and analysis dimensions.
          </CardDescription>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleLoadDemo}
          disabled={isPending}
          className="text-xs font-medium text-accent hover:bg-accent/10"
        >
          <Sparkles className="h-3.5 w-3.5" />
          Load demo
        </Button>
      </CardHeader>

      <CardContent className="pt-6">
        <form onSubmit={handleSubmit} noValidate className="space-y-8">
          <fieldset disabled={isPending} className="space-y-8 disabled:opacity-80">
            {/* Our product section */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                  1
                </span>
                <h4 className="text-sm font-semibold tracking-tight">Our product</h4>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="our-product-name" className="mb-1 block text-xs font-medium text-foreground">
                    Product name <span className="text-danger">*</span>
                  </label>
                  <Input
                    id="our-product-name"
                    ref={ourNameInputRef}
                    placeholder="e.g. Acme Notes"
                    value={ourName}
                    onChange={(e) => setOurName(e.target.value)}
                    onBlur={() => setTouched((prev) => ({ ...prev, ourName: true }))}
                    onKeyDown={handleKeyDown}
                    aria-invalid={Boolean((touched.ourName || touched.submitted) && errors.ourName)}
                    aria-describedby={errors.ourName ? 'our-product-name-error' : undefined}
                  />
                  {(touched.ourName || touched.submitted) && errors.ourName && (
                    <p id="our-product-name-error" className="mt-1.5 flex items-center gap-1 text-xs text-danger" role="alert">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                      <span>{errors.ourName}</span>
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor="our-product-url" className="mb-1 block text-xs font-medium text-foreground">
                    Homepage / Main URL <span className="text-danger">*</span>
                  </label>
                  <Input
                    id="our-product-url"
                    type="url"
                    placeholder="https://acmenotes.example.com"
                    value={ourUrl}
                    onChange={(e) => setOurUrl(e.target.value)}
                    onBlur={handleOurUrlBlur}
                    onKeyDown={handleKeyDown}
                    aria-invalid={Boolean((touched.ourUrl || touched.submitted) && errors.ourUrl)}
                    aria-describedby={errors.ourUrl ? 'our-product-url-error' : undefined}
                  />
                  {(touched.ourUrl || touched.submitted) && errors.ourUrl && (
                    <p id="our-product-url-error" className="mt-1.5 flex items-center gap-1 text-xs text-danger" role="alert">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                      <span>{errors.ourUrl}</span>
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Competitors section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                    2
                  </span>
                  <h4 className="text-sm font-semibold tracking-tight">Competitors (1 to 4)</h4>
                </div>
                {competitors.length < 4 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={addCompetitor}
                    disabled={isPending}
                    className="text-xs text-accent hover:bg-accent/10"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add competitor
                  </Button>
                )}
              </div>

              <div className="space-y-3">
                {competitors.map((comp, idx) => {
                  const compTouched = touched.competitors?.[idx]
                  const compErr = errors.competitors[idx]

                  return (
                    <div
                      key={comp.id}
                      className="rounded-xl border border-border/80 bg-background/50 p-4 transition-colors"
                    >
                      <div className="flex items-start gap-3">
                        <div className="grid flex-1 gap-3 sm:grid-cols-2">
                          <div>
                            <label
                              htmlFor={`competitor-name-${idx}`}
                              className="mb-1 block text-xs font-medium text-foreground"
                            >
                              Competitor {idx + 1} name <span className="text-danger">*</span>
                            </label>
                            <Input
                              id={`competitor-name-${idx}`}
                              placeholder="e.g. Rivalo"
                              value={comp.name}
                              onChange={(e) =>
                                setCompetitors((prev) =>
                                  prev.map((c, i) => (i === idx ? { ...c, name: e.target.value } : c)),
                                )
                              }
                              onBlur={() =>
                                setTouched((prev) => ({
                                  ...prev,
                                  competitors: {
                                    ...prev.competitors,
                                    [idx]: { ...prev.competitors?.[idx], name: true },
                                  },
                                }))
                              }
                              onKeyDown={handleKeyDown}
                              aria-invalid={Boolean((compTouched?.name || touched.submitted) && compErr?.name)}
                              aria-describedby={compErr?.name ? `competitor-name-${idx}-error` : undefined}
                            />
                            {(compTouched?.name || touched.submitted) && compErr?.name && (
                              <p
                                id={`competitor-name-${idx}-error`}
                                className="mt-1.5 flex items-center gap-1 text-xs text-danger"
                                role="alert"
                              >
                                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                                <span>{compErr.name}</span>
                              </p>
                            )}
                          </div>

                          <div>
                            <label
                              htmlFor={`competitor-url-${idx}`}
                              className="mb-1 block text-xs font-medium text-foreground"
                            >
                              Competitor {idx + 1} URL <span className="text-danger">*</span>
                            </label>
                            <Input
                              id={`competitor-url-${idx}`}
                              type="url"
                              placeholder="https://rivalo.example.com"
                              value={comp.url}
                              onChange={(e) =>
                                setCompetitors((prev) =>
                                  prev.map((c, i) => (i === idx ? { ...c, url: e.target.value } : c)),
                                )
                              }
                              onBlur={() => handleCompetitorUrlBlur(idx)}
                              onKeyDown={handleKeyDown}
                              aria-invalid={Boolean((compTouched?.url || touched.submitted) && compErr?.url)}
                              aria-describedby={compErr?.url ? `competitor-url-${idx}-error` : undefined}
                            />
                            {(compTouched?.url || touched.submitted) && compErr?.url && (
                              <p
                                id={`competitor-url-${idx}-error`}
                                className="mt-1.5 flex items-center gap-1 text-xs text-danger"
                                role="alert"
                              >
                                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                                <span>{compErr.url}</span>
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="pt-6">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => removeCompetitor(idx)}
                            disabled={competitors.length <= 1 || isPending}
                            title={competitors.length <= 1 ? 'At least 1 competitor is required' : 'Remove competitor'}
                            className="text-muted-foreground hover:bg-muted hover:text-danger disabled:opacity-30"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      {/* Extra URLs toggle */}
                      <div className="mt-3 border-t border-border/50 pt-2.5">
                        <button
                          type="button"
                          onClick={() => toggleExtraUrls(idx)}
                          className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        >
                          {comp.showExtraUrls ? (
                            <ChevronUp className="h-3.5 w-3.5 text-accent" />
                          ) : (
                            <ChevronDown className="h-3.5 w-3.5 text-accent" />
                          )}
                          <span>
                            {comp.showExtraUrls ? 'Hide extra URLs' : '+ Extra URLs (pricing, docs, changelog)'}
                          </span>
                        </button>

                        {comp.showExtraUrls && (
                          <div className="mt-2.5">
                            <label
                              htmlFor={`competitor-extra-urls-${idx}`}
                              className="mb-1 block text-[11px] text-muted-foreground"
                            >
                              One URL per line (optional hand-picked pages)
                            </label>
                            <textarea
                              id={`competitor-extra-urls-${idx}`}
                              rows={2}
                              className="w-full rounded-lg border border-input bg-card p-2 font-mono text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              placeholder={'https://rivalo.example.com/pricing\nhttps://rivalo.example.com/docs'}
                              value={comp.extraUrlsText}
                              onChange={(e) =>
                                setCompetitors((prev) =>
                                  prev.map((c, i) => (i === idx ? { ...c, extraUrlsText: e.target.value } : c)),
                                )
                              }
                              onBlur={() =>
                                setTouched((prev) => ({
                                  ...prev,
                                  competitors: {
                                    ...prev.competitors,
                                    [idx]: { ...prev.competitors?.[idx], extraUrls: true },
                                  },
                                }))
                              }
                            />
                            {(compTouched?.extraUrls || touched.submitted) && compErr?.extraUrls && (
                              <p className="mt-1 flex items-center gap-1 text-xs text-danger" role="alert">
                                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                                <span>{compErr.extraUrls}</span>
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Dimensions section */}
            <div id="dimensions-group" className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                  3
                </span>
                <h4 className="text-sm font-semibold tracking-tight">Dimensions</h4>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {availableDimensions.map((dim) => {
                  const isSelected = selectedDimensions.includes(dim)
                  return (
                    <button
                      key={dim}
                      type="button"
                      onClick={() => toggleDimension(dim)}
                      className={cn(
                        'flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
                        isSelected
                          ? 'border-accent/40 bg-accent text-accent-foreground shadow-sm'
                          : 'border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground',
                      )}
                    >
                      {isSelected ? <Check className="h-3 w-3 stroke-[3]" /> : null}
                      <span>{humanizeDimension(dim)}</span>
                    </button>
                  )
                })}
              </div>

              {/* Add custom dimension */}
              <div className="flex max-w-sm items-center gap-2 pt-1">
                <Input
                  id="custom-dimension-input"
                  placeholder="Add custom dimension…"
                  value={customDimensionInput}
                  onChange={(e) => setCustomDimensionInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addCustomDimension()
                    }
                  }}
                  className="h-8 text-xs"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => addCustomDimension()}
                  disabled={!customDimensionInput.trim() || isPending}
                  className="h-8 shrink-0 text-xs"
                >
                  <Plus className="h-3 w-3" />
                  Add
                </Button>
              </div>

              {(touched.dimensions || touched.submitted) && errors.dimensions && (
                <p className="mt-1.5 flex items-center gap-1 text-xs text-danger" role="alert">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  <span>{errors.dimensions}</span>
                </p>
              )}
            </div>

            {/* Error Banner with Retry */}
            {createAnalysis.isError && (
              <div
                className="flex items-center justify-between rounded-xl border border-danger/30 bg-danger-soft p-4 text-sm text-danger"
                role="alert"
              >
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{createAnalysis.error?.message || 'Failed to start analysis'}</span>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => handleSubmit()}
                  className="border-danger/40 text-danger hover:bg-danger/10"
                >
                  <RotateCcw className="h-3 w-3" />
                  Retry
                </Button>
              </div>
            )}

            {/* Submit Action */}
            <div className="flex items-center justify-between border-t border-border/60 pt-5">
              <div className="text-xs text-muted-foreground">
                <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px]">Enter</kbd> to
                navigate between fields and submit.
              </div>
              <Button
                type="submit"
                disabled={isPending}
                className="h-10 px-6 font-medium"
              >
                {isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Starting agents…</span>
                  </>
                ) : (
                  <>
                    <span>Analyze</span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          </fieldset>
        </form>
      </CardContent>
    </Card>
  )
}
