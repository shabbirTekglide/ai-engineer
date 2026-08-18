import { useLocation } from "react-router-dom";
import LoginForm from "../../components/LoginForm";

function Login() {
  const location = useLocation();

  // Determine role based on current path
  const getRoleFromPath = () => {
    if (location.pathname === '/admin/login') {
      return 'admin';
    }
    return 'student'; // default role for /login
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[linear-gradient(90deg,#9144E0,#6F2CCA)]">
      <LoginForm role={getRoleFromPath()} />
    </div>
  )
}

export default Login