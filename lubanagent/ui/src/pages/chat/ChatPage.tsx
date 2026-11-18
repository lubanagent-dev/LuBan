/**
 * /chat 用户端聊天页（示例级入口，不在 AppShell 布局壳内）：
 * 无侧边栏全屏聊天，面向最终用户——选 Agent、多轮对话（流式）、
 * 工具调用显示为状态行、大额操作页内审批、终态后 markdown 渲染。
 * 定位边界：不做用户注册/登录/会话列表持久化；生产用户端由业务系统自建走 REST/SSE。
 * 鉴权（H13）：请求自动携带工作台内存态 API Key（见 lib/auth.ts；AUTH_ENABLED=false 时无需提供）。
 */

import { ArrowLeft, MessageCircle, PanelLeft, RotateCcw, Send, Square } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { useQueryClient } from '@tanstack/react-query';

import { useCreateSession, useSessionMessages } from '@/api/hooks';
import { clearPortalSession, getPortalToken } from '@/lib/portal';

import { API_BASE } from '@/api/client';
import { useAgents, useCancelRun, useDecideApproval } from '@/api/hooks';
import { AgentAvatar } from '@/components/agent-avatar';
import { eventTypeOf, reduceRunEvents } from '@/components/run-events';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { localeToggleLabel, setLocale, toggleLocale, useLocale, useT } from '@/lib/i18n';
import type { SseEvent } from '@/lib/sse';
import { useRunStream } from '@/lib/sse';

import { AssistantBubble } from './components/AssistantBubble';
import { SessionSidebar } from './components/SessionSidebar';

interface ArchivedTurn {
  input: string;
  events: SseEvent[];
}

/** 观测标签：Trace 列表按 user_id 区分用户端流量 vs 工作台调试流量 */
const CHAT_USER_ID = 'chat-user';

/** 默认选中内置客服；无此 key 时落到列表第一个 */
const DEFAULT_AGENT_KEY = 'customer-service-bot';

