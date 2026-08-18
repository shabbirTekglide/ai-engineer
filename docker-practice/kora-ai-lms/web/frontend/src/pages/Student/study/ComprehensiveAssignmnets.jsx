import { useState, useEffect, useRef, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button } from '../../../components/ui/Button';
import {
  ChevronLeft,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Loader2,
  Send,
  MessageSquare,
  User,
  Bot,
  X,
  Play,
  Square,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAudioRecorder } from '../../../hooks/useAudioRecorder';
import {
  assessComprehensionText,
  assessComprehensionAudio,
  resetComprehension,
  setPlayingResponse,
  clearError
} from '../../../store/slicers/comprehensionSlice';
import ComprehensionApi from '../../../api/comprehensionApi';
import { toast } from 'react-toastify';
import { toggleTrialExpired } from '../../../store/slicers/authSlice';

export default function ComprehensionAssessmentPage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const { subscriptionStatus } = useSelector((state) => state.auth);
  const LectureIds = location.state?.selectedLectures;
  const DocumentIds = location.state?.selectedDocuments;
  const classId = location.state?.selectedClassId;
  const lectureName = 'Selected Lecture';

  // Debug: Log received state
  useEffect(() => {
    console.log('[Comprehension Assessment] Location state:', location.state);
    console.log('[Comprehension Assessment] Lecture IDs:', LectureIds);
    console.log('[Comprehension Assessment] Class ID:', classId);
  }, [location.state, LectureIds, classId]);

  // Redux state
  const {
    isProcessing,
    isPlayingResponse,
    responseAudioBlob,
    error: comprehensionError
  } = useSelector((state) => state.comprehension);

  // Audio recorder hook
  const {
    isRecording,
    formattedTime,
    error: recorderError,
    startRecording,
    stopRecording,
    cancelRecording,
  } = useAudioRecorder();

  // Local state
  const [conversationHistory, setConversationHistory] = useState([]);
  const [questionText, setQuestionText] = useState('');
  const [enableAudioResponses, setEnableAudioResponses] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [currentPlayingIndex, setCurrentPlayingIndex] = useState(null);
  const [currentPlayingType, setCurrentPlayingType] = useState(null); // 'user' or 'assistant'
  const [pendingVoiceResponseIndex, setPendingVoiceResponseIndex] = useState(null);
  const audioRef = useRef(null);
  const conversationEndRef = useRef(null);
  const textInputRef = useRef(null);
  const blobUrlsRef = useRef([]); // Track blob URLs for cleanup

  // Check if lecture ID is provided
  useEffect(() => {
    if (!LectureIds || !classId) {
      console.warn('[Comprehension Assessment] Missing required data - redirecting');
      toast.error('Please select a lecture for comprehension assessment');
      navigate('/student/study');
    }
  }, [LectureIds, classId, navigate]);

  // Match Ask Kora / thread flow: no AI access when subscription is not active — disable inputs
  // immediately and surface the same subscription dialog (without requiring a failed request).
  const canUseAiFeatures = subscriptionStatus === 'active';

  useEffect(() => {
    if (subscriptionStatus && subscriptionStatus !== 'active') {
      dispatch(toggleTrialExpired(true));
    }
  }, [subscriptionStatus, dispatch]);

  // Handle errors
  useEffect(() => {
    if (recorderError) {
      toast.error(recorderError);
    }
    if (comprehensionError) {
      toast.error(comprehensionError);
      dispatch(clearError());
    }
  }, [recorderError, comprehensionError, dispatch]);

  // Auto-scroll conversation
  useEffect(() => {
    conversationEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversationHistory]);

  // Handle voice response audio when available
  useEffect(() => {
    if (responseAudioBlob && pendingVoiceResponseIndex !== null) {
      console.log('[Voice Response] Processing audio response blob:', {
        blobSize: responseAudioBlob.size,
        blobType: responseAudioBlob.type,
        pendingIndex: pendingVoiceResponseIndex
      });

      // Convert blob to base64 for storage and replay
      const reader = new FileReader();
      reader.onloadend = () => {
        try {
          const base64Audio = reader.result.split(',')[1]; // Remove data:audio/...;base64, prefix

          console.log('[Voice Response] Base64 conversion complete:', {
            base64Length: base64Audio?.length || 0
          });

          // Update the conversation with the audio data
          setConversationHistory(prev =>
            prev.map((item, idx) =>
              idx === pendingVoiceResponseIndex
                ? { ...item, audioBase64: base64Audio, status: 'playing' }
                : item
            )
          );

          // Play the audio using blob URL (more reliable than data URI)
          const audioUrl = URL.createObjectURL(responseAudioBlob);
          blobUrlsRef.current.push(audioUrl); // Track for cleanup

          console.log('[Voice Response] Playing audio from blob URL');

          if (audioRef.current) {
            audioRef.current.src = audioUrl;

            const playPromise = audioRef.current.play();
            if (playPromise !== undefined) {
              playPromise
                .then(() => {
                  console.log('[Voice Response] Playback started successfully');
                  setIsPlayingAudio(true);
                  setCurrentPlayingIndex(pendingVoiceResponseIndex);
                  setCurrentPlayingType('assistant');
                })
                .catch(playError => {
                  console.error('[Voice Response] Play failed:', playError);

                  if (playError.name === 'NotAllowedError') {
                    toast.info('Click the play button to hear the response');
                  } else {
                    toast.error('Failed to auto-play audio response');
                  }

                  // Still update status to completed so user can manually play
                  setConversationHistory(prev =>
                    prev.map(item =>
                      item.status === 'playing'
                        ? { ...item, status: 'completed' }
                        : item
                    )
                  );
                });
            }
          }

          setPendingVoiceResponseIndex(null);
        } catch (error) {
          console.error('[Voice Response] Error processing audio:', error);
          toast.error('Failed to process audio response');
          setPendingVoiceResponseIndex(null);
        }
      };

      reader.onerror = (error) => {
        console.error('[Voice Response] FileReader error:', error);
        toast.error('Failed to read audio response');
        setPendingVoiceResponseIndex(null);
      };

      reader.readAsDataURL(responseAudioBlob);
    }
  }, [responseAudioBlob, pendingVoiceResponseIndex]);

  // Helper: Convert blob to base64
  const blobToBase64 = (blob) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  // ==================== QUICK START HANDLER ====================
  const handleQuickStart = (prompt) => {
    if (!canUseAiFeatures || isProcessing || isRecording) return;
    setQuestionText('');
    handleSendTextQuestion(prompt);
  };

  // ==================== TEXT QUESTION HANDLER ====================
  const handleSendTextQuestion = async (directQuestion) => {
    const question = (directQuestion ?? questionText).trim();
    if (!canUseAiFeatures || !question || isProcessing || isRecording) return;
    console.log("classId", classId)
    console.log("LectureIds", LectureIds)
    console.log("DocumentIds", DocumentIds)
    if (!classId || (!LectureIds?.length &&
      !DocumentIds?.length)) {
      toast.error('Session data missing. Please go back and select a lecture.');
      return;
    }

    setQuestionText('');

    // Add user message to conversation
    setConversationHistory(prev => [
      ...prev,
      { type: 'user', inputMode: 'text', content: question, status: 'sent', timestamp: new Date() }
    ]);

    try {
      // Add processing indicator for AI
      setConversationHistory(prev => [
        ...prev,
        { type: 'assistant', status: 'processing', timestamp: new Date() }
      ]);

      // Send to API with optional audio
      console.log('[Comprehension Assessment] Sending text question:', {
        classId,
        lectureIds: LectureIds,
        question,
        includeAudio: enableAudioResponses
      });
      const result = await dispatch(assessComprehensionText({
        classId,
        lectureIds: LectureIds,
        documentIds: DocumentIds,
        question,
        includeAudio: enableAudioResponses
      })).unwrap();
      console.log('[Comprehension Assessment] Received response:', result);

      // Update conversation with AI response
      setConversationHistory(prev => [
        ...prev.slice(0, -1),
        {
          type: 'assistant',
          inputMode: 'text',
          content: result.text,
          audioBase64: result.audio,
          status: 'completed',
          timestamp: new Date()
        }
      ]);

    } catch {
      setConversationHistory(prev => prev.slice(0, -1));
      toast.error('Failed to get response');
    }
  };

  // Handler: Key press (Enter to send)
  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (canUseAiFeatures) handleSendTextQuestion();
    }
  };

  // ==================== VOICE QUESTION HANDLERS ====================
  const handleStartRecording = async () => {
    if (!canUseAiFeatures || isProcessing) return;

    await startRecording();
    // Add recording indicator to conversation
    setConversationHistory(prev => [
      ...prev,
      { type: 'user', inputMode: 'voice', status: 'recording', timestamp: new Date() }
    ]);
  };

  const handleStopRecording = async () => {
    try {
      const audioBlob = await stopRecording();

      // Convert user's audio to base64 for replay
      const userAudioBase64 = await blobToBase64(audioBlob);

      // Update conversation history - store user's audio
      setConversationHistory(prev =>
        prev.map((item, idx) =>
          idx === prev.length - 1 && item.status === 'recording'
            ? { ...item, status: 'sent', content: 'Voice question', audioBase64: userAudioBase64 }
            : item
        )
      );

      // Add processing indicator for AI and track its index
      const aiResponseIndex = conversationHistory.length; // Current length = index of AI response
      setConversationHistory(prev => [
        ...prev,
        { type: 'assistant', inputMode: 'voice', status: 'processing', timestamp: new Date() }
      ]);

      // Set pending index so we can update with audio when response comes back
      setPendingVoiceResponseIndex(aiResponseIndex);

      // Send to API (voice mode returns audio response)
      await dispatch(assessComprehensionAudio({ classId, lectureIds: LectureIds, documentIds: DocumentIds, audioBlob })).unwrap();

    } catch {
      setPendingVoiceResponseIndex(null);
      // Remove user recording message and processing indicator
      setConversationHistory(prev => {
        const filtered = prev.filter((item, idx) => {
          if (idx === prev.length - 2 && item.type === 'user' && item.inputMode === 'voice') return false;
          if (idx === prev.length - 1 && item.status === 'processing') return false;
          return true;
        });
        return filtered;
      });
      toast.error('Failed to process voice question');
    }
  };

  const handleCancelRecording = () => {
    cancelRecording();
    setConversationHistory(prev =>
      prev.filter((item, idx) => !(idx === prev.length - 1 && item.status === 'recording'))
    );
  };

  // Cleanup blob URLs on unmount
  useEffect(() => {
    return () => {
      blobUrlsRef.current.forEach(url => {
        try {
          URL.revokeObjectURL(url);
        } catch (e) {
          // Ignore cleanup errors
        }
      });
    };
  }, []);

  // ==================== AUDIO PLAYBACK HANDLERS ====================
  /**
   * Play audio from base64 string using robust blob conversion
   * This method works reliably in production by converting base64 to blob
   * and using createObjectURL instead of data URIs
   */
  const handlePlayAudio = useCallback(async (audioBase64, index, type) => {
    if (!audioRef.current || !audioBase64) {
      console.warn('[Audio Playback] Missing audio ref or base64 data');
      return;
    }

    try {
      // Determine mime type based on source
      const mimeType = type === 'user' ? 'audio/webm' : 'audio/mpeg';

      console.log('[Audio Playback] Converting base64 to blob:', {
        type,
        mimeType,
        base64Length: audioBase64.length
      });

      // Use the robust base64ToBlob utility from API
      const { blob, url } = await ComprehensionApi.createAudioBlobUrl(audioBase64, mimeType.split('/')[1]);

      // Track URL for cleanup
      blobUrlsRef.current.push(url);

      console.log('[Audio Playback] Blob created successfully:', {
        blobSize: blob.size,
        blobType: blob.type,
        url: url.substring(0, 50) + '...'
      });

      // Set audio source and play
      audioRef.current.src = url;

      // Handle play promise for better error handling
      const playPromise = audioRef.current.play();

      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            console.log('[Audio Playback] Playback started successfully');
            setIsPlayingAudio(true);
            setCurrentPlayingIndex(index);
            setCurrentPlayingType(type);
          })
          .catch(playError => {
            console.error('[Audio Playback] Play failed:', playError);

            // Handle autoplay restrictions
            if (playError.name === 'NotAllowedError') {
              toast.info('Click play again to start audio');
            } else {
              toast.error('Failed to play audio. Please try again.');
            }

            // Cleanup the blob URL on error
            URL.revokeObjectURL(url);
          });
      }
    } catch (error) {
      console.error('[Audio Playback] Error creating audio blob:', error);
      toast.error('Failed to load audio. The audio data may be corrupted.');
    }
  }, []);

  const handleStopAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      handleAudioEnded();
    }
  };

  const handleAudioEnded = () => {
    dispatch(setPlayingResponse(false));
    setIsPlayingAudio(false);
    setCurrentPlayingIndex(null);
    setCurrentPlayingType(null);

    // Update any "playing" status messages to "completed"
    setConversationHistory(prev =>
      prev.map(item =>
        item.status === 'playing'
          ? { ...item, status: 'completed' }
          : item
      )
    );
  };

  const handleEndSession = () => {
    dispatch(resetComprehension());
    navigate('/student/study');
  };

  // Check if currently playing this specific message
  const isPlayingMessage = (index, type) => {
    return isPlayingAudio && currentPlayingIndex === index && currentPlayingType === type;
  };

  // Determine current state
  const isIdle = !isRecording && !isProcessing && !isPlayingResponse;

  return (
    <>
      <div className="flex flex-col h-screen bg-background text-foreground">
        <main className="flex-1 flex flex-col overflow-hidden">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8 pb-2 pt-6 md:py-6 max-w-4xl flex flex-col h-full">
            {/* Header */}
            <header className="mb-4 flex items-center gap-3">
              <Button variant="ghost" size="icon" asChild>
                <Link to="/student/study">
                  <ChevronLeft className="w-5 h-5" />
                </Link>
              </Button>
              <div className="flex-1">
                <h1 className="text-[22px] md:text-2xl font-bold text-foreground tracking-tight w-[85%] md:w-full">
                  Comprehension Assessment
                </h1>
                <p className="text-sm text-muted-foreground">{lectureName}</p>
              </div>
              {/* Audio response toggle for text questions */}
              {/* <button
                onClick={() => setEnableAudioResponses(!enableAudioResponses)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  enableAudioResponses
                    ? 'bg-green-500/10 text-green-600 border border-green-500/30'
                    : 'bg-muted text-muted-foreground hover:text-foreground'
                }`}
                title={enableAudioResponses ? 'Audio responses enabled for text questions' : 'Enable audio responses'}
              >
                {enableAudioResponses ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                <span className="hidden sm:inline">{enableAudioResponses ? 'Audio On' : 'Audio Off'}</span>
              </button> */}
            </header>

            {/* Conversation Area */}
            <div className="flex-1 overflow-y-auto mb-4 space-y-4 px-2 py-4 bg-muted/30 rounded-lg">
              {conversationHistory.length === 0 ? (
                <div className="h-full flex items-center justify-center text-center">
                  <div className="space-y-4 max-w-md">
                    <div className="w-20 h-20 mx-auto bg-primary/10 rounded-full flex items-center justify-center">
                      <MessageSquare className="w-10 h-10 text-primary" />
                    </div>
                    <h2 className="text-xl font-semibold">Ready to assess your understanding?</h2>
                    <p className="text-muted-foreground">
                      Ask Rubitt a question about the lecture to test what you've learned. You can <strong>type</strong> or <strong>speak</strong> — switch anytime.
                    </p>
                    <div className="space-y-2 mt-4">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Quick Start</p>
                      <div className="flex flex-wrap justify-center gap-2">
                        {[
                          'What is the main topic of the lecture?',
                          'Explain the most important concepts.',
                          'What might be on an exam for this lecture?',
                        ].map((prompt) => (
                          <button
                            key={prompt}
                            onClick={() => handleQuickStart(prompt)}
                            disabled={isProcessing || !canUseAiFeatures}
                            className="px-4 py-2 bg-primary/10 text-primary text-sm rounded-full font-medium hover:bg-primary hover:text-primary-foreground transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {prompt}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  {conversationHistory.map((item, idx) => (
                    <div
                      key={idx}
                      className={`flex items-start gap-3 ${item.type === 'user' ? 'justify-end' : 'justify-start'
                        }`}
                    >
                      {item.type === 'assistant' && (
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <Bot className="w-4 h-4 text-primary" />
                        </div>
                      )}

                      <div
                        className={`rounded-2xl px-4 py-3 max-w-[80%] ${item.type === 'user'
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-background border border-border'
                          }`}
                      >
                        {/* Recording indicator */}
                        {item.status === 'recording' && (
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                            <span className="text-sm">Recording... {formattedTime}</span>
                          </div>
                        )}

                        {/* USER MESSAGE - Text or Voice */}
                        {item.type === 'user' && item.status !== 'recording' && (
                          <div className="space-y-2">
                            {/* Text message */}
                            {item.inputMode === 'text' && (
                              <p className="text-sm whitespace-pre-wrap">{item.content}</p>
                            )}

                            {/* Voice message with play button */}
                            {item.inputMode === 'voice' && (
                              <div className="flex items-center gap-3">
                                <button
                                  onClick={() => isPlayingMessage(idx, 'user')
                                    ? handleStopAudio()
                                    : handlePlayAudio(item.audioBase64, idx, 'user')
                                  }
                                  disabled={!item.audioBase64}
                                  className="flex items-center justify-center w-10 h-10 rounded-full bg-primary-foreground/20 hover:bg-primary-foreground/30 transition-colors disabled:opacity-50"
                                >
                                  {isPlayingMessage(idx, 'user') ? (
                                    <Square className="w-4 h-4 fill-current" />
                                  ) : (
                                    <Play className="w-4 h-4 fill-current ml-0.5" />
                                  )}
                                </button>
                                <div className="flex flex-col">
                                  <span className="text-sm font-medium flex items-center gap-1">
                                    <Mic className="w-3 h-3" />
                                    Voice question
                                  </span>
                                  {isPlayingMessage(idx, 'user') && (
                                    <span className="text-xs opacity-70">Playing...</span>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Processing indicator */}
                        {item.status === 'processing' && (
                          <div className="flex items-center gap-2">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span className="text-sm">Thinking...</span>
                          </div>
                        )}

                        {/* ASSISTANT RESPONSE - Text or Voice */}
                        {item.type === 'assistant' && item.status !== 'processing' && (
                          <div className="space-y-2">
                            {/* Text response (from text questions) */}
                            {item.inputMode === 'text' && item.content && (
                              <>
                                <p className="text-sm whitespace-pre-wrap">{item.content}</p>
                                {/* Optional audio for text response */}
                                {item.audioBase64 && (
                                  <button
                                    onClick={() => isPlayingMessage(idx, 'assistant')
                                      ? handleStopAudio()
                                      : handlePlayAudio(item.audioBase64, idx, 'assistant')
                                    }
                                    className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors mt-2 py-1 px-2 rounded-full bg-primary/10"
                                  >
                                    {isPlayingMessage(idx, 'assistant') ? (
                                      <>
                                        <Square className="w-3 h-3 fill-current" />
                                        <span>Stop</span>
                                      </>
                                    ) : (
                                      <>
                                        <Volume2 className="w-3 h-3" />
                                        <span>Listen</span>
                                      </>
                                    )}
                                  </button>
                                )}
                              </>
                            )}

                            {/* Voice response (from voice questions) */}
                            {item.inputMode === 'voice' && (
                              <div className="flex items-center gap-3">
                                <button
                                  onClick={() => isPlayingMessage(idx, 'assistant')
                                    ? handleStopAudio()
                                    : handlePlayAudio(item.audioBase64, idx, 'assistant')
                                  }
                                  disabled={!item.audioBase64}
                                  className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 hover:bg-primary/20 transition-colors disabled:opacity-50"
                                >
                                  {isPlayingMessage(idx, 'assistant') ? (
                                    <Square className="w-4 h-4 fill-primary text-primary" />
                                  ) : (
                                    <Play className="w-4 h-4 fill-primary text-primary ml-0.5" />
                                  )}
                                </button>
                                <div className="flex flex-col">
                                  <span className="text-sm font-medium flex items-center gap-1">
                                    <Volume2 className="w-3 h-3" />
                                    Audio response
                                  </span>
                                  {isPlayingMessage(idx, 'assistant') ? (
                                    <span className="text-xs text-muted-foreground">Playing...</span>
                                  ) : item.status === 'playing' ? (
                                    <span className="text-xs text-muted-foreground">Now playing...</span>
                                  ) : (
                                    <span className="text-xs text-muted-foreground">Tap to play</span>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {item.type === 'user' && (
                        <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                          <User className="w-4 h-4 text-primary-foreground" />
                        </div>
                      )}
                    </div>
                  ))}
                  <div ref={conversationEndRef} />
                </>
              )}
            </div>

            {/* Input Area - Both Text and Voice Available */}
            <div className="md:pb-4 space-y-3">
              {/* Recording in progress */}
              {isRecording && (
                <div className="flex gap-3 items-center justify-center bg-red-500/10 rounded-2xl p-4 border border-red-500/30">
                  <div className="flex items-center gap-3 flex-1">
                    <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
                    <span className="text-sm font-medium">Recording: {formattedTime}</span>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      onClick={handleCancelRecording}
                      variant="outline"
                      size="sm"
                      className="rounded-full"
                    >
                      <X className="w-4 h-4 mr-1" />
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      onClick={handleStopRecording}
                      size="sm"
                      className="rounded-full bg-red-500 hover:bg-red-600"
                    >
                      <MicOff className="w-4 h-4 mr-1" />
                      Stop & Send
                    </Button>
                  </div>
                </div>
              )}

              {/* Normal input area (text + mic button) */}
              {!isRecording && (
                <div className="flex gap-2 items-center ">
                  {/* Text input */}
                  <div className="flex-1 relative">
                    <textarea
                      ref={textInputRef}
                      value={questionText}
                      onChange={(e) => setQuestionText(e.target.value)}
                      onKeyDown={handleKeyPress}
                      placeholder="Type your question about the lecture..."
                      disabled={isProcessing || !canUseAiFeatures}
                      rows={1}
                      className="text-[12px] md:text-[14px] w-full px-2 md:px-4 py-2 md:py-3 rounded-2xl border border-border bg-background text-foreground placeholder-muted-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50"

                    />
                  </div>

                  {/* Send text button */}
                  <Button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleSendTextQuestion();
                    }}
                    disabled={!questionText.trim() || isProcessing || !canUseAiFeatures}
                    size="lg"
                    className="rounded-full h-9 w-9 md:h-12 md:w-12 p-0 flex items-center justify-center"
                    title={
                      !canUseAiFeatures
                        ? 'Subscribe or renew to use comprehension assessment'
                        : 'Send text question'
                    }
                  >
                    <Send className="w-5 h-5" />
                  </Button>

                  {/* Microphone button - always available */}
                  <Button
                    type="button"
                    onClick={handleStartRecording}
                    disabled={isProcessing || !canUseAiFeatures}
                    variant="outline"
                    size="lg"
                    className="rounded-full h-9 w-9 md:h-12 md:w-12 p-0 flex items-center justify-center hover:bg-primary hover:text-primary-foreground transition-colors"
                    title={
                      !canUseAiFeatures
                        ? 'Subscribe or renew to use voice questions'
                        : 'Ask with voice'
                    }
                  >
                    <Mic className="w-5 h-5" />
                  </Button>
                </div>
              )}

              {/* Processing indicator */}
              {isProcessing && !isRecording && (
                <div className=" justify-center md:flex hidden">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    {/* <Loader2 className="w-4 h-4 animate-spin" /> */}
                    <span>Processing your question...</span>
                  </div>
                </div>
              )}

              {/* End Session Button */}
              {conversationHistory.length > 0 && isIdle && (
                <div className=" justify-center md:flex hidden">
                  <Button
                    onClick={handleEndSession}
                    variant="outline"
                    size="sm"
                    className="rounded-full"
                  >
                    End Session
                  </Button>
                </div>
              )}
            </div>

            {/* Hidden audio element for playback */}
            <audio
              ref={audioRef}
              onEnded={handleAudioEnded}
              onError={(e) => {
                // Get detailed error information
                const mediaError = e.target?.error;
                const errorDetails = {
                  code: mediaError?.code,
                  message: mediaError?.message,
                  src: e.target?.src?.substring(0, 100),
                  networkState: e.target?.networkState,
                  readyState: e.target?.readyState,
                };

                console.error('[Audio Element] Playback error:', errorDetails);

                // Provide user-friendly error messages based on error code
                let errorMessage = 'Failed to play audio';
                if (mediaError?.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) {
                  errorMessage = 'Audio format not supported. Please try again.';
                } else if (mediaError?.code === MediaError.MEDIA_ERR_DECODE) {
                  errorMessage = 'Audio decoding error. The audio data may be corrupted.';
                } else if (mediaError?.code === MediaError.MEDIA_ERR_NETWORK) {
                  errorMessage = 'Network error while loading audio. Please check your connection.';
                }

                toast.error(errorMessage);
                dispatch(setPlayingResponse(false));
                setIsPlayingAudio(false);
                setCurrentPlayingIndex(null);
                setCurrentPlayingType(null);
              }}
              onLoadStart={() => console.log('[Audio Element] Loading audio...')}
              onCanPlay={() => console.log('[Audio Element] Audio can play')}
              onLoadedData={() => console.log('[Audio Element] Audio data loaded')}
            />
          </div>
        </main>
      </div>
    </>
  );
}
