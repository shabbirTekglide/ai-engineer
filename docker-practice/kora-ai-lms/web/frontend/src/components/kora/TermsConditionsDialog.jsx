import React, { useState, useRef, useEffect } from 'react'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../ui/Dialog'
import ReactMarkdown from 'react-markdown'
import { useSelector, useDispatch } from 'react-redux'
import { Button } from '../ui/Button';
import { acceptTermsConditions } from '../../store/slicers/termsConditionSlice';

function TermsConditionsDialog() {
    const { termsConditions, termsConditionsAccepted } = useSelector((s) => s.termsCondition);
    const { profileExists } = useSelector((s) => s.studentprofile || {});
    const dispatch = useDispatch();
    const [hasReadToBottom, setHasReadToBottom] = useState(false);
    const scrollContainerRef = useRef(null);

    const handleScroll = () => {
        const element = scrollContainerRef.current;
        if (element) {
            // Check if user has scrolled to the bottom (with a small buffer)
            const isAtBottom = element.scrollHeight - element.scrollTop <= element.clientHeight + 20;
            if (isAtBottom) {
                setHasReadToBottom(true);
            }
        }
    };

    useEffect(() => {
        // Check initial state or when content changes
        const element = scrollContainerRef.current;
        if (element) {
            // Reset state when content changes
            setHasReadToBottom(element.scrollHeight <= element.clientHeight);
        }
    }, [termsConditions?.content, termsConditionsAccepted]);

    return (
        <Dialog open={!termsConditionsAccepted && profileExists} >
            <DialogContent showCloseButton={false} className="gap-0 sm:max-w-[600px] max-h-[85vh] flex flex-col p-0 overflow-hidden border-none bg-gradient-to-b from-background to-background/95 backdrop-blur-xl shadow-2xl">
                <DialogHeader className="p-6 pb-0">
                    <DialogTitle className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-accent">
                        {termsConditions?.title || 'Terms and Conditions'}
                    </DialogTitle>
                </DialogHeader>

                <div className="relative flex-grow overflow-hidden px-6">
                    {/* Top Fade */}
                    <div className="absolute top-0 left-0 right-0 h-4 bg-gradient-to-b from-background to-transparent z-10 pointer-events-none" />

                    <div
                        ref={scrollContainerRef}
                        onScroll={handleScroll}
                        className="h-full overflow-y-auto py-4 scrollbar-thin scrollbar-thumb-primary/20 scrollbar-track-transparent pr-2"
                        style={{ maxHeight: '55vh' }}
                    >
                        <div className="prose prose-sm dark:prose-invert max-w-none text-muted-foreground leading-relaxed">
                            <ReactMarkdown
                                components={{
                                    h2: ({ node, ...props }) => <h2 className="mt-8 mb-4 font-bold text-foreground" {...props} />
                                }}
                            >
                                {termsConditions?.content || ''}
                            </ReactMarkdown>
                        </div>
                    </div>

                    {/* Bottom Fade - only show if not at bottom */}
                    {!hasReadToBottom && (
                        <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-background to-transparent z-10 pointer-events-none animate-pulse" />
                    )}
                </div>

                <DialogFooter className="p-6 pt-4 bg-muted/30 border-t border-primary/10">
                    <div className="flex flex-col items-center w-full gap-3">
                        {!hasReadToBottom && (
                            <p className="text-[10px] text-muted-foreground uppercase tracking-widest animate-bounce">
                                Please scroll to the bottom to continue
                            </p>
                        )}
                        <Button
                            onClick={() => dispatch(acceptTermsConditions())}
                            disabled={!hasReadToBottom}
                            className={`w-full h-12 rounded-xl font-semibold transition-all duration-500 shadow-lg ${hasReadToBottom
                                ? 'bg-gradient-to-r from-primary to-accent hover:opacity-90 scale-100'
                                : 'bg-muted text-muted-foreground scale-95 opacity-50 cursor-not-allowed'
                                }`}
                        >
                            {hasReadToBottom ? 'Accept & Continue' : 'Please Read to End'}
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

export default TermsConditionsDialog