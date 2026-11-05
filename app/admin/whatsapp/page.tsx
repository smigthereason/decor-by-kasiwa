'use client';

import { useCallback, useEffect, useState } from 'react';
import { MessageCircle, RefreshCw, Send, UserRound, Bot } from 'lucide-react';

type Conversation = {
  wa_id: string; display_name: string; mode: 'bot' | 'human';
  last_inbound_at: string | null; last_outbound_at: string | null; failed_messages: number;
};
type Message = {
  id: string; direction: 'in' | 'out'; message_type: string;
  message_text: string; media_id: string | null; status: string; created_at: string;
};

export default function WhatsAppInboxPage() {
  const [chats, setChats] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const loadChats = useCallback(async () => {
    const response = await fetch('/api/backoffice/whatsapp', { cache: 'no-store' });
    if (!response.ok) throw new Error('Cannot load conversations');
    const result = await response.json() as { conversations: Conversation[] };
    setChats(result.conversations);
  }, []);
  const loadMessages = useCallback(async (waId: string) => {
    const response = await fetch(`/api/backoffice/whatsapp/${encodeURIComponent(waId)}`, { cache: 'no-store' });
    if (!response.ok) throw new Error('Cannot load messages');
    const result = await response.json() as { messages: Message[] };
    setMessages(result.messages);
  }, []);
  const refresh = useCallback(async () => {
    try {
      await loadChats();
      if (selected) await loadMessages(selected);
      setError('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to refresh'); }
  }, [loadChats, loadMessages, selected]);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => { void refresh(); }, 15000);
    return () => clearInterval(timer);
  }, [refresh]);
  const current = chats.find(chat => chat.wa_id === selected);

  async function action(body: { action: string; text: string }) {
    if (!selected || busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/backoffice/whatsapp/${encodeURIComponent(selected)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      if (!response.ok) {
        const payload = await response.json() as { error?: string };
        throw new Error(payload.error || 'Action failed');
      }
      if (body.action === 'send') setDraft('');
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Action failed'); }
    finally { setBusy(false); }
  }

  return (
    <div className="min-h-full bg-[var(--paper-2)] p-4 sm:p-6 lg:p-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="kicker text-[var(--muted)]">Customer care</p>
          <h1 className="mt-2 text-3xl font-medium">WhatsApp inbox</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">Review automated conversations and take over customer enquiries. Updates every 15 seconds.</p>
        </div>
        <button type="button" onClick={() => void refresh()} className="inline-flex gap-2 rounded-xl border px-4 py-2 text-sm"><RefreshCw size={16}/>Refresh</button>
      </div>
      {error && <p role="alert" className="mb-4 rounded-lg border border-red-500 p-3 text-sm text-red-700">{error}</p>}
      <div className="grid min-h-[65vh] gap-4 lg:grid-cols-[290px_minmax(0,1fr)]">
        <aside className="rounded-xl border bg-white p-3">
          <p className="px-2 pb-2 font-medium">Conversations ({chats.length})</p>
          {chats.length === 0 && <p className="p-3 text-sm text-gray-500">No incoming conversations yet.</p>}
          <div className="space-y-2">
            {chats.map(chat => <button type="button" key={chat.wa_id} onClick={() => {
              setSelected(chat.wa_id); setMessages([]); void loadMessages(chat.wa_id).catch(() => setError('Cannot load messages'));
            }} className={`w-full rounded-xl border p-3 text-left transition ${selected === chat.wa_id ? 'border-green-600 bg-green-50' : 'hover:bg-gray-50'}`}>
              <span className="flex items-center justify-between gap-2 text-sm font-semibold"><span className="truncate">{chat.display_name || chat.wa_id}</span>{chat.mode === 'human' ? <UserRound size={16}/> : <Bot size={16}/>}</span>
              <span className="mt-1 block text-xs text-gray-600">{chat.wa_id} · {chat.mode === 'human' ? 'Staff' : 'Rules bot'}</span>
              {chat.failed_messages > 0 && <span className="mt-1 block text-xs text-red-700">{chat.failed_messages} failed messages</span>}
            </button>)}
          </div>
        </aside>
        <section className="flex min-h-[65vh] flex-col rounded-xl border bg-white">
          {!selected ? <div className="flex flex-1 flex-col items-center justify-center gap-3 text-gray-500"><MessageCircle size={34}/><p>Select a conversation to view messages</p></div> : <>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
              <div><p className="font-semibold">{current?.display_name || selected}</p><p className="text-xs text-gray-600">{selected}</p></div>
              <button type="button" disabled={busy} onClick={() => void action({ action: 'mode', text: current?.mode === 'human' ? 'bot' : 'human' })}
                className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50">{current?.mode === 'human' ? 'Return to bot' : 'Take over conversation'}</button>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto bg-gray-50 p-4" style={{ minHeight: 360, maxHeight: 560 }}>
              {messages.map(message => <div key={message.id} className={`flex ${message.direction === 'out' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-xl px-4 py-3 text-sm ${message.direction === 'out' ? 'bg-green-100' : 'border bg-white'}`}>
                  {message.message_type === 'image' && <p className="mb-2 text-xs font-medium">Customer photo received — media preview not yet enabled</p>}
                  <p className="whitespace-pre-wrap break-words">{message.message_text || (message.message_type === 'unsupported' ? '[Unsupported message]' : '')}</p>
                  <p className="mt-2 text-[10px] text-gray-500">{new Date(message.created_at).toLocaleString('en-KE')} · {message.status}</p>
                </div>
              </div>)}
            </div>
            <form className="flex gap-2 border-t p-4" onSubmit={event => { event.preventDefault(); void action({ action: 'send', text: draft }); }}>
              <input aria-label="Message to customer" value={draft} onChange={event => setDraft(event.target.value)} maxLength={1500}
                placeholder={current?.mode === 'human' ? 'Reply to customer…' : 'Take over before replying'} disabled={busy || current?.mode !== 'human'}
                className="min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm disabled:bg-gray-100" />
              <button aria-label="Send message" type="submit" disabled={busy || current?.mode !== 'human' || !draft.trim()}
                className="rounded-lg bg-green-700 px-4 py-2 text-white disabled:opacity-50"><Send size={17}/></button>
            </form>
          </>}
        </section>
      </div>
    </div>
  );
}
