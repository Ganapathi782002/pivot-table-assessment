//Main file for rendering the react app.
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Upload from "./Upload";
// eslint-disable-next-line no-unused-vars
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
