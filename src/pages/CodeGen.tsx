import { useMemo, useRef, useState, type DragEvent } from 'react';
import Editor, { type Monaco, type OnMount } from '@monaco-editor/react';
import Split from '@uiw/react-split';
import { Tree, type NodeRendererProps } from 'react-arborist';
import JSZip from 'jszip';
import {
  Bot,
  ChevronRight,
  Code,
  Download,
  FileArchive,
  FileCode2,
  Folder,
  FolderOpen,
  Loader2,
  MessageSquareText,
  RefreshCw,
  Save,
  Search,
  Send,
  UploadCloud,
  User,
} from 'lucide-react';
import { useAppContext } from '../AppContext';
import { backendApi } from '../services/backendApi';

type WorkspaceFile = {
  path: string;
  name: string;
  content: string;
  originalContent: string;
  language: string;
  size: number;
  dirty: boolean;
};

type FileNode = {
  id: string;
  name: string;
  path: string;
  type: 'folder' | 'file';
  children?: FileNode[];
};

type ChatItem = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  reasoning?: string | null;
  status?: 'loading' | 'done' | 'error';
  applyCode?: string;
  applyPath?: string;
  applied?: boolean;
  changeSummaries?: ChangeSummary[];
};

type CodeEditChange = {
  filePath: string;
  operation: string;
  find: string;
  replace: string;
  description: string;
};

type ChangeSummary = {
  id: string;
  filePath: string;
  lineNumber: number;
  operation: string;
  description: string;
  before: string;
  after: string;
};

type FileSystemEntryLike = {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  fullPath: string;
};

type FileSystemFileEntryLike = FileSystemEntryLike & {
  file: (success: (file: File) => void, error?: (error: DOMException) => void) => void;
};

type FileSystemDirectoryEntryLike = FileSystemEntryLike & {
  createReader: () => {
    readEntries: (success: (entries: FileSystemEntryLike[]) => void, error?: (error: DOMException) => void) => void;
  };
};

type DataTransferItemWithEntry = DataTransferItem & {
  webkitGetAsEntry?: () => FileSystemEntryLike | null;
};

const ignoredSegments = new Set([
  '.git',
  '.idea',
  '.vscode',
  'node_modules',
  'dist',
  'build',
  '.next',
  '.venv',
  'venv',
  '__pycache__',
]);

const textExtensions = new Set([
  '.c',
  '.cpp',
  '.cs',
  '.css',
  '.env',
  '.go',
  '.h',
  '.html',
  '.java',
  '.js',
  '.json',
  '.jsx',
  '.kt',
  '.less',
  '.md',
  '.mjs',
  '.py',
  '.rs',
  '.scss',
  '.sh',
  '.sql',
  '.toml',
  '.ts',
  '.tsx',
  '.txt',
  '.vue',
  '.xml',
  '.yaml',
  '.yml',
]);

const welcomeCode = `// 将项目文件或文件夹拖到左侧区域
// 也可以点击“选择项目目录”导入一个本地项目
//
// 导入后：
// 1. 左侧会生成文件树
// 2. 中间可以编辑代码
// 3. 右侧可以基于当前文件或选中代码询问 AI
// 4. 可以导出当前文件或整个工作区 zip
`;

function extensionOf(path: string) {
  const index = path.lastIndexOf('.');
  return index >= 0 ? path.slice(index).toLowerCase() : '';
}

function languageFor(path: string) {
  const ext = extensionOf(path);
  if (ext === '.py') return 'python';
  if (['.ts', '.tsx', '.js', '.jsx', '.mjs'].includes(ext)) return 'typescript';
  if (ext === '.json') return 'json';
  if (ext === '.md') return 'markdown';
  if (ext === '.css' || ext === '.scss' || ext === '.less') return 'css';
  if (ext === '.html' || ext === '.xml') return 'html';
  if (ext === '.yaml' || ext === '.yml') return 'yaml';
  if (ext === '.sql') return 'sql';
  if (ext === '.sh') return 'shell';
  if (ext === '.java') return 'java';
  if (ext === '.go') return 'go';
  if (ext === '.rs') return 'rust';
  return 'plaintext';
}

function shouldIgnore(path: string) {
  const normalized = path.replaceAll('\\', '/');
  return normalized.split('/').some((segment) => ignoredSegments.has(segment));
}

function isTextFile(file: File) {
  if (file.type.startsWith('text/')) return true;
  if (file.type.includes('json') || file.type.includes('xml')) return true;
  return textExtensions.has(extensionOf(file.name));
}

function normalizeRelativePath(file: File) {
  const withDirectory = file.webkitRelativePath || file.name;
  return withDirectory.replaceAll('\\', '/').replace(/^\/+/, '');
}

