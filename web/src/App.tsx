import { Route, Routes } from "react-router-dom";
import { LandingPage } from "./pages/LandingPage";
import { DappPage } from "./pages/DappPage";

export function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/app" element={<DappPage />} />
    </Routes>
  );
}
