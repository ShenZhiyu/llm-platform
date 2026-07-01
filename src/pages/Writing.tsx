import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  Building2,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  FileText,
  FlaskConical,
  Loader2,
  MessageSquareText,
  PenTool,
  Plus,
  Settings2,
  Sparkles,
  Wand2,
  X,
} from 'lucide-react';
import { useAppContext } from '../AppContext';
import { cn } from '../lib/utils';
import { backendApi } from '../services/backendApi';
import type { LLMTask } from '../types/domain';

type WritingTemplate = {
  id: string;
  group: string;
  title: string;
  subtitle: string;
  description: string;
  icon: ReactNode;
  documentTitle: string;
};

const officialTemplates: WritingTemplate[] = [
  {
    id: 'policy-memo',
    group: '正式公文',
    title: '政策备忘录',
    subtitle: '政策备忘',
    description: '适用于制度通知、管理要求和行政指令的标准格式。',
    icon: <FileText className="h-6 w-6" />,
    documentTitle: '数据安全与治理协议',
  },
  {
    id: 'compliance-brief',
    group: '正式公文',
    title: '合规简报',
    subtitle: '合规简报',
    description: '用于外部审计准备的法规符合性与整改摘要。',
    icon: <Wand2 className="h-6 w-6" />,
    documentTitle: '合规审查与风险控制简报',
  },
];

const internalTemplates: WritingTemplate[] = [
  {
    id: 'quarterly-operations',
    group: '内部报告',
    title: '季度运营报告',
    subtitle: '内部报告',
    description: '指标分析与资源配置',
    icon: <Sparkles className="h-4 w-4" />,
    documentTitle: '季度运营复盘报告',
  },
  {
    id: 'rd-progress',
    group: '内部报告',
    title: '研发进展摘要',
    subtitle: '技术摘要',
    description: '技术里程碑与阶段进展更新',
    icon: <FlaskConical className="h-4 w-4" />,
    documentTitle: '研发进展摘要',
  },
];

const meetingTemplates: WritingTemplate[] = [
  {
    id: 'executive-agenda',
    group: '会议材料',
    title: '高管会议议程',
    subtitle: '会议议程',
    description: '董事会和高管会议议程',
    icon: <ClipboardList className="h-4 w-4" />,
    documentTitle: '高管会议议程',
  },
  {
    id: 'talking-points',
    group: '会议材料',
    title: '发言要点',
    subtitle: '发言提纲',
    description: '结构化汇报和讨论要点',
    icon: <MessageSquareText className="h-4 w-4" />,
    documentTitle: 'AI 集成工作发言要点',
  },
  {
    id: 'minutes-actions',
    group: '会议材料',
    title: '纪要与行动项',
    subtitle: '会议纪要',
    description: '会议记录和行动项跟踪',
    icon: <CheckCircle2 className="h-4 w-4" />,
    documentTitle: '会议纪要与行动项',
  },
];

const recentDrafts = [
  ['第三季度水声传感器部署策略', '内部报告', '2 小时前', '编辑中'],
  ['实验室访问控制协议草案', '政策备忘', '昨天', '编辑中'],
  ['每周系统审计准备材料（第 42 周）', '合规简报', '2023-10-15', '待审核'],
  ['董事会简报：AI 集成路线图', '发言提纲', '2023-10-12', '草稿'],
];

const seedDocument = `1. 目标与范围

本文档用于建立智能大模型系统环境中敏感数据管理、处理和留存的制度框架。适用范围包括所有使用平台的科研人员、管理员、审计人员以及外部协作人员。

2. 处理规范

所有进入知识库的非结构化文本，在向量化前必须完成个人敏感信息识别与脱敏处理。系统应采用多层过滤机制识别敏感词、访问限制和留存要求。

3. 参考依据

- ISO/IEC 27001 安全控制要求
- 内部数据治理制度
- 知识库安全管理协议`;

