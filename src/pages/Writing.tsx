import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  Building2,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Download,
  FileText,
  FlaskConical,
  Loader2,
  MessageSquareText,
  PenTool,
  Plus,
  Save,
  Settings2,
  Sparkles,
  Trash2,
  Upload,
  Wand2,
  X,
} from 'lucide-react';
import { useAppContext } from '../AppContext';
import { cn } from '../lib/utils';
import { backendApi } from '../services/backendApi';
import type { WritingDocument, WritingFormatConfig, WritingTemplate } from '../types/domain';

type ChapterPrompt = {
  id: string;
  title: string;
};

type ProofreadIssue = {
  id: string;
  type: string;
  original: string;
  suggestion: string;
  reason: string;
};

const defaultFormat: WritingFormatConfig = {
  titleFont: '黑体',
  bodyFont: '仿宋',
  titleFontSize: '二号',
  bodyFontSize: '小四',
  fontSize: '小四',
  lineSpacing: '1.5',
  allowUserFormat: false,
};

const categoryOptions = ['正式公文', '内部报告', '会议材料', '通用模板'];

const categoryIcon: Record<string, ReactNode> = {
  正式公文: <Building2 className="h-4 w-4" />,
  内部报告: <FlaskConical className="h-4 w-4" />,
  会议材料: <ClipboardList className="h-4 w-4" />,
  通用模板: <BookOpen className="h-4 w-4" />,
};

const statusTone: Record<string, string> = {
  draft: 'bg-violet-50 text-violet-700',
  generated: 'bg-emerald-50 text-emerald-700',
  archived: 'bg-slate-100 text-slate-700',
};

const fontSizeMap: Record<string, string> = {
  初号: '42pt',
  小初: '36pt',
  一号: '26pt',
  小一: '24pt',
  二号: '22pt',
  小二: '18pt',
  三号: '16pt',
  小三: '15pt',
  四号: '14pt',
  小四: '12pt',
  五号: '10.5pt',
  小五: '9pt',
};

function toCssFontSize(value?: string) {
  if (!value) return undefined;
  return fontSizeMap[value] ?? (/^\d+(\.\d+)?$/.test(value) ? `${value}pt` : value);
}

function titleOf(template: WritingTemplate) {
  return template.fields.find((field) => field.key === 'title')?.defaultValue || template.name || '未命名文档';
}

function bodyOf(template: WritingTemplate) {
  return template.fields.find((field) => field.key === 'body')?.defaultValue || '';
}

function normalizeContent(document: WritingDocument) {
  return {
    title: String(document.content?.title ?? document.title ?? ''),
    body: String(document.content?.body ?? ''),
  };
}

function splitFirst(value: string, token: string) {
  if (!token) return null;
  const index = value.indexOf(token);
  if (index < 0) return null;
  return {
    before: value.slice(0, index),
    after: value.slice(index + token.length),
  };
}

function buildTemplateDisplayParts(template: WritingTemplate | null | undefined) {
  const previewText = stripHeaderFooterText(String(template?.previewText ?? ''));
  const defaultTitle = template?.fields.find((field) => field.key === 'title')?.defaultValue ?? '';
  const defaultBody = template?.fields.find((field) => field.key === 'body')?.defaultValue ?? '';
  const bodySplit = splitFirst(previewText, defaultBody);

  if (!bodySplit) {
    const titleSplit = splitFirst(previewText, defaultTitle);
    if (!titleSplit) {
      return {
        titleInTemplate: false,
        beforeTitle: previewText,
        betweenTitleAndBody: '',
        afterBody: '',
      };
    }
    return {
      titleInTemplate: true,
      beforeTitle: titleSplit.before,
      betweenTitleAndBody: titleSplit.after,
      afterBody: '',
    };
  }

  const titleSplit = splitFirst(bodySplit.before, defaultTitle);
  if (!titleSplit) {
    return {
      titleInTemplate: false,
      beforeTitle: bodySplit.before,
      betweenTitleAndBody: '',
      afterBody: bodySplit.after,
    };
  }

  return {
    titleInTemplate: true,
    beforeTitle: titleSplit.before,
    betweenTitleAndBody: titleSplit.after,
    afterBody: bodySplit.after,
  };
}

function trimDisplayBlock(value: string) {
  return value.replace(/^\n+/, '').replace(/\n+$/, '');
}

function stripHeaderFooterText(value: string) {
  return value
    .split(/\r?\n/)
    .filter((line) => {
      const text = line.trim();
      if (!text) return true;
      if (/^[-—–－\s]*\d+[-—–－\s]*$/.test(text)) return false;
      if (/^在\s*[-—–－]\s*\d+\s*[-—–－]\s*在$/.test(text)) return false;
      if (/^第\s*\d+\s*页\s*(共\s*\d+\s*页)?$/.test(text)) return false;
      return true;
    })
    .join('\n')
    .replace(/\n{4,}/g, '\n\n\n');
}

