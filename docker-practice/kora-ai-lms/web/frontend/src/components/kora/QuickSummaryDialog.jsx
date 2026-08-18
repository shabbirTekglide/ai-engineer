import { useNavigate } from 'react-router-dom';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../ui/Dialog';
import { Button } from '../ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card';
import { AlertTriangle, BookOpen, CheckCircle, PartyPopper, Sparkles, Star, Target, ThumbsUp, Trophy } from 'lucide-react';

export function QuizSummaryDialog({
  quiz,
  userAnswers,
  children,
}) {
  const navigate = useNavigate();

  // Calculate summary data from quiz/flashcards and user answers
  const calculateSummaryData = () => {
    if (!quiz || !userAnswers) {
      return {
        score: 0,
        correct: 0,
        total: 0,
        topicsToReview: []
      };
    }

    // Determine if it's a quiz (has questions) or flashcards (has cards)
    const isFlashcards = quiz.cards && Array.isArray(quiz.cards);
    const isQuiz = quiz.questions && Array.isArray(quiz.questions);

    const items = isFlashcards ? quiz.cards : (isQuiz ? quiz.questions : []);
    const totalItems = items.length;

    if (totalItems === 0) {
      return {
        score: 0,
        correct: 0,
        total: 0,
        topicsToReview: []
      };
    }

    let correctCount = 0;
    const itemsToReview = [];

    // Calculate correct answers and collect items to review
    items.forEach((item, index) => {
      const userAnswer = userAnswers[index];

      // For flashcards: userAnswer = 1 means mastered, 0 means not mastered
      // For quiz: userAnswer = correctIndex means correct, otherwise incorrect
      if (isFlashcards) {
        if (userAnswer === 1) { // 1 means mastered in flashcards
          correctCount++;
        } else {
          // Add flashcard term for review
          const topic = item.term || `Card ${index + 1}`;
          itemsToReview.push(topic);
        }
      } else if (isQuiz) {
        // Skip if question wasn't answered
        if (userAnswer === undefined || userAnswer === -1) return;

        if (userAnswer === item.correctIndex) {
          correctCount++;
        } else {
          // Add question topic or first few words for review
          const topic = item.question ? item.question.split(' ').slice(0, 5).join(' ') + '...' : `Question ${index + 1}`;
          itemsToReview.push(topic);
        }
      }
    });

    const score = totalItems > 0 ? Math.round((correctCount / totalItems) * 100) : 0;

    return {
      score,
      correct: correctCount,
      total: totalItems,
      topicsToReview: itemsToReview,
      isFlashcards
    };
  };

  const summaryData = calculateSummaryData();

  const handleFinish = () => {
    navigate('/student/study');
  };

  const getTitle = () => {
    if (summaryData.isFlashcards) {
      return 'Flashcards Summary';
    }
    return 'Quiz Summary';
  };

  const getDescription = () => {
    if (summaryData.total === 0) {
      return "No items were completed.";
    }

    if (summaryData.isFlashcards) {
      return `Here's how you did on the ${quiz?.title || 'flashcards'}.`;
    }

    return `Here's how you did on the ${quiz?.title || 'quiz'}.`;
  };

  const getScoreColor = (score) => {
    if (score >= 80) return 'from-green-500 to-emerald-600';
    if (score >= 60) return 'from-blue-500 to-cyan-600';
    if (score >= 40) return 'from-violet-400 to-purple-600';
    return 'from-red-500 to-rose-600';
  };

  const getScoreEmoji = (score) => {
    if (score === 100) return <Trophy className="w-5 h-5 text-yellow-400" />;
    if (score >= 80) return <Star className="w-5 h-5 text-amber-400" />;
    if (score >= 60) return <ThumbsUp className="w-5 h-5 text-blue-400" />;
    if (score >= 40) return <BookOpen className="w-5 h-5 text-lime-500" />;
    return <AlertTriangle className="w-5 h-5 text-red-500" />;
  };

  const getMotivationalMessage = (score) => {
    if (score === 100) return 'Perfect score! Outstanding work!';
    if (score >= 80) return 'Great job! Keep up the excellent work!';
    if (score >= 60) return 'Good effort! You\'re making progress!';
    if (score >= 40) return 'Keep practicing! You\'re improving!';
    return 'Don\'t give up! Review and try again!';
  };

  return (
    <Dialog >
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-[380px] p-0 gap-0 overflow-hidden">
        <div className={`bg-gradient-to-r ${getScoreColor(summaryData.score)} p-6 text-white`}>
          <div className="text-center mb-4">
            <div className="w-16 h-16 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center mx-auto mb-3">
              <Trophy className="w-8 h-8" />
            </div>
          </div>
          <DialogHeader>
            <DialogTitle className="text-xl text-white text-center">{getTitle()}</DialogTitle>
            <DialogDescription className="text-white/90 text-center">
              {getDescription()}
            </DialogDescription>
          </DialogHeader>
        </div>

        {/* Content Area */}
        <div className="p-6">
          {summaryData.total > 0 && (
            <>
              <div className="my-4 grid grid-cols-2 gap-4">
                <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-100">
                  <CardHeader>
                    <CardTitle className='text-sm text-muted-foreground font-medium flex items-center gap-2'>
                      <Target className="w-4 h-4 text-blue-600" />
                      {summaryData.isFlashcards ? 'Mastery' : 'Score'}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-4xl font-bold">{summaryData.score}%</p>
                    {/* Progress Bar */}
                    <div className="h-1.5 bg-blue-200 rounded-full overflow-hidden mt-3">
                      <div
                        className={`h-full bg-gradient-to-r ${getScoreColor(summaryData.score)} transition-all duration-1000`}
                        style={{ width: `${summaryData.score}%` }}
                      />
                    </div>
                  </CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-green-50 to-emerald-50 border-green-100">
                  <CardHeader>
                    <CardTitle className='text-sm text-muted-foreground font-medium flex items-center gap-2'>
                      <CheckCircle className="w-4 h-4 text-green-600" />
                      {summaryData.isFlashcards ? 'Mastered' : 'Correct'}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-4xl font-bold">
                      {summaryData.correct}
                      <span className="text-2xl text-gray-500">/{summaryData.total}</span>
                    </p>
                  </CardContent>
                </Card>
              </div>

              <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl p-4 mb-4 border border-purple-100">
                <div className="flex items-center gap-3">
                  <div className="text-3xl">{getScoreEmoji(summaryData.score)}</div>
                  <p className="font-semibold text-gray-800 text-sm md:text-md">
                    {getMotivationalMessage(summaryData.score)}
                  </p>
                </div>
              </div>

              {/* {summaryData.topicsToReview.length > 0 && (
                <div>
                  <h3 className="font-semibold mb-2 flex items-center gap-2">
                    <AlertCircle className="w-5 h-5 text-amber-600" />
                    {getReviewTitle()}
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {summaryData.topicsToReview.map((topic, index) => (
                      <Badge
                        key={index}
                        variant="secondary"
                        className="bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100 px-3 py-1.5"
                      >
                        {topic}
                      </Badge>
                    ))}
                  </div>
                </div>
              )} */}

              {summaryData.score === 100 && (
                <div className="text-center py-2 mt-4">
                  <div className="bg-gradient-to-r from-yellow-50 to-amber-50 border-2 border-yellow-200 rounded-xl p-4">
                    <div className="flex items-center justify-center gap-2">
                      <Sparkles className="w-5 h-5 text-yellow-600" />
                      <p className="text-green-600 font-semibold">
                        {summaryData.isFlashcards ? (
                          <div className="flex items-center gap-2 text-yellow-400">
                            <PartyPopper className="w-5 h-5" />
                            <span>Perfect mastery!</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 text-yellow-900">
                            <Trophy className="w-5 h-5" />
                            <span>Quiz Champion! 🏅</span>
                          </div>
                        )}
                      </p>
                      <Sparkles className="w-5 h-5 text-yellow-600" />
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {summaryData.total === 0 && (
            <div className="text-center py-4">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trophy className="w-8 h-8 text-gray-400" />
              </div>
              <p className="text-muted-foreground">
                {summaryData.isFlashcards ? 'Complete the flashcards to see your results!' : 'Complete the quiz to see your results!'}
              </p>
            </div>
          )}

          <DialogFooter className='mt-6'>
            <Button
              onClick={handleFinish}
              className="w-full cursor-pointer bg-gradient-to-r bg-[#783BF2] hover:bg-[#6430ce] shadow-lg hover:shadow-xl transition-all"
            >
              Back to Learn
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}