export default function ChatPage() {
  const t = useT();
  const locale = useLocale();
  const agentsQuery = useAgents();
  const agents = agentsQuery.data ?? [];
  const stream = useRunStream();
  const cancelRun = useCancelRun();
  const decideApproval = useDecideApproval();
  const queryClient = useQueryClient();
  const createSession = useCreateSession();

  // 门户模式（R7）：带门户令牌 → 会话侧栏 + 消息持久化归因；否则维持示例级入口语义。
  const portalMode = getPortalToken() !== null;
  const [sidebarOpen, setSidebarOpen] = useState(portalMode);
  const [activeSession, setActiveSession] = useState<{ id: string; title: string } | null>(null);
  const portalHistory = useSessionMessages(portalMode ? activeSession?.id ?? null : null);

  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [turns, setTurns] = useState<ArchivedTurn[]>([]);
  const [currentInput, setCurrentInput] = useState<string | null>(null);
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  // 非门户模式：挂载生成一次、多轮共用（刷新重开新会话）；门户模式用持久会话 id。
  const [ephemeralSessionId, setEphemeralSessionId] = useState(() => crypto.randomUUID());
  const sessionId = portalMode ? (activeSession?.id ?? null) : ephemeralSessionId;

  // agents 加载后定默认选中（customer-service-bot 优先）
  const effectiveKey =
    selectedKey ??
    (agents.length > 0
      ? (agents.find((agent) => agent.key === DEFAULT_AGENT_KEY)?.key ?? agents[0].key)
      : null);
  const selectedAgent = agents.find((agent) => agent.key === effectiveKey) ?? null;

  const streaming = stream.status === 'streaming';
  const pendingApproval =
    stream.events.some((event) => eventTypeOf(event) === 'tool_approval_requested') &&
    !stream.events.some((event) => eventTypeOf(event) === 'tool_approval_resolved');
  const inputLocked = streaming || pendingApproval;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [stream.events.length, turns.length]);

  /** 重置会话：换 session、清轮次；保留 Agent 选择（换话题不换对象） */
  const newSession = () => {
    stream.reset();
    setTurns([]);
    setCurrentInput(null);
    setActiveSession(null);
    setEphemeralSessionId(crypto.randomUUID());
  };

  const send = () => {
    const text = input.trim();
    if (text === '' || effectiveKey === null || inputLocked) return;
    // 归档上一轮 + 前端自拼 history（v1 后端不查库，由调用方携带）
    const archived: ArchivedTurn[] =
      currentInput !== null ? [...turns, { input: currentInput, events: stream.events }] : turns;
    if (currentInput !== null) setTurns(archived);
    const history = archived.flatMap((turn) => {
      const r = reduceTurn(turn);
      return [
        { role: 'user', content: turn.input },
        { role: 'assistant', content: r },
      ];
    });
    setCurrentInput(text);
    setInput('');
    const startStream = (id: string | null) => {
      void stream.start(`${API_BASE}/v1/agents/${encodeURIComponent(effectiveKey)}/runs`, {
        input: text,
        session_id: id,
        user_id: CHAT_USER_ID,
        history,
      });
    };
    if (portalMode && activeSession === null) {
      // 首条消息落会话：标题取输入前缀，SSE 完成后本轮自动持久化
      void createSession
        .mutateAsync({ title: text.slice(0, 40) })
        .then((session) => {
          setActiveSession({ id: session.id, title: session.title ?? '' });
          startStream(session.id);
        })
        .catch(() => startStream(null));
      return;
    }
    startStream(sessionId);
  };

  // 门户模式：流结束把本轮对话落库视图刷新（清内存轮次，避免与持久化历史重复）
  const lastStatusRef = useRef(stream.status);
  useEffect(() => {
    if (
      portalMode &&
      activeSession !== null &&
      lastStatusRef.current === 'streaming' &&
      stream.status === 'done'
    ) {
      void queryClient.invalidateQueries({
        queryKey: ['sessions', activeSession.id, 'messages'],
      });
      setTurns([]);
      setCurrentInput(null);
    }
    lastStatusRef.current = stream.status;
  }, [portalMode, activeSession, stream.status, queryClient]);

  const cancel = () => {
    const runId = reduceRunEvents(stream.events).runId;
    if (runId !== null) cancelRun.mutate(runId);
    stream.cancel();
  };

  const onDecide = (approvalId: string, approved: boolean) => {
    setDecidingId(approvalId);
    decideApproval.mutate(
      { approvalId, approved, decided_by: CHAT_USER_ID },
      { onSettled: () => setDecidingId(null) },
    );
  };

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b px-4">
        <MessageCircle className="h-5 w-5 shrink-0 text-primary" />
        <h1 className="shrink-0 text-xl font-semibold">{t('chat.title')}</h1>
        <div className="ml-auto flex min-w-0 items-center justify-end gap-2">
          {portalMode && (
            <Button
              variant="ghost"
              size="sm"
              className="shrink-0"
              aria-label={t('portal.toggleSidebar')}
              onClick={() => setSidebarOpen((open) => !open)}
            >
              <PanelLeft className="h-4 w-4" />
            </Button>
          )}
          <Select
            value={effectiveKey ?? undefined}
            onValueChange={(value) => {
              if (value !== effectiveKey) {
                // 切 Agent = 重置会话（防跨 Agent 历史污染）
                setSelectedKey(value);
                newSession();
              }
            }}
          >
            <SelectTrigger className="h-9 w-44 sm:w-56" aria-label={t('chat.selectAgent')}>
              <SelectValue
                placeholder={agentsQuery.isLoading ? t('common.loading') : t('chat.selectAgent')}
              />
            </SelectTrigger>
            <SelectContent>
              {agents.map((agent) => (
                <SelectItem key={agent.key} value={agent.key}>
                  {agent.name}（{agent.key}）
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={newSession}
            disabled={inputLocked}
            className="shrink-0"
          >
            <RotateCcw className="mr-1 h-4 w-4" />
            <span className="hidden sm:inline">{t('chat.newSession')}</span>
          </Button>
          {!portalMode && (
            <Button variant="ghost" size="sm" asChild className="shrink-0">
              <Link to="/agents">
                <ArrowLeft className="mr-1 h-4 w-4" />
                <span className="hidden sm:inline">{t('chat.backToWorkbench')}</span>
              </Link>
            </Button>
          )}
          {portalMode && (
            <Button
              variant="ghost"
              size="sm"
              className="shrink-0"
              onClick={() => {
                clearPortalSession();
                window.location.reload();
              }}
            >
              {t('portal.signOut')}
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="font-mono text-xs"
            aria-label={t('topbar.switchLanguage')}
            title={t('topbar.switchLanguage')}
            data-testid="chat-language-toggle"
            onClick={() => setLocale(toggleLocale())}
          >
            {localeToggleLabel(locale)}
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {portalMode && sidebarOpen && (
          <SessionSidebar
            activeSessionId={activeSession?.id ?? null}
            onSelect={(id, title) => {
              stream.reset();
              setTurns([]);
              setCurrentInput(null);
              setActiveSession({ id, title });
            }}
            onClose={() => setSidebarOpen(false)}
          />
        )}
        {/* 关闭时不挂载陪伴区，也不请求形象资源；旧定义默认显示。 */}
        {selectedAgent?.show_avatar !== false && (
          <aside
            aria-label={t('chat.avatarAria')}
            className="hidden w-72 shrink-0 items-center justify-center border-r md:flex"
          >
            {selectedAgent ? (
              <AgentAvatar agent={selectedAgent} size={224} speaking={streaming} />
            ) : (
              <MessageCircle className="h-24 w-24 shrink-0 text-primary" />
            )}
          </aside>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            <div className="mx-auto max-w-3xl space-y-4">
              {portalMode &&
                (portalHistory.data ?? [])
                  .filter((message) => message.role === 'user' || message.role === 'assistant')
                  .map((message) =>
                    message.role === 'user' ? (
                      <section key={message.id} className="space-y-2">
                        <div className="flex justify-end">
                          <div className="max-w-[85%] whitespace-pre-wrap rounded-lg bg-primary px-4 py-2 text-sm leading-6 text-primary-foreground">
                            {message.content}
                          </div>
                        </div>
                      </section>
                    ) : (
                      <section key={message.id} className="space-y-2">
                        <div className="flex">
                          <div className="max-w-[85%] whitespace-pre-wrap rounded-lg bg-muted px-4 py-3 text-sm leading-6">
                            {message.content}
                          </div>
                        </div>
                      </section>
                    ),
                  )}
              {turns.length === 0 && currentInput === null && selectedAgent?.greeting && (
                <div className="flex">
                  <div className="rounded-lg bg-muted px-4 py-3 text-sm leading-6">
                    {selectedAgent.greeting}
                  </div>
                </div>
              )}

              {turns.map((turn, index) => (
                <TurnBlock key={index} input={turn.input}>
                  <AssistantBubble
                    events={turn.events}
                    status="done"
                    error={null}
                    onDecide={onDecide}
                    decidingApprovalId={decidingId}
                  />
                </TurnBlock>
              ))}

              {currentInput !== null && (
                <TurnBlock input={currentInput}>
                  <AssistantBubble
                    events={stream.events}
                    status={stream.status}
                    error={stream.error}
                    onDecide={onDecide}
                    decidingApprovalId={decidingId}
                    errorStatus={stream.errorStatus}
                  />
                </TurnBlock>
              )}
              <div ref={bottomRef} />
            </div>
          </div>

          <div className="shrink-0 border-t px-4 py-3">
            <div className="mx-auto flex max-w-3xl items-end gap-2">
              <Textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    send();
                  }
                }}
                placeholder={
                  effectiveKey === null
                    ? t('chat.inputPlaceholderNoAgents')
                    : t('chat.inputPlaceholder')
                }
                rows={2}
                disabled={inputLocked || effectiveKey === null}
                aria-label={t('chat.inputAria')}
              />
              {streaming ? (
                <Button variant="destructive" onClick={cancel} disabled={cancelRun.isPending}>
                  <Square className="mr-1 h-4 w-4" />
                  {t('chat.stop')}
                </Button>
              ) : (
                <Button onClick={send} disabled={input.trim() === '' || inputLocked}>
                  <Send className="mr-1 h-4 w-4" />
                  {t('chat.send')}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TurnBlock({ input, children }: { input: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-lg bg-primary px-4 py-2 text-sm leading-6 text-primary-foreground">
          {input}
        </div>
      </div>
      <div className="flex">
        <div className="max-w-[85%] rounded-lg bg-muted px-4 py-3">{children}</div>
      </div>
    </section>
  );
}

/** 归档轮次的 assistant 内容（与 AgentDebugPage 同构：output 优先，兜底 token 累积） */
function reduceTurn(turn: ArchivedTurn): string {
  const reduced = reduceRunEvents(turn.events);
  return reduced.output ?? reduced.text;
}
