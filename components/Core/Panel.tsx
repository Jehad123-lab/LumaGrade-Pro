import React from 'react';

interface PanelProps {
  title: string;
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}

export const Panel: React.FC<PanelProps> = ({ title, children, className = '', action }) => {
  return (
    <div className={`flex flex-col bg-white/60 dark:bg-[#09090b]/60 backdrop-blur-xl border border-zinc-200 dark:border-white/5 rounded-xl overflow-hidden ${className}`}>
      <div className="h-9 shrink-0 flex items-center justify-between px-4 border-b border-zinc-200 dark:border-white/5 bg-zinc-50/50 dark:bg-white/[0.02]">
        <h3 className="text-[10px] font-bold text-zinc-500 dark:text-zinc-500 tracking-[0.2em] uppercase font-['Inter']">
            {title}
        </h3>
        {action && <div>{action}</div>}
      </div>
      <div className="flex-1 overflow-hidden relative">
        {children}
      </div>
    </div>
  );
};