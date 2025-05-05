import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Upload from "./Upload";
import CraftingPivot from "./CraftingPivot";

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Upload />} />
        <Route path="/CraftingPivot" element={<CraftingPivot />} />
      </Routes>
    </Router>
  );
}

export default App;
