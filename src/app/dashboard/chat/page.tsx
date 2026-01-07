/**
 * Chat Dashboard Page
 * Context-aware chatbot that queries extracted entities
 */

'use client';

import { useState, useEffect, useRef } from 'react';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  entities?: EntityReference[];
}

interface EntityReference {
  type: string;
  value: string;
  context?: string;
}

const EXAMPLE_QUERIES = [
  "Who have I been emailing about the project?",
  "What action items do I have?",
  "Tell me about my meetings this week",
  "What companies have I interacted with?",
  "Summarize my recent communications",
];

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input on load
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  /**
   * Send message and stream response
   */
  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    setError(null);

    // Create assistant message placeholder
    const assistantMessageId = (Date.now() + 1).toString();
    const assistantMessage: Message = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      entities: [],
    };

    setMessages((prev) => [...prev, assistantMessage]);

    try {
      // Prepare history (last 5 messages)
      const history = messages.slice(-5).map((m) => ({
        role: m.role,
        content: m.content,
      }));

      // Send request
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: userMessage.content,
          history,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to send message');
      }

      // Read streaming response
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('No response body');
      }

      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process complete SSE messages
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || ''; // Keep incomplete message in buffer

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = JSON.parse(line.slice(6));

            if (data.error) {
              setError(data.error);
              break;
            }

            // Update assistant message
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMessageId
                  ? {
                      ...m,
                      content: data.content || m.content,
                      entities: data.entities || m.entities,
                    }
                  : m
              )
            );
          }
        }
      }
    } catch (err) {
      console.error('Chat error:', err);
      setError(err instanceof Error ? err.message : 'Failed to send message');
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Handle example query click
   */
  const handleExampleClick = (query: string) => {
    setInput(query);
    inputRef.current?.focus();
  };

  /**
   * Handle Enter key (Shift+Enter for new line)
   */
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  /**
   * Clear chat history
   */
  const clearChat = () => {
    setMessages([]);
    setError(null);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 64px)' }}>
      {/* Header */}
      <div style={{ backgroundColor: '#fff', borderBottom: '1px solid #e5e7eb' }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '1.5rem 2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h1 style={{ fontSize: '1.875rem', fontWeight: '700', color: '#111' }}>
                Chat Assistant
              </h1>
              <p style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.25rem' }}>
                Ask questions about your emails, calendar, and tasks
              </p>
            </div>
            {messages.length > 0 && (
              <button
                onClick={clearChat}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: '#fff',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '0.875rem',
                  color: '#374151',
                  cursor: 'pointer',
                }}
              >
                Clear Chat
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Chat Container */}
      <div style={{ flex: 1, maxWidth: '900px', width: '100%', margin: '0 auto', padding: '2rem', display: 'flex', flexDirection: 'column' }}>
        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', marginBottom: '1.5rem' }}>
          {messages.length === 0 ? (
            // Empty state with examples
            <div style={{ textAlign: 'center', padding: '3rem 0' }}>
              <h2 style={{ fontSize: '1.5rem', fontWeight: '600', color: '#111', marginBottom: '1rem' }}>
                How can I help you today?
              </h2>
              <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '2rem' }}>
                Try asking questions about your emails, meetings, or action items
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxWidth: '600px', margin: '0 auto' }}>
                {EXAMPLE_QUERIES.map((query, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleExampleClick(query)}
                    style={{
                      padding: '0.75rem 1rem',
                      backgroundColor: '#fff',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '0.875rem',
                      color: '#374151',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.2s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = '#f9fafb';
                      e.currentTarget.style.borderColor = '#3b82f6';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = '#fff';
                      e.currentTarget.style.borderColor = '#e5e7eb';
                    }}
                  >
                    {query}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            // Message list
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {messages.map((message) => (
                <div
                  key={message.id}
                  style={{
                    display: 'flex',
                    justifyContent: message.role === 'user' ? 'flex-end' : 'flex-start',
                  }}
                >
                  <div
                    style={{
                      maxWidth: '80%',
                      padding: '1rem 1.25rem',
                      backgroundColor: message.role === 'user' ? '#3b82f6' : '#fff',
                      color: message.role === 'user' ? '#fff' : '#111',
                      borderRadius: '12px',
                      border: message.role === 'assistant' ? '1px solid #e5e7eb' : 'none',
                      boxShadow: message.role === 'assistant' ? '0 1px 3px rgba(0, 0, 0, 0.1)' : 'none',
                    }}
                  >
                    <div style={{ whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}>
                      {message.content || (message.role === 'assistant' && isLoading ? (
                        <span style={{ color: '#6b7280' }}>Thinking...</span>
                      ) : null)}
                    </div>

                    {/* Entity chips */}
                    {message.entities && message.entities.length > 0 && (
                      <div style={{ marginTop: '0.75rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                        {message.entities.slice(0, 5).map((entity, idx) => (
                          <span
                            key={idx}
                            style={{
                              padding: '0.25rem 0.5rem',
                              backgroundColor: '#f3f4f6',
                              border: '1px solid #e5e7eb',
                              borderRadius: '4px',
                              fontSize: '0.75rem',
                              color: '#6b7280',
                            }}
                          >
                            {entity.type}: {entity.value}
                          </span>
                        ))}
                      </div>
                    )}

                    <div
                      style={{
                        marginTop: '0.5rem',
                        fontSize: '0.75rem',
                        color: message.role === 'user' ? 'rgba(255,255,255,0.7)' : '#9ca3af',
                      }}
                    >
                      {message.timestamp.toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Error message */}
        {error && (
          <div
            style={{
              padding: '0.75rem 1rem',
              backgroundColor: '#fee2e2',
              border: '1px solid #f87171',
              borderRadius: '6px',
              marginBottom: '1rem',
            }}
          >
            <p style={{ fontSize: '0.875rem', color: '#dc2626' }}>
              Error: {error}
            </p>
          </div>
        )}

        {/* Input */}
        <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '1rem', boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)' }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question... (Shift+Enter for new line)"
            disabled={isLoading}
            style={{
              width: '100%',
              minHeight: '60px',
              maxHeight: '200px',
              padding: '0.75rem',
              border: 'none',
              borderRadius: '6px',
              fontSize: '0.875rem',
              color: '#111',
              resize: 'vertical',
              outline: 'none',
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.75rem' }}>
            <button
              onClick={sendMessage}
              disabled={isLoading || !input.trim()}
              style={{
                padding: '0.5rem 1.5rem',
                backgroundColor: isLoading || !input.trim() ? '#d1d5db' : '#3b82f6',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                fontSize: '0.875rem',
                fontWeight: '500',
                cursor: isLoading || !input.trim() ? 'not-allowed' : 'pointer',
              }}
            >
              {isLoading ? 'Sending...' : 'Send'}
            </button>
          </div>
        </div>
      </div>

      {/* CSS for spinner animation */}
      <style jsx global>{`
        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}
