import { useEffect, useState } from 'react';
import { FileText, Presentation } from 'lucide-react';
import { useAppContext } from '../AppContext';
import { backendApi } from '../services/backendApi';
import type { LLMTask } from '../types/domain';

export function Meeting() {
  const { user } = useAppContext();
  const [input, setInput] = useState('参会人员讨论了项目进展、风险事项和下一阶段任务。请生成会议纪要。');
  const [tasks, setTasks] = useState<LLMTask[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = async () => setTasks(await backendApi.listLLMTasks('meeting'));
  useEffect(() => { void reload(); }, []);

  const submit = async () => {
    if (!user) return;
    setLoading(true);
    try {
      await backendApi.createLLMTask({ taskType: 'meeting', title: '会议纪要', inputText: input, userId: user.id });
      await reload();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto h-full flex flex-col space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-700 flex items-center">
            <Presentation className="w-6 h-6 mr-2 text-blue-600" />
            AI 会议助手
          </h1>
          <p className="text-xs text-slate-500 mt-1">会议纪要生成已接入后端 LLM 任务。</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1 min-h-0">
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm flex flex-col p-5">
          <h3 className="font-bold text-slate-700 text-sm mb-3">会议记录输入</h3>
          <textarea value={input} onChange={(e) => setInput(e.target.value)} className="flex-1 min-h-80 border border-slate-200 rounded p-3 text-sm outline-none" />
          <button disabled={loading} onClick={() => void submit()} className="mt-3 px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded self-end disabled:opacity-60">{loading ? '生成中...' : '生成纪要'}</button>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm flex flex-col p-5 overflow-auto">
          <h3 className="font-bold text-slate-700 text-sm mb-3 flex items-center"><FileText className="w-4 h-4 mr-2 text-blue-500" />生成历史</h3>
          {tasks.map((task) => (
            <div key={task.id} className="border border-slate-100 rounded p-3 mb-3">
              <div className="text-xs font-bold text-slate-700 mb-2">{task.createdAt}</div>
              <pre className="whitespace-pre-wrap text-xs text-slate-600 leading-5">{task.outputText}</pre>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
