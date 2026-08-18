// components/kora/DraggableChatWindowEnhanced.jsx
import React, { useState, useRef, useEffect, useCallback } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  Card,
  CardHeader,
  CardContent,
  CardTitle,
  CardFooter,
} from "../ui/Card";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { ScrollArea } from "../ui/ScrollArea";
import {
  Bot,
  User,
  X,
  Sparkles,
  Move,
  Send,
  Trash2,
  GraduationCap,
  BookOpen,
  Home,
} from "lucide-react";
import { Avatar, AvatarFallback } from "../ui/Avatar";
import { cn } from "../../libs/Utils";
import {
  closeChat,
  sendMessage,
  clearThread,
  selectIsOpen,
  selectMessages,
  selectIsSendingMessage,
  selectCurrentContext,
  selectCurrentThread,
} from "../../store/slicers/chatSlice";
import { useToast } from "../../hooks/use-toast";

// ─── Hook: stable real viewport height ────────────────────────────────────────
// On mobile browsers the window height changes as the browser chrome
// appears/disappears. We pin the height once on mount so the chat window
// never jumps or gets pushed off-screen.
function useStableVH() {
  const [vh, setVh] = useState(() =>
    typeof window !== "undefined" ? window.innerHeight : 812,
  );

  useEffect(() => {
    // Set once on mount
    setVh(window.innerHeight);

    // Only update when the user explicitly resizes (orientation change, etc.)
    // but NOT on every scroll-triggered toolbar show/hide.
    let rafId;
    const handleResize = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => setVh(window.innerHeight));
    };

    window.addEventListener("orientationchange", handleResize);
    // Also listen to resize but debounce aggressively so scroll-toolbar
    // animations don't cause jumps.
    let resizeTimer;
    const debouncedResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(handleResize, 300);
    };
    window.addEventListener("resize", debouncedResize);

    return () => {
      window.removeEventListener("orientationchange", handleResize);
      window.removeEventListener("resize", debouncedResize);
      cancelAnimationFrame(rafId);
      clearTimeout(resizeTimer);
    };
  }, []);

  return vh;
}