function buildSeedDocument(template: WritingTemplate) {
  if (template.id === 'policy-memo') return seedDocument;
  return `1. 目标与范围

本文档围绕“${template.title}”建立写作结构，为评审、协作和后续行动提供清晰依据。

2. 重点事项

文档应优先引用经过验证的知识库资料，明确前提假设，并区分事实结论与建议措施。

3. 后续行动

- 确认资料来源
- 生成初稿内容
- 检查一致性和制度表述`;
}

const statusTone: Record<string, string> = {
  编辑中: 'bg-slate-100 text-slate-700',
  待审核: 'bg-emerald-50 text-emerald-700',
  草稿: 'bg-violet-50 text-violet-700',
};

export function Writing() {
  const { user } = useAppContext();
  const [selectedTemplate, setSelectedTemplate] = useState<WritingTemplate | null>(null);
  const [documentText, setDocumentText] = useState(seedDocument);
  const [tasks, setTasks] = useState<LLMTask[]>([]);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);

  useEffect(() => {
    void backendApi.listLLMTasks('writing').then(setTasks).catch(() => setTasks([]));
  }, []);

  const activeTemplate = selectedTemplate ?? officialTemplates[0];
  const wordCount = useMemo(() => documentText.replace(/\s+/g, '').length, [documentText]);

  const openTemplate = (template: WritingTemplate) => {
    setSelectedTemplate(template);
    setDocumentText(buildSeedDocument(template));
  };

  const runWritingTask = async (action: string) => {
    if (!user) return;
    setLoadingAction(action);
    try {
      const task = await backendApi.createLLMTask({
        taskType: 'writing',
        title: `${action}: ${activeTemplate.title}`,
        inputText: `${action}\n模板：${activeTemplate.title}\n\n${documentText}`,
        userId: user.id,
      });
      setTasks((items) => [task, ...items]);
      if (task.outputText) setDocumentText((text) => `${text.trim()}\n\n${task.outputText.trim()}`);
    } finally {
      setLoadingAction(null);
    }
  };

  if (!selectedTemplate) {
    return <WritingHub onOpenTemplate={openTemplate} latestTaskTitle={tasks[0]?.title} />;
  }

  return (
    <WritingEditor
      template={selectedTemplate}
      documentText={documentText}
      setDocumentText={setDocumentText}
      wordCount={wordCount}
      loadingAction={loadingAction}
      onRunTask={runWritingTask}
      onBack={() => setSelectedTemplate(null)}
    />
  );
}

