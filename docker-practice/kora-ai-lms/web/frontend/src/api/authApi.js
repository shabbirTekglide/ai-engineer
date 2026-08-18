import axiosInstance from '../config/axios.js'
const AuthApi = {
    sendOtp :(email, name) => axiosInstance.post(`/api/auth/send-otp`,{email, name}),
    verifyOtp: (email, otp) => axiosInstance.post(`/api/auth/verify-otp`,{email,otp}),
    setPassword: (email,password, confirm_password) => axiosInstance.post(`/api/auth/set-password`,{email,password,confirm_password}),
    login: (email,password,role) => axiosInstance.post(`/api/auth/login
    `,{email,password,role}),
    forgetPass: (email) => axiosInstance.post('/api/auth/forgot-password',{email}),
    resetPass: ({token,confirmNewPassword,newPassword}) => axiosInstance.post(`/api/auth/reset-password/${token}`,{newPassword,confirmNewPassword}),
    changePass:({token,oldPassword,newPassword,confirmNewPassword}) => axiosInstance.post(`/api/auth/change-password`,{token,oldPassword,newPassword,confirmNewPassword}),
    logout: () => axiosInstance.post('/api/auth/logout'),
    getSessions: () => axiosInstance.get('api/me/sessions'),
    revokeSession: (id) => axiosInstance.post(`/api/me/sessions/${id}/revoke`),
}
export default AuthApi;


