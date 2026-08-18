import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { setGoogleAuthData } from '../store/slicers/authSlice';
import { toast } from 'react-toastify';

const AuthSuccessHandler = () => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const dispatch = useDispatch();

    useEffect(() => {
        const token = searchParams.get('token');
        const userParam = searchParams.get('user');

        if (token && userParam) {
            try {
                const user = JSON.parse(decodeURIComponent(userParam));
                
                // Use the auth reducer action to set Google auth data
                dispatch(setGoogleAuthData({ token, user }));
                // Redirect based on role
                if (user.role === 'admin') {
                    navigate('/admin/dashboard');
                } else {
                    navigate('/student/dashboard');
                }
                toast.success('Login successful!');
            } catch (error) {
                console.error('Error parsing user data:', error);
                toast.error('Failed to login. Please try again.');
                navigate('/login');
                // window.location.href = '/login';
            }
        } else {
            const error = searchParams.get('error');
            toast.error(error || 'Authentication failed. Please try again.');
            navigate('/login');
            // window.location.href = '/login';
        }
    }, [searchParams, navigate, dispatch]);

    return (
        <div className="min-h-screen flex items-center justify-center">
            <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                <p className="mt-4 text-gray-600">Signing you in...</p>
            </div>
        </div>
    );
};

export default AuthSuccessHandler;
