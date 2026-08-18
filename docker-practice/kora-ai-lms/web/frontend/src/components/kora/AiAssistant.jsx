import { useState, useTransition, useRef } from 'react';
// import { answerQuestionsAboutClasses } from '@/ai/flows/answer-questions-about-classes';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Send, Bot } from 'lucide-react';
import { DraggableChatWindow } from './DraggableChatWindow';
import { useToast } from '../../hooks/use-toast';

export function AiAssistant() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isPending, startTransition] = useTransition();
  const [isChatOpen, setIsChatOpen] = useState(false);
  const formRef = useRef(null);
  const { toast } = useToast();

  const handleSubmit = (e) => {
    e.preventDefault();
    const question = input.trim();
    if (!question || isPending) return;

    if (!isChatOpen) {
      setIsChatOpen(true);
    }

    setMessages((prev) => [...prev, { role: 'user', content: question }]);
    setInput('');

    startTransition(async () => {
      try {
        // const response = await answerQuestionsAboutClasses({ question });
        const respone = { answer: "This is a placeholder answer from Rubitt." }; // Placeholder response
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: response.answer },
        ]);
      } catch (error) {
        console.error('Failed to get answer:', error);
        toast({
          title: 'Error',
          description: 'Could not get an answer from Rubitt. Please try again.',
          variant: 'destructive',
        });
        setMessages((prev) => prev.slice(0, prev.length - 1));
      }
    });
  };

  return (
    <>
      <DraggableChatWindow
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
        messages={messages}
        isPending={isPending}
        setMessages={setMessages}
        startTransition={startTransition}
      />
      {!isChatOpen && (
        <div className="fixed bottom-8 right-8 z-50">
          <Button
            size="lg"
            className="rounded-full h-14 w-auto px-5 shadow-lg bg-primary hover:bg-primary/90"
            onClick={() => setIsChatOpen(true)}
          >
            <Bot className="mr-2" /> Ask Rubitt
          </Button>
        </div>
      )}
    </>
  );
}