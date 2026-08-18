// components/kora/AiAssistantEnhanced.jsx
import { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useLocation, useParams } from 'react-router-dom';
import { Button } from '../ui/Button';
import { Bot } from 'lucide-react';
import { DraggableChatWindowEnhanced } from './DraggableChatWindowEnhanced';
import {
  openChat, setContext, createOrGetThread,
  selectIsOpen, selectCurrentContext
} from '../../store/slicers/chatSlice';

export function AiAssistant() {
  const dispatch = useDispatch();
  const location = useLocation();
  const params = useParams();
  const isOpen = useSelector(selectIsOpen);
  const currentContext = useSelector(selectCurrentContext);
  const { token } = useSelector((state) => state.auth);

  // --- Draggable state ---
  const buttonRef = useRef(null);
  const dragState = useRef({
    isDragging: false,
    startX: 0,
    startY: 0,
    startLeft: 0,
    startTop: 0,
    hasMoved: false,
  });

  const [position] = useState(() => ({
    right: 16,
    bottom: typeof window !== 'undefined' && window.innerWidth < 768 ? 48 : 24,
  }));

  const [absPos, setAbsPos] = useState(null); // { left, top } — only set after a mobile drag

  const isMobile = () => window.innerWidth < 768;

  const onPointerDown = (e) => {
    // Desktop: do nothing, let normal click handle it
    if (!isMobile()) return;

    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    const btn = buttonRef.current;
    if (!btn) return;

    const rect = btn.getBoundingClientRect();

    dragState.current = {
      isDragging: true,
      startX: e.clientX,
      startY: e.clientY,
      startLeft: rect.left,
      startTop: rect.top,
      hasMoved: false,
    };

    btn.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e) => {
    // Desktop: skip
    if (!isMobile()) return;
    if (!dragState.current.isDragging) return;
    e.preventDefault();

    const dx = e.clientX - dragState.current.startX;
    const dy = e.clientY - dragState.current.startY;

    // 5px threshold to distinguish tap vs drag
    if (!dragState.current.hasMoved && Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
    dragState.current.hasMoved = true;

    const btn = buttonRef.current;
    if (!btn) return;

    const btnW = btn.offsetWidth;
    const btnH = btn.offsetHeight;
    const margin = 8;

    let newLeft = dragState.current.startLeft + dx;
    let newTop = dragState.current.startTop + dy;

    // Clamp within viewport bounds
    newLeft = Math.max(margin, Math.min(window.innerWidth - btnW - margin, newLeft));
    newTop = Math.max(margin, Math.min(window.innerHeight - btnH - margin, newTop));

    setAbsPos({ left: newLeft, top: newTop });
  };

  const onPointerUp = (e) => {
    // Desktop: skip
    if (!isMobile()) return;
    if (!dragState.current.isDragging) return;

    const wasDrag = dragState.current.hasMoved;
    dragState.current.isDragging = false;
    dragState.current.hasMoved = false;

    // Tap (no movement) → open the chat
    if (!wasDrag) {
      handleOpenChat();
    }
  };

  // Context detection
  useEffect(() => {
    if (!token) return;
    const path = location.pathname;
    let newContext = { type: 'general', classId: null, lectureId: null };

    if (path.includes('/my-classes/') && params.lectureId) {
      newContext = { type: 'lecture', classId: params.classId, lectureId: params.lectureId };
    } else if (path.includes('/my-classes/') && params.classId) {
      newContext = { type: 'class', classId: params.classId, lectureId: null };
    }

    if (
      newContext.type !== currentContext.type ||
      newContext.classId !== currentContext.classId ||
      newContext.lectureId !== currentContext.lectureId
    ) {
      dispatch(setContext(newContext));
    }
  }, [location.pathname, params.classId, params.lectureId, token]);

  useEffect(() => {
    if (!token || !isOpen) return;
    dispatch(createOrGetThread({
      context: currentContext.type,
      classId: currentContext.classId,
      lectureId: currentContext.lectureId
    }));
  }, [currentContext.type, currentContext.classId, currentContext.lectureId, isOpen, token]);

  const handleOpenChat = () => dispatch(openChat());

  if (!token) return null;

  // On mobile after a drag: use absolute left/top
  // Otherwise: use fixed bottom-right
  const buttonStyle = absPos
    ? {
      position: 'fixed',
      left: absPos.left,
      top: absPos.top,
      right: 'auto',
      bottom: 'auto',
      zIndex: 50,
      touchAction: 'none',
      userSelect: 'none',
    }
    : {
      position: 'fixed',
      bottom: position.bottom,
      right: position.right,
      zIndex: 50,
      touchAction: 'none',
      userSelect: 'none',
    };

  return (
    <>
      <DraggableChatWindowEnhanced />

      {!isOpen && (
        <div
          ref={buttonRef}
          style={buttonStyle}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          <div className="relative">
            <Button
              size="lg"
              onClick={!isMobile() ? handleOpenChat : undefined}
              className="gap-1 rounded-full w-20 h-20 md:h-14 md:w-auto px-5 shadow-lg bg-[#6F2CCA] hover:bg-[#550dba] transition-all md:cursor-pointer cursor-grab active:cursor-grabbing select-none"
            >
              {/* <Bot className="!w-[28px] !h-[28px] md:mr-2 md:h-5 md:w-5" /> */}
              <img
                src="/assets/images/newImages/kora-outline-icon-2-white.png"
                alt="Ask Rubitt"
                draggable={false}
                className="w-[38px]  object-contain flex-shrink-0 pointer-events-none"
              />
              <span className="hidden md:block">Ask Rubitt</span>
            </Button>

            {/* Drag hint dot — mobile only */}
            <div className="absolute -top-1 -right-1 w-3 h-3 bg-white/80 rounded-full shadow-sm border border-gray-200 md:hidden flex items-center justify-center">
              <div className="w-1.5 h-1.5 rounded-full bg-gray-400" />
            </div>
          </div>
        </div>
      )}
    </>
  );
}