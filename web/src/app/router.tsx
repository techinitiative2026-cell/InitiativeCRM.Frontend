import { Routes, Route } from "react-router-dom";
import {MainLayout} from "./layouts/MainLayout";
import { LeadsListPage} from "../features/leads/pages/LeadsListPage";
import {LeadDetailsPage} from "../features/leads/pages/LeadsDetailsPage";
import ProtectedRoute from "./ProtectedRoute";
import { HeatmapLayout } from "./layouts/heatmap";

export const AppRoutes = () => {
  return (
    <Routes>
      {/* Layout route */}
        
        {/* Nested routes */}
        <Route path="/kriisha" element={<LeadsListPage/> }></Route>
        <Route path="/leads/:id" element={<LeadDetailsPage />} />

        {/* Protected route */}
        <Route
          path="/admin"
          element={
            <ProtectedRoute>
              <div>Admin Page</div>
            </ProtectedRoute>
          }
        />

    </Routes>
  );
};
