import { useEffect, useState } from 'react';
import { Bot, Calendar, FileText, Target, Zap } from 'lucide-react';
import { useAppContext } from '../AppContext';
import { backendApi } from '../services/backendApi';
import type { LLMTask } from '../types/domain';

const TASKS = [
  { title: '起草本周工作汇报', icon: FileText },
  { title: '提炼明天部门例会的会议纪要', icon: Calendar },
  { title: '提取招标文件的核心技术要求', icon: Target },
  { title: '润色项目申报书摘要', icon: Zap },
];

export function AIOffice() {
  const { user } = useAppContext();
  const [input, setInput] = useState('帮我起草一份关于设备网络维护的通知');
  const [tasks, setTasks] = useState<LLMTask[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = async () => setTasks(await backendApi.listLLMTasks('office'));
  useEffect(() => { void reload(); }, []);

  const submit = async (text = input) => {
    if (!user) return;
    setLoading(true);
    try {
      await backendApi.createLLMTask({ taskType: 'office', title: '办公任务', inputText: text, userId: user.id });
      await reload();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto h-full flex flex-col space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-700">AI 办公工作台</h1>
        <p className="text-xs text-slate-500 mt-1">办公任务已接入后端 LLM 任务接口。</p>
      </div>
      <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm">
        <Bot className="w-12 h-12 text-blue-400 mb-4" />
        <div className="max-w-2xl bg-white border border-blue-200 shadow-sm rounded-lg p-2 flex items-center">
          <input value={input} onChange={(e) => setInput(e.target.value)} className="flex-1 bg-transparent border-none outline-none text-sm px-4 py-2" />
          <button disabled={loading} onClick={() => void submit()} className="px-4 py-1.5 bg-blue-600 text-white rounded text-sm font-bold disabled:opacity-60">{loading ? '处理中...' : '处理'}</button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-8">
          {TASKS.map((task) => (
            <button key={task.title} onClick={() => void submit(task.title)} className="flex justify-between items-center bg-slate-50 border border-slate-100 rounded-lg p-4 hover:bg-white hover:border-blue-200 text-left">
              <span className="flex items-center text-sm text-slate-700 font-medium"><task.icon className="w-4 h-4 mr-3 text-blue-500" />{task.title}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm overflow-auto">
        <h3 className="font-bold text-slate-700 text-sm mb-3">任务历史</h3>
        {tasks.map((task) => <pre key={task.id} className="whitespace-pre-wrap text-xs text-slate-600 border-t border-slate-100 py-3">{task.outputText}</pre>)}
      </div>
    </div>
  );
}
