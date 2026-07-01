import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSearchParams } from 'react-router-dom';
import { AlertOctagon, ArrowRight, CheckCircle2, FileText, Loader2, UploadCloud } from 'lucide-react';
import { useAppContext } from '../AppContext';
import { backendApi } from '../services/backendApi';
import type { KnowledgeBase, KnowledgeDocument } from '../types/domain';

type FileStatus = 'idle' | 'uploading' | 'indexing' | 'success' | 'failed';

export function KBUpload() {
  const { user } = useAppContext();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
  const [knowledgeBaseId, setKnowledgeBaseId] = useState('kb-acoustic');
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<FileStatus>('idle');
  const [document, setDocument] = useState<KnowledgeDocument | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    void backendApi.listKnowledgeBases().then((items) => {
      const requestedKnowledgeBaseId = searchParams.get('knowledgeBaseId');
      setKnowledgeBases(items);
      setKnowledgeBaseId(items.find((item) => item.id === requestedKnowledgeBaseId)?.id ?? items[0]?.id ?? 'kb-acoustic');
    });
  }, [searchParams]);

  const upload = async (indexNow: boolean) => {
    if (!file || !user) return;
    setError('');
    setStatus('uploading');
    try {
      const uploaded = await backendApi.uploadDocument(file, knowledgeBaseId, user.name, indexNow);
      setDocument(uploaded);
      if (indexNow && uploaded.indexStatus !== 'indexed') {
        setStatus('indexing');
        const indexed = await backendApi.indexDocument(uploaded.id);
        setDocument(indexed);
      }
      setStatus('success');
    } catch (exc) {
      setError(exc instanceof Error ? exc.message : String(exc));
      setStatus('failed');
    }
  };

  const reset = () => {
    setFile(null);
    setDocument(null);
    setError('');
    setStatus('idle');
  };

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">上传文件至知识库</h1>
        <p className="text-slate-500 mt-1">真实保存文件，支持 PDF、DOCX、TXT、MD，并通过本地 RAG 索引后用于智能问答引用。</p>
      </div>

      <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-8 rounded-r-md shadow-sm">
        <div className="flex">
          <AlertOctagon className="h-5 w-5 text-red-600 shrink-0" />
          <div className="ml-3">
            <h3 className="text-sm font-bold text-red-800">安全提示</h3>
            <p className="mt-1 text-sm text-red-700">当前版本会真实读取和索引上传文件。请勿上传涉密或敏感材料。</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 space-y-6">
        {status === 'idle' && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="text-sm font-medium text-slate-700">
                目标知识库
                <select
                  value={knowledgeBaseId}
                  onChange={(event) => setKnowledgeBaseId(event.target.value)}
                  className="mt-2 block w-full border border-slate-200 rounded px-3 py-2 text-sm bg-white"
                >
                  {knowledgeBases.map((kb) => (
                    <option key={kb.id} value={kb.id}>{kb.name}</option>
                  ))}
                </select>
              </label>
              <div className="text-sm text-slate-500 bg-slate-50 border border-slate-200 rounded p-3">
                <div className="font-semibold text-slate-700 mb-1">索引说明</div>
                审批入库会创建待办；立即索引会直接解析、切片并写入本地 Chroma 向量库。
              </div>
            </div>

            <label className="border-2 border-dashed border-slate-300 rounded-lg p-12 text-center hover:bg-slate-50 transition-colors block cursor-pointer">
              <UploadCloud className="mx-auto h-12 w-12 text-slate-400" />
              <div className="mt-4 text-sm text-slate-600">
                <span className="font-semibold text-blue-600">选择文件</span>
                <span className="ml-2">支持 PDF / DOCX / TXT / MD</span>
              </div>
              <input
                type="file"
                accept=".pdf,.docx,.txt,.md"
                className="hidden"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
              {file && <div className="mt-4 text-sm text-slate-800">{file.name}</div>}
            </label>

            <div className="flex justify-center gap-4">
              <button
                onClick={() => void upload(false)}
                disabled={!file}
                className="px-4 py-2 bg-white border border-slate-300 text-slate-700 text-sm font-medium rounded shadow-sm hover:bg-slate-50 disabled:opacity-50"
              >
                上传并进入审批
              </button>
              <button
                onClick={() => void upload(true)}
                disabled={!file}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded shadow-sm hover:bg-blue-700 disabled:opacity-50"
              >
                上传并立即索引
              </button>
            </div>
          </>
        )}

        {(status === 'uploading' || status === 'indexing') && (
          <div className="p-12 flex flex-col items-center justify-center text-center">
            <Loader2 className="w-12 h-12 text-blue-500 animate-spin mb-4" />
            <h3 className="text-lg font-medium text-slate-800">{status === 'uploading' ? '正在上传文件...' : '正在解析、切片并写入向量库...'}</h3>
          </div>
        )}

        {status === 'failed' && (
          <div className="border border-red-200 bg-red-50 rounded-lg p-8 text-center shadow-sm">
            <FileText className="w-14 h-14 text-red-500 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-red-800 mb-2">上传或索引失败</h3>
            <p className="text-red-700 mb-6 max-w-2xl mx-auto whitespace-pre-wrap">{error}</p>
            <button onClick={reset} className="px-6 py-2 bg-white text-red-700 border border-red-300 font-medium rounded hover:bg-red-50">返回重试</button>
          </div>
        )}

        {status === 'success' && document && (
          <div className="border border-green-200 bg-green-50 rounded-lg p-8 text-center shadow-sm">
            <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-green-800 mb-2">文件提交成功</h3>
            <p className="text-green-700 mb-2">{document.fileName}</p>
            <p className="text-sm text-green-700 mb-6">
              索引状态：{document.indexStatus ?? 'not_indexed'} / 切片数：{document.chunkCount ?? 0}
            </p>
            <div className="flex justify-center space-x-4">
              <button onClick={reset} className="px-6 py-2 bg-white text-slate-700 border border-slate-300 font-medium rounded hover:bg-slate-50">继续上传</button>
              <button onClick={() => navigate('/kb')} className="px-6 py-2 bg-blue-600 text-white font-medium rounded hover:bg-blue-700 flex items-center">
                返回知识库 <ArrowRight className="w-4 h-4 ml-2" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