async function readWorkspaceFiles(fileList: File[]) {
  const nextFiles: WorkspaceFile[] = [];
  for (const file of fileList) {
    const path = normalizeRelativePath(file);
    if (!path || shouldIgnore(path) || !isTextFile(file) || file.size > 2_000_000) continue;
    const content = await file.text();
    nextFiles.push({
      path,
      name: path.split('/').pop() ?? file.name,
      content,
      originalContent: content,
      language: languageFor(path),
      size: file.size,
      dirty: false,
    });
  }
  return nextFiles.sort((a, b) => a.path.localeCompare(b.path));
}

function fileEntryToFile(entry: FileSystemFileEntryLike) {
  return new Promise<File>((resolve, reject) => entry.file(resolve, reject));
}

function readDirectoryEntries(entry: FileSystemDirectoryEntryLike) {
  const reader = entry.createReader();
  const entries: FileSystemEntryLike[] = [];
  return new Promise<FileSystemEntryLike[]>((resolve, reject) => {
    const readBatch = () => {
      reader.readEntries((batch) => {
        if (batch.length === 0) {
          resolve(entries);
          return;
        }
        entries.push(...batch);
        readBatch();
      }, reject);
    };
    readBatch();
  });
}

async function collectFilesFromEntry(entry: FileSystemEntryLike, rootName = ''): Promise<File[]> {
  const currentPath = `${rootName}/${entry.name}`.replace(/^\/+/, '');
  if (shouldIgnore(currentPath)) return [];
  if (entry.isFile) {
    const file = await fileEntryToFile(entry as FileSystemFileEntryLike);
    Object.defineProperty(file, 'webkitRelativePath', { value: currentPath });
    return [file];
  }
  if (entry.isDirectory) {
    const children = await readDirectoryEntries(entry as FileSystemDirectoryEntryLike);
    const nested = await Promise.all(children.map((child) => collectFilesFromEntry(child, currentPath)));
    return nested.flat();
  }
  return [];
}

