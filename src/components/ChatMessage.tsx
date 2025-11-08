import { Bot, User } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatMessageProps {
  role: 'user' | 'assistant';
  content: string;
  time?: string; // optional timestamp
}

// Small, safe inline parser for **bold**, *italic* and `code` (returns React nodes)
function renderInline(text: string) {
  const parts: React.ReactNode[] = [];
  // Split by code first
  const codeSplit = text.split(/(`[^`]+`)/g);
  codeSplit.forEach((chunk, i) => {
    if (!chunk) return;
    const codeMatch = chunk.match(/^`([^`]+)`$/);
    if (codeMatch) {
      parts.push(
        <code key={`c-${i}`} className="bg-muted/50 px-1 py-0.5 rounded text-xs font-mono text-muted-foreground">
          {codeMatch[1]}
        </code>
      );
      return;
    }

    // Handle bold and italic inside non-code chunks
    const boldSplit = chunk.split(/(\*\*[^*]+\*\*)/g);
    boldSplit.forEach((bs, j) => {
      if (!bs) return;
      const boldMatch = bs.match(/^\*\*([^*]+)\*\*$/);
      if (boldMatch) {
        parts.push(
          <strong key={`b-${i}-${j}`} className="font-semibold">
            {boldMatch[1]}
          </strong>
        );
        return;
      }

      const italicSplit = bs.split(/(\*[^*]+\*)/g);
      italicSplit.forEach((is, k) => {
        if (!is) return;
        const italicMatch = is.match(/^\*([^*]+)\*$/);
        if (italicMatch) {
          parts.push(
            <em key={`i-${i}-${j}-${k}`} className="italic">
              {italicMatch[1]}
            </em>
          );
        } else {
          parts.push(<span key={`t-${i}-${j}-${k}`}>{is}</span>);
        }
      });
    });
  });
  return parts;
}

export function ChatMessage({ role, content, time }: ChatMessageProps) {
  // Render content preserving newlines as <p>
  const lines = content.split('\n').filter(l => l.length > 0);

  return (
    <div
      className={cn(
        "flex gap-3 animate-in fade-in-50 slide-in-from-bottom-3 transition-all duration-200",
        role === 'user' ? "justify-end" : "justify-start"
      )}
    >
      {role === 'assistant' && (
        <div className="flex h-9 w-9 shrink-0 select-none items-center justify-center rounded-full bg-gradient-to-br from-accent to-accent/80 text-accent-foreground shadow-md">
          <Bot className="h-4 w-4" />
        </div>
      )}

      <div
        className={cn(
          "max-w-2xl rounded-lg px-5 py-3 shadow-sm",
          role === 'user'
            ? "bg-gradient-to-br from-primary to-primary/90 text-primary-foreground rounded-br-none shadow-lg"
            : "bg-white dark:bg-slate-800 text-foreground border border-border/60 rounded-bl-none"
        )}
      >
        <div className={cn("text-sm leading-relaxed whitespace-pre-wrap break-words")}> 
          {lines.map((line, idx) => (
            <p key={idx} className="mb-2 last:mb-0">
              {renderInline(line)}
            </p>
          ))}
        </div>

        {/* metadata row (timestamp) */}
        {time && (
          <div className="mt-2 text-xs text-muted-foreground flex items-center gap-2">
            <span className="opacity-80">{time}</span>
          </div>
        )}
      </div>

      {role === 'user' && (
        <div className="flex h-9 w-9 shrink-0 select-none items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-md">
          <User className="h-4 w-4" />
        </div>
      )}
    </div>
  );
}
