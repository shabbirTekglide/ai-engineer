import React, { useState, useRef, useEffect, useTransition } from 'react';
import { Card, CardHeader, CardContent, CardTitle, CardFooter } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { ScrollArea } from '../ui/ScrollArea';
import { Bot, User, X, Sparkles, Move, Send } from 'lucide-react';
import { Avatar, AvatarFallback } from '../ui/Avatar';
import { cn } from '../../libs/Utils';
// import { answerQuestionsAboutClasses } from '@/ai/flows/answer-questions-about-classes';

export function DraggableChatWindow({
  isOpen,
  onClose,
  messages,
  setMessages,
  isPending,
  startTransition,
}) {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [size, setSize] = useState({ width: 400, height: 500 });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const chatWindowRef = useRef(null);
  const dragHandleRef = useRef(null);
  const scrollAreaRef = useRef(null);
  const formRef = useRef(null);
  const [input, setInput] = useState('');

  useEffect(() => {
    if (isOpen) {
      const x = window.innerWidth - size.width - 50;
      const y = (window.innerHeight - size.height) / 2;
      setPosition({ x, y });
    }
  }, [isOpen, size.width, size.height]);

  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTo({
        top: scrollAreaRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [messages, isPending]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const question = input.trim();
    if (!question || isPending) return;

    setMessages((prev) => [...prev, { role: 'user', content: question }]);
    setInput('');

    startTransition(async () => {
      // const response = await answerQuestionsAboutClasses({ question });
      const response = { answer: "This is a placeholder answer from Rubitt." }; // Placeholder response
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: response.answer },
      ]);
    });
  };

  const handleMouseDown = (
    e,
    action
  ) => {
    e.preventDefault();
    if (action === 'drag') {
      setIsDragging(true);
    } else {
      setIsResizing(true);
    }

    const startX = e.clientX;
    const startY = e.clientY;
    const startWidth = size.width;
    const startHeight = size.height;
    const startLeft = position.x;
    const startTop = position.y;

    const handleMouseMove = (moveEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;

      if (action === 'drag') {
        setPosition({ x: startLeft + dx, y: startTop + dy });
      } else {
        setSize({
          width: Math.max(300, startWidth + dx),
          height: Math.max(200, startHeight + dy),
        });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setIsResizing(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  if (!isOpen) return null;

  return (
    <div
      ref={chatWindowRef}
      className="fixed z-50"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: `${size.width}px`,
        height: `${size.height}px`,
      }}
    >
      <Card className="h-full w-full flex flex-col shadow-2xl rounded-xl border-2">
        <CardHeader
          ref={dragHandleRef}
          onMouseDown={(e) => handleMouseDown(e, 'drag')}
          className="flex flex-row items-center justify-between p-3 border-b cursor-grab active:cursor-grabbing"
        >
          <div className="flex items-center gap-2">
            <Move className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base font-semibold">
              Rubitt
            </CardTitle>
          </div>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="p-0 flex-grow overflow-hidden">
          <ScrollArea className="h-full">
            <div className="p-4 space-y-4" ref={scrollAreaRef}>
              {messages.map((message, index) => (
                <div
                  key={index}
                  className={cn(
                    'flex gap-3 text-sm',
                    message.role === 'user' ? 'justify-end' : 'justify-start'
                  )}
                >
                  {message.role === 'assistant' && (
                    <Avatar className="w-8 h-8 flex-shrink-0">
                      <AvatarFallback className="bg-accent text-accent-foreground">
                        <Bot className="w-4 h-4" />
                      </AvatarFallback>
                    </Avatar>
                  )}
                  <div
                    className={cn(
                      'rounded-lg px-3 py-2 max-w-sm shadow-sm',
                      message.role === 'user'
                        ? 'bg-accent text-accent-foreground'
                        : 'bg-card border'
                    )}
                  >
                    <p className="leading-relaxed">{message.content}</p>
                  </div>
                  {message.role === 'user' && (
                    <Avatar className="w-8 h-8 flex-shrink-0">
                      <AvatarFallback className="bg-secondary text-secondary-foreground">
                        <User className="w-4 h-4" />
                      </AvatarFallback>
                    </Avatar>
                  )}
                </div>
              ))}
              {isPending && (
                <div className="flex gap-3 text-sm justify-start">
                  <Avatar className="w-8 h-8 flex-shrink-0">
                    <AvatarFallback className="bg-accent text-accent-foreground">
                      <Bot className="w-4 h-4" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="rounded-lg px-3 py-2 bg-muted flex items-center shadow-sm">
                    <Sparkles className="w-4 h-4 mr-2 text-accent animate-pulse" />
                    Thinking...
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
        </CardContent>
        <CardFooter className="p-3 border-t">
          <form
            ref={formRef}
            onSubmit={handleSubmit}
            className="relative w-full"
          >
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask anything..."
              className="pl-4 pr-12 rounded-full text-base"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  formRef.current?.requestSubmit();
                }
              }}
              disabled={isPending}
            />
            <Button
              type="submit"
              size="icon"
              disabled={!input.trim() || isPending}
              className="rounded-full absolute right-1.5 top-1/2 -translate-y-1/2 h-8 w-8 bg-accent hover:bg-accent/90"
            >
              <Send />
            </Button>
          </form>
        </CardFooter>
        <div
          className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize"
          onMouseDown={(e) => handleMouseDown(e, 'resize')}
          style={{
            borderBottom: '2px solid hsl(var(--border))',
            borderRight: '2px solid hsl(var(--border))',
          }}
        />
      </Card>
    </div>
  );
}