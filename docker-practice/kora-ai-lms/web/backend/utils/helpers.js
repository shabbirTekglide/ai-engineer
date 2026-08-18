export const capitalize = (str) => {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
}
export function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Shuffles the options array of a question and updates the correctIndex
 * to point to the new position of the correct answer
 * @param {Object} question - Question object with options and correctIndex
 * @returns {Object} Question object with shuffled options and updated correctIndex
 */
export function shuffleQuestionOptions(question) {
  if (!question || !question.options || !Array.isArray(question.options) || question.options.length === 0) {
    return question;
  }

  // Validate correctIndex
  if (typeof question.correctIndex !== 'number' || question.correctIndex < 0 || question.correctIndex >= question.options.length) {
    console.warn('Invalid correctIndex for question, defaulting to 0');
    question.correctIndex = 0;
  }

  // Store the correct answer text before shuffling
  const correctAnswer = question.options[question.correctIndex];
  
  // Create pairs of [option, originalIndex] to track positions
  const optionsWithIndices = question.options.map((option, index) => ({ option, originalIndex: index }));
  
  // Shuffle the pairs
  const shuffledPairs = shuffleArray(optionsWithIndices);
  
  // Extract shuffled options
  const shuffledOptions = shuffledPairs.map(pair => pair.option);
  
  // Find the new index of the correct answer
  const newCorrectIndex = shuffledOptions.findIndex(option => option === correctAnswer);
  
  // Return question with shuffled options and updated correctIndex
  return {
    ...question,
    options: shuffledOptions,
    correctIndex: newCorrectIndex >= 0 ? newCorrectIndex : 0
  };
}

export const formatTo12Hour = (time) => {
  if (!time) return '';
  const [hours, minutes] = time.split(':');
  const h = parseInt(hours, 10);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const formattedHour = h % 12 || 12; // 0 ko 12 banana aur 13 ko 1 banana
  return `${formattedHour}:${minutes} ${ampm}`;
};