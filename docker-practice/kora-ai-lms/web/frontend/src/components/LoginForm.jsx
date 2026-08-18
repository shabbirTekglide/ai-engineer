import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { useDispatch, useSelector } from "react-redux";
import { login, clearError } from "../store/slicers/authSlice";
import { useNavigate, Link } from "react-router-dom";
import { FiEye, FiEyeOff } from "react-icons/fi";
import { toast } from "react-toastify";
import ReactSpinner from "./ui/ReactSpinner";
import SSOButtons from "./SSOButtons";

const LoginForm = ({ role }) => {
  const [showPassoword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm();
  const {
    loading,
    error,
    isLoggedIn,
    role: userRole,
  } = useSelector((state) => state.auth);
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const onSubmit = async (data) => {
    if (!data.email || !data.password) return;
    data.role = role;
    try {
      const res = await dispatch(login(data)).unwrap();
      const userRole = userRole;
      console.log(userRole);
      if (userRole === "student") {
        navigate("/student/dashboard");
      }
      if (userRole === "admin") {
        navigate("/admin/dashboard");
      } else {
        navigate("/");
      }
      toast.success(res.message);
    } catch (error) {
      toast.error(error);
      console.error("Login failed:", error);
    }
  };

  if (loading) {
    return <ReactSpinner />;
  }

  return (
    <div className="bg-white p-3 md:p-8 rounded-[22px] max-w-[500px] w-full shadow-[0px_0px_20px_3px_rgba(0,0,0,0.05)] pb-12 m-2">
      {/* <h1 className="text-2xl font-bold mb-4 text-center">Login</h1> */}
      <div className="max-w-[120px] flex justify-center items-center mx-[auto] mt-5 mb-10">
        <a href={import.meta.env.VITE_SITE_URL}>
          <img
            src="/login/assets/images/newImages/rubitt-lamp.png"
            className="w-full"
            alt=""
          />
        </a>
        {/* ../../assets/images/KoraLogo.png */}
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label htmlFor="email" className="block font-medium mb-1 hidden">
            Email:
          </label>
          <input
            id="email"
            placeholder="Email"
            type="email"
            className="mt-2 w-full px-4 py-2 border-[1.5px] border-[rgba(167,167,167,1)] rounded-[7px] outline-none focus:outline-none focus:border-[1.5px] focus:border-[rgba(167,167,167,1)] "
            {...register("email", { required: "Email is required" })}
            disabled={loading}
          />
          {errors.email && (
            <p className="text-red-500 text-sm mt-1">{errors.email.message}</p>
          )}
        </div>

        <div className="mb-6">
          <label htmlFor="password" className="block font-medium mb-1 hidden">
            Password:
          </label>
          <div className="input-field relative">
            <input
              id="password"
              placeholder="Password"
              type={`${showPassoword ? "text" : "password"}`}
              className="mt-2 w-full px-4 py-2 border-[1.5px] border-[rgba(167,167,167,1)] rounded-[7px] outline-none focus:outline-none focus:border-[1.5px] focus:border-[rgba(167,167,167,1)] "
              {...register("password", { required: "Password is required" })}
              disabled={loading}
            />
            <div
              className="absolute right-[2%] top-[45%] cursor-pointer"
              onClick={() => setShowPassword(!showPassoword)}
            >
              {showPassoword ? <FiEyeOff /> : <FiEye />}
            </div>
          </div>
          {errors.password && (
            <p className="text-red-500 text-sm mt-1 px-1">
              {errors.password.message}
            </p>
          )}
          <div className="forgot-pass flex justify-end text-sm mt-3">
            <Link
              to="/forgot-password"
              className="text-black text-[16px] underline"
            >
              Forgot Password?
            </Link>
          </div>
        </div>

        <button
          type="submit"
          className="w-full px-4 py-[10px] bg-[linear-gradient(90deg,#9144E0,#6F2CCA)] text-white rounded-[7px] cursor-[pointer]"
          disabled={loading}
        >
          {loading ? "Logging in..." : "Login"}
        </button>

        {/* Forgot Password & Signup Links */}
        <div className="flex text-sm mt-4 items-center text-[16px] justify-center">
          Don’t have an account?
          <Link
            to="/signup"
            className="hover:underline ml-2 text-[16px] text-[#9144E0]  underline"
          >
            Request here
          </Link>
        </div>
      </form>
      <SSOButtons />
    </div>
  );
};

export default LoginForm;
