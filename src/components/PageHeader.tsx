import React from 'react';

export function PageHeader({ title, desc }: { title: string, desc?: string }) {
  return (
    <div className="p-6 max-w-7xl mx-auto h-full flex flex-col">
      <div className="bg-white rounded-lg border border-slate-200/80 p-6 flex-1 flex flex-col items-center justify-center text-center shadow-sm">
        <h1 className="text-xl font-bold text-slate-700 mb-2">{title}</h1>
        {desc && <p className="text-xs text-slate-500">{desc}</p>}
        <div className="mt-8 p-4 bg-slate-50/50 rounded border border-slate-100 max-w-md w-full">
          <p className="text-[11px] text-slate-400">开发占位页 / 正在构建中</p>
        </div>
      </div>
    </div>
  );
}