function WritingHub({
  onOpenTemplate,
  latestTaskTitle,
}: {
  onOpenTemplate: (template: WritingTemplate) => void;
  latestTaskTitle?: string;
}) {
  return (
    <div className="flex h-full flex-col overflow-hidden bg-[#f5f3fb] text-slate-900">
      <div className="m-3 mb-2 border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="flex items-center gap-2 text-lg font-bold">
              <FileText className="h-5 w-5" />
              智能写作中心
            </h1>
            <p className="mt-1 text-xs text-slate-600">
              基于已验证的知识库资料生成制度文档、报告和会议材料。
            </p>
            <div className="mt-2 flex items-center gap-2 border border-red-100 bg-red-50 px-2 py-1 text-xs font-semibold text-red-700">
              <AlertTriangle className="h-3.5 w-3.5" />
              安全提示：生成前请确认内容不包含涉密信息。
            </div>
          </div>
          <div className="flex w-[420px] gap-2">
            <button
              className="flex flex-1 items-center justify-center gap-3 border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 hover:border-slate-300"
              onClick={() => onOpenTemplate(officialTemplates[0])}
            >
              <FileText className="h-4 w-4" />
              空白文稿
            </button>
            <button
              className="flex flex-1 items-center justify-center gap-3 bg-slate-700 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800"
              onClick={() => onOpenTemplate(officialTemplates[1])}
            >
              <Sparkles className="h-4 w-4" />
              从模板创建
            </button>
          </div>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[2fr_1fr] gap-3 overflow-hidden px-3 pb-2">
        <div className="min-h-0 overflow-auto">
          <section className="border border-slate-200 bg-white p-3 shadow-sm">
            <PanelTitle icon={<Building2 className="h-4 w-4" />} title="正式公文" badge="15 类" />
            <div className="mt-3 grid grid-cols-2 gap-3">
              {officialTemplates.map((template) => (
                <div key={template.id}>
                  <TemplatePreviewCard template={template} onClick={() => onOpenTemplate(template)} />
                </div>
              ))}
            </div>
            <button
              className="mt-3 w-full border-t border-slate-100 pt-2 text-center text-sm font-medium text-slate-700 hover:text-blue-700"
              onClick={() => onOpenTemplate(officialTemplates[0])}
            >
              查看全部 15 个正式公文模板 <ChevronRight className="inline h-3.5 w-3.5" />
            </button>
          </section>

          <section className="mt-3 border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-200 p-3">
              <PanelTitle icon={<CheckCircle2 className="h-4 w-4" />} title="最近草稿" />
              <button className="border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-600">全部类型</button>
            </div>
            <table className="w-full text-left text-xs">
              <thead className="bg-[#f1eff8] text-slate-600">
                <tr>
                  <th className="px-3 py-2 font-semibold">文档标题</th>
                  <th className="px-3 py-2 font-semibold">模板</th>
                  <th className="px-3 py-2 font-semibold">最近修改</th>
                  <th className="px-3 py-2 text-right font-semibold">状态</th>
                </tr>
              </thead>
              <tbody>
                {recentDrafts.map(([title, template, modified, status]) => (
                  <tr key={title} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-medium text-slate-800">
                      <FileText className="mr-2 inline h-3.5 w-3.5 text-slate-500" />
                      {title}
                    </td>
                    <td className="px-3 py-2 text-slate-600">{template}</td>
                    <td className="px-3 py-2 text-slate-600">{modified}</td>
                    <td className="px-3 py-2 text-right">
                      <span className={cn('rounded px-2 py-0.5 text-[11px]', statusTone[status] ?? statusTone.Draft)}>
                        {status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button className="w-full border-t border-slate-100 py-2 text-sm font-semibold text-slate-700">
              加载更多草稿
            </button>
          </section>
        </div>

        <div className="min-h-0 space-y-3 overflow-auto">
          <TemplateListPanel title="内部报告" templates={internalTemplates} onOpenTemplate={onOpenTemplate} />
          <TemplateListPanel title="会议材料" templates={meetingTemplates} onOpenTemplate={onOpenTemplate} />
          <div className="border border-slate-200 bg-white p-3 text-xs text-slate-600 shadow-sm">
            <div className="font-bold text-slate-800">最近生成</div>
            <div className="mt-2 border-t border-slate-100 pt-2">{latestTaskTitle ?? '暂无后端写作任务'}</div>
          </div>
        </div>
      </div>

      <SecurityFooter />
    </div>
  );
}

function WritingEditor({
  template,
  documentText,
  setDocumentText,
  wordCount,
  loadingAction,
  onRunTask,
  onBack,
}: {
  template: WritingTemplate;
  documentText: string;
  setDocumentText: (text: string) => void;
  wordCount: number;
  loadingAction: string | null;
  onRunTask: (action: string) => void;
  onBack: () => void;
}) {
  return (
    <div className="flex h-full flex-col overflow-hidden bg-[#f5f3fb] text-slate-900">
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-3">
        <button
          className="flex items-center gap-2 rounded border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:border-blue-300 hover:text-blue-700"
          onClick={onBack}
        >
          <ArrowLeft className="h-4 w-4" />
          返回模板中心
        </button>
        <div className="min-w-0 truncate text-sm font-semibold text-slate-700">{template.title}</div>
      </div>
      <div className="flex min-h-0 flex-1">
        <aside className="w-48 shrink-0 overflow-auto border-r border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
            <div className="text-sm font-bold">模板格式</div>
            <Settings2 className="h-3.5 w-3.5 text-slate-500" />
          </div>
          <div className="space-y-4 p-3 text-xs">
            <Field label="标准类型">
              <select className="w-full border border-slate-200 bg-slate-50 px-2 py-1.5">
                <option>ISO/IEC 27001 安全制度</option>
                <option>{template.title}</option>
              </select>
            </Field>
            <div>
              <div className="mb-2 font-semibold text-slate-700">全局排版</div>
              <Field label="标题字体">
                <div className="border border-slate-200 bg-slate-50 px-2 py-1.5">黑体</div>
              </Field>
              <Field label="正文字体">
                <div className="border border-slate-200 bg-slate-50 px-2 py-1.5">仿宋</div>
              </Field>
            </div>
            <Field label="行距">
              <div className="grid grid-cols-3 overflow-hidden border border-slate-200 text-center">
                {['1.0', '1.5', '2.0'].map((item) => (
                  <button key={item} className={cn('py-1', item === '1.5' ? 'bg-slate-200 font-semibold' : 'bg-slate-50')}>
                    {item}
                  </button>
                ))}
              </div>
            </Field>
            <div>
              <div className="mb-2 font-semibold text-slate-700">文档结构</div>
              {['1. 目标与范围', '2. 参考依据', '3. 术语定义'].map((item) => (
                <button key={item} className="mb-1 w-full bg-[#ebe9f6] px-2 py-1.5 text-left font-medium text-slate-700">
                  {item}
                </button>
              ))}
              <button className="mt-1 flex w-full items-center justify-center gap-1 py-1.5 text-slate-500 hover:text-blue-700">
                <Plus className="h-3.5 w-3.5" />
                添加章节
              </button>
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1 overflow-auto px-8 py-4">
          <div className="mx-auto min-h-full max-w-[560px] bg-white px-14 py-8 shadow-sm ring-1 ring-slate-200">
            <div className="mb-8 flex items-center justify-center gap-3 border-b border-slate-200 pb-3 text-xs text-slate-600">
              <select className="border-0 bg-transparent text-xs">
                <option>正文</option>
              </select>
              <span className="h-4 w-px bg-slate-200" />
              <button className="font-bold">B</button>
              <button className="italic">I</button>
              <button className="underline">U</button>
              <span className="text-[11px] text-slate-400">字数：{wordCount}</span>
            </div>
            <h1 className="text-center text-xl font-bold leading-tight text-slate-950">{template.documentTitle}</h1>
            <div className="mt-4 text-center text-xs leading-relaxed text-slate-500">
              <div>文档编号：SEC-2023-09A</div>
              <div>日期：2023-10-24</div>
            </div>
            <textarea
              className="mt-8 min-h-[520px] w-full resize-none border-0 bg-transparent text-sm leading-7 text-slate-900 outline-none"
              value={documentText}
              onChange={(event) => setDocumentText(event.target.value)}
            />
          </div>
        </main>

        <aside className="w-64 shrink-0 overflow-auto border-l border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
            <div className="flex items-center gap-1 text-sm font-bold">
              <Sparkles className="h-4 w-4" />
              AI 助手
            </div>
            <X className="h-4 w-4 text-slate-500" />
          </div>
          <div className="space-y-4 p-3">
            <div className="grid grid-cols-2 gap-2">
              {[
                ['润色文本', <PenTool className="h-4 w-4" />],
                ['扩写内容', <ChevronRight className="h-4 w-4" />],
                ['摘要提炼', <FileText className="h-4 w-4" />],
                ['校对检查', <BookOpen className="h-4 w-4" />],
              ].map(([label, icon]) => (
                <button
                  key={String(label)}
                  className={cn(
                    'relative flex flex-col items-center gap-1 border border-slate-200 bg-slate-50 px-2 py-3 text-xs font-semibold text-slate-700 hover:border-orange-300',
                    label === '校对检查' && 'bg-slate-100',
                  )}
                  onClick={() => onRunTask(String(label))}
                  disabled={loadingAction !== null}
                >
                  {loadingAction === label ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
                  {String(label)}
                  {label === '校对检查' && <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-red-500" />}
                </button>
              ))}
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between text-xs font-bold text-slate-700">
                校对结果
                <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] text-red-700">2 个问题</span>
              </div>
              <ProofCard title="表述不够规范" quote="建议将口语化表达调整为正式制度表述" />
              <ProofCard title="术语可能不一致" quote="建议统一使用“知识库索引”这一术语" />
            </div>

            <button className="mt-36 w-full bg-slate-200 py-2 text-xs font-semibold text-slate-500" disabled>
              应用全部修改
            </button>
          </div>
        </aside>
      </div>
      <SecurityFooter />
    </div>
  );
}

function TemplatePreviewCard({ template, onClick }: { template: WritingTemplate; onClick: () => void }) {
  return (
    <button
      className="group border border-slate-200 bg-[#f7f6fb] p-2 text-left hover:border-orange-400 hover:bg-white"
      onClick={onClick}
    >
      <div className="flex h-24 items-center justify-center bg-[#dddbea] text-slate-500 group-hover:text-orange-600">
        {template.icon}
      </div>
      <div className="mt-2 text-sm font-bold text-slate-900">{template.title}</div>
      <p className="mt-8 text-xs leading-relaxed text-slate-600">{template.description}</p>
    </button>
  );
}

function TemplateListPanel({
  title,
  templates,
  onOpenTemplate,
}: {
  title: string;
  templates: WritingTemplate[];
  onOpenTemplate: (template: WritingTemplate) => void;
}) {
  return (
    <section className="border border-slate-200 bg-white p-3 shadow-sm">
      <PanelTitle icon={<ClipboardList className="h-4 w-4" />} title={title} />
      <div className="mt-2 space-y-1">
        {templates.map((template) => (
          <button
            key={template.id}
            className="flex w-full items-start gap-2 border border-slate-100 bg-slate-50 px-2 py-2 text-left hover:border-orange-300 hover:bg-white"
            onClick={() => onOpenTemplate(template)}
          >
            <span className="mt-0.5 text-slate-500">{template.icon}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-slate-800">{template.title}</span>
              <span className="block text-xs text-slate-500">{template.description}</span>
            </span>
            <ChevronRight className="mt-1 h-3.5 w-3.5 text-slate-400" />
          </button>
        ))}
      </div>
    </section>
  );
}

function PanelTitle({ icon, title, badge }: { icon: ReactNode; title: string; badge?: string }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
        {icon}
        {title}
      </div>
      {badge && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">{badge}</span>}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function ProofCard({ title, quote }: { title: string; quote: string }) {
  return (
    <div className="mb-2 border border-red-100 bg-red-50 p-2 text-xs">
      <div className="flex items-center gap-1 font-bold text-red-700">
        <AlertTriangle className="h-3.5 w-3.5" />
        {title}
      </div>
      <div className="mt-1 text-slate-700">{quote}</div>
      <div className="mt-2 grid grid-cols-2 gap-1">
        <button className="bg-slate-700 px-2 py-1 font-semibold text-white">应用修改</button>
        <button className="border border-slate-200 bg-white px-2 py-1 text-slate-600">忽略</button>
      </div>
    </div>
  );
}

function SecurityFooter() {
  return (
    <div className="flex h-7 shrink-0 items-center justify-between border-t border-slate-200 bg-white px-3 text-[11px] text-slate-600">
      <div className="flex items-center gap-1 font-semibold text-red-700">
        <AlertTriangle className="h-3 w-3" />
        严禁上传或处理涉密信息
      </div>
      <div className="flex items-center gap-5">
        <span>隐私政策</span>
        <span>安全协议</span>
        <span>系统状态</span>
      </div>
    </div>
  );
}
