import { JSX } from "react";
import { Navigate } from "react-router-dom";

const isAuthenticated = () => {
  // replace with real auth logic
  return Boolean(localStorage.getItem("token"));
};

const ProtectedRoute = ({ children }: { children: JSX.Element }) => {
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }

  return children;
};

export default ProtectedRoute;
