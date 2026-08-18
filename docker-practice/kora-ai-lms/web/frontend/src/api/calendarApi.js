import axiosInstance from "../config/axios";

const calendarApi = {
    getAllEvents : () => axiosInstance.get('/api/calendar'),
    addEvent : (data) => axiosInstance.post('/api/calendar', data),
    updateEvent : ({eventId, data}) => axiosInstance.put(`/api/calendar/${eventId}`, data),
    deleteEvent :(eventId) => axiosInstance.delete(`/api/calendar/${eventId}`)
}
export default calendarApi;
