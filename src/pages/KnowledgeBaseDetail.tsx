import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Database, FileText, Loader2, Search, UploadCloud } from 'lucide-react';
import { backendApi } from '../services/backendApi';
import type { KnowledgeBase, KnowledgeDocument, KnowledgeSearchResult } from '../types/domain';

export function KnowledgeBaseDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [knowledgeBase, setKnowledgeBase] = useState<KnowledgeBase | null>(null);
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<KnowledgeSearchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    if (!id) return;
    setLoading(true);
    setError('');
    try {
      const [kb, docs] = await Promise.all([backendApi.getKnowledgeBase(id), backendApi.listDocuments()]);
      setKnowledgeBase(kb);
      setDocuments(docs.filter((document) => document.knowledgeBaseId === id));
    } catch (exc) {
      setError(exc instanceof Error ? exc.message : String(exc));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [id]);

  const indexedDocuments = useMemo(
    () => documents.filter((document) => document.indexStatus === 'indexed' && (document.chunkCount ?? 0) > 0),
    [documents],
  );

  const runSearch = async () => {
    if (!id || !query.trim()) return;
    setSearching(true);
    setError('');
    try {
      setHits(await backendApi.searchKnowledgeBase(id, query.trim()));
    } catch (exc) {
      setError(exc instanceof Error ? exc.message : String(exc));
      setHits([]);
    } finally {
      setSearching(false);
    }
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center text-slate-500">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        正在加载知识库...
      </div>
    );
  }

  if (!knowledgeBase) {
    return (
      <div className="p-6">
        <button onClick={() => navigate('/kb')} className="text-sm text-blue-600 inline-flex items-center">
          <ArrowLeft className="w-4 h-4 mr-1" />
          返回知识库中心
        </button>
        <div className="mt-6 border border-red-200 bg-red-50 text-red-700 rounded p-4 text-sm">{error || '知识库不存在'}</div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto h-full flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <Link to="/kb" className="text-xs text-slate-500 hover:text-blue-600 inline-flex items-center mb-2">
            <ArrowLeft className="w-3.5 h-3.5 mr-1" />
            返回知识库中心
          </Link>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded bg-blue-50 text-blue-600 flex items-center justify-center">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-800">{knowledgeBase.name}</h1>
              <p className="text-xs text-slate-500 mt-1">
                {knowledgeBase.department} / {knowledgeBase.type} / {knowledgeBase.level}
              </p>
            </div>
          </div>
        </div>
        <button
          onClick={() => navigate(`/kb/upload?knowledgeBaseId=${knowledgeBase.id}`)}
          className="px-3 py-1.5 bg-blue-600 text-white rounded text-xs font-semibold hover:bg-blue-700 inline-flex items-center"
        >
          <UploadCloud className="w-3.5 h-3.5 mr-1" />
          上传到此知识库
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Metric label="文件数" value={documents.length} />
        <Metric label="已索引文档" value={indexedDocuments.length} />
        <Metric label="切片数" value={documents.reduce((sum, document) => sum + (document.chunkCount ?? 0), 0)} />
        <Metric label="状态" value={knowledgeBase.status} />
      </div>

      {error && <div className="border border-red-200 bg-red-50 text-red-700 rounded p-3 text-sm">{error}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 min-h-0 flex-1">
        <section className="lg:col-span-2 bg-white border border-slate-200 rounded-lg overflow-hidden flex flex-col min-h-0">
          <div className="p-3 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-700">文档列表</h2>
            <span className="text-xs text-slate-400">{documents.length} 个文档</span>
          </div>
          <div className="flex-1 overflow-auto custom-scrollbar">
            {documents.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">暂无文档，上传并索引后即可用于检索引用。</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500">
                  <tr>
                    <th className="text-left px-4 py-2">文档</th>
                    <th className="text-left px-4 py-2">入库状态</th>
                    <th className="text-left px-4 py-2">索引</th>
                    <th className="text-right px-4 py-2">切片</th>
                  </tr>
                </thead>
                <tbody>
                  {documents.map((document) => (
                    <tr key={document.id} className="border-t border-slate-100">
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-700 flex items-center">
                          <FileText className="w-4 h-4 mr-2 text-blue-500" />
                          {document.title}
                        </div>
                        <div className="text-xs text-slate-400 mt-1">{document.fileName}</div>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">{document.status}</td>
                      <td className="px-4 py-3 text-xs">
                        <span className={document.indexStatus === 'indexed' ? 'text-green-700' : document.indexStatus === 'failed' ? 'text-red-700' : 'text-slate-500'}>
                          {document.indexStatus ?? 'not_indexed'}
                        </span>
                        {document.indexError && <div className="text-red-600 mt-1 max-w-xs truncate">{document.indexError}</div>}
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-slate-600">{document.chunkCount ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>

        <section className="bg-white border border-slate-200 rounded-lg overflow-hidden flex flex-col min-h-0">
          <div className="p-3 border-b border-slate-100">
            <h2 className="text-sm font-bold text-slate-700">检索测试</h2>
            <p className="text-xs text-slate-400 mt-1">调用真实知识库检索接口，返回已索引切片。</p>
          </div>
          <div className="p-3 border-b border-slate-100 flex gap-2">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void runSearch();
              }}
              className="min-w-0 flex-1 border border-slate-200 rounded px-3 py-2 text-sm"
              placeholder="输入检索问题"
            />
            <button onClick={() => void runSearch()} disabled={!query.trim() || searching} className="px-3 py-2 rounded bg-blue-600 text-white disabled:opacity-50">
              {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            </button>
          </div>
          <div className="flex-1 overflow-auto p-3 space-y-3 custom-scrollbar">
            {hits.length === 0 ? (
              <div className="text-sm text-slate-400 text-center py-8">暂无检索结果</div>
            ) : (
              hits.map((hit) => (
                <div key={hit.chunkId} className="border border-slate-200 bg-slate-50 rounded p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-semibold text-xs text-slate-700 truncate">{hit.title}</div>
                    <span className="text-[10px] text-blue-600 shrink-0">{hit.similarity}%</span>
                  </div>
                  <p className="text-xs text-slate-600 leading-5 mt-2">{hit.excerpt}</p>
                  <div className="text-[10px] text-slate-400 mt-2">{hit.pageLabel ?? hit.documentId}</div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4">
      <div className="text-xs text-slate-400">{label}</div>
      <div className="mt-1 text-lg font-bold text-slate-800">{value}</div>
    </div>
  );
}
