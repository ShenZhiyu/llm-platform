import { Cpu, Server } from 'lucide-react';
import { useAppContext } from '../AppContext';

export function AdminModels() {
  const { models } = useAppContext();

  return (
    <div className="p-6 max-w-7xl mx-auto h-full flex flex-col">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-700 flex items-center gap-2">
          <Cpu className="w-6 h-6 text-indigo-500" />
          模型管理
        </h1>
        <p className="text-xs text-slate-500 mt-1">统一查看大模型接入、默认模型和推理服务状态。</p>
      </div>
      <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="p-4 text-xs text-slate-500">模型名称</th>
              <th className="p-4 text-xs text-slate-500">类型</th>
              <th className="p-4 text-xs text-slate-500">Endpoint</th>
              <th className="p-4 text-xs text-slate-500">状态</th>
              <th className="p-4 text-xs text-slate-500">默认</th>
            </tr>
          </thead>
          <tbody>
            {models.map((model) => (
              <tr key={model.id} className="border-t border-slate-100">
                <td className="p-4 font-bold text-slate-800 flex items-center gap-2"><Server className="w-4 h-4 text-indigo-400" />{model.name}</td>
                <td className="p-4 text-slate-600">{model.type}</td>
                <td className="p-4 font-mono text-slate-400">{model.endpoint}</td>
                <td className="p-4"><span className={`px-2 py-0.5 rounded text-xs ${model.status === '正常' ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-500'}`}>{model.status}</span></td>
                <td className="p-4">{model.isDefault ? <span className="text-xs text-blue-600 font-bold">默认</span> : <span className="text-xs text-slate-400">-</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