function deriveChapterPrompts(body: string): ChapterPrompt[] {
  const matched = body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^(\d+[.、．]|[一二三四五六七八九十]+[、.．])\s*\S+/.test(line))
    .slice(0, 12)
    .map((line, index) => ({ id: `chapter-${index + 1}`, title: line.replace(/^(\d+[.、．]|[一二三四五六七八九十]+[、.．])\s*/, '') }));
  if (matched.length > 0) return matched;
  return [
    { id: 'chapter-1', title: '目标与范围' },
    { id: 'chapter-2', title: '参考依据' },
    { id: 'chapter-3', title: '术语定义' },
  ];
}

function isPlaceholderBody(value: string) {
  const text = value.trim();
  if (!text) return false;
  const compact = text.replace(/\s+/g, '');
  const placeholderChars = Array.from(compact).filter((char) => ['×', 'X', 'x', '_', '＿', '…', '□', '■'].includes(char)).length;
  const placeholderRatio = placeholderChars / Math.max(compact.length, 1);
  const placeholderLines = text.split(/\r?\n/).filter((line) => /[×Xx_＿□■]{4,}|……|…．|\.{3,}/.test(line));
  const hasDemoDate = /20(1[0-9]|2[0-5])年\d{1,2}月\d{1,2}日/.test(text);
  return placeholderRatio >= 0.25 || placeholderLines.length >= 3 || (hasDemoDate && placeholderRatio >= 0.1);
}

