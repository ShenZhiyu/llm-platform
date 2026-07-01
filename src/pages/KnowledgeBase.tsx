import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, Database, FileText, Filter, MoreVertical, Plus, Search, Shield, X } from 'lucide-react';
import { backendApi } from '../services/backendApi';
import type { KnowledgeBase as KnowledgeBaseType } from '../types/domain';

const allTab = '全部';

export function KnowledgeBase() {
  const navigate = useNavigate();
  const [items, setItems] = useState<KnowledgeBaseType[]>([]);
  const [activeTab, setActiveTab] = useState(allTab);
  const [keyword, setKeyword] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', department: '', level: '', type: '' });

  const loadKnowledgeBases = async () => {
    const next = await backendApi.listKnowledgeBases();
    setItems(next);
    setForm((current) => ({
      ...current,
      level: current.level || next[0]?.level || '',
      type: current.type || next[0]?.type || '',
    }));
  };

  useEffect(() => {
    void loadKnowledgeBases();
  }, []);

  const typeOptions = useMemo(() => Array.from(new Set(items.map((item) => item.type))).filter(Boolean), [items]);
  const levelOptions = useMemo(() => Array.from(new Set(items.map((item) => item.level))).filter(Boolean), [items]);
  const tabs = useMemo(() => [allTab, ...typeOptions], [typeOptions]);

  const filtered = useMemo(
    () =>
      items.filter((item) => {
        const matchTab = activeTab === allTab || item.type === activeTab;
        const matchKeyword = item.name.includes(keyword) || item.department.includes(keyword);
        return matchTab && matchKeyword;
      }),
    [activeTab, items, keyword],
  );

  const createKnowledgeBase = async () => {
    if (!form.name.trim() || !form.department.trim() || !form.level || !form.type) return;
    setCreating(true);
    try {
      const created = await backendApi.createKnowledgeBase({
        name: form.name.trim(),
        department: form.department.trim(),
        level: form.level as KnowledgeBaseType['level'],
        type: form.type as KnowledgeBaseType['type'],
      });
      setItems((current) => [created, ...current]);
      setForm({ name: '', department: '', level: created.level, type: created.type });
      setCreateOpen(false);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto h-full flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-700">知识库中心</h1>
          <p className="text-xs text-slate-500 mt-1">真实文档上传、索引、检索与智能问答引用。</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => navigate('/kb/upload')}
            className="px-3 py-1.5 bg-white border border-slate-200 text-slate-600 text-xs font-semibold rounded hover:bg-slate-50 transition-colors flex items-center shadow-sm"
          >
            <FileText className="w-3.5 h-3.5 mr-1" />
            上传文件
          </button>
          <button
            onClick={() => setCreateOpen(true)}
            className="px-3 py-1.5 bg-blue-500 text-white text-xs font-semibold rounded hover:bg-blue-600 transition-colors flex items-center shadow-sm"
          >
            <Plus className="w-3.5 h-3.5 mr-1" />
            新建知识库
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-slate-200/80 shadow-sm flex flex-col flex-1 overflow-hidden">
        <div className="p-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex gap-1">
            {tabs.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                  activeTab === tab ? 'bg-white border border-slate-200 text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-slate-400" />
              <input
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                type="text"
                placeholder="搜索知识库名称..."
                className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded focus:ring-1 focus:ring-blue-400 outline-none w-48 bg-white"
              />
            </div>
            <button className="p-1.5 text-slate-400 hover:text-slate-600 border border-transparent hover:border-slate-200 rounded bg-white transition-colors" title="筛选">
              <Filter className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar bg-slate-50/30">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map((kb) => (
              <div
                key={kb.id}
                onClick={() => navigate(`/kb/${kb.id}`)}
                className="bg-white rounded border border-slate-200 p-4 hover:border-blue-300 hover:shadow-sm transition-all group cursor-pointer flex flex-col h-40"
              >
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-8 h-8 rounded bg-blue-50 flex items-center justify-center text-blue-500 shrink-0">
                      <Database className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-bold text-slate-700 group-hover:text-blue-700 truncate" title={kb.name}>
                        {kb.name}
                      </h3>
                      <p className="text-[10px] text-slate-400 mt-0.5 truncate">{kb.department}</p>
                    </div>
                  </div>
                  <button className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-slate-600 transition-opacity">
                    <MoreVertical className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="mt-auto space-y-2">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="flex items-center text-slate-500">
                      <FileText className="w-3 h-3 mr-1" /> {kb.fileCount} 份文件
                    </span>
                    <span className="flex items-center text-slate-500">
                      <Clock className="w-3 h-3 mr-1" /> {kb.updatedAt}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] pt-2 border-t border-slate-100">
                    <div className="flex gap-1.5 min-w-0">
                      <span className="px-1.5 py-0.5 rounded bg-green-50 text-green-700 truncate">{kb.level}</span>
                      <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 truncate">{kb.status}</span>
                    </div>
                    <span className="flex items-center text-slate-400 shrink-0">
                      <Shield className="w-3 h-3 mr-1" />
                      {kb.role}
                    </span>
                  </div>
                </div>
              </div>
            ))}

            <button
              onClick={() => setCreateOpen(true)}
              className="bg-slate-50/50 border border-dashed border-slate-300 rounded p-4 hover:border-blue-400 hover:bg-blue-50/20 transition-all cursor-pointer flex flex-col items-center justify-center text-slate-500 hover:text-blue-600 h-40"
            >
              <Plus className="w-6 h-6 mb-2" />
              <span className="text-xs font-medium">新建知识库</span>
            </button>
          </div>
        </div>
      </div>

      {createOpen && (
        <div className="fixed inset-0 z-40 bg-slate-900/30 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-lg border border-slate-200 shadow-xl">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-slate-800">新建知识库</h2>
                <p className="text-xs text-slate-500 mt-1">创建后可上传文件、索引并用于智能问答引用。</p>
              </div>
              <button onClick={() => setCreateOpen(false)} className="p-1 text-slate-400 hover:text-slate-700">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-4 text-sm">
              <label className="block">
                <span className="text-xs font-semibold text-slate-600">名称</span>
                <input value={form.name} onChange={(event) => setForm((value) => ({ ...value, name: event.target.value }))} className="mt-1 w-full border border-slate-200 rounded px-3 py-2" />
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-slate-600">部门</span>
                <input value={form.department} onChange={(event) => setForm((value) => ({ ...value, department: event.target.value }))} className="mt-1 w-full border border-slate-200 rounded px-3 py-2" />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs font-semibold text-slate-600">密级</span>
                  <select value={form.level} onChange={(event) => setForm((value) => ({ ...value, level: event.target.value }))} className="mt-1 w-full border border-slate-200 rounded px-3 py-2 bg-white">
                    {levelOptions.map((level) => (
                      <option key={level} value={level}>
                        {level}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-semibold text-slate-600">类型</span>
                  <select value={form.type} onChange={(event) => setForm((value) => ({ ...value, type: event.target.value }))} className="mt-1 w-full border border-slate-200 rounded px-3 py-2 bg-white">
                    {typeOptions.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
            <div className="p-4 border-t border-slate-100 flex justify-end gap-2">
              <button onClick={() => setCreateOpen(false)} className="px-3 py-1.5 text-xs border border-slate-200 rounded text-slate-600 hover:bg-slate-50">
                取消
              </button>
              <button onClick={() => void createKnowledgeBase()} disabled={creating || !form.name.trim() || !form.department.trim() || !form.level || !form.type} className="px-3 py-1.5 text-xs rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
                {creating ? '创建中...' : '创建'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
