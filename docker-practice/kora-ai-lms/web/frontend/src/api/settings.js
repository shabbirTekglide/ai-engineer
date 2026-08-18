import axiosInstance from "../config/axios";

const settingApi = {
    getSettings: () => axiosInstance.get('/api/setting/'),
    toggleNotification: () => axiosInstance.get('/api/setting/toggleNotification'),
    toggleStudyReminder: () => axiosInstance.get('/api/setting/toggleStudyReminder')
}
export default settingApi