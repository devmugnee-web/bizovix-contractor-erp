"use client"

import { useLayoutEffect, useRef } from "react"
import type { ChangeEvent, ReactNode } from "react"

import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

interface AppInputCardProps {
  title: string
  value: string
  placeholder?: string
  icon: ReactNode
  accentClassName: string
  helperText?: string
  suffix?: string
  readOnly?: boolean
  onChange?: (value: string) => void
}

export function AppInputCard({
  title,
  value,
  placeholder,
  icon,
  accentClassName,
  helperText,
  suffix,
  readOnly = false,
  onChange
}: AppInputCardProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const pendingCaretTokensRef = useRef<number | null>(null)

  useLayoutEffect(() => {
    if (pendingCaretTokensRef.current === null || !inputRef.current) {
      return
    }

    const nextCaretPosition = getCaretPositionFromTokenCount(value, pendingCaretTokensRef.current)
    inputRef.current.setSelectionRange(nextCaretPosition, nextCaretPosition)
    pendingCaretTokensRef.current = null
  }, [value])

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const caretPosition = event.target.selectionStart ?? event.target.value.length
    pendingCaretTokensRef.current = countValueTokens(event.target.value.slice(0, caretPosition))
    onChange?.(event.target.value)
  }

  return (
    <Card className="rounded-[1.75rem] border border-slate-200 bg-white shadow-[var(--shadow-card)]">
      <CardContent className="flex gap-3 p-4">
        <div
          className={cn(
            "flex size-16 shrink-0 items-center justify-center rounded-[1.4rem] border",
            accentClassName
          )}
        >
          {icon}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="space-y-1.5">
            <h3 className="text-[20px] leading-none font-bold tracking-tight text-[#132b72]">{title}</h3>
            <div className="relative rounded-[1.15rem] border border-slate-200 bg-white px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)]">
              <Input
                ref={inputRef}
                value={value}
                readOnly={readOnly}
                placeholder={placeholder}
                onChange={handleChange}
                className={cn(
                  "h-[44px] border-0 bg-transparent px-0 py-0 text-[18px] leading-[44px] font-black text-[#132b72] caret-[#132b72] align-middle shadow-none placeholder:text-[18px] placeholder:leading-[44px] placeholder:font-bold placeholder:text-[#8b97b7] focus:ring-0",
                  readOnly && "text-[#132b72]"
                )}
              />
              {suffix ? (
                <span className="pointer-events-none absolute bottom-4 right-4 text-xl font-bold text-[#132b72]">
                  {suffix}
                </span>
              ) : null}
            </div>
          </div>
          {helperText ? <p className="text-sm leading-6 text-[#7080aa]">{helperText}</p> : null}
        </div>
      </CardContent>
    </Card>
  )
}

function countValueTokens(value: string) {
  return value.replace(/,/g, "").length
}

function getCaretPositionFromTokenCount(value: string, tokenCount: number) {
  if (tokenCount <= 0) {
    return 0
  }

  let seenTokens = 0

  for (let index = 0; index < value.length; index += 1) {
    if (value[index] !== ",") {
      seenTokens += 1
    }

    if (seenTokens >= tokenCount) {
      return index + 1
    }
  }

  return value.length
}
