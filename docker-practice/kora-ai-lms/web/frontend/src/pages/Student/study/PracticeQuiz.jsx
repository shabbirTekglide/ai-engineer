import { Button } from '../../../components/ui/Button';
import { Card, CardContent } from '../../../components/ui/Card';
import { RadioGroup, RadioGroupItem } from '../../../components/ui/RadioGroup';
import { Label } from '../../../components/ui/Label';
import { ChevronLeft, ChevronRight, Flag, CheckCircle2, XCircle, Lightbulb, BookOpen, BookAIcon } from 'lucide-react';
import { Badge } from '../../../components/ui/Badge';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { QuizSummaryDialog } from '../../../components/kora/QuickSummaryDialog';
import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { getQuiz } from '../../../store/slicers/learnSlice';
import { toast } from 'react-toastify';

export default function PracticeQuizPage() {
  const location = useLocation();
  const { quiz, loading } = useSelector(state => state.learn);
  const { selectedClassId, selectedLectures, selectedDocuments, timestamp } = location.state || {};
  const dispatch = useDispatch();
  console.log('quiz', quiz)
  // Quiz state management
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState({});
  const [showExplanation, setShowExplanation] = useState(false);
  const [score, setScore] = useState(0);
  const [showHint, setShowHint] = useState(false);
  const navigate = useNavigate();
  useEffect(() => {
    if (selectedClassId && (selectedLectures || selectedDocuments)) {
      dispatch(getQuiz({ classId: selectedClassId, lectureIds: selectedLectures, documentIds: selectedDocuments })).unwrap()
        .catch((error) => {
          console.error('Failed to fetch quiz:', error);
          toast.error(error);
        });
    }
  }, [selectedClassId, selectedLectures, selectedDocuments, dispatch]);


  if (!selectedClassId || !selectedLectures) {
    <>
      <div className="flex flex-col items-center justify-center h-full py-10 text-center">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 max-w-md shadow-sm">
          <h2 className="text-xl font-semibold text-red-600 mb-2">
            ⚠️ No Data Found
          </h2>
          <p className="text-gray-600">
            Please select a <span className="font-medium">Class ID</span> and a{" "}
            <span className="font-medium">Class Lecture</span> to continue.
          </p>
            <button className='mt-2 text-blue-500 underline cursor-pointer' onClick={() => navigate(-1)}>Go Back</button>
        </div>
      </div>
    </>
  }

  if (loading) {
    return (
      <>
        <div className="flex justify-center items-center min-h-screen">
          <div>Loading quiz...</div>
        </div>
      </>
    );
  }

  if (!quiz || !quiz.questions || quiz.questions.length === 0) {
    return (
      <>
        <div className="flex flex-col items-center justify-center min-h-screen text-center px-4">
          <div className="bg-gray-100 border border-gray-300 rounded-lg p-8 shadow-md max-w-sm">
            <h2 className="text-2xl font-semibold text-gray-700 mb-2">📘 No Quiz Available</h2>
            <p className="text-gray-500">
              There are no quizzes available for this lecture yet. Please check back later or select a different lecture.
            </p>
            <button className='mt-2 text-blue-500 underline cursor-pointer' onClick={() => navigate(-1)}>Go Back</button>
          </div>
        </div>
      </>
    );
  }

  const currentQuestion = quiz.questions[currentQuestionIndex];
  const totalQuestions = quiz.questions.length;
  const userAnswer = userAnswers[currentQuestionIndex];
  const isAnswered = userAnswer !== undefined;

  const handleAnswerSelect = (value) => {
    const selectedIndex = currentQuestion.options.findIndex(option => option === value);
    setUserAnswers(prev => ({
      ...prev,
      [currentQuestionIndex]: selectedIndex
    }));
  };

  const handleCheckAnswer = () => {
    setShowExplanation(true);
    if (userAnswer === currentQuestion.correctIndex) {
      setScore(prev => prev + 1);
    }
  };

  const handleNextQuestion = () => {
    if (currentQuestionIndex < totalQuestions - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
      setShowExplanation(false);
      setShowHint(false);
    }
  };

  const handlePreviousQuestion = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(prev => prev - 1);
      setShowExplanation(false);
      setShowHint(false);
    }
  };

  const handleSkip = () => {
    setUserAnswers(prev => ({
      ...prev,
      [currentQuestionIndex]: -1 // -1 indicates skipped
    }));
    setShowExplanation(false);
    setShowHint(false);
    if (currentQuestionIndex < totalQuestions - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
    }
  };

  const toggleHint = () => {
    setShowHint(prev => !prev);
  };

  const calculateScorePercentage = () => {
    const answeredQuestions = Object.keys(userAnswers).length;
    if (answeredQuestions === 0) return 0;
    return Math.round((score / answeredQuestions) * 100);
  };

  return (
      <div className="flex flex-col overflow-hidden bg-secondary/40">
        <main className="flex-1 flex flex-col items-center p-4 mt-5 md:mt-0">
          <div className="w-full max-w-4xl">
            <header className="mb-4 flex items-center gap-1 md:gap-2">
              <Button variant="ghost" size="icon" className="gap-1" asChild>
                <Link to={'/student/study'}>
                  <ChevronLeft />
                </Link>
              </Button>
              <div>
                <h1 className="text-[18px] md:text-[25px] font-bold text-foreground">
                  {quiz?.title || 'Practice Quiz'}
                </h1>
                <p className="text-sm text-muted-foreground">
                 {currentQuestion?.sourceLecture?.title || ''}
                </p>
              </div>
            </header>

            <Card className="w-full shadow-lg">
              <CardContent className="p-3 md:p-8">
                <div className="flex justify-between items-start mb-6">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">Multiple choice</Badge>
                    {/* <Button className="bg-[#976AF2] hover:bg-[#783bf2]" size="sm">
                      <Flag className="h-4 w-4 " />
                      Flag
                    </Button> */}
                  </div>

                  {/* Hint Button */}
                  <Button
                    variant="link"
                    className="p-2 text-primary flex items-center gap-2 cursor-pointer underline"
                    onClick={toggleHint}
                  >
                    <Lightbulb className="h-4 w-4" />
                    <span className=''>{showHint ? 'Hide Hint' : 'Show Hint'}</span>
                  </Button>
                </div>

                {/* Hint Display */}
                {showHint && currentQuestion.hint && (
                  <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <Lightbulb className="h-4 w-4 text-yellow-600" />
                      <h3 className="font-semibold text-yellow-800">Hint:</h3>
                    </div>
                    <p className="text-yellow-700 text-sm">{currentQuestion.hint}</p>
                  </div>
                )}

                <h2 className="text-xl font-semibold mb-6">
                  {currentQuestion.question}
                </h2>

                <RadioGroup
                  value={isAnswered ? currentQuestion.options[userAnswer] : ''}
                  onValueChange={handleAnswerSelect}
                  className="space-y-4 mb-8"
                  disabled={showExplanation}
                >
                  {currentQuestion.options.map((option, index) => (
                    <Label
                      key={index}
                      htmlFor={`option-${currentQuestionIndex}-${index}`}
                      className={`flex items-center p-2 md:p-4 border rounded-lg hover:bg-muted cursor-pointer ${showExplanation && index === currentQuestion.correctIndex
                        ? 'border-green-500 bg-green-50'
                        : showExplanation && index === userAnswer && index !== currentQuestion.correctIndex
                          ? 'border-red-500 bg-red-50'
                          : ''
                        }`}
                    >
                      <RadioGroupItem
                        value={option}
                        id={`option-${currentQuestionIndex}-${index}`}
                        disabled={showExplanation}
                      />
                      <span className="ml-4 text-base">{option}</span>
                    </Label>
                  ))}
                </RadioGroup>

                {showExplanation && currentQuestion.explanation && (
                  <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <h3 className="font-semibold text-blue-900 mb-2 flex items-center gap-1"><BookAIcon className='w-6 h-6 object-cover' />Explanation:</h3>
                    <p className="text-blue-800 text-sm">{currentQuestion.explanation}</p>

                  </div>
                )}

                <div className="flex justify-between items-center">
                  <Button
                    variant="outline"
                    onClick={handlePreviousQuestion}
                    disabled={currentQuestionIndex === 0}
                  >
                    <ChevronLeft className="h-4 w-4 mr-2" />
                    Previous
                  </Button>
                  <div className="flex items-center gap-2">
                    {/* <Button 
                      variant="secondary" 
                      className="bg-blue-500 hover:bg-blue-600 text-white"
                      onClick={handleSkip}
                      disabled={currentQuestionIndex === totalQuestions - 1}
                    >
                      Skip
                    </Button> */}
                    {!showExplanation ? (
                      <Button
                        onClick={handleCheckAnswer}
                        disabled={!isAnswered}
                        className="bg-accent hover:bg-accent/90 cursor-pointer"
                      >
                        Check answer
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        onClick={handleNextQuestion}
                        disabled={currentQuestionIndex === totalQuestions - 1}
                        className="cursor-pointer"
                      >
                        Next
                        <ChevronRight className="h-4 w-4 ml-2" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-between items-center mt-6 w-full">
              <div className="text-sm text-muted-foreground flex items-center gap-2">
                <span>Question {currentQuestionIndex + 1} of {totalQuestions}</span>
                <span className="mx-2">|</span>
                <span>Score {calculateScorePercentage()}%</span>
              </div>
              <QuizSummaryDialog quiz={quiz} userAnswers={userAnswers}>
                <Button className="cursor-pointer" variant="outline">End quiz</Button>
              </QuizSummaryDialog>
            </div>
          </div>
        </main>
      </div>
  );
}

