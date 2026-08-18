import axiosInstance from "../config/axios";

// Study guide generation can take 1–3+ minutes for multiple lectures (AI per lecture)
const STUDY_GUIDE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

const learnApi = {
    getQuiz :({classId, lectureIds}) => axiosInstance.post('/api/learn/quiz',{classId,lectureIds}),
    getFlashCards : ({classId, lectureIds})=> axiosInstance.post('/api/learn/flashCards',{classId, lectureIds}),
    getLearingPod: ({classId, lectureIds}) =>
      axiosInstance.post('/api/learn/studyGuide', { classId, lectureIds }, { timeout: STUDY_GUIDE_TIMEOUT_MS }),
}

export default learnApi