function buildInstruction(baseInstruction: string, chapters: ChapterPrompt[], bodyIsPlaceholder: boolean) {
  const chapterText = chapters
    .map((chapter, index) => `${index + 1}. ${chapter.title}`)
    .join('\n');
  const bodyPolicy = bodyIsPlaceholder
    ? [
        '当前 <body> 中已有内容主要是 ×××、……、示例日期等格式占位符，不是真实正文。',
        '请把这些占位符作为格式示例来理解，生成真实正文时应替换掉它们，不要保留占位符。',
        '“××××××：”通常是通知/公文的主送对象或称呼占位，请根据用户要求、通知主题和语境自行判断合适对象，不要机械套用固定称呼。',
      ]
    : [
        '当前 <body> 中已有内容是完整正文的一部分。除非用户明确要求重写全文，否则必须保留已有正文中未被要求修改的内容。',
        '如果用户要求“根据已有章节生成其他章节/补充其他章节”，请在原正文后追加或补全新章节，不能删除原有章节。',
      ];
  return [
    ...bodyPolicy,
    '返回结果必须是完整正文，而不是只返回新增片段。不要输出 <body> 或 </body> 标签。',
    baseInstruction.trim(),
    chapterText ? `请按以下章节组织正文内容：\n${chapterText}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

function actionInstruction(action: string, extraInstruction: string, userInstruction: string, chapters: ChapterPrompt[], bodyIsPlaceholder: boolean) {
  const chapterText = chapters
    .map((chapter, index) => `${index + 1}. ${chapter.title}`)
    .join('\n');
  const chapterInstruction = chapterText ? `章节要求：\n${chapterText}` : '';
  const base = [extraInstruction, userInstruction].filter(Boolean).join('\n');
  if (action === '润色文本') {
    return [
      '请对当前正文进行润色，保持原有事实和结构不变，使表达更正式、准确、连贯。',
      '必须直接返回润色后的完整正文，不要解释修改点，不要添加“正文：”前缀。',
      base,
    ].filter(Boolean).join('\n\n');
  }
  if (action === '扩写内容') {
    return [
      '请围绕当前正文进行扩写，补充必要的背景、流程、要求和责任说明。',
      bodyIsPlaceholder
        ? '当前正文是格式占位符示例，请替换为真实扩写内容，不要保留 ××× 或示例日期。必须直接返回完整正文，不要解释，不要添加“正文：”前缀，不要输出 <body> 标签。'
        : '必须保留当前正文已有内容，在其基础上扩写或补充。必须直接返回扩写后的完整正文，不要只返回新增片段，不要解释，不要添加“正文：”前缀。',
      chapterInstruction,
      base,
    ].filter(Boolean).join('\n\n');
  }
  if (action === '摘要提炼') {
    return [
      '请将当前正文提炼为结构清晰的摘要，保留核心事实、结论和行动项。',
      '必须直接返回摘要正文，不要解释，不要添加“正文：”前缀。',
      base,
    ].filter(Boolean).join('\n\n');
  }
  if (action === '校对检查') {
    return [
      '请检查当前正文的错别字、病句、口语化表达、不规范表述、术语一致性和格式问题。',
      '只返回校对问题列表，不要修改正文。',
      base,
    ].filter(Boolean).join('\n\n');
  }
  if (action === '应用校对修改') {
    return [
      '请根据下面的单条校对结果修改当前正文。',
      '只修改该问题相关内容，尽量保持其他内容不变。',
      '必须直接返回修改后的完整正文，不要解释，不要添加“正文：”前缀。',
      base,
    ].filter(Boolean).join('\n\n');
  }
  return buildInstruction(base, chapters, bodyIsPlaceholder);
}

export function Writing() {
  const { user } = useAppContext();
  const [templates, setTemplates] = useState<WritingTemplate[]>([]);
  const [documents, setDocuments] = useState<WritingDocument[]>([]);
  const [activeDocument, setActiveDocument] = useState<WritingDocument | null>(null);
  const [configTemplate, setConfigTemplate] = useState<WritingTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [templateList, documentList] = await Promise.all([
        backendApi.listWritingTemplates(),
        backendApi.listWritingDocuments(user?.id),
      ]);
      setTemplates(templateList);
      setDocuments(documentList);
      setConfigTemplate((current) => (current ? templateList.find((item) => item.id === current.id) ?? null : null));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '智能写作数据加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [user?.id]);

  const createFromTemplate = async (template: WritingTemplate) => {
    if (!user) return;
    setBusy(`create:${template.id}`);
    setError(null);
    try {
      const title = titleOf(template);
      const document = await backendApi.createWritingDocument({
        templateId: template.id,
        userId: user.id,
        title,
        content: { title, body: bodyOf(template) },
        formatConfig: template.formatConfig,
      });
      setActiveDocument(document);
      await loadData();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '创建文档失败');
    } finally {
      setBusy(null);
    }
  };

  const createBlank = async () => {
    const fallback = templates[0];
    if (!fallback) return;
    await createFromTemplate(fallback);
  };

  if (activeDocument) {
    return (
      <WritingEditor
        document={activeDocument}
        onDocumentChange={setActiveDocument}
        onBack={() => {
          setActiveDocument(null);
          void loadData();
        }}
      />
    );
  }

  return (
    <WritingHub
      userId={user?.id ?? 'u-1001'}
      templates={templates}
      documents={documents}
      loading={loading}
      busy={busy}
      error={error}
      onReload={loadData}
      onCreateBlank={createBlank}
      onCreateFromTemplate={createFromTemplate}
      onOpenDocument={setActiveDocument}
      configTemplate={configTemplate}
      onConfigTemplate={setConfigTemplate}
      onCloseConfig={() => setConfigTemplate(null)}
    />
  );
}

function WritingHub({
  userId,
  templates,
  documents,
  loading,
  busy,
  error,
  onReload,
  onCreateBlank,
  onCreateFromTemplate,
  onOpenDocument,
  configTemplate,
  onConfigTemplate,
  onCloseConfig,
}: {
  userId: string;
  templates: WritingTemplate[];
  documents: WritingDocument[];
  loading: boolean;
  busy: string | null;
  error: string | null;
  onReload: () => Promise<void>;
  onCreateBlank: () => Promise<void>;
  onCreateFromTemplate: (template: WritingTemplate) => Promise<void>;
  onOpenDocument: (document: WritingDocument) => void;
  configTemplate: WritingTemplate | null;
  onConfigTemplate: (template: WritingTemplate) => void;
  onCloseConfig: () => void;
}) {
  const grouped = useMemo(
    () =>
      categoryOptions
        .map((category) => ({ category, items: templates.filter((template) => template.category === category) }))
        .filter((group) => group.items.length > 0),
    [templates],
  );
  const firstTemplate = templates[0];

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[#f5f3fb] text-slate-900">
      <div className="m-3 mb-2 border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="flex items-center gap-2 text-lg font-bold">
              <FileText className="h-5 w-5" />
              智能写作中心
            </h1>
            <p className="mt-1 text-xs text-slate-600">基于 Word 模板生成制度文档、报告和会议材料。模板只识别标题和正文，章节作为 AI 写作提示使用。</p>
            <div className="mt-2 flex items-center gap-2 border border-red-100 bg-red-50 px-2 py-1 text-xs font-semibold text-red-700">
              <AlertTriangle className="h-3.5 w-3.5" />
              安全提示：生成前请确认内容不包含涉密信息。模板建议使用 &lt;title&gt; 和 &lt;body&gt;。
            </div>
            {error && <div className="mt-2 border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">{error}</div>}
          </div>
          <div className="flex w-[620px] gap-2">
            <button
              className="flex flex-1 items-center justify-center gap-3 border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 hover:border-slate-300 disabled:opacity-50"
              onClick={() => void onCreateBlank()}
              disabled={!firstTemplate || busy !== null}
            >
              <FileText className="h-4 w-4" />
              空白文稿
            </button>
            <button
              className="flex flex-1 items-center justify-center gap-3 bg-slate-700 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
              onClick={() => firstTemplate && void onCreateFromTemplate(firstTemplate)}
              disabled={!firstTemplate || busy !== null}
            >
              <Sparkles className="h-4 w-4" />
              从模板创建
            </button>
            <UploadTemplatePanel userId={userId} onUploaded={onReload} />
          </div>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[2fr_1fr] gap-3 overflow-hidden px-3 pb-2">
        <div className="min-h-0 overflow-auto">
          {loading ? (
            <LoadingBox text="正在加载智能写作数据" />
          ) : templates.length === 0 ? (
            <EmptyState />
          ) : (
            <>
              {grouped.map((group, groupIndex) => (
                <section key={group.category} className={cn('border border-slate-200 bg-white p-3 shadow-sm', groupIndex > 0 && 'mt-3')}>
                  <PanelTitle icon={categoryIcon[group.category] ?? <BookOpen className="h-4 w-4" />} title={group.category} badge={`${group.items.length} 类`} />
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    {group.items.slice(0, groupIndex === 0 ? 4 : 2).map((template) => (
                      <TemplatePreviewCard
                        key={template.id}
                        template={template}
                        busy={busy === `create:${template.id}`}
                        onClick={() => void onCreateFromTemplate(template)}
                        onConfig={() => onConfigTemplate(template)}
                      />
                    ))}
                  </div>
                  {group.items.length > 4 && (
                    <button className="mt-3 w-full border-t border-slate-100 pt-2 text-center text-sm font-medium text-slate-700 hover:text-blue-700">
                      查看全部 {group.items.length} 个{group.category}模板 <ChevronRight className="inline h-3.5 w-3.5" />
                    </button>
                  )}
                </section>
              ))}

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
                    {documents.slice(0, 8).map((document) => (
                      <tr key={document.id} className="cursor-pointer border-t border-slate-100 hover:bg-slate-50" onClick={() => onOpenDocument(document)}>
                        <td className="px-3 py-2 font-medium text-slate-800">
                          <FileText className="mr-2 inline h-3.5 w-3.5 text-slate-500" />
                          {document.title}
                        </td>
                        <td className="px-3 py-2 text-slate-600">{document.template?.name ?? document.templateId}</td>
                        <td className="px-3 py-2 text-slate-600">{document.updatedAt}</td>
                        <td className="px-3 py-2 text-right">
                          <span className={cn('rounded px-2 py-0.5 text-[11px]', statusTone[document.status] ?? statusTone.draft)}>{document.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <button className="w-full border-t border-slate-100 py-2 text-sm font-semibold text-slate-700">加载更多草稿</button>
              </section>
            </>
          )}
        </div>

        <div className="min-h-0 space-y-3 overflow-auto">
          {categoryOptions.slice(1).map((category) => (
            <TemplateListPanel
              key={category}
              title={category}
              templates={templates.filter((template) => template.category === category).slice(0, 6)}
              onOpenTemplate={(template) => void onCreateFromTemplate(template)}
            />
          ))}
          <TemplateConfigPanel template={configTemplate} onClose={onCloseConfig} onSaved={onReload} />
          <div className="border border-slate-200 bg-white p-3 text-xs text-slate-600 shadow-sm">
            <div className="font-bold text-slate-800">最近生成</div>
            <div className="mt-2 border-t border-slate-100 pt-2">{documents[0]?.title ?? '暂无后端写作任务'}</div>
          </div>
        </div>
      </div>

      <SecurityFooter />
    </div>
  );
}

function UploadTemplatePanel({ userId, onUploaded }: { userId: string; onUploaded: () => Promise<void> }) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const upload = async (targetFile = file) => {
    if (!targetFile) return;
    setUploading(true);
    try {
      await backendApi.uploadWritingTemplate(targetFile, {
        name: targetFile.name.replace(/\.(doc|docx)$/i, ''),
        category: '正式公文',
        description: '',
        userId,
      });
      setFile(null);
      await onUploaded();
    } finally {
      setUploading(false);
    }
  };

  return (
    <label className="relative flex flex-1 cursor-pointer items-center justify-center gap-3 border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 hover:border-slate-400">
      {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
      {file ? file.name : '上传模板'}
      <input
        className="absolute inset-0 cursor-pointer opacity-0"
        type="file"
        accept=".doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        disabled={uploading}
        onChange={(event) => {
          const selected = event.target.files?.[0] ?? null;
          setFile(selected);
          if (selected) setTimeout(() => void upload(selected), 0);
        }}
      />
    </label>
  );
}

function WritingEditor({
  document,
  onDocumentChange,
  onBack,
}: {
  document: WritingDocument;
  onDocumentChange: (document: WritingDocument) => void;
  onBack: () => void;
}) {
  const { user } = useAppContext();
  const [title, setTitle] = useState(normalizeContent(document).title);
  const [body, setBody] = useState(normalizeContent(document).body);
  const [instruction, setInstruction] = useState('');
  const [chapters, setChapters] = useState<ChapterPrompt[]>(() => deriveChapterPrompts(normalizeContent(document).body));
  const [format, setFormat] = useState<WritingFormatConfig>({ ...defaultFormat, ...(document.formatConfig ?? {}) });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [proofreadResults, setProofreadResults] = useState<ProofreadIssue[]>([]);
  const allowFormat = Boolean(format.allowUserFormat);
  const wordCount = useMemo(() => body.replace(/\s+/g, '').length, [body]);
  const displayParts = useMemo(() => buildTemplateDisplayParts(document.template), [document.template]);
  const editableContent = () => ({
    title,
    body,
    _nonEditableTemplateText: [
      displayParts.beforeTitle,
      displayParts.betweenTitleAndBody,
      displayParts.afterBody,
    ]
      .map(trimDisplayBlock)
      .filter(Boolean)
      .join('\n\n'),
  });

  useEffect(() => {
    const content = normalizeContent(document);
    setTitle(content.title);
    setBody(content.body);
    setChapters(deriveChapterPrompts(content.body));
    setFormat({ ...defaultFormat, ...(document.formatConfig ?? {}) });
  }, [document.id]);

  const save = async () => {
    setBusy('save');
    setError(null);
    try {
      const updated = await backendApi.updateWritingDocument(document.id, {
        title,
        content: { title, body },
        formatConfig: format,
      });
      onDocumentChange(updated);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '保存失败');
    } finally {
      setBusy(null);
    }
  };

  const runTask = async (action: string, extraInstruction = '') => {
    setBusy(action);
    setError(null);
    try {
      const response = await backendApi.generateWritingDocument(document.id, {
        action,
        instruction: actionInstruction(action, extraInstruction, instruction, chapters, isPlaceholderBody(body)),
        content: editableContent(),
        userId: user?.id ?? 'u-1001',
      });
      if (action === '校对检查') {
        setProofreadResults(response.proofreadResults ?? []);
        return;
      }
      onDocumentChange(response.document);
      setTitle(String(response.document.content.title ?? response.document.title ?? ''));
      setBody(String(response.document.content.body ?? ''));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'AI 处理失败');
    } finally {
      setBusy(null);
    }
  };

  const applyProofreadIssue = async (issue: ProofreadIssue) => {
    await runTask(
      '应用校对修改',
      [
        '请只根据以下校对结果修改正文，并返回修改后的完整正文。',
        `问题类型：${issue.type}`,
        issue.original ? `原文片段：${issue.original}` : '',
        issue.suggestion ? `建议修改为：${issue.suggestion}` : '',
        issue.reason ? `原因：${issue.reason}` : '',
      ].filter(Boolean).join('\n'),
    );
    setProofreadResults((items) => items.filter((item) => item.id !== issue.id));
  };

  const ignoreProofreadIssue = (issueId: string) => {
    setProofreadResults((items) => items.filter((item) => item.id !== issueId));
  };

  const exportDoc = async () => {
    setBusy('export');
    setError(null);
    try {
      const saved = await backendApi.updateWritingDocument(document.id, {
        title,
        content: { title, body },
        formatConfig: format,
      });
      const exported = await backendApi.exportWritingDocument(saved.id, user?.id ?? 'u-1001');
      onDocumentChange(exported);
      if (exported.downloadUrl) window.open(backendApi.writingDownloadUrl(exported.downloadUrl), '_blank');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '导出失败');
    } finally {
      setBusy(null);
    }
  };

  const addChapter = () => {
    setChapters((items) => [...items, { id: `chapter-${Date.now()}`, title: `新章节 ${items.length + 1}` }]);
  };

  const updateChapter = (id: string, nextTitle: string) => {
    setChapters((items) => items.map((item) => (item.id === id ? { ...item, title: nextTitle } : item)));
  };

  const removeChapter = (id: string) => {
    setChapters((items) => items.filter((item) => item.id !== id));
  };

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
        <div className="min-w-0 truncate text-sm font-semibold text-slate-700">{document.template?.name ?? document.templateId}</div>
        <div className="flex gap-2">
          <button className="flex items-center gap-1 border border-slate-200 px-2 py-1 text-xs font-semibold" disabled={busy === 'save'} onClick={() => void save()}>
            {busy === 'save' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            保存
          </button>
          <button className="flex items-center gap-1 bg-slate-700 px-2 py-1 text-xs font-semibold text-white" disabled={busy === 'export'} onClick={() => void exportDoc()}>
            {busy === 'export' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            生成 Word
          </button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1">
        <aside className="w-56 shrink-0 overflow-auto border-r border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
            <div className="text-sm font-bold">模板格式</div>
            <Settings2 className="h-3.5 w-3.5 text-slate-500" />
          </div>
          <div className="space-y-4 p-3 text-xs">
            <Field label="标准类型">
              <select className="w-full border border-slate-200 bg-slate-50 px-2 py-1.5">
                <option>{document.template?.category ?? '正式公文'}</option>
                <option>{document.template?.name ?? 'Word 模板'}</option>
              </select>
            </Field>
            <div>
              <div className="mb-2 font-semibold text-slate-700">全局排版</div>
              <Field label="标题字体">
                <input
                  className="w-full border border-slate-200 bg-slate-50 px-2 py-1.5 disabled:text-slate-400"
                  value={format.titleFont ?? ''}
                  disabled={!allowFormat}
                  onChange={(event) => setFormat((item) => ({ ...item, titleFont: event.target.value }))}
                />
              </Field>
              <Field label="正文字体">
                <input
                  className="w-full border border-slate-200 bg-slate-50 px-2 py-1.5 disabled:text-slate-400"
                  value={format.bodyFont ?? ''}
                  disabled={!allowFormat}
                  onChange={(event) => setFormat((item) => ({ ...item, bodyFont: event.target.value }))}
                />
              </Field>
              <Field label="标题字号">
                <input
                  className="w-full border border-slate-200 bg-slate-50 px-2 py-1.5 disabled:text-slate-400"
                  value={format.titleFontSize ?? format.fontSize ?? ''}
                  disabled={!allowFormat}
                  onChange={(event) => setFormat((item) => ({ ...item, titleFontSize: event.target.value }))}
                />
              </Field>
              <Field label="正文字号">
                <input
                  className="w-full border border-slate-200 bg-slate-50 px-2 py-1.5 disabled:text-slate-400"
                  value={format.bodyFontSize ?? format.fontSize ?? ''}
                  disabled={!allowFormat}
                  onChange={(event) => setFormat((item) => ({ ...item, bodyFontSize: event.target.value }))}
                />
              </Field>
            </div>
            <Field label="行距">
              <div className="grid grid-cols-3 overflow-hidden border border-slate-200 text-center">
                {['1.0', '1.5', '2.0'].map((item) => (
                  <button
                    key={item}
                    className={cn('py-1', String(format.lineSpacing) === item ? 'bg-slate-200 font-semibold' : 'bg-slate-50')}
                    disabled={!allowFormat}
                    onClick={() => setFormat((current) => ({ ...current, lineSpacing: item }))}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </Field>
            <div>
              <div className="mb-2 flex items-center justify-between font-semibold text-slate-700">
                <span>文档结构</span>
                <button className="text-slate-500 hover:text-blue-700" onClick={addChapter}>
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
              {chapters.map((chapter, index) => (
                <div key={chapter.id} className="mb-1 flex items-center gap-1 bg-[#ebe9f6] px-2 py-1.5 font-medium text-slate-700">
                  <span className="shrink-0">{index + 1}.</span>
                  <input
                    className="min-w-0 flex-1 bg-transparent outline-none"
                    value={chapter.title}
                    onChange={(event) => updateChapter(chapter.id, event.target.value)}
                  />
                  <button className="text-slate-400 hover:text-red-600" onClick={() => removeChapter(chapter.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              <button className="mt-1 flex w-full items-center justify-center gap-1 py-1.5 text-slate-500 hover:text-blue-700" onClick={addChapter}>
                <Plus className="h-3.5 w-3.5" />
                添加章节
              </button>
              <div className="mt-2 text-[11px] leading-4 text-slate-500">这里的章节只会合并进 AI 提示词，不作为模板字段保存。</div>
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1 overflow-auto px-8 py-4">
          <div className="mx-auto min-h-full max-w-[640px] bg-white px-14 py-8 shadow-sm ring-1 ring-slate-200">
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
            {!displayParts.titleInTemplate && (
              <input
                className="w-full border-0 bg-transparent text-center text-xl font-bold leading-tight text-slate-950 outline-none"
                style={{ fontFamily: format.titleFont, fontSize: toCssFontSize(format.titleFontSize ?? format.fontSize) }}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="请输入标题"
              />
            )}
            <LockedTemplateBlock value={displayParts.beforeTitle} />
            {displayParts.titleInTemplate && (
              <input
                className="my-4 w-full border-0 bg-transparent text-center text-xl font-bold leading-tight text-slate-950 outline-none"
                style={{ fontFamily: format.titleFont, fontSize: toCssFontSize(format.titleFontSize ?? format.fontSize) }}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="请输入标题"
              />
            )}
            <LockedTemplateBlock value={displayParts.betweenTitleAndBody} />
            <textarea
              className="my-4 min-h-[360px] w-full resize-y border border-blue-100 bg-blue-50/20 p-3 text-sm leading-7 text-slate-900 outline-none focus:border-blue-300"
              style={{ fontFamily: format.bodyFont, fontSize: toCssFontSize(format.bodyFontSize ?? format.fontSize), lineHeight: format.lineSpacing }}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="正文内容。可以手动编辑，也可以使用右侧 AI 助手生成或修改。"
            />
            <LockedTemplateBlock value={displayParts.afterBody} />
          </div>
        </main>

        <aside className="w-72 shrink-0 overflow-auto border-l border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
            <div className="flex items-center gap-1 text-sm font-bold">
              <Sparkles className="h-4 w-4" />
              AI 助手
            </div>
            <X className="h-4 w-4 text-slate-500" />
          </div>
          <div className="space-y-4 p-3">
            <textarea
              className="min-h-[110px] w-full resize-y border border-slate-200 p-2 text-xs leading-5 outline-none focus:border-[#32245d]"
              value={instruction}
              onChange={(event) => setInstruction(event.target.value)}
              placeholder="直接输入写作要求。章节名称请在左侧文档结构中维护。"
            />
            <button
              className="w-full bg-[#32245d] py-2 text-xs font-semibold text-white disabled:opacity-60"
              disabled={busy !== null || (!instruction.trim() && chapters.length === 0)}
              onClick={() => void runTask('按要求写作')}
            >
              {busy === '按要求写作' ? <Loader2 className="mr-1 inline h-4 w-4 animate-spin" /> : <Sparkles className="mr-1 inline h-4 w-4" />}
              按要求写作
            </button>
            <div className="grid grid-cols-2 gap-2">
              {[
                ['润色文本', <PenTool className="h-4 w-4" />, '请在保持原意的基础上润色正文，使表达更正式、准确。'],
                ['扩写内容', <ChevronRight className="h-4 w-4" />, '请围绕现有正文进行扩写，补充必要的说明、流程和要求。'],
                ['摘要提炼', <FileText className="h-4 w-4" />, '请提炼当前正文摘要，保留核心要点。'],
                ['校对检查', <BookOpen className="h-4 w-4" />, '请检查正文中的表述、术语一致性和格式问题，只返回校对结果列表。'],
              ].map(([label, icon, prompt]) => (
                <button
                  key={String(label)}
                  className={cn(
                    'relative flex flex-col items-center gap-1 border border-slate-200 bg-slate-50 px-2 py-3 text-xs font-semibold text-slate-700 hover:border-orange-300 disabled:opacity-60',
                    label === '校对检查' && 'bg-slate-100',
                  )}
                  onClick={() => void runTask(String(label), String(prompt))}
                  disabled={busy !== null}
                >
                  {busy === label ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
                  {String(label)}
                  {label === '校对检查' && <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-red-500" />}
                </button>
              ))}
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between text-xs font-bold text-slate-700">
                校对结果
                <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] text-red-700">{proofreadResults.length} 个问题</span>
              </div>
              {proofreadResults.length === 0 ? (
                <div className="border border-slate-100 bg-slate-50 p-2 text-xs text-slate-500">点击“校对检查”后，这里会展示 AI 返回的真实校对结果。</div>
              ) : (
                proofreadResults.map((issue) => (
                  <ProofCard
                    key={issue.id}
                    issue={issue}
                    applying={busy === '应用校对修改'}
                    onApply={() => void applyProofreadIssue(issue)}
                    onIgnore={() => ignoreProofreadIssue(issue.id)}
                  />
                ))
              )}
            </div>

            <button className="mt-20 w-full bg-slate-200 py-2 text-xs font-semibold text-slate-500" disabled>
              应用全部修改
            </button>
            {error && <div className="border border-red-200 bg-red-50 p-2 text-xs text-red-700">{error}</div>}
          </div>
        </aside>
      </div>
      <SecurityFooter />
    </div>
  );
}

function TemplatePreviewCard({
  template,
  busy,
  onClick,
  onConfig,
}: {
  key?: string;
  template: WritingTemplate;
  busy: boolean;
  onClick: () => void;
  onConfig: () => void;
}) {
  return (
    <div className="group border border-slate-200 bg-[#f7f6fb] p-2 text-left hover:border-orange-400 hover:bg-white">
      <button className="block w-full text-left disabled:opacity-60" onClick={onClick} disabled={busy}>
        <div className="flex h-24 items-center justify-center bg-[#dddbea] text-slate-500 group-hover:text-orange-600">
          {busy ? <Loader2 className="h-6 w-6 animate-spin" /> : <FileText className="h-6 w-6" />}
        </div>
        <div className="mt-2 text-sm font-bold text-slate-900">{template.name}</div>
        <p className="mt-8 line-clamp-2 text-xs leading-relaxed text-slate-600">{template.description || template.originalFileName}</p>
      </button>
      <button className="mt-2 w-full border border-slate-200 bg-white py-1.5 text-xs font-semibold text-slate-600 hover:border-blue-300 hover:text-blue-700" onClick={onConfig}>
        设置模板格式
      </button>
    </div>
  );
}

function TemplateConfigPanel({ template, onClose, onSaved }: { template: WritingTemplate | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const [format, setFormat] = useState<WritingFormatConfig>(defaultFormat);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setFormat({ ...defaultFormat, ...(template?.formatConfig ?? {}) });
  }, [template]);

  if (!template) {
    return (
      <section className="border border-slate-200 bg-white p-3 text-xs text-slate-600 shadow-sm">
        <div className="font-bold text-slate-800">模板格式设置</div>
        <div className="mt-2 border-t border-slate-100 pt-2">选择左侧模板卡片的“设置模板格式”后，可修改上传模板的默认格式。</div>
      </section>
    );
  }

  const save = async () => {
    setSaving(true);
    try {
      await backendApi.updateWritingTemplate(template.id, { formatConfig: format });
      await onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="border border-slate-200 bg-white p-3 text-xs shadow-sm">
      <PanelTitle icon={<Settings2 className="h-4 w-4" />} title="模板格式设置" badge={template.name} />
      <div className="mt-3 grid grid-cols-2 gap-2">
        <ConfigInput label="标题字体" value={format.titleFont ?? ''} onChange={(value) => setFormat((item) => ({ ...item, titleFont: value }))} />
        <ConfigInput label="正文字体" value={format.bodyFont ?? ''} onChange={(value) => setFormat((item) => ({ ...item, bodyFont: value }))} />
        <ConfigInput label="标题字号" value={format.titleFontSize ?? format.fontSize ?? ''} onChange={(value) => setFormat((item) => ({ ...item, titleFontSize: value }))} />
        <ConfigInput label="正文字号" value={format.bodyFontSize ?? format.fontSize ?? ''} onChange={(value) => setFormat((item) => ({ ...item, bodyFontSize: value }))} />
        <ConfigInput label="行距" value={format.lineSpacing ?? ''} onChange={(value) => setFormat((item) => ({ ...item, lineSpacing: value }))} />
      </div>
      <label className="mt-3 flex items-center gap-2">
        <input
          type="checkbox"
          checked={Boolean(format.allowUserFormat)}
          onChange={(event) => setFormat((item) => ({ ...item, allowUserFormat: event.target.checked }))}
        />
        允许用户在写作页修改格式
      </label>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button className="bg-slate-700 px-2 py-1.5 font-semibold text-white disabled:opacity-60" disabled={saving} onClick={() => void save()}>
          {saving ? '保存中...' : '保存配置'}
        </button>
        <button className="border border-slate-200 bg-white px-2 py-1.5 text-slate-600" onClick={onClose}>
          关闭
        </button>
      </div>
    </section>
  );
}

function ConfigInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold text-slate-500">{label}</span>
      <input className="w-full border border-slate-200 bg-slate-50 px-2 py-1.5" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function TemplateListPanel({
  title,
  templates,
  onOpenTemplate,
}: {
  key?: string;
  title: string;
  templates: WritingTemplate[];
  onOpenTemplate: (template: WritingTemplate) => void;
}) {
  return (
    <section className="border border-slate-200 bg-white p-3 shadow-sm">
      <PanelTitle icon={<ClipboardList className="h-4 w-4" />} title={title} />
      <div className="mt-2 space-y-1">
        {templates.length === 0 ? (
          <div className="px-2 py-2 text-xs text-slate-500">暂无模板</div>
        ) : (
          templates.map((template) => (
            <button
              key={template.id}
              className="flex w-full items-start gap-2 border border-slate-100 bg-slate-50 px-2 py-2 text-left hover:border-orange-300 hover:bg-white"
              onClick={() => onOpenTemplate(template)}
            >
              <span className="mt-0.5 text-slate-500">
                <FileText className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-slate-800">{template.name}</span>
                <span className="block truncate text-xs text-slate-500">{template.description || template.originalFileName}</span>
              </span>
              <ChevronRight className="mt-1 h-3.5 w-3.5 text-slate-400" />
            </button>
          ))
        )}
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

function LockedTemplateBlock({ value }: { value: string }) {
  const text = trimDisplayBlock(value);
  if (!text) return null;
  return (
    <div className="my-3 whitespace-pre-wrap border border-slate-100 bg-slate-50/80 p-3 text-sm leading-7 text-slate-600">
      {text}
    </div>
  );
}

function ProofCard({
  issue,
  applying,
  onApply,
  onIgnore,
}: {
  key?: string;
  issue: ProofreadIssue;
  applying: boolean;
  onApply: () => void;
  onIgnore: () => void;
}) {
  return (
    <div className="mb-2 border border-red-100 bg-red-50 p-2 text-xs">
      <div className="flex items-center gap-1 font-bold text-red-700">
        <AlertTriangle className="h-3.5 w-3.5" />
        {issue.type}
      </div>
      {issue.original && <div className="mt-1 text-slate-700">原文：{issue.original}</div>}
      {issue.suggestion && <div className="mt-1 text-slate-700">建议：{issue.suggestion}</div>}
      {issue.reason && <div className="mt-1 text-slate-500">原因：{issue.reason}</div>}
      <div className="mt-2 grid grid-cols-2 gap-1">
        <button className="bg-slate-700 px-2 py-1 font-semibold text-white disabled:bg-slate-300" disabled={applying} onClick={onApply}>
          {applying ? '修改中...' : '应用修改'}
        </button>
        <button className="border border-slate-200 bg-white px-2 py-1 text-slate-600" onClick={onIgnore}>
          忽略
        </button>
      </div>
    </div>
  );
}

function LoadingBox({ text }: { text: string }) {
  return (
    <div className="flex h-48 items-center justify-center border border-slate-200 bg-white text-sm text-slate-500">
      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      {text}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex h-64 flex-col items-center justify-center border border-dashed border-slate-300 bg-white text-center text-sm text-slate-500">
      <FileText className="mb-3 h-10 w-10 text-slate-300" />
      暂无智能写作模板，请先上传包含 &lt;title&gt; 和 &lt;body&gt; 的 Word 模板。
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