export function DraggableChatWindowEnhanced() {
  const dispatch = useDispatch();
  const { toast } = useToast();
  const [pendingUserMessage, setPendingUserMessage] = useState(null);

  // Redux state
  const isOpen = useSelector(selectIsOpen);
  const messages = useSelector(selectMessages);
  const isSendingMessage = useSelector(selectIsSendingMessage);
  const currentContext = useSelector(selectCurrentContext);
  const currentThread = useSelector(selectCurrentThread);

  const [isMobile, setIsMobile] = useState(false);
  const stableVH = useStableVH();

  // Local state for UI (desktop only)
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [size, setSize] = useState({ width: 450, height: 600 });
  const [isDragging, setIsDragging] = useState(false);
  const [input, setInput] = useState("");

  // Refs
  const chatWindowRef = useRef(null);
  const scrollAreaRef = useRef(null);
  const formRef = useRef(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // ─── Detect mobile ─────────────────────────────────────────────────────────
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth <= 767);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // ─── Desktop: position window on open ──────────────────────────────────────
  useEffect(() => {
    if (isOpen && !isMobile) {
      const x = window.innerWidth - size.width - 50;
      const y = Math.max(20, window.innerHeight - size.height - 20);
      setPosition({ x, y });
    }
  }, [isOpen, isMobile, size.width, size.height]);

  // ─── Mobile: prevent body scroll while chat is open ────────────────────────
  // This stops the browser toolbar show/hide from ever firing while the chat
  // is active, which eliminates the "pushed up" jitter entirely.
  useEffect(() => {
    if (!isMobile) return;

    if (isOpen) {
      // Lock body scroll
      const scrollY = window.scrollY;
      document.body.style.position = "fixed";
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = "100%";
      document.body.style.overflow = "hidden";

      return () => {
        // Restore body scroll
        const storedScrollY = parseInt(document.body.style.top || "0") * -1;
        document.body.style.position = "";
        document.body.style.top = "";
        document.body.style.width = "";
        document.body.style.overflow = "";
        window.scrollTo(0, storedScrollY);
      };
    }
  }, [isOpen, isMobile]);

  // ─── Auto-scroll to bottom when messages change ────────────────────────────
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isSendingMessage, pendingUserMessage]);

  // ─── Mobile: focus input without triggering viewport resize ────────────────
  // On iOS, focusing an input scrolls the viewport. We use scrollIntoView
  // with preventScroll to avoid the jump.
  const handleInputFocus = useCallback(() => {
    if (isMobile && inputRef.current) {
      setTimeout(() => {
        inputRef.current?.scrollIntoView({
          block: "nearest",
          behavior: "smooth",
        });
      }, 100);
    }
  }, [isMobile]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const question = input.trim();
    if (!question || isSendingMessage || !currentThread) return;

    setInput("");
    setPendingUserMessage({
      role: "user",
      content: question,
      timestamp: new Date().toISOString(),
    });

    try {
      await dispatch(
        sendMessage({ threadId: currentThread._id, message: question }),
      ).unwrap();
      setPendingUserMessage(null);
    } catch (error) {
      console.error("Failed to send message:", error);
      toast({
        title: "Error",
        description:
          error.message ||
          "Could not get an answer from Rubitt. Please try again.",
        variant: "destructive",
      });
      setPendingUserMessage(null);
    }
  };

  const handleClearChat = async () => {
    if (!currentThread) return;
    try {
      await dispatch(clearThread(currentThread._id)).unwrap();
      toast({
        title: "Chat cleared",
        description: "Conversation history has been cleared.",
      });
    } catch {
      toast({
        title: "Error",
        description: "Failed to clear chat.",
        variant: "destructive",
      });
    }
  };

  const handleClose = () => dispatch(closeChat());

  // ─── Desktop drag / resize ─────────────────────────────────────────────────
  const handleMouseDown = (e, action) => {
    e.preventDefault();
    if (action === "drag") setIsDragging(true);

    const startX = e.clientX;
    const startY = e.clientY;
    const startLeft = position.x;
    const startTop = position.y;
    const startWidth = size.width;
    const startHeight = size.height;

    const handleMouseMove = (moveEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      if (action === "drag") {
        setPosition({
          x: Math.max(
            0,
            Math.min(window.innerWidth - size.width, startLeft + dx),
          ),
          y: Math.max(
            0,
            Math.min(window.innerHeight - size.height, startTop + dy),
          ),
        });
      } else if (action === "resize") {
        setSize({
          width: Math.max(350, Math.min(800, startWidth + dx)),
          height: Math.max(400, Math.min(900, startHeight + dy)),
        });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  // ─── Context display ───────────────────────────────────────────────────────
  const getContextDisplay = () => {
    switch (currentContext.type) {
      case "lecture":
        return {
          icon: <BookOpen className="h-4 w-4" />,
          label: "Lecture Context",
        };
      case "class":
        return {
          icon: <GraduationCap className="h-4 w-4" />,
          label: "Class Context",
        };
      default:
        return { icon: <Home className="h-4 w-4" />, label: "General" };
    }
  };

  const contextDisplay = getContextDisplay();

  if (!isOpen) return null;

  // ─── Styles ────────────────────────────────────────────────────────────────
  // FIX 1: Use the stable captured viewport height (`stableVH`) instead of
  //         100dvh / 100vh so the window never moves when the browser toolbar
  //         shows or hides.
  // FIX 2: Use `env(safe-area-inset-bottom)` padding inside the footer so
  //         the input is always above the iOS home indicator / Android gesture
  //         bar — even on notched/gesture-nav phones.
  const mobileStyles = {
    position: "fixed",
    top: 0,
    left: 0,
    width: "100%",
    height: `${stableVH}px`,
    zIndex: 50,
  };

  const desktopStyles = {
    left: `${position.x}px`,
    top: `${position.y}px`,
    width: `${size.width}px`,
    height: `${size.height}px`,
  };

  const containerStyles = isMobile ? mobileStyles : desktopStyles;

  return (
    <div ref={chatWindowRef} className="fixed z-50" style={containerStyles}>
      <Card className="h-full w-full flex flex-col shadow-2xl rounded-xl border-2 overflow-hidden">
        {/* ── Header ── */}
        <CardHeader
          onMouseDown={(e) => !isMobile && handleMouseDown(e, "drag")}
          className={cn(
            "flex flex-row items-center justify-between p-6 md:p-3 border-b bg-gradient-to-r from-primary/5 to-primary/10 flex-shrink-0",
            !isMobile && "cursor-grab active:cursor-grabbing",
          )}
        >
          <div className="flex items-center gap-3 flex-1">
            {!isMobile && (
              <Move className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            )}
            <div className="flex flex-col flex-1 min-w-0">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <img className="w-[30px] h-auto object-cover" src="/assets/images/newImages/rubitt-lamp.png" alt="" />
                {/* <Bot className="h-5 w-5 text-primary" /> */}
                Rubitt
              </CardTitle>
              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-2">
                {contextDisplay.icon}
                <span className="truncate text-[13px] ml-2">
                  {contextDisplay.label}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {messages.length > 0 && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 rounded-[50%]"
                onClick={handleClearChat}
                title="Clear conversation"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 rounded-[50%]"
              onClick={handleClose}
              title="Close"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>

        {/* ── Messages ── */}
        <CardContent className="p-0 flex-1 overflow-hidden min-h-0">
          <ScrollArea className="h-full">
            <div className="p-4 space-y-4" ref={scrollAreaRef}>
              {messages.length === 0 && !pendingUserMessage && (
                <div className="flex flex-col items-center justify-center h-64 text-center px-4">
                  {/* <Bot className="h-16 w-16 text-primary/30 mb-4" /> */}
                  <img className="w-[80px] h-auto object-cover" src="/assets/images/newImages/rubitt-lamp.png" alt="" />
                  <h3 className="text-lg font-semibold mb-2">
                    Welcome to Rubitt!
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {currentContext.type === "lecture" &&
                      "Ask me anything about this lecture. I have access to the transcript, notes, study guide, quiz, and flashcards."}
                    {currentContext.type === "class" &&
                      "Ask me about this class. I can help you with any lecture materials and course content."}
                    {currentContext.type === "general" &&
                      "I'm here to help you with your studies! Ask me about your classes, study tips, or anything else."}
                  </p>
                </div>
              )}

              {messages.map((message, index) => (
                <div
                  key={index}
                  className={cn(
                    "flex gap-3 text-sm",
                    message.role === "user" ? "justify-end" : "justify-start",
                  )}
                >
                  {message.role === "assistant" && (
                    <Avatar className="w-8 h-8 flex-shrink-0">
                      <AvatarFallback className="bg-primary/10 text-primary">
                        <Bot className="w-4 h-4" />
                      </AvatarFallback>
                    </Avatar>
                  )}
                  <div
                    className={cn(
                      "rounded-lg px-4 py-2.5 max-w-[85%] shadow-sm",
                      message.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-card border border-border",
                    )}
                  >
                    <p className="leading-relaxed whitespace-pre-wrap">
                      {message.content}
                    </p>
                    {message.timestamp && (
                      <span className="text-xs opacity-70 mt-1 block">
                        {new Date(message.timestamp).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    )}
                  </div>
                  {message.role === "user" && (
                    <Avatar className="w-8 h-8 flex-shrink-0">
                      <AvatarFallback className="bg-secondary text-secondary-foreground">
                        <User className="w-4 h-4" />
                      </AvatarFallback>
                    </Avatar>
                  )}
                </div>
              ))}

              {pendingUserMessage && (
                <div className="flex gap-3 text-sm justify-end">
                  <div className="rounded-lg px-4 py-2.5 max-w-[85%] shadow-sm bg-primary text-primary-foreground">
                    <p className="leading-relaxed whitespace-pre-wrap">
                      {pendingUserMessage.content}
                    </p>
                    <span className="text-xs opacity-70 mt-1 block">
                      {new Date(
                        pendingUserMessage.timestamp,
                      ).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <Avatar className="w-8 h-8 flex-shrink-0">
                    <AvatarFallback className="bg-secondary text-secondary-foreground">
                      <User className="w-4 h-4" />
                    </AvatarFallback>
                  </Avatar>
                </div>
              )}

              {isSendingMessage && (
                <div className="flex gap-3 text-sm justify-start">
                  <Avatar className="w-8 h-8 flex-shrink-0">
                    <AvatarFallback className="bg-primary/10 text-primary">
                      <Bot className="w-4 h-4" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="rounded-lg px-4 py-2.5 bg-muted flex items-center shadow-sm">
                    <Sparkles className="w-4 h-4 mr-2 text-primary animate-pulse" />
                    <span className="text-sm">Thinking...</span>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>
        </CardContent>

        {/* ── Footer / Input ─────────────────────────────────────────────────
            FIX 3: paddingBottom uses safe-area-inset-bottom so the input
            clears the iOS home bar and Android gesture nav bar on every device.
            The inline style is the only reliable cross-browser way to do this.
        ─────────────────────────────────────────────────────────────────────── */}
        <CardFooter
          className="p-3 border-t bg-muted/20 flex-shrink-0"
          style={{
            paddingBottom: isMobile
              ? "max(12px, env(safe-area-inset-bottom, 12px))"
              : undefined,
          }}
        >
          <form
            ref={formRef}
            onSubmit={handleSubmit}
            className="relative w-full"
          >
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onFocus={handleInputFocus}
              placeholder={
                currentContext.type === "lecture"
                  ? "Ask about this lecture..."
                  : currentContext.type === "class"
                    ? "Ask about this class..."
                    : "Ask Rubitt anything..."
              }
              className="pl-4 pr-12 rounded-full text-sm border-border focus:border-primary"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  formRef.current?.requestSubmit();
                }
              }}
              disabled={isSendingMessage || !currentThread}
            />
            <Button
              type="submit"
              size="icon"
              disabled={!input.trim() || isSendingMessage || !currentThread}
              className="rounded-full absolute right-1.5 top-1/2 -translate-y-1/2 h-8 w-8 bg-[#6F2CCA] hover:bg-[#550dba] cursor-pointer"
            >
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </CardFooter>

        {/* Desktop resize handle only */}
        {!isMobile && (
          <div
            className="absolute bottom-0 right-0 w-5 h-5 cursor-se-resize opacity-50 hover:opacity-100 transition-opacity"
            onMouseDown={(e) => handleMouseDown(e, "resize")}
          >
            <div className="absolute bottom-1 right-1 w-3 h-3 border-r-2 border-b-2 border-border rounded-br" />
          </div>
        )}
      </Card>
    </div>
  );
}

export default DraggableChatWindowEnhanced;
