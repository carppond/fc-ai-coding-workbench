import { AppShell } from "./components/layout/AppShell";
import { ToastProvider } from "./components/common/Toast";
import "./styles/layout.css";

function App() {
  return (
    <ToastProvider>
      <AppShell />
    </ToastProvider>
  );
}

export default App;
