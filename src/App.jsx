import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Upload from "./Upload";
import CraftingPivot from "./GeneratingFields";
import GeneratingFields from "./GeneratingFields";

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Upload />} />
        <Route path="/GeneratingFields" element={<GeneratingFields />} />
      </Routes>
    </Router>
  );
}

export default App;
