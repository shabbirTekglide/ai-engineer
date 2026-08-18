import { useEffect, useState } from 'react';
import { Button } from '../../../components/ui/Button';
import { Card, CardContent } from '../../../components/ui/Card';
import {
  ChevronLeft,
  ChevronRight,
  RefreshCcw,
} from 'lucide-react';
import { Separator } from '../../../components/ui/Seperator';
import { cn } from '../../../libs/Utils';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { getFlashCards } from '../../../store/slicers/learnSlice';
import { QuizSummaryDialog } from '../../../components/kora/QuickSummaryDialog';

export default function FlashcardsPage() {
  const [currentCard, setCurrentCard] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [masteredCards, setMasteredCards] = useState(new Set());
  const location = useLocation();
  const { selectedClassId, selectedLectures, selectedDocuments, timestamp } = location.state || {};
  console.log('selectedLecture in flashcards', selectedLectures);
  const { flashCards, loading } = useSelector(state => state.learn);
  const dispatch = useDispatch();
  console.log('flashcards', flashCards)
  const navigate = useNavigate();
  useEffect(() => {
    if (selectedClassId && (selectedLectures || selectedDocuments)) {
      dispatch(getFlashCards({ classId: selectedClassId, lectureIds: selectedLectures, documentIds: selectedDocuments }));
    }
  }, [dispatch, selectedClassId, selectedLectures, selectedDocuments]);

  const handleNext = () => {
    if (isFlipped) {
      setTimeout(() => {
        setCurrentCard((prev) => (prev + 1) % flashCards?.cards?.length);
        setIsFlipped(false);
      }, 150);
    } else {
      setCurrentCard((prev) => (prev + 1) % flashCards?.cards?.length);
    }
  };

  const handlePrev = () => {
    if (isFlipped) {
      setTimeout(() => {
        setCurrentCard((prev) => (prev - 1 + flashCards?.cards?.length) % flashCards?.cards?.length);
        setIsFlipped(false);
      }, 150);
    } else {
      setCurrentCard((prev) => (prev - 1 + flashCards?.cards?.length) % flashCards?.cards?.length);
    }
  };

  const handleGotIt = () => {
    // Add current card to mastered set
    setMasteredCards(prev => new Set([...prev, currentCard]));

    // Auto move to next card after marking as mastered
    handleNext();
  };

  const handleEndSession = () => {
    setShowSummary(true);
  };

  // Convert masteredCards Set to userAnswers format for QuizSummaryDialog
  const getUserAnswersForSummary = () => {
    const userAnswers = {};
    // Mark mastered cards as "correct" (1) and non-mastered as "incorrect" (0)
    if (flashCards?.cards) {
      flashCards.cards.forEach((_, index) => {
        userAnswers[index] = masteredCards.has(index) ? 1 : 0; // 1 = correct, 0 = incorrect
      });
    }
    return userAnswers;
  };

  if (!selectedClassId || !selectedLectures) {
    return (
      <>
        <div className="flex flex-col items-center justify-center h-full py-10 text-center min-h-screen">
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 max-w-md shadow-sm">
            <h2 className="text-xl font-semibold text-red-600 mb-2">
              ⚠️ No Data Found
            </h2>
            <p className="text-gray-600">
              Please select a <span className="font-medium">Class</span> and {" "}
              <span className="font-medium"> Lecture</span> to continue.
            </p>
            <button className='mt-2 text-blue-500 underline cursor-pointer' onClick={() => navigate(-1)}>Go Back</button>
          </div>
        </div>
      </>
    );
  }

  if (loading) {
    return (
      <>
        <div className="flex justify-center items-center min-h-screen">
          <div>Loading flashcards...</div>
        </div>
      </>
    );
  }

  if (!flashCards || !flashCards.cards || flashCards.cards.length === 0) {
    return (
      <>
        <div className="flex flex-col items-center justify-center h-full py-10 text-center min-h-screen">
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 max-w-md shadow-sm">
            <h2 className="text-xl font-semibold text-red-600 mb-2">
              ⚠️ No Data Found
            </h2>
            <p className="text-gray-600">
              No flashcards available for the selected class and lecture.
            </p>
            <button className='mt-2 text-blue-500 underline cursor-pointer' onClick={() => navigate(-1)}>Go Back</button>
          </div>
        </div>
      </>
    );
  }

  const totalCards = flashCards.cards.length;
  const currentCardData = flashCards.cards[currentCard];
  const isCurrentCardMastered = masteredCards.has(currentCard);

  return (
    <>
      <div className="flex flex-col h-screen bg-background text-foreground">
        <main className="flex-1 flex flex-col items-center justify-center p-4">
          <div className="w-full max-w-5xl mx-auto px-4 py-8 md:pb-8 pb-2">
            <header className="flex items-center gap-2">
              <Button className='hover:bg-[#6F2CCA]' variant="ghost" size="icon" asChild>
                <Link to={'/student/study'}>
                  <ChevronLeft />
                </Link>
              </Button>
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-foreground tracking-tight">Flash Cards</h1>
                <p className="text-sm text-muted-foreground">{currentCardData?.sourceLecture?.title || ''}</p>
              </div>
            </header>
          </div>

          <div className="flex flex-col items-center justify-center w-full max-w-2xl mx-auto min-h-[calc(100vh-200px)]">
            <div className="w-full aspect-[4/3] relative [perspective:1200px]">
              <div className={cn(
                "absolute inset-0 transition-transform duration-700 [transform-style:preserve-3d]",
                isFlipped && "[transform:rotateY(180deg)]"
              )}>
                {/* Front of card - Term */}
                <Card className={cn(
                  "absolute inset-0 flex flex-col items-center justify-center p-2 md:p-8 shadow-xl rounded-2xl bg-white border border-gray-200 [backface-visibility:hidden] transition-all duration-300",
                  isCurrentCardMastered && "border-green-500 border-2"
                )}>
                  <CardContent className="h-full flex items-center justify-center p-4 md:p-6 text-center">
                    <p className="text-xl md:text-3xl font-semibold">
                      {currentCardData?.term}
                    </p>
                    {isCurrentCardMastered && (
                      <div className="absolute top-4 left-4">
                        <span className="text-xs bg-green-500 text-white px-2 py-1 rounded-full">
                          Mastered ✓
                        </span>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Back of card - Definition */}
                <Card className={cn(
                  "h-full shadow-lg absolute top-0 left-0 w-full [backface-visibility:hidden] [transform:rotateY(180deg)]",
                  isCurrentCardMastered && "border-green-500 border-2"
                )}>
                  <CardContent className="h-full flex items-center justify-center p-6 text-center">
                    <p className="text-xl font-semibold md:leading-9">
                      {currentCardData?.definition}
                    </p>
                    {/* {currentCardData?.hint && (
                      <div className="absolute bottom-4 left-4 right-4">
                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                          <p className="text-sm text-yellow-800">
                            <span className="font-semibold">Hint:</span> {currentCardData.hint}
                          </p>
                        </div>
                      </div>
                    )} */}
                    {isCurrentCardMastered && (
                      <div className="absolute top-4 left-4">
                        <span className="text-xs bg-green-500 text-white px-2 py-1 rounded-full">
                          Mastered ✓
                        </span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>

            <div className="flex justify-center items-center gap-2 md:gap-4 my-6">
              <Button className="cursor-pointer hover:bg-[#6F2CCA]" variant="outline" size="icon" onClick={handlePrev}>
                <ChevronLeft className="h-5 w-5" />
              </Button>
              <Button
                variant="default"
                size="lg"
                className="px-8 bg-[#6F2CCA] hover:bg-[#550dba] cursor-pointer"
                onClick={() => setIsFlipped(!isFlipped)}
              >
                <RefreshCcw className="mr-2 h-4 w-4" /> Flip
              </Button>
              <Button
                variant="default"
                size="lg"
                className="px-8 bg-green-600 hover:bg-green-700 cursor-pointer"
                onClick={handleGotIt}
                disabled={isCurrentCardMastered}
              >
                {isCurrentCardMastered ? 'Already Mastered' : 'Got it'}
              </Button>
              <Button className="cursor-pointer hover:bg-[#6F2CCA]" variant="outline" size="icon" onClick={handleNext}>
                <ChevronRight className="h-5 w-5" />
              </Button>
            </div>
          </div>

          <div className="mt-8 w-full max-w-5xl">
            <div className="max-w-5xl mx-auto flex flex-col items-center gap-4">
              <div className="text-sm text-muted-foreground flex items-center gap-4">
                <span>Card {currentCard + 1} of {totalCards}</span>
                <Separator orientation="vertical" className="h-4" />
                <span>{masteredCards.size} mastered</span>
              </div>
              <p className="text-xs text-muted-foreground">Shortcuts: ← → to move, Space to flip, G to master</p>

              <QuizSummaryDialog
                quiz={flashCards}
                userAnswers={getUserAnswersForSummary()}
              >
                <button className="cursor-pointer border-[#8C5AF2] border min-w-[120px] px-3 py-2 rounded-[6px] hover:bg-[#8C5AF2] hover:text-white transition-colors duration-200" onClick={handleEndSession}>
                  End session & summary
                </button>
              </QuizSummaryDialog>
            </div>
          </div>
        </main>
      </div>
    </>
  );
}
