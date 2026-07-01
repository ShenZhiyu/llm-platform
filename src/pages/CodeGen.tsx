import { useEffect, useState } from 'react';
import { Code, Play } from 'lucide-react';
import { useAppContext } from '../AppContext';
import { backendApi } from '../services/backendApi';
import type { LLMTask } from '../types/domain';

export function CodeGen() {
  const { user } = useAppContext();
  const [code, setCode] = useState('function processSonarSignal(data) {\n  if (!data) return;\n  return data.map(v => v.process());\n}');
  const [tasks, setTasks] = useState<LLMTask[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = async () => setTasks(await backendApi.listLLMTasks('code'));
  useEffect(() => { void reload(); }, []);

  const run = async () => {
    if (!user) return;
    setLoading(true);
    try {
      await backendApi.createLLMTask({ taskType: 'code', title: '代码分析', inputText: code, userId: user.id });
      await reload();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto h-full flex flex-col space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-700 flex items-center"><Code className="w-6 h-6 mr-2 text-slate-600" />代码生成与辅助</h1>
        <p className="text-xs text-slate-500 mt-1">代码分析任务会真实调用后端模型并保存结果。</p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1 min-h-0">
        <div className="bg-[#1e1e1e] rounded-lg shadow-sm flex flex-col overflow-hidden border border-slate-700 font-mono">
          <div className="flex items-center justify-between px-4 py-2 bg-[#2d2d2d] border-b border-slate-700">
            <span className="text-slate-300 text-xs">代码输入</span>
            <button disabled={loading} onClick={() => void run()} className="px-3 py-1 bg-blue-600 text-white text-xs font-bold rounded flex items-center hover:bg-blue-500 disabled:opacity-60">
              <Play className="w-3 h-3 mr-1" />{loading ? '分析中...' : '运行分析'}
            </button>
          </div>
          <textarea className="flex-1 min-h-96 bg-transparent text-slate-300 outline-none resize-none font-mono text-sm leading-relaxed p-4" value={code} onChange={(e) => setCode(e.target.value)} spellCheck="false" />
        </div>
        <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-auto p-4">
          <h3 className="font-bold text-slate-700 text-sm mb-3">分析输出</h3>
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