function buildTree(files: WorkspaceFile[]): FileNode[] {
  const root: FileNode[] = [];
  const folderMap = new Map<string, FileNode>();

  for (const file of files) {
    const parts = file.path.split('/').filter(Boolean);
    let children = root;
    let currentPath = '';
    parts.forEach((part, index) => {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const isFile = index === parts.length - 1;
      if (isFile) {
        if (!children.some((node) => node.path === file.path)) {
          children.push({ id: file.path, name: part, path: file.path, type: 'file' });
        }
        return;
      }
      let folder = folderMap.get(currentPath);
      if (!folder) {
        folder = { id: currentPath, name: part, path: currentPath, type: 'folder', children: [] };
        folderMap.set(currentPath, folder);
        children.push(folder);
      }
      children = folder.children ?? [];
    });
  }

  const sortNodes = (nodes: FileNode[]) => {
    nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    nodes.forEach((node) => node.children && sortNodes(node.children));
  };
  sortNodes(root);
  return root;
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function isEditRequest(content: string) {
  return /修改|改成|增加|新增|添加|补充|删除|移除|重构|优化|修复|替换|实现|加上|加一个|完善|edit|modify|add|fix|replace|refactor|implement/i.test(content);
}

function extractFirstCodeBlock(content: string) {
  const match = content.match(/```[^\n`]*\n([\s\S]*?)```/);
  return match?.[1]?.replace(/\n$/, '') ?? null;
}

function extractCodeBlockByLanguage(content: string, language: string) {
  const escaped = language.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = content.match(new RegExp('```' + escaped + '\\s*\\n([\\s\\S]*?)```', 'i'));
  return match?.[1]?.replace(/\n$/, '') ?? null;
}

function applyFindReplacePatch(source: string, patchText: string) {
  let operations: unknown;
  try {
    operations = JSON.parse(patchText);
  } catch {
    return null;
  }
  if (!Array.isArray(operations)) return null;

  let next = source;
  for (const operation of operations) {
    if (!operation || typeof operation !== 'object') return null;
    const { find, replace } = operation as { find?: unknown; replace?: unknown };
    if (typeof find !== 'string' || typeof replace !== 'string' || !find) return null;
    if (!next.includes(find)) return null;
    next = next.replace(find, replace);
  }
  return next;
}

function extractApplyCodeFromOutput(source: string, outputText: string) {
  const patchBlock = extractCodeBlockByLanguage(outputText, 'json');
  if (patchBlock) {
    const patched = applyFindReplacePatch(source, patchBlock);
    if (patched !== null) return patched;
  }

  return extractFirstCodeBlock(outputText);
}

function detectLineEnding(value: string) {
  const crlfCount = (value.match(/\r\n/g) ?? []).length;
  const lfCount = (value.match(/(?<!\r)\n/g) ?? []).length;
  return crlfCount > lfCount ? '\r\n' : '\n';
}

function originalIndexFromNormalized(value: string, normalizedIndex: number) {
  let normalizedCursor = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (normalizedCursor === normalizedIndex) return index;
    if (value[index] === '\r' && value[index + 1] === '\n') {
      index += 1;
    }
    normalizedCursor += 1;
  }
  return value.length;
}

function normalizeReplacementLineEndings(value: string, lineEnding: string) {
  return value.replace(/\r\n/g, '\n').replace(/\n/g, lineEnding);
}

function applyTextChange(source: string, change: CodeEditChange) {
  const find = change.find;
  const replacement = normalizeReplacementLineEndings(change.replace, detectLineEnding(source));

  if (change.operation === 'replace' && source.includes(find)) {
    return source.replace(find, replacement);
  }
  if (change.operation === 'insert_after' && source.includes(find)) {
    return source.replace(find, `${find}${replacement}`);
  }
  if (change.operation === 'insert_before' && source.includes(find)) {
    return source.replace(find, `${replacement}${find}`);
  }

  const normalizedSource = source.replace(/\r\n/g, '\n');
  const normalizedFind = find.replace(/\r\n/g, '\n');
  const start = normalizedSource.indexOf(normalizedFind);
  if (start < 0) return null;

  const originalStart = originalIndexFromNormalized(source, start);
  const originalEnd = originalIndexFromNormalized(source, start + normalizedFind.length);
  if (change.operation === 'replace') {
    return source.slice(0, originalStart) + replacement + source.slice(originalEnd);
  }
  if (change.operation === 'insert_after') {
    return source.slice(0, originalEnd) + replacement + source.slice(originalEnd);
  }
  if (change.operation === 'insert_before') {
    return source.slice(0, originalStart) + replacement + source.slice(originalStart);
  }
  return null;
}

function lineNumberAtIndex(value: string, index: number) {
  return value.slice(0, Math.max(0, index)).split(/\r\n|\r|\n/).length;
}

function snippet(value: string, maxLength = 420) {
  const trimmed = value.trim();
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength)}\n...`;
}

function findChangeLine(source: string, find: string) {
  const directIndex = source.indexOf(find);
  if (directIndex >= 0) return lineNumberAtIndex(source, directIndex);
  const normalizedSource = source.replace(/\r\n/g, '\n');
  const normalizedFind = find.replace(/\r\n/g, '\n');
  const normalizedIndex = normalizedSource.indexOf(normalizedFind);
  if (normalizedIndex < 0) return 1;
  return lineNumberAtIndex(normalizedSource, normalizedIndex);
}

function ProjectNode({ node, style, dragHandle }: NodeRendererProps<FileNode>) {
  const isFolder = node.data.type === 'folder';
  const Icon = isFolder ? (node.isOpen ? FolderOpen : Folder) : FileCode2;

  return (
    <div
      ref={dragHandle}
      style={style}
      onClick={() => {
        if (isFolder) node.toggle();
      }}
      className={`flex cursor-default items-center gap-1.5 rounded px-2 text-xs ${
        node.isSelected ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-100'
      }`}
    >
      {isFolder ? (
        <ChevronRight className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform ${node.isOpen ? 'rotate-90' : ''}`} />
      ) : (
        <span className="w-3.5 shrink-0" />
      )}
      <Icon className={`h-3.5 w-3.5 shrink-0 ${isFolder ? 'text-amber-500' : 'text-slate-400'}`} />
      <span className="truncate">{node.data.name}</span>
    </div>
  );
}

export function CodeGen() {
  const { user, currentModel } = useAppContext();
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const decorationIdsRef = useRef<string[]>([]);
  const directoryInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [workspaceFiles, setWorkspaceFiles] = useState<WorkspaceFile[]>([]);
  const [activePath, setActivePath] = useState('');
  const [openTabs, setOpenTabs] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCode, setSelectedCode] = useState('');
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [importStatus, setImportStatus] = useState('拖拽文件或文件夹开始');
  const [recentChanges, setRecentChanges] = useState<ChangeSummary[]>([]);
  const [chatItems, setChatItems] = useState<ChatItem[]>([
    {
      id: 'assistant-welcome',
      role: 'assistant',
      content: '导入项目后，我可以基于当前文件或选中代码做解释、审查、重构建议和测试用例生成。',
      status: 'done',
    },
  ]);

  const fileByPath = useMemo(() => new Map(workspaceFiles.map((file) => [file.path, file])), [workspaceFiles]);
  const treeData = useMemo(() => buildTree(workspaceFiles), [workspaceFiles]);
  const activeFile = activePath ? fileByPath.get(activePath) : null;
  const activeCode = activeFile?.content ?? welcomeCode;
  const dirtyCount = workspaceFiles.filter((file) => file.dirty).length;
  const totalSize = workspaceFiles.reduce((sum, file) => sum + file.size, 0);

  const importFiles = async (files: File[]) => {
    setImportStatus('正在读取项目文件...');
    const nextFiles = await readWorkspaceFiles(files);
    if (nextFiles.length === 0) {
      setImportStatus('没有找到可读取的代码或文本文件');
      return;
    }
    setWorkspaceFiles(nextFiles);
    setActivePath(nextFiles[0].path);
    setOpenTabs([nextFiles[0].path]);
    setSelectedCode('');
    setImportStatus(`已导入 ${nextFiles.length} 个文件`);
  };

  const handleDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);

    const entryFiles: File[] = [];
    const items = Array.from(event.dataTransfer.items) as DataTransferItemWithEntry[];
    for (const item of items) {
      const entry = item.webkitGetAsEntry?.();
      if (entry) entryFiles.push(...(await collectFilesFromEntry(entry)));
    }

    const fallbackFiles = Array.from<File>(event.dataTransfer.files);
    await importFiles(entryFiles.length > 0 ? entryFiles : fallbackFiles);
  };

  const openFile = (path: string) => {
    if (!fileByPath.has(path)) return;
    setActivePath(path);
    setOpenTabs((tabs) => (tabs.includes(path) ? tabs : [...tabs, path]));
  };

  const closeTab = (path: string) => {
    setOpenTabs((tabs) => {
      const next = tabs.filter((item) => item !== path);
      if (path === activePath) setActivePath(next[0] ?? '');
      return next;
    });
  };

  const handleEditorMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    editor.onDidChangeCursorSelection(() => {
      const selection = editor.getSelection();
      const model = editor.getModel();
      if (!selection || !model || selection.isEmpty()) {
        setSelectedCode('');
        return;
      }
      setSelectedCode(model.getValueInRange(selection));
    });
  };

  const updateFileContent = (path: string, content: string) => {
    if (!path) return;
    setWorkspaceFiles((files) =>
      files.map((file) =>
        file.path === path
          ? { ...file, content, dirty: content !== file.originalContent, size: new Blob([content]).size }
          : file,
      ),
    );
  };

  const updateActiveFile = (content: string) => {
    updateFileContent(activePath, content);
  };

  const applyCodeEditChanges = (changes: CodeEditChange[]) => {
    const errors: string[] = [];
    let appliedCount = 0;
    setWorkspaceFiles((files) =>
      files.map((file) => {
        const fileChanges = changes.filter((change) => change.filePath === file.path);
        if (fileChanges.length === 0) return file;

        let nextContent = file.content;
        for (const change of fileChanges) {
          if (change.operation !== 'replace') {
            errors.push(`${change.filePath}: 不支持的操作 ${change.operation}`);
            continue;
          }
          if (!nextContent.includes(change.find)) {
            errors.push(`${change.filePath}: 未找到匹配代码片段`);
            continue;
          }
          nextContent = nextContent.replace(change.find, change.replace);
          appliedCount += 1;
        }

        return {
          ...file,
          content: nextContent,
          dirty: nextContent !== file.originalContent,
          size: new Blob([nextContent]).size,
        };
      }),
    );
    return { appliedCount, errors };
  };

  const applyAssistantCode = (item: ChatItem) => {
    if (!item.applyCode || !item.applyPath) return;
    updateFileContent(item.applyPath, item.applyCode);
    openFile(item.applyPath);
    setChatItems((items) => items.map((chatItem) => (chatItem.id === item.id ? { ...chatItem, applied: true } : chatItem)));
  };

  const applyStructuredCodeChanges = (changes: CodeEditChange[]) => {
    const errors: string[] = [];
    let appliedCount = 0;
    const nextFiles = workspaceFiles.map((file) => {
      const fileChanges = changes.filter((change) => change.filePath === file.path);
      if (fileChanges.length === 0) return file;

      let nextContent = file.content;
      for (const change of fileChanges) {
        if (!['replace', 'insert_after', 'insert_before'].includes(change.operation)) {
          errors.push(`${change.filePath}: 不支持的操作 ${change.operation}`);
          continue;
        }
        const changedContent = applyTextChange(nextContent, change);
        if (changedContent === null) {
          errors.push(`${change.filePath}: 未找到匹配代码片段`);
          continue;
        }
        nextContent = changedContent;
        appliedCount += 1;
      }

      return {
        ...file,
        content: nextContent,
        dirty: nextContent !== file.originalContent,
        size: new Blob([nextContent]).size,
      };
    });
    setWorkspaceFiles(nextFiles);
    return { appliedCount, errors };
  };

  const applyCodeChangesWithSummary = (changes: CodeEditChange[]) => {
    const errors: string[] = [];
    const summaries: ChangeSummary[] = [];
    let appliedCount = 0;
    const nextFiles = workspaceFiles.map((file) => {
      const fileChanges = changes.filter((change) => change.filePath === file.path);
      if (fileChanges.length === 0) return file;

      let nextContent = file.content;
      for (const change of fileChanges) {
        if (!['replace', 'insert_after', 'insert_before'].includes(change.operation)) {
          errors.push(`${change.filePath}: 不支持的操作 ${change.operation}`);
          continue;
        }
        const changedContent = applyTextChange(nextContent, change);
        if (changedContent === null) {
          errors.push(`${change.filePath}: 未找到匹配代码片段`);
          continue;
        }
        summaries.push({
          id: `${change.filePath}-${appliedCount}`,
          filePath: change.filePath,
          lineNumber: findChangeLine(nextContent, change.find),
          operation: change.operation,
          description: change.description,
          before: change.operation === 'replace' ? snippet(change.find) : '',
          after: snippet(change.replace),
        });
        nextContent = changedContent;
        appliedCount += 1;
      }

      return {
        ...file,
        content: nextContent,
        dirty: nextContent !== file.originalContent,
        size: new Blob([nextContent]).size,
      };
    });
    setWorkspaceFiles(nextFiles);
    setRecentChanges(summaries);
    return { appliedCount, errors, summaries };
  };

  const jumpToChange = (change: ChangeSummary) => {
    openFile(change.filePath);
    window.setTimeout(() => {
      const editor = editorRef.current;
      const monaco = monacoRef.current;
      if (!editor || !monaco) return;
      editor.revealLineInCenter(change.lineNumber);
      editor.setPosition({ lineNumber: change.lineNumber, column: 1 });
      decorationIdsRef.current = editor.deltaDecorations(decorationIdsRef.current, [
        {
          range: new monaco.Range(change.lineNumber, 1, change.lineNumber, 1),
          options: {
            isWholeLine: true,
            className: 'code-assistant-change-line',
            glyphMarginClassName: 'code-assistant-change-glyph',
            overviewRuler: {
              color: '#22c55e',
              position: monaco.editor.OverviewRulerLane.Right,
            },
          },
        },
      ]);
    }, 0);
  };

  const markActiveSaved = () => {
    if (!activePath) return;
    setWorkspaceFiles((files) =>
      files.map((file) => (file.path === activePath ? { ...file, originalContent: file.content, dirty: false } : file)),
    );
  };

  const exportCurrentFile = () => {
    if (!activeFile) return;
    downloadBlob(new Blob([activeFile.content], { type: 'text/plain;charset=utf-8' }), activeFile.name);
  };

  const exportWorkspace = async () => {
    if (workspaceFiles.length === 0) return;
    const zip = new JSZip();
    workspaceFiles.forEach((file) => zip.file(file.path, file.content));
    const blob = await zip.generateAsync({ type: 'blob' });
    downloadBlob(blob, 'code-workspace.zip');
  };

  const sendChat = async (overrideQuestion?: string) => {
    const content = (overrideQuestion ?? question).trim();
    if (!content || loading) return;

    const wantsEdit = isEditRequest(content);
    const targetPath = activePath;
    const contextCode = wantsEdit ? activeCode : selectedCode || activeCode;
    const contextLabel = wantsEdit ? '当前打开文件完整内容' : selectedCode ? '用户选中的代码' : '当前打开文件内容';
    const prompt = [
      '请严格按照用户的问题回答。下面的代码只是上下文材料，不代表用户一定要求你做完整代码分析、代码审查或总结。',
      '',
      `用户问题: ${content}`,
      '',
      `当前文件: ${activePath || '未选择文件'}`,
      `${contextLabel}:`,
      '```' + (activeFile?.language ?? 'plaintext'),
      contextCode.slice(0, 12000),
      '```',
      ...(wantsEdit && selectedCode
        ? ['', '用户当前选中的代码片段:', '```' + (activeFile?.language ?? 'plaintext'), selectedCode.slice(0, 4000), '```']
        : []),
      '',
      wantsEdit
        ? [
            '回答要求: 用户这次希望修改代码。请返回可应用补丁，不要返回完整文件，避免内容过长被截断。',
            '补丁格式必须是一个单独的 ```json fenced code block，内容为数组，每项包含 find 和 replace 字符串。',
            'find 必须从原文件中逐字复制一段唯一文本；replace 是替换后的文本。',
            'JSON code block 外可以有一句简短说明，但不要输出完整文件。',
          ].join('\n')
        : '回答要求: 围绕用户问题直接回答；只有当用户明确要求分析、审查、重构或生成代码时，才展开对应内容。',
    ].join('\n');

    const userItem: ChatItem = { id: `user-${Date.now()}`, role: 'user', content, status: 'done' };
    const assistantId = `assistant-${Date.now()}`;
    setChatItems((items) => [...items, userItem, { id: assistantId, role: 'assistant', content: '正在处理请求...', status: 'loading' }]);
    setQuestion('');
    setLoading(true);

    try {
      if (!user) throw new Error('请先登录后再调用模型。');
      if (wantsEdit && activeFile) {
        const editResult = await backendApi.createCodeEdit({
          instruction: content,
          filePath: activePath,
          language: activeFile.language,
          content: activeCode,
          selectedText: selectedCode,
          userId: user.id,
          model: currentModel,
          maxTokens: 4096,
        });
        const { appliedCount, errors, summaries } = applyCodeChangesWithSummary(editResult.changes);
        if (appliedCount > 0) openFile(activePath);
        const applySummary =
          appliedCount > 0
            ? `\n\n已自动应用 ${appliedCount} 处代码变更到编辑器。`
            : '\n\n未应用代码变更：AI 没有返回可匹配的结构化变更。';
        const errorSummary = errors.length > 0 ? `\n\n未应用项：\n${errors.map((item) => `- ${item}`).join('\n')}` : '';
        setChatItems((items) =>
          items.map((item) =>
            item.id === assistantId
              ? { ...item, content: `${editResult.answer}${applySummary}${errorSummary}`, reasoning: editResult.reasoning, status: 'done', applied: appliedCount > 0, changeSummaries: summaries }
              : item,
          ),
        );
        return;
      }

      const task = await backendApi.createLLMTask({
        taskType: 'code',
        title: `代码助手: ${activeFile?.name ?? '临时代码'}`,
        inputText: prompt,
        userId: user.id,
        model: currentModel,
        maxTokens: 4096,
      });
      const outputText = task.outputText || '模型没有返回内容。';
      setChatItems((items) =>
        items.map((item) =>
          item.id === assistantId
            ? { ...item, content: outputText, reasoning: task.reasoning, status: 'done' }
            : item,
        ),
      );
    } catch (error) {
      setChatItems((items) =>
        items.map((item) =>
          item.id === assistantId
            ? { ...item, content: error instanceof Error ? error.message : '代码分析失败。', status: 'error' }
            : item,
        ),
      );
    } finally {
      setLoading(false);
    }
  };

  const workspaceSummary =
    workspaceFiles.length > 0
      ? `${workspaceFiles.length} 个文件 / ${(totalSize / 1024).toFixed(1)} KB${dirtyCount ? ` / ${dirtyCount} 个未保存` : ''}`
      : '未导入项目';

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-100">
      <input
        ref={directoryInputRef}
        type="file"
        multiple
        className="hidden"
        {...{ webkitdirectory: '' }}
        onChange={(event) => void importFiles(Array.from(event.target.files ?? []))}
      />
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(event) => void importFiles(Array.from(event.target.files ?? []))}
      />

      <div className="flex h-12 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4">
        <div className="flex min-w-0 items-center gap-3">
          <Code className="h-5 w-5 text-blue-600" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold text-slate-800">代码助手工作台</h1>
              <span className="rounded border border-slate-200 px-1.5 py-0.5 text-[10px] text-slate-500">Workspace</span>
            </div>
            <p className="truncate text-[11px] text-slate-500">导入外部项目，编辑代码，导出修改结果</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex h-8 items-center gap-1.5 rounded border border-slate-200 px-3 text-xs text-slate-600 hover:bg-slate-50"
          >
            <UploadCloud className="h-3.5 w-3.5" />
            选择文件
          </button>
          <button
            onClick={() => directoryInputRef.current?.click()}
            className="flex h-8 items-center gap-1.5 rounded bg-blue-600 px-3 text-xs text-white hover:bg-blue-500"
          >
            <FolderOpen className="h-3.5 w-3.5" />
            选择项目目录
          </button>
        </div>
      </div>

      <Split className="min-h-0 flex-1" style={{ height: 'calc(100vh - 92px)' }} lineBar>
        <aside
          style={{ width: 310, minWidth: 250, maxWidth: 430 }}
          className="flex min-h-0 flex-col border-r border-slate-200 bg-white"
          onDrop={(event) => void handleDrop(event)}
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
        >
          <div className="border-b border-slate-100 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700">工作区文件</span>
              <button
                onClick={() => {
                  setWorkspaceFiles([]);
                  setActivePath('');
                  setOpenTabs([]);
                  setImportStatus('拖拽文件或文件夹开始');
                }}
                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                title="清空工作区"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            </div>
            <label className="flex h-8 items-center gap-2 rounded border border-slate-200 bg-slate-50 px-2">
              <Search className="h-3.5 w-3.5 text-slate-400" />
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                className="min-w-0 flex-1 bg-transparent text-xs text-slate-700 outline-none"
                placeholder="搜索文件"
              />
            </label>
            <div className="mt-2 text-[11px] text-slate-500">{workspaceSummary}</div>
          </div>

          {workspaceFiles.length === 0 ? (
            <div className="flex min-h-0 flex-1 p-3">
              <div
                className={`grid flex-1 place-items-center rounded-md border border-dashed p-4 text-center ${
                  isDragging ? 'border-blue-400 bg-blue-50' : 'border-slate-300 bg-slate-50'
                }`}
              >
                <div>
                  <UploadCloud className="mx-auto mb-3 h-9 w-9 text-blue-500" />
                  <div className="text-sm font-bold text-slate-700">拖拽项目到这里</div>
                  <p className="mt-2 text-xs leading-5 text-slate-500">支持文件、多个文件或文件夹。会跳过 node_modules、.git、dist 等目录。</p>
                  <div className="mt-4 flex justify-center gap-2">
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="rounded border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
                    >
                      选择文件
                    </button>
                    <button
                      onClick={() => directoryInputRef.current?.click()}
                      className="rounded bg-blue-600 px-3 py-1.5 text-xs text-white hover:bg-blue-500"
                    >
                      选择目录
                    </button>
                  </div>
                  <div className="mt-3 text-[11px] text-slate-400">{importStatus}</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-hidden p-2">
              <Tree<FileNode>
                data={treeData}
                width="100%"
                height={760}
                indent={18}
                rowHeight={28}
                openByDefault
                selection={activePath}
                searchTerm={searchTerm}
                searchMatch={(node, term) => node.data.name.toLowerCase().includes(term.toLowerCase())}
                onActivate={(node) => {
                  if (node.data.type === 'file') openFile(node.data.path);
                }}
                disableDrag
                disableEdit
                disableDrop
              >
                {ProjectNode}
              </Tree>
            </div>
          )}
        </aside>

        <main style={{ minWidth: 520, flex: 1 }} className="flex min-h-0 flex-col bg-[#1e1e1e]">
          <div className="flex h-10 shrink-0 items-center justify-between border-b border-[#2d2d2d] bg-[#252526]">
            <div className="flex min-w-0 flex-1 items-center overflow-x-auto">
              {openTabs.length === 0 ? (
                <div className="px-3 text-xs text-slate-400">未打开文件</div>
              ) : (
                openTabs.map((path) => {
                  const file = fileByPath.get(path);
                  return (
                    <button
                      key={path}
                      onClick={() => setActivePath(path)}
                      className={`group flex h-10 max-w-56 items-center gap-2 border-r border-[#343434] px-3 text-xs ${
                        path === activePath ? 'bg-[#1e1e1e] text-white' : 'text-slate-400 hover:bg-[#2d2d2d]'
                      }`}
                    >
                      <FileCode2 className="h-3.5 w-3.5 shrink-0 text-blue-400" />
                      <span className="truncate">{file?.name ?? path}</span>
                      {file?.dirty && <span className="h-1.5 w-1.5 rounded-full bg-orange-400" />}
                      <span
                        onClick={(event) => {
                          event.stopPropagation();
                          closeTab(path);
                        }}
                        className="rounded px-1 text-slate-500 opacity-0 hover:bg-slate-700 hover:text-white group-hover:opacity-100"
                      >
                        x
                      </span>
                    </button>
                  );
                })
              )}
            </div>
            <div className="flex items-center gap-1 px-2">
              <button
                onClick={markActiveSaved}
                disabled={!activeFile}
                className="rounded p-1.5 text-slate-300 hover:bg-[#343434] hover:text-white disabled:opacity-40"
                title="标记当前文件已保存"
              >
                <Save className="h-4 w-4" />
              </button>
              <button
                onClick={exportCurrentFile}
                disabled={!activeFile}
                className="rounded p-1.5 text-slate-300 hover:bg-[#343434] hover:text-white disabled:opacity-40"
                title="导出当前文件"
              >
                <Download className="h-4 w-4" />
              </button>
              <button
                onClick={() => void exportWorkspace()}
                disabled={workspaceFiles.length === 0}
                className="rounded p-1.5 text-slate-300 hover:bg-[#343434] hover:text-white disabled:opacity-40"
                title="导出工作区 zip"
              >
                <FileArchive className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1">
            <Editor
              key={activePath || 'empty-workspace'}
              value={activeCode}
              language={activeFile?.language ?? 'typescript'}
              theme="vs-dark"
              onMount={handleEditorMount}
              onChange={(value) => updateActiveFile(value ?? '')}
              options={{
                readOnly: !activeFile,
                fontSize: 13,
                minimap: { enabled: Boolean(activeFile) },
                scrollBeyondLastLine: false,
                wordWrap: 'on',
                automaticLayout: true,
                tabSize: 2,
                padding: { top: 12, bottom: 12 },
              }}
            />
          </div>

          <div className="flex h-8 shrink-0 items-center justify-between border-t border-[#2d2d2d] bg-[#007acc] px-3 text-[11px] text-white">
            <div className="flex min-w-0 items-center gap-4">
              <span>{activeFile?.language ?? 'plaintext'}</span>
              <span>{activeCode.split('\n').length} 行</span>
              <span>{activeCode.length} 字符</span>
            </div>
            <span className="truncate">{activePath || importStatus}</span>
          </div>
        </main>

        <aside style={{ width: 360, minWidth: 300, maxWidth: 480 }} className="flex min-h-0 flex-col border-l border-slate-200 bg-white">
          <div className="flex h-12 shrink-0 items-center justify-between border-b border-slate-100 px-3">
            <div className="flex items-center gap-2">
              <MessageSquareText className="h-4 w-4 text-blue-600" />
              <div>
                <div className="text-xs font-bold text-slate-800">AI 聊天</div>
                <div className="text-[11px] text-slate-500">{currentModel}</div>
              </div>
            </div>
            <button
              onClick={() => setChatItems([])}
              className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              title="清空对话"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="custom-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto bg-slate-50 p-3">
            {chatItems.length === 0 ? (
              <div className="grid h-full place-items-center text-center text-xs text-slate-400">暂无对话</div>
            ) : (
              chatItems.map((item) => (
                <div key={item.id} className={`flex gap-2 ${item.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {item.role === 'assistant' && (
                    <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded bg-blue-600 text-white">
                      <Bot className="h-3.5 w-3.5" />
                    </div>
                  )}
                  <div
                    className={`max-w-[82%] rounded-md border px-3 py-2 text-xs leading-5 ${
                      item.role === 'user'
                        ? 'border-blue-500 bg-blue-600 text-white'
                        : item.status === 'error'
                          ? 'border-red-200 bg-red-50 text-red-700'
                          : 'border-slate-200 bg-white text-slate-700'
                    }`}
                  >
                    {item.status === 'loading' && <Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" />}
                    {item.role === 'assistant' && item.reasoning && (
                      <details className="mb-2 rounded border border-blue-100 bg-blue-50 px-2 py-1.5 text-[11px] text-slate-600">
                        <summary className="cursor-pointer font-bold text-blue-700">思考过程</summary>
                        <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap font-sans">{item.reasoning}</pre>
                      </details>
                    )}
                    <pre className="whitespace-pre-wrap font-sans">{item.content}</pre>
                    {item.role === 'assistant' && item.changeSummaries && item.changeSummaries.length > 0 && (
                      <div className="mt-3 rounded border border-slate-200 bg-slate-50">
                        <div className="border-b border-slate-200 px-2.5 py-2 text-[11px] font-bold text-slate-700">更改的文件</div>
                        <div className="space-y-2 p-2">
                          {item.changeSummaries.map((change) => (
                            <div key={change.id} className="rounded border border-slate-200 bg-white">
                              <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-2 py-1.5">
                                <div className="min-w-0">
                                  <div className="truncate text-[11px] font-bold text-slate-700">{change.filePath}</div>
                                  <div className="text-[10px] text-slate-500">
                                    第 {change.lineNumber} 行 · {change.description || change.operation}
                                  </div>
                                </div>
                                <button
                                  onClick={() => jumpToChange(change)}
                                  className="shrink-0 rounded border border-blue-200 px-2 py-1 text-[10px] font-bold text-blue-600 hover:bg-blue-50"
                                >
                                  跳转
                                </button>
                              </div>
                              {change.before && (
                                <pre className="max-h-28 overflow-auto whitespace-pre-wrap border-b border-slate-100 bg-red-50 px-2 py-1.5 font-mono text-[10px] leading-4 text-red-700">
                                  {change.before}
                                </pre>
                              )}
                              <pre className="max-h-36 overflow-auto whitespace-pre-wrap bg-emerald-50 px-2 py-1.5 font-mono text-[10px] leading-4 text-emerald-700">
                                {change.after}
                              </pre>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {item.role === 'assistant' && item.applyCode && item.applyPath && item.status === 'done' && (
                      <div className="mt-2 border-t border-slate-200 pt-2">
                        <button
                          onClick={() => applyAssistantCode(item)}
                          disabled={item.applied}
                          className="flex h-7 items-center gap-1.5 rounded bg-blue-600 px-2.5 text-[11px] font-bold text-white hover:bg-blue-500 disabled:cursor-default disabled:bg-slate-300"
                        >
                          <Save className="h-3.5 w-3.5" />
                          {item.applied ? '已应用到编辑器' : '应用到编辑器'}
                        </button>
                      </div>
                    )}
                  </div>
                  {item.role === 'user' && (
                    <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded bg-slate-700 text-white">
                      <User className="h-3.5 w-3.5" />
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          <div className="shrink-0 border-t border-slate-200 bg-white p-3">
            <div className="mb-2 flex items-center justify-between gap-3 text-[11px] text-slate-500">
              <span className="truncate">上下文: {activePath || '未选择文件'}</span>
              <span className="shrink-0">{selectedCode ? '选中代码' : '当前文件'}</span>
            </div>
            <div className="flex items-end gap-2 rounded border border-slate-200 bg-white p-2 focus-within:border-blue-400">
              <textarea
                value={question}
                disabled={!activeFile}
                onChange={(event) => setQuestion(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                    event.preventDefault();
                    void sendChat();
                  }
                }}
                className="max-h-28 min-h-16 flex-1 resize-none text-xs leading-5 text-slate-700 outline-none disabled:bg-white disabled:text-slate-400"
                placeholder={activeFile ? '询问当前文件或选中代码，Ctrl+Enter 发送' : '请先导入并选择一个文件'}
              />
              <button
                disabled={loading || !question.trim() || !activeFile}
                onClick={() => void sendChat()}
                className="grid h-8 w-8 shrink-0 place-items-center rounded bg-blue-600 text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                title="发送"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </aside>
      </Split>
    </div>
  );
}
