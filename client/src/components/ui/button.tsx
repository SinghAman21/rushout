import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
const buttonVariants = cva('inline-flex items-center justify-center gap-2 rounded-xl border-2 border-black/60 font-bold transition-transform focus-visible:ring-4 focus-visible:ring-yellow-300 disabled:pointer-events-none disabled:opacity-50 active:translate-y-1', { variants: { variant: { default:'bg-yellow-300 text-slate-950 shadow-[0_5px_0_#927216] hover:bg-yellow-200', secondary:'bg-violet-950 text-white hover:bg-violet-900' }, size: { default:'px-6 py-3', sm:'px-4 py-2', lg:'px-8 py-4 text-xl' } }, defaultVariants:{variant:'default',size:'default'} });
export function Button({className,variant,size,asChild=false,...props}:React.ButtonHTMLAttributes<HTMLButtonElement>&VariantProps<typeof buttonVariants>&{asChild?:boolean}) { const Comp=asChild?Slot:'button'; return <Comp className={twMerge(clsx(buttonVariants({variant,size}),className))} {...props}/>; }